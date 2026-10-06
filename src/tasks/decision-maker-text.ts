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
 * Text playground for the Decision Maker: ask a Boolean, Choice or Score
 * question about any input text. Samples match the Android sample app and are
 * fully editable; edits are kept per question type.
 */

import textTemplate from '../templates/decision-maker-text.html?raw';
import { ViewToggle } from '../components/view-toggle';
import { parseDecisionRequest, toRequestJson, type Draft, type QuestionKind } from './decision-maker-json';

export type { QuestionKind };

/** Runs one evaluation in the worker; resolves with the raw task result. */
export type Evaluator = (kind: QuestionKind, text: string, question: object) => Promise<any>;

/** Fields not used by a question type. */
const EMPTY: Omit<Draft, 'input'> = {
  condition: '',
  trueDescription: '',
  falseDescription: '',
  context: '',
  threshold: 0.5,
  items: [],
  instructions: '',
};

/** Laya's built-in descriptions, used when one side is left empty. */
const DEFAULT_TRUE = 'yes, the statement holds';
const DEFAULT_FALSE = 'no, the statement does not hold';

/** Editable samples; the first one of each type is shown by default. */
const SAMPLES: Record<QuestionKind, { name: string; draft: Draft }[]> = {
  boolean: [
    {
      // Ask the decision itself; "Is the user asking for a refund?" would be Yes.
      name: 'Refund eligibility',
      draft: {
        ...EMPTY,
        input: "The item is fine, I just don't like it. Refund please.",
        condition: 'The customer gave a valid reason for a refund, such as a damaged, defective, or wrong item.',
        trueDescription: 'The customer gave a concrete reason (item arrived broken, defective, or wrong).',
        falseDescription: 'No reason given, or the customer just changed their mind.',
      },
    },
  ],
  choice: [
    {
      name: 'Support ticket',
      draft: {
        ...EMPTY,
        input: 'My package never arrived even though tracking says delivered.',
        items: [
          { label: 'shipping', description: 'Delivery problems, lost packages, tracking' },
          { label: 'billing', description: 'Payment issues, duplicate charges, invoices' },
          { label: 'technical', description: 'App crashes, login errors, bugs' },
        ],
        instructions: 'Which department should handle this ticket?',
      },
    },
    {
      name: 'Refund decision',
      draft: {
        ...EMPTY,
        input: "The item is fine, I just don't like it. Refund please.",
        items: [
          { label: 'approve', description: 'item arrived damaged, defective or wrong' },
          { label: 'deny', description: 'no reason given, changed mind, or customer damaged it' },
        ],
        instructions: 'Should this refund request be approved or denied?',
      },
    },
  ],
  // Short, concrete level descriptions give much better scores than bare labels.
  score: [
    {
      name: 'Customer satisfaction',
      draft: {
        ...EMPTY,
        input: 'The support agent was friendly and fixed my issue fast.',
        items: [
          { label: 'Very dissatisfied', description: 'angry, problem not solved, terrible service' },
          { label: 'Dissatisfied', description: 'slow or unhelpful support, problem partly solved' },
          { label: 'Neutral', description: 'okay, average, nothing special' },
          { label: 'Satisfied', description: 'helpful support, problem solved' },
          { label: 'Very satisfied', description: 'excellent, fast, friendly support, delighted' },
        ],
        instructions: 'Rate how satisfied the customer is with the support experience.',
      },
    },
  ],
};

interface Bar {
  label: string;
  probability: number;
  highlighted: boolean;
}

interface Outcome {
  headline: string;
  subtitle?: string;
  bars: Bar[];
}

/** One-line explanation of each question type, shown under the tabs. */
const KIND_HELP: Record<QuestionKind, string> = {
  boolean: 'Boolean: is the condition true for the input text? The model answers Yes or No, with a probability.',
  choice: 'Choice: which option fits the input text best? The model picks one option and scores all of them.',
  score: 'Score: where does the input text fall on a scale? The model picks a level from your rubric.',
};

export class DecisionTextPlayground {
  private kind: QuestionKind = 'boolean';
  private sampleIndex: Record<QuestionKind, number> = { boolean: 0, choice: 0, score: 0 };
  private drafts: Record<QuestionKind, Draft> = {
    boolean: structuredClone(SAMPLES.boolean[0].draft),
    choice: structuredClone(SAMPLES.choice[0].draft),
    score: structuredClone(SAMPLES.score[0].draft),
  };
  private ready = false;
  private busy = false;
  private el: Record<string, HTMLElement> = {};
  private kindToggle!: ViewToggle;

  constructor(
    private root: HTMLElement,
    private evaluate: Evaluator,
    private onStatus: (text: string, inferenceTime?: number) => void
  ) {}

  init() {
    this.root.innerHTML = textTemplate;
    this.root.querySelectorAll<HTMLElement>('[id]').forEach((node) => (this.el[node.id] = node));
    (this.el['dt-true-desc'] as HTMLTextAreaElement).placeholder = DEFAULT_TRUE;
    (this.el['dt-false-desc'] as HTMLTextAreaElement).placeholder = DEFAULT_FALSE;

    this.kindToggle = new ViewToggle(
      'dt-kind-toggle',
      [
        { label: 'Boolean', value: 'boolean', icon: 'rule' },
        { label: 'Choice', value: 'choice', icon: 'list' },
        { label: 'Score', value: 'score', icon: 'star_half' },
      ],
      this.kind,
      (value) => {
        this.saveDraft();
        this.kind = value as QuestionKind;
        this.showDraft();
        this.clearResult();
      },
      'tabs'
    );

    this.el['dt-evaluate'].addEventListener('click', () => this.run());
    this.el['dt-add-item'].addEventListener('click', () => {
      this.saveDraft();
      this.drafts[this.kind].items.push({ label: '', description: '' });
      this.renderItems();
    });
    this.el['dt-reset'].addEventListener('click', () => this.loadSample(this.sampleIndex[this.kind]));
    this.el['dt-threshold'].addEventListener('input', (e) => {
      this.el['dt-threshold-value'].textContent = parseFloat((e.target as HTMLInputElement).value).toFixed(2);
    });

    this.initJsonDialog();
    this.showDraft();
  }

  setReady(ready: boolean) {
    this.ready = ready;
    this.updateButton();
  }

  // ---------------------------------------------------------------------------
  // Editor
  // ---------------------------------------------------------------------------

  private showDraft() {
    const d = this.drafts[this.kind];
    const isBoolean = this.kind === 'boolean';
    (this.el['dt-input'] as HTMLTextAreaElement).value = d.input;
    (this.el['dt-condition'] as HTMLTextAreaElement).value = d.condition;
    (this.el['dt-true-desc'] as HTMLTextAreaElement).value = d.trueDescription;
    (this.el['dt-false-desc'] as HTMLTextAreaElement).value = d.falseDescription;
    (this.el['dt-context'] as HTMLInputElement).value = d.context;
    (this.el['dt-threshold'] as HTMLInputElement).value = `${d.threshold}`;
    this.el['dt-threshold-value'].textContent = d.threshold.toFixed(2);
    (this.el['dt-instructions'] as HTMLInputElement).value = d.instructions;
    this.el['dt-boolean-fields'].style.display = isBoolean ? '' : 'none';
    this.el['dt-list-fields'].style.display = isBoolean ? 'none' : '';
    this.el['dt-items-title'].textContent = this.kind === 'score' ? 'Rubric' : 'Options';
    this.el['dt-items-hint'].textContent =
      this.kind === 'score'
        ? 'levels from lowest to highest, each with a short description'
        : 'the answers to pick from, each with a short description';
    this.el['dt-add-label'].textContent = this.kind === 'score' ? 'Add level' : 'Add option';
    this.el['dt-kind-help'].textContent = KIND_HELP[this.kind];
    this.renderItems();
    this.renderSamples();
  }

  /** Sample chips (only shown when a type has more than one sample). */
  private renderSamples() {
    const box = this.el['dt-samples'];
    box.innerHTML = '';
    const samples = SAMPLES[this.kind];
    if (samples.length < 2) return;
    samples.forEach((sample, i) => {
      const chip = document.createElement('button');
      chip.className = `dt-sample ${i === this.sampleIndex[this.kind] ? 'active' : ''}`;
      chip.textContent = sample.name;
      chip.addEventListener('click', () => this.loadSample(i));
      box.appendChild(chip);
    });
  }

  private loadSample(i: number) {
    this.sampleIndex[this.kind] = i;
    this.drafts[this.kind] = structuredClone(SAMPLES[this.kind][i].draft);
    this.showDraft();
    this.clearResult();
  }

  private renderItems() {
    const list = this.el['dt-items'];
    list.innerHTML = '';
    const isScore = this.kind === 'score';
    this.drafts[this.kind].items.forEach((item, i) => {
      const row = document.createElement('div');
      row.className = 'dt-item';
      row.innerHTML = `
        <input class="dt-field dt-item-label" placeholder="${isScore ? `Level ${i + 1}` : 'Key'}" />
        <input class="dt-field dt-item-desc" placeholder="Description" />
        <button class="dt-icon-btn" title="Remove"><span class="material-icons">close</span></button>`;
      (row.querySelector('.dt-item-label') as HTMLInputElement).value = item.label;
      (row.querySelector('.dt-item-desc') as HTMLInputElement).value = item.description;
      row.querySelector('button')!.addEventListener('click', () => {
        this.saveDraft();
        this.drafts[this.kind].items.splice(i, 1);
        this.renderItems();
      });
      list.appendChild(row);
    });
  }

  private saveDraft() {
    const d = this.drafts[this.kind];
    d.input = (this.el['dt-input'] as HTMLTextAreaElement).value;
    d.condition = (this.el['dt-condition'] as HTMLTextAreaElement).value;
    d.trueDescription = (this.el['dt-true-desc'] as HTMLTextAreaElement).value;
    d.falseDescription = (this.el['dt-false-desc'] as HTMLTextAreaElement).value;
    d.context = (this.el['dt-context'] as HTMLInputElement).value;
    d.threshold = parseFloat((this.el['dt-threshold'] as HTMLInputElement).value);
    d.instructions = (this.el['dt-instructions'] as HTMLInputElement).value;
    d.items = [...this.el['dt-items'].querySelectorAll('.dt-item')].map((row) => ({
      label: (row.querySelector('.dt-item-label') as HTMLInputElement).value,
      description: (row.querySelector('.dt-item-desc') as HTMLInputElement).value,
    }));
  }

  private updateButton() {
    (this.el['dt-evaluate'] as HTMLButtonElement).disabled = !this.ready || this.busy;
  }

  // ---------------------------------------------------------------------------
  // Open JSON: paste a Decision API request instead of filling in the form
  // ---------------------------------------------------------------------------

  private initJsonDialog() {
    const dialog = this.el['dt-json-dialog'] as HTMLDialogElement;
    const textarea = this.el['dt-json-text'] as HTMLTextAreaElement;
    const error = this.el['dt-json-error'];

    this.el['dt-open-json'].addEventListener('click', () => {
      // Prefill with the request for the current form so the format is self-explanatory.
      this.saveDraft();
      const d = this.drafts[this.kind];
      textarea.value = toRequestJson(this.kind, d.input.trim(), this.buildQuestion(d).question);
      error.textContent = '';
      dialog.showModal();
      textarea.focus();
      textarea.setSelectionRange(0, 0);
      textarea.scrollTop = 0;
    });
    this.el['dt-json-cancel'].addEventListener('click', () => dialog.close());

    const load = (andRun: boolean) => {
      try {
        const { kind, draft, note } = parseDecisionRequest(textarea.value, EMPTY);
        this.drafts[kind] = draft;
        if (kind !== this.kind) {
          this.kindToggle.setActive(kind); // switches tab, shows the new draft
        } else {
          this.showDraft();
          this.clearResult();
        }
        dialog.close();
        if (andRun && this.ready && !this.busy) {
          // Show the note after the run so "Evaluating..." doesn't hide it.
          this.run().then((ok) => ok && note && this.onStatus(note));
        } else if (andRun) {
          this.onStatus(note ? `${note} The model is not ready yet.` : 'Loaded. The model is not ready yet.');
        } else if (note) {
          this.onStatus(note);
        }
      } catch (e: any) {
        error.textContent = e?.message ?? String(e);
      }
    };
    this.el['dt-json-load'].addEventListener('click', () => load(false));
    this.el['dt-json-run'].addEventListener('click', () => load(true));
  }

  // ---------------------------------------------------------------------------
  // Evaluation
  // ---------------------------------------------------------------------------

  /** Builds the question in the same shape as the Android sample. */
  private buildQuestion(d: Draft): { question: object; error?: string } {
    const context = d.context.trim() ? { context: d.context.trim() } : {};
    if (this.kind === 'boolean') {
      if (!d.condition.trim()) return { question: {}, error: 'Enter a condition.' };
      // Custom meanings for false / true; an empty side falls back to Laya's default.
      const t = d.trueDescription.trim();
      const f = d.falseDescription.trim();
      const options =
        t || f
          ? {
              options: [
                { label: 'false', description: f || DEFAULT_FALSE },
                { label: 'true', description: t || DEFAULT_TRUE },
              ],
            }
          : {};
      return { question: { condition: d.condition.trim(), threshold: d.threshold, ...options, ...context } };
    }
    const items = d.items.filter((it) => it.label.trim());
    if (items.length < 2) return { question: {}, error: 'Add at least two entries.' };
    if (this.kind === 'choice') {
      const criteria = Object.fromEntries(items.map((it) => [it.label.trim(), it.description.trim()]));
      return { question: { criteria, instructions: d.instructions.trim(), ...context } };
    }
    // Each rubric level is sent as "name: description".
    const rubric = items.map((it) =>
      it.description.trim() ? `${it.label.trim()}: ${it.description.trim()}` : it.label.trim()
    );
    return { question: { rubric, instructions: d.instructions.trim(), ...context } };
  }

  /** Evaluates the current form; resolves true if a result was shown. */
  private async run(): Promise<boolean> {
    this.saveDraft();
    const d = this.drafts[this.kind];
    if (!d.input.trim()) {
      this.onStatus('Enter some input text.');
      return false;
    }
    const { question, error } = this.buildQuestion(d);
    if (error) {
      this.onStatus(error);
      return false;
    }

    this.busy = true;
    this.updateButton();
    this.onStatus('Evaluating...');
    try {
      const msg = await this.evaluate(this.kind, d.input.trim(), question);
      if (msg.type !== 'DECIDE_RESULT') throw new Error(msg.error);
      this.showOutcome(this.format(msg.result, d));
      this.onStatus('Done', msg.inferenceTime);
      return true;
    } catch (e: any) {
      this.onStatus(`Error: ${e?.message ?? e}`);
      return false;
    } finally {
      this.busy = false;
      this.updateButton();
    }
  }

  private format(r: any, d: Draft): Outcome {
    if (this.kind === 'boolean') {
      return {
        headline: r.value ? 'Yes' : 'No',
        subtitle: `P(yes) = ${r.probabilityTrue.toFixed(2)} · threshold ${d.threshold.toFixed(2)}`,
        bars: [
          { label: 'Yes', probability: r.probabilityTrue, highlighted: r.value },
          { label: 'No', probability: 1 - r.probabilityTrue, highlighted: !r.value },
        ],
      };
    }
    if (this.kind === 'choice') {
      const desc = d.items.find((it) => it.label.trim() === r.selectedKey)?.description;
      return {
        headline: r.selectedKey,
        subtitle: desc || undefined,
        bars: Object.entries(r.probabilities as Record<string, number>)
          .sort((a, b) => b[1] - a[1])
          .map(([label, p]) => ({ label, probability: p, highlighted: label === r.selectedKey })),
      };
    }
    // Score: expected score on a 1..N scale, like the Android sample.
    const probs: number[] = r.probabilities;
    const levels = d.items.filter((it) => it.label.trim()).map((it) => it.label.trim());
    const expected = probs.reduce((sum, p, i) => sum + (i + 1) * p, 0);
    const best = probs.indexOf(Math.max(...probs));
    return {
      headline: `${expected.toFixed(2)} / ${probs.length}`,
      subtitle: levels[best] ? `Most likely: ${levels[best]}` : undefined,
      bars: probs.map((p, i) => ({ label: `${i + 1} · ${levels[i] ?? ''}`, probability: p, highlighted: i === best })),
    };
  }

  private showOutcome(o: Outcome) {
    this.el['dt-headline'].textContent = o.headline;
    this.el['dt-headline'].classList.remove('dt-muted');
    this.el['dt-subtitle'].textContent = o.subtitle ?? '';
    this.el['dt-bars'].innerHTML = '';
    for (const bar of o.bars) {
      const p = Math.min(1, Math.max(0, bar.probability));
      const row = document.createElement('div');
      row.className = `dt-bar ${bar.highlighted ? 'hl' : ''}`;
      row.innerHTML = `
        <span class="dt-bar-label"></span>
        <div class="dt-bar-track"><div class="dt-bar-fill" style="width: ${p * 100}%"></div></div>
        <span class="dt-bar-value">${(p * 100).toFixed(1)}%</span>`;
      row.querySelector('.dt-bar-label')!.textContent = bar.label;
      this.el['dt-bars'].appendChild(row);
    }
  }

  private clearResult() {
    this.el['dt-headline'].textContent = '-';
    this.el['dt-headline'].classList.add('dt-muted');
    this.el['dt-subtitle'].textContent = '';
    this.el['dt-bars'].innerHTML = '';
  }
}
