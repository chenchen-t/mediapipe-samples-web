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
 * selector, Load Model button, load status, streaming progress bar and the
 * delegate select. All state lives in decisionRuntime, so the controls show
 * the same model on both pages.
 */

import { ModelSelector, type ModelSelection } from './model-selector';
import { DECISION_MODELS, decisionRuntime, type Delegate } from './decision-runtime';

const MODEL_PANEL_HTML = `
  <div class="section-title">Model Selection</div>
  <div id="model-selector-container"></div>
  <button
    type="button"
    id="dm-load-btn"
    class="action-button secondary"
    style="width: 100%; padding: 8px 12px; font-size: 0.84rem; margin: 8px 0"
  >
    Load Model
  </button>
  <div id="dm-load-status" class="status-text">Ready to load model</div>
  <div id="dm-progress-wrap" style="display: none; margin-top: 10px">
    <div class="progress-container">
      <div class="progress-bar" id="dm-progress-bar"></div>
    </div>
    <div class="progress-text" id="dm-progress-text">Streaming model... 0%</div>
  </div>`;

const DELEGATE_HTML = `
  <div class="control-group">
    <div class="control-label">
      <span>Delegate</span>
    </div>
    <div class="select-wrapper">
      <select id="delegate-select">
        <option value="GPU">GPU</option>
        <option value="CPU">CPU</option>
      </select>
    </div>
  </div>`;

/**
 * Renders the model controls into `modelContainer` and the delegate select into
 * `delegateContainer`, wired to decisionRuntime. Returns a cleanup function.
 */
export function mountDecisionModelPanel(modelContainer: HTMLElement, delegateContainer: HTMLElement): () => void {
  modelContainer.innerHTML = MODEL_PANEL_HTML;
  delegateContainer.innerHTML = DELEGATE_HTML;
  const $ = (id: string) => modelContainer.querySelector<HTMLElement>(`#${id}`)!;
  const loadBtn = $('dm-load-btn') as HTMLButtonElement;
  const loadStatus = $('dm-load-status');
  const progressWrap = $('dm-progress-wrap');
  const progressBar = $('dm-progress-bar');
  const progressText = $('dm-progress-text');
  const delegateSelect = delegateContainer.querySelector<HTMLSelectElement>('#delegate-select')!;

  new ModelSelector(
    'model-selector-container',
    Object.entries(DECISION_MODELS).map(([value, m]) => ({
      value,
      label: m.label,
      isDefault: value === decisionRuntime.modelName,
    })),
    (selection: ModelSelection) => {
      if (selection.type === 'custom') decisionRuntime.selectFile(selection.file);
      else decisionRuntime.select(selection.value);
    }
  );
  // Listed so users know they're coming, but not selectable yet.
  for (const [value, m] of Object.entries(DECISION_MODELS)) {
    if (!m.unsupported) continue;
    const option = modelContainer.querySelector<HTMLOptionElement>(`.model-select option[value="${value}"]`);
    if (option) option.disabled = true;
  }
  // Decision models also ship as .litertlm (e.g. EmbeddingGemma), so allow those for upload.
  const upload = modelContainer.querySelector<HTMLInputElement>('.model-upload');
  if (upload) {
    upload.accept = '.task,.tflite,.litertlm';
    const label = upload.parentElement?.firstChild;
    if (label?.nodeType === Node.TEXT_NODE) label.textContent = 'Choose .task / .tflite / .litertlm File';
  }

  loadBtn.addEventListener('click', () => decisionRuntime.load());
  delegateSelect.addEventListener('change', () => decisionRuntime.setDelegate(delegateSelect.value as Delegate));

  /** Streaming progress bar, same format as the retrieval demos. */
  const showProgress = (loaded: number, total: number) => {
    progressWrap.style.display = 'block';
    const mbLoaded = (loaded / (1024 * 1024)).toFixed(1);
    if (total > 0) {
      const pct = Math.min(100, Math.round((loaded / total) * 100));
      progressBar.style.width = `${pct}%`;
      progressText.textContent =
        loaded >= total
          ? `Streamed ${mbLoaded} MB · initializing model...`
          : `Streaming model: ${mbLoaded} / ${(total / (1024 * 1024)).toFixed(1)} MB (${pct}%)`;
    } else {
      progressBar.style.width = '100%';
      progressText.textContent = `Streaming model: ${mbLoaded} MB...`;
    }
  };

  /** Syncs the button, the status line under it, the delegate select and the progress bar. */
  const renderState = () => {
    const rt = decisionRuntime;
    loadBtn.disabled = rt.loading;
    loadBtn.textContent = rt.loading ? 'Loading…' : 'Load Model';
    delegateSelect.value = rt.delegate;
    if (!rt.loading) progressWrap.style.display = 'none';
    const selected = rt.currentLabel();
    if (rt.loading) loadStatus.textContent = `Loading ${rt.loadingLabel}...`;
    else if (rt.failed) loadStatus.textContent = `Failed to load ${rt.loadingLabel}`;
    else if (rt.loadedLabel && rt.loadedLabel === selected) loadStatus.textContent = `✓ Loaded: ${rt.loadedLabel}`;
    else if (rt.loadedLabel) loadStatus.textContent = `✓ Loaded: ${rt.loadedLabel} · press Load Model to switch`;
    else loadStatus.textContent = 'Ready to load model';
  };

  const unsubscribe = decisionRuntime.subscribe((event) => {
    if (event.type === 'progress') showProgress(event.loaded, event.total);
    else if (event.type === 'loading') progressWrap.style.display = 'none';
    else if (event.type === 'state') renderState();
  });
  renderState();
  return unsubscribe;
}
