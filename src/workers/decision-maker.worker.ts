/**
 * Copyright 2026 The MediaPipe Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { DecisionMaker, FilesetResolver } from '@mediapipe/tasks-decision';
import { BaseWorker } from './base-worker';

class DecisionMakerWorker extends BaseWorker<DecisionMaker> {
  protected async initializeTask(): Promise<void> {
    const fileset = await FilesetResolver.forDecisionTasks(this.getWasmPath(), true);
    fileset.wasmLoaderPath = `${fileset.wasmLoaderPath}?cb=${Date.now()}`; // Force reload

    // Stream the model (URL or uploaded file) so it isn't copied into one big JS
    // buffer, and report bytes received so the page can show a progress bar.
    const file: File | undefined = this.currentOptions.modelFile;
    let stream: ReadableStream<Uint8Array>;
    let size: number;
    if (file) {
      stream = file.stream();
      size = file.size;
    } else {
      const url: string = this.currentOptions.modelAssetPath;
      const response = await fetch(url);
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status} when fetching ${url}`);
      stream = response.body;
      size = Number(response.headers.get('content-length') || 0);
    }

    this.taskInstance = await DecisionMaker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetBuffer: this.progressReader(stream, size),
        delegate: this.currentOptions.delegate === 'GPU' ? 'GPU' : 'CPU',
      },
      ...(size > 0 ? { modelAssetSize: size } : {}),
      // Same as the Android sample; the default (256) is too small for longer inputs.
      maxNumTokens: 4096,
    });
  }

  /** Wraps a stream so each chunk read posts LOAD_PROGRESS (throttled to ~10/s). */
  private progressReader(source: ReadableStream<Uint8Array>, total: number): ReadableStreamDefaultReader<Uint8Array> {
    const reader = source.getReader();
    let loaded = 0;
    let lastPost = 0;
    const post = () => self.postMessage({ type: 'LOAD_PROGRESS', loaded, total });
    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          post();
          controller.close();
          return;
        }
        loaded += value.byteLength;
        const now = performance.now();
        if (now - lastPost > 100) {
          lastPost = now;
          post();
        }
        controller.enqueue(value);
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    }).getReader();
  }

  protected async handleCustomMessage(data: any): Promise<void> {
    if (data.type !== 'DECIDE') return;
    if (!this.taskInstance) {
      self.postMessage({ type: 'ERROR', error: 'Decision Maker not initialized' });
      return;
    }

    const startTimeMs = performance.now();
    const dm = this.taskInstance;
    // 'schema': a whole ClassifierSchema, all questions evaluated on the same input.
    const result =
      data.kind === 'schema'
        ? await this.evaluateSchema(dm, data.text, data.question)
        : data.kind === 'choice'
          ? await dm.evaluateChoice(data.text, data.question)
          : data.kind === 'score'
            ? await dm.evaluateScore(data.text, data.question)
            : await dm.evaluateBoolean(data.text, data.question);
    const inferenceTime = performance.now() - startTimeMs;
    self.postMessage({ type: 'DECIDE_RESULT', id: data.id, result, inferenceTime });
  }

  /**
   * Evaluates a ClassifierSchema with DecisionMaker.evaluate(input, schema).
   * If that native path throws, falls back to one single-question call per
   * question and returns the same ClassifierResult shape ({ [id]: { id, label,
   * confidence, probability?, expectedScore?, probabilities } }).
   */
  private async evaluateSchema(dm: DecisionMaker, text: string, schema: any): Promise<Record<string, any>> {
    try {
      return await dm.evaluate(text, schema);
    } catch (e) {
      console.warn('DecisionMaker.evaluate(schema) failed; evaluating questions one by one.', e);
    }
    const context: string | undefined = schema.context || undefined;
    const result: Record<string, any> = {};
    for (const q of schema.questions ?? []) {
      const type = String(q.type).toLowerCase();
      const options: { label: string; description?: string }[] = q.options ?? [];
      if (type === 'binary' || type === 'boolean') {
        const r = await dm.evaluateBoolean(text, {
          condition: q.prompt,
          context,
          threshold: q.threshold,
          ...(options.length >= 2 ? { options } : {}),
        } as any);
        const p = r.probabilityTrue;
        result[q.id] = {
          id: q.id,
          label: r.value ? 'true' : 'false',
          confidence: r.value ? p : 1 - p,
          probability: p,
          probabilities: [
            { label: 'true', probability: p },
            { label: 'false', probability: 1 - p },
          ],
        };
      } else if (type === 'categorical' || type === 'choice') {
        const criteria = Object.fromEntries(options.map((o) => [o.label, o.description ?? '']));
        const r = await dm.evaluateChoice(text, { criteria, instructions: q.prompt, context } as any);
        const probs: Record<string, number> = r.probabilities ?? {};
        result[q.id] = {
          id: q.id,
          label: r.selectedKey,
          confidence: probs[r.selectedKey] ?? 0,
          probabilities: options.map((o) => ({ label: o.label, probability: probs[o.label] ?? 0 })),
        };
      } else {
        const rubric = options.map((o) => (o.description ? `${o.label}: ${o.description}` : o.label));
        const r = await dm.evaluateScore(text, { rubric, instructions: q.prompt, context } as any);
        const probs: number[] = r.probabilities ?? [];
        const best = probs.indexOf(Math.max(...probs));
        result[q.id] = {
          id: q.id,
          label: options[best]?.label ?? String(best + 1),
          confidence: probs[best] ?? 0,
          expectedScore: probs.reduce((sum, p, i) => sum + i * p, 0), // 0-based, like evaluate()
          probabilities: options.map((o, i) => ({ label: o.label, probability: probs[i] ?? 0 })),
        };
      }
    }
    return result;
  }
}

new DecisionMakerWorker();
