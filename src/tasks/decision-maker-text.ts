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

import { ViewToggle } from '../components/view-toggle';

export type QuestionKind = 'boolean' | 'choice' | 'score';

/** Runs one evaluation in the worker; resolves with the raw task result. */
export type Evaluator = (kind: QuestionKind, text: string, question: object) => Promise<any>;

interface Item {
  label: string;
  description: string;
}

interface Draft {
  input: string;
  condition: string;
  /** Boolean only: what "true" / "false" mean (sent as `options`). Optional. */
  trueDescription: string;
  falseDescription: string;
  /** Optional domain context prepended to the question. */
  context: string;
  /** Boolean only: P(true) needed to answer Yes. */
  threshold: number;
  items: Item[];
  instructions: string;
}

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

export const textTemplate = `
<div class="dt-root">
  <div id="dt-kind-toggle" style="margin-bottom: 12px"></div>

  <div class="dt-card">
    <div class="dt-input-header">
      <label class="dt-label" for="dt-input">Input text</label>
      <div id="dt-samples" class="dt-samples"></div>
    </div>
    <textarea id="dt-input" class="dt-field" rows="3"></textarea>

    <div id="dt-boolean-fields">
      <label class="dt-label" for="dt-condition">Condition</label>
      <textarea id="dt-condition" class="dt-field" rows="2"></textarea>

      <div class="dt-two-col">
        <div>
          <label class="dt-label" for="dt-true-desc">Yes means <span class="dt-optional">optional</span></label>
          <textarea id="dt-true-desc" class="dt-field" rows="2" placeholder="${DEFAULT_TRUE}"></textarea>
        </div>
        <div>
          <label class="dt-label" for="dt-false-desc">No means <span class="dt-optional">optional</span></label>
          <textarea id="dt-false-desc" class="dt-field" rows="2" placeholder="${DEFAULT_FALSE}"></textarea>
        </div>
      </div>

      <label class="dt-label" for="dt-threshold">
        Threshold <span class="dt-optional">answer Yes when P(yes) ≥ <b id="dt-threshold-value">0.50</b></span>
      </label>
      <input id="dt-threshold" type="range" min="0.05" max="0.95" step="0.05" value="0.5" class="range-slider" />
    </div>

    <div id="dt-list-fields">
      <label class="dt-label" for="dt-instructions">Instructions</label>
      <input id="dt-instructions" class="dt-field" type="text" />
      <div class="dt-label" id="dt-items-title">Options</div>
      <div id="dt-items"></div>
      <button id="dt-add-item" class="dt-link-btn">
        <span class="material-icons">add</span><span id="dt-add-label">Add option</span>
      </button>
    </div>

    <label class="dt-label" for="dt-context">Context <span class="dt-optional">optional</span></label>
    <input id="dt-context" class="dt-field" type="text" placeholder="e.g. Screening emails sent to a company inbox." />

    <div class="dt-actions">
      <button id="dt-reset" class="dt-link-btn">Restore sample</button>
      <button id="dt-evaluate" class="dt-action-btn" disabled>
        <span class="material-icons">psychology</span> Evaluate
      </button>
    </div>
  </div>

  <div class="dt-card">
    <div class="dt-label">Result</div>
    <div id="dt-headline" class="dt-headline dt-muted">-</div>
    <div id="dt-subtitle" class="dt-subtitle"></div>
    <div id="dt-bars"></div>
  </div>

  <style>
    .dt-root { width: 100%; max-width: 800px; }
    .dt-card {
      border: 1px solid var(--border-color); border-radius: var(--radius-sm);
      padding: 16px; margin-bottom: 12px; background: var(--surface);
    }
    .dt-label {
      display: block; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.5px;
      font-weight: 600; color: var(--text-secondary); margin: 12px 0 6px;
    }
    .dt-input-header { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
    .dt-input-header .dt-label { margin-top: 0; }
    .dt-samples { display: flex; gap: 6px; flex-wrap: wrap; }
    .dt-sample {
      border: 1px solid var(--border-color); background: transparent; border-radius: 16px;
      padding: 4px 12px; font-size: 0.75rem; color: var(--text-secondary); cursor: pointer;
    }
    .dt-sample:hover { color: var(--primary); border-color: var(--primary); }
    .dt-sample.active { background: var(--primary); border-color: var(--primary); color: #fff; }
    .dt-optional { text-transform: none; letter-spacing: 0; font-weight: 400; margin-left: 4px; }
    .dt-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 600px) { .dt-two-col { grid-template-columns: 1fr; } }
    .dt-field {
      width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: var(--radius-sm);
      border: 1px solid var(--border-color); background: var(--bg-color); color: var(--text-main);
      font-family: 'Roboto', sans-serif; font-size: 0.9rem; resize: vertical;
    }
    .dt-field:focus { outline: none; border-color: var(--primary); }
    .dt-item { display: grid; grid-template-columns: 30% 1fr 32px; gap: 8px; margin-bottom: 8px; }
    .dt-icon-btn {
      border: none; background: none; cursor: pointer; color: var(--text-secondary);
      display: flex; align-items: center; justify-content: center; border-radius: 50%;
    }
    .dt-icon-btn:hover { background: #f1f3f4; color: var(--text-main); }
    .dt-link-btn {
      display: inline-flex; align-items: center; gap: 4px; border: none; background: none;
      color: var(--primary); font-size: 0.85rem; font-weight: 500; cursor: pointer; padding: 4px 0;
    }
    .dt-link-btn .material-icons { font-size: 18px; }
    .dt-actions { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; }
    .dt-action-btn {
      display: flex; align-items: center; gap: 8px; background: var(--primary); color: #fff;
      border: none; border-radius: var(--radius-sm); padding: 10px 24px; font-size: 0.9rem;
      font-weight: 500; cursor: pointer;
    }
    .dt-action-btn .material-icons { font-size: 18px; }
    .dt-action-btn:hover:not(:disabled) { background: var(--primary-hover); }
    .dt-action-btn:disabled { background: var(--border-color); cursor: not-allowed; }
    .dt-headline { font-size: 1.6rem; font-weight: 500; color: var(--text-main); }
    .dt-muted { color: var(--text-secondary); }
    .dt-subtitle { font-size: 0.9rem; color: var(--text-secondary); margin: 2px 0 8px; min-height: 1em; }
    .dt-bar { display: grid; grid-template-columns: 35% 1fr 56px; align-items: center; gap: 12px; padding: 4px 0; }
    .dt-bar-label { font-size: 0.85rem; color: var(--text-main); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dt-bar.hl .dt-bar-label { font-weight: 600; }
    .dt-bar-track { height: 8px; background: #f1f3f4; border-radius: 4px; overflow: hidden; }
    .dt-bar-fill { height: 100%; background: #bdc1c6; border-radius: 4px; transition: width 0.3s; }
    .dt-bar.hl .dt-bar-fill { background: var(--primary); }
    .dt-bar-value { font-family: 'Roboto Mono', monospace; font-size: 0.8rem; text-align: right; color: var(--text-main); }
  </style>
</div>
`;

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

  constructor(
    private root: HTMLElement,
    private evaluate: Evaluator,
    private onStatus: (text: string, inferenceTime?: number) => void
  ) {}

  init() {
    this.root.innerHTML = textTemplate;
    this.root.querySelectorAll<HTMLElement>('[id]').forEach((node) => (this.el[node.id] = node));

    new ViewToggle(
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
    this.el['dt-items-title'].textContent = this.kind === 'score' ? 'Rubric (lowest to highest)' : 'Options';
    this.el['dt-add-label'].textContent = this.kind === 'score' ? 'Add level' : 'Add option';
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

  private async run() {
    this.saveDraft();
    const d = this.drafts[this.kind];
    if (!d.input.trim()) return this.onStatus('Enter some input text.');
    const { question, error } = this.buildQuestion(d);
    if (error) return this.onStatus(error);

    this.busy = true;
    this.updateButton();
    this.onStatus('Evaluating...');
    try {
      const msg = await this.evaluate(this.kind, d.input.trim(), question);
      if (msg.type !== 'DECIDE_RESULT') throw new Error(msg.error);
      this.showOutcome(this.format(msg.result, d));
      this.onStatus('Done', msg.inferenceTime);
    } catch (e: any) {
      this.onStatus(`Error: ${e?.message ?? e}`);
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
