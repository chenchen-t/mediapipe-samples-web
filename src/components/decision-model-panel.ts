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

/**
 * Model controls shared by the Decision Maker and Dino Game pages: model
 * selector, Load Model button, load status and streaming progress bar. GPU
 * only (no delegate select), like the Semantic Retriever. All state lives in
 * decisionRuntime, so the controls show the same model on both pages.
 */

import { ModelSelector, type ModelSelection } from './model-selector';
import { DECISION_MODELS, decisionModelDownloadUrl, decisionRuntime } from './decision-runtime';

const MODEL_PANEL_HTML = `
  <div class="section-title">Model Selection</div>
  <div id="model-selector-container"></div>`;

/**
 * Renders the model controls into `modelContainer`, wired to decisionRuntime.
 * Returns a cleanup function.
 */
export function mountDecisionModelPanel(modelContainer: HTMLElement): () => void {
  modelContainer.innerHTML = MODEL_PANEL_HTML;

  // Enhanced ModelSelector now natively handles the "Load Model" (Initialize Task) button,
  // file upload accept tags, caching indicators, and progress streaming.
  const selector = new ModelSelector(
    'model-selector-container',
    Object.entries(DECISION_MODELS).map(([value, m]) => ({
      value,
      label: m.label,
      isDefault: value === decisionRuntime.modelName,
      disabled: m.unsupported,
    })),
    (selection: ModelSelection) => {
      // With autoLoad: false, this is called when the user explicitly clicks the load button
      // or selects a file. We just update the state and call load().
      if (selection.type === 'custom') decisionRuntime.selectFile(selection.file);
      else decisionRuntime.select(selection.value);
      decisionRuntime.load();
    },
    {
      autoLoad: false,
      accept: '.task,.tflite,.litertlm',
      uploadLabel: 'Choose .task / .tflite / .litertlm File',
      // Same URL the runtime downloads, so the cache lookup matches.
      resolveUrl: decisionModelDownloadUrl,
      // If e.g. the text+vision model was already downloaded for the embedder
      // demos, start with it instead of asking for another download.
      preferCached: true,
    }
  );

  const renderState = () => {
    const rt = decisionRuntime;
    selector.setBusy(rt.loading);
    if (rt.loading) {
      selector.setStatus(`Loading ${rt.loadingLabel}...`);
    } else if (rt.failed) {
      selector.hideProgress();
      selector.setStatus(`Failed to load ${rt.loadingLabel}`);
    } else if (rt.loadedLabel) {
      // The load finished: replace the pinned "Loading..." line and progress bar.
      selector.hideProgress();
      selector.setLoaded(rt.loadedValue);
      selector.setStatus(`✓ Active: ${rt.loadedLabel}`);
    }
  };

  const unsubscribe = decisionRuntime.subscribe((event) => {
    if (event.type === 'progress') selector.showProgress(event.loaded, event.total);
    else if (event.type === 'cached') selector.refreshCacheState();
    else if (event.type === 'loading') {
      /* handled in renderState */
    } else if (event.type === 'state') renderState();
  });
  renderState();
  return unsubscribe;
}
