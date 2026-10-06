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

// @ts-ignore
import {
  DefaultTextChunker,
  FilesetResolver,
  MemoryVectorStore,
  SemanticRetriever,
  SemanticRetrieverComponents,
  UniversalEmbedder,
} from '@mediapipe/tasks-retrieval';

import { ViewToggle } from './view-toggle';

export interface SampleImageItem {
  id: string;
  label: string;
  fileName: string;
}

export const SAMPLE_IMAGES: SampleImageItem[] = [
  { id: 'red_apple', label: 'red apple', fileName: 'red_apple.jpg' },
  { id: 'yellow_banana', label: 'yellow banana', fileName: 'yellow_banana.jpg' },
  { id: 'cute_cat', label: 'cute cat', fileName: 'cute_cat.jpg' },
  { id: 'fast_car', label: 'fast car', fileName: 'fast_car.jpg' },
  { id: 'green_tree', label: 'green tree', fileName: 'green_tree.jpg' },
  { id: 'blue_sky', label: 'blue sky', fileName: 'blue_sky.jpg' },
  { id: 'coffee_mug', label: 'coffee mug', fileName: 'coffee_mug.jpg' },
  { id: 'open_book', label: 'open book', fileName: 'open_book.jpg' },
  { id: 'sunny_beach', label: 'sunny beach', fileName: 'sunny_beach.jpg' },
  {
    id: 'snowy_mountain',
    label: 'snowy mountain',
    fileName: 'snowy_mountain.jpg',
  },
];

/** Metadata configuration for standard pre-quantized retrieval models. */
export interface StandardRetrievalModel {
  id: string;
  name: string;
  url: string;
  defaultFileName: string;
  description?: string;
}

/**
 * Standard pre-configured multimodal retrieval models available in the demo.
 */
export const STANDARD_RETRIEVAL_MODELS: StandardRetrievalModel[] = [
  {
    id: 'embeddinggemma-2-text-vision-440m',
    name: 'EmbeddingGemma-2 Text-Vision 440M',
    url: 'https://huggingface.co/litert-community/embeddinggemma-2-text-vision-440m-litert-lm',
    defaultFileName: 'embeddinggemma-2-text-vision-440m.litertlm',
    description: 'Multimodal (Text & Image)',
  },
  {
    id: 'embeddinggemma-2-740m',
    name: 'EmbeddingGemma-2 740M',
    url: 'https://huggingface.co/litert-community/embeddinggemma-2-740m-litert-lm',
    defaultFileName: 'embeddinggemma-2-740m.litertlm',
    description: 'Multimodal (Text & Image & Audio)',
  },
];

/**
 * Resolves model page URLs (e.g. Hugging Face repository or tree URLs) to their
 * direct binary download endpoints suitable for HTTP fetching and streaming.
 *
 * Browsers require direct raw binary streams (HTTP 200/206 with binary content)
 * to initialize LiteRT LM via WebAssembly / WebGPU. When users copy links from
 * Hugging Face or select pre-defined models, the input URL can come in multiple
 * web-facing formats rather than a direct raw download URL.
 *
 * @param rawUrl The input URL from UI selection, input field, or configuration.
 * @returns The direct HTTP download URL that resolves to raw model binary bytes.
 */
export function resolveModelDownloadUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  const hfRepoMatch = trimmed.match(
    /^https?:\/\/huggingface\.co\/([^/]+)\/([^/]+)(?:\/(?:tree|blob|resolve)\/([^/]+)(?:\/(.+))?)?$/
  );
  if (hfRepoMatch) {
    const [, org, repo, branchOrType, filePath] = hfRepoMatch;
    // 1. Direct download endpoint already specified
    if (branchOrType === 'resolve' && filePath) {
      return trimmed;
    }
    // 2. Look up the specific model filename for known repository versions
    const matched = STANDARD_RETRIEVAL_MODELS.find((m) => m.url.includes(`${org}/${repo}`));
    const fileName = filePath || (matched ? matched.defaultFileName : `${repo}.litertlm`);
    // 3. Preserve custom git branch/tag/revision if specified, otherwise default to 'main'
    const branch = branchOrType && branchOrType !== 'tree' && branchOrType !== 'blob' ? branchOrType : 'main';
    return `https://huggingface.co/${org}/${repo}/resolve/${branch}/${fileName}`;
  }
  // Passthrough for non-Hugging Face URLs (GCS, local dev server, direct CDNs)
  return trimmed;
}

/**
 * WASM binaries location.
 * Local: './wasm' (populated by copy-wasm.js to public/wasm/).
 * TODO(gkarpiak): Post-release CDN: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-retrieval@1.1.0/wasm'
 */
export const RETRIEVAL_WASM_PATH = './wasm';

/** Base path for sample images located in public/images/ */
export const SAMPLE_IMAGES_PATH = './images';

class RetrievalRuntimeManager {
  public wasmFileset: any = null;
  public embedder: any = null;
  public activeModelLabel: string | null = null;
  public activeL2Normalize = true;
  public lastSelectedFile: File | null = null;
  public lastSelectedUrl = STANDARD_RETRIEVAL_MODELS[0].url;
  public isInitializing = false;
  private imageBytesCache = new Map<string, Uint8Array>();

  getImageUrl(fileName: string): string {
    return `${SAMPLE_IMAGES_PATH}/${fileName}`;
  }

  async fetchSampleImageBytes(sample: SampleImageItem): Promise<Uint8Array> {
    if (this.imageBytesCache.has(sample.id)) {
      return this.imageBytesCache.get(sample.id)!;
    }
    const url = this.getImageUrl(sample.fileName);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch sample image ${url} (${response.status})`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    this.imageBytesCache.set(sample.id, bytes);
    return bytes;
  }

  async resolveWasmFileset(): Promise<any> {
    if (this.wasmFileset) return this.wasmFileset;
    this.wasmFileset = await (FilesetResolver as any).forRetrievalTasks(RETRIEVAL_WASM_PATH);
    return this.wasmFileset;
  }

  isReady(): boolean {
    return this.embedder !== null && !this.isInitializing;
  }

  createProgressReader(
    sourceStream: ReadableStream<Uint8Array>,
    totalBytes: number,
    onProgress?: ((loaded: number, total: number) => void) | null
  ): ReadableStreamDefaultReader<Uint8Array> {
    const rawReader = sourceStream.getReader();
    let loadedBytes = 0;

    const trackedStream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const { done, value } = await rawReader.read();
        if (done) {
          controller.close();
          return;
        }
        loadedBytes += value.byteLength;
        if (onProgress) {
          onProgress(loadedBytes, totalBytes);
        }
        controller.enqueue(value);
      },
      cancel(reason) {
        return rawReader.cancel(reason);
      },
    });

    return trackedStream.getReader();
  }

  async initializeFromFile(
    file: File,
    l2Normalize = true,
    onProgress?: ((loaded: number, total: number) => void) | null
  ): Promise<any> {
    this.lastSelectedFile = file;
    this.isInitializing = true;

    try {
      const wasmFileset = await this.resolveWasmFileset();
      if (this.embedder) {
        try {
          this.embedder.close();
        } catch {
          // Ignore close errors
        }
        this.embedder = null;
      }

      const reader = this.createProgressReader(file.stream(), file.size, onProgress);

      this.embedder = await UniversalEmbedder.createFromOptions(wasmFileset, {
        baseOptions: {
          modelAssetBuffer: reader,
        },
        l2Normalize,
      });

      this.activeModelLabel = `${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`;
      this.activeL2Normalize = l2Normalize;
      return this.embedder;
    } finally {
      this.isInitializing = false;
    }
  }

  async initializeFromUrl(
    url: string,
    l2Normalize = true,
    onProgress?: ((loaded: number, total: number) => void) | null
  ): Promise<any> {
    this.lastSelectedUrl = url;
    this.isInitializing = true;

    try {
      const wasmFileset = await this.resolveWasmFileset();
      const downloadUrl = resolveModelDownloadUrl(url);

      const response = await fetch(downloadUrl);
      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status} when fetching ${downloadUrl}`);
      }

      if (this.embedder) {
        try {
          this.embedder.close();
        } catch {
          // Ignore close errors
        }
        this.embedder = null;
      }

      const contentLength = Number(response.headers.get('content-length') || 0);
      const reader = this.createProgressReader(response.body, contentLength, onProgress);

      this.embedder = await UniversalEmbedder.createFromOptions(wasmFileset, {
        baseOptions: {
          modelAssetBuffer: reader,
        },
        l2Normalize,
      });

      const matched = STANDARD_RETRIEVAL_MODELS.find((m) => m.url === url);
      this.activeModelLabel = matched ? matched.name : url.split('/').pop() || url;
      this.activeL2Normalize = l2Normalize;
      return this.embedder;
    } finally {
      this.isInitializing = false;
    }
  }

  async createSemanticRetriever(chunkSize = 512, chunkOverlap = 100): Promise<any> {
    if (!this.embedder) {
      throw new Error('UniversalEmbedder is not initialized yet.');
    }
    const wasmFileset = await this.resolveWasmFileset();
    let textChunker;
    if (this.embedder.wasmModule && typeof DefaultTextChunker.createFromModule === 'function') {
      textChunker = DefaultTextChunker.createFromModule(this.embedder.wasmModule, chunkSize, chunkOverlap);
    } else {
      textChunker = await DefaultTextChunker.create(wasmFileset, chunkSize, chunkOverlap);
    }

    const vectorStore = new MemoryVectorStore();
    const components = new SemanticRetrieverComponents()
      .addProvider(this.embedder.getProvider())
      .setVectorStore(vectorStore)
      .setTextChunker(textChunker);

    return SemanticRetriever.createFromComponents(components);
  }
}

export const retrievalRuntime = new RetrievalRuntimeManager();

export interface ModelSelectorCallbacks {
  getL2Normalize?: () => boolean;
  onLoadStart?: (message: string) => void;
  onModelReady?: () => Promise<void> | void;
  onError?: (err: any) => void;
}

export function mountModelSelector(containerId: string, callbacks: ModelSelectorCallbacks) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const isAlreadyLoaded = retrievalRuntime.isReady();
  const activeLabel = retrievalRuntime.activeModelLabel || 'No model loaded yet';

  container.innerHTML = `
    <div id="${containerId}-tabs"></div>

    <div id="${containerId}-tab-standard" class="tab-content active">
      <div class="select-wrapper">
        <select id="${containerId}-standard-select">
          ${STANDARD_RETRIEVAL_MODELS.map(
            (model, idx) => `<option value="${model.url}" ${idx === 0 ? 'selected' : ''}>${model.name}</option>`
          ).join('')}
        </select>
      </div>
      <button type="button" id="${containerId}-standard-load-btn" class="action-button secondary" style="width: 100%; padding: 8px 12px; font-size: 0.84rem; margin-bottom: 8px;">
        Load Model
      </button>
      <div class="status-text" id="${containerId}-standard-status">
        ${isAlreadyLoaded ? `✓ Loaded: ${activeLabel}` : 'Ready to load model'}
      </div>
    </div>

    <div id="${containerId}-tab-upload" class="tab-content">
      <label class="file-upload-btn" id="${containerId}-file-label">
        <span>Choose .litertlm Model</span>
        <input type="file" id="${containerId}-file-input" accept=".litertlm,.bin,.task,.tflite" />
      </label>
      <div class="status-text" id="${containerId}-upload-status">
        ${isAlreadyLoaded ? `✓ Loaded: ${activeLabel}` : 'Select a local .litertlm file'}
      </div>
    </div>

    <div id="${containerId}-progress-wrap" style="display: none; margin-top: 10px;">
      <div class="progress-container">
        <div class="progress-bar" id="${containerId}-progress-bar"></div>
      </div>
      <div class="progress-text" id="${containerId}-progress-text">Streaming model... 0%</div>
    </div>
  `;

  const standardTab = document.getElementById(`${containerId}-tab-standard`)!;
  const uploadTab = document.getElementById(`${containerId}-tab-upload`)!;
  const standardSelect = document.getElementById(`${containerId}-standard-select`) as HTMLSelectElement;
  const standardLoadBtn = document.getElementById(`${containerId}-standard-load-btn`) as HTMLButtonElement;
  const standardStatus = document.getElementById(`${containerId}-standard-status`)!;
  const fileInput = document.getElementById(`${containerId}-file-input`) as HTMLInputElement;
  const uploadStatus = document.getElementById(`${containerId}-upload-status`)!;
  const progressWrap = document.getElementById(`${containerId}-progress-wrap`)!;
  const progressBar = document.getElementById(`${containerId}-progress-bar`)!;
  const progressText = document.getElementById(`${containerId}-progress-text`)!;

  new ViewToggle(
    `${containerId}-tabs`,
    [
      { label: 'Standard', value: 'standard', icon: 'grid_view' },
      { label: 'Upload', value: 'upload', icon: 'upload' },
    ],
    'standard',
    (tab) => {
      if (tab === 'standard') {
        standardTab.classList.add('active');
        uploadTab.classList.remove('active');
      } else {
        uploadTab.classList.add('active');
        standardTab.classList.remove('active');
      }
    },
    'tabs'
  );

  const showProgress = (loaded: number, total: number) => {
    progressWrap.style.display = 'block';
    const mbLoaded = (loaded / (1024 * 1024)).toFixed(1);
    if (total > 0) {
      const pct = Math.min(100, Math.round((loaded / total) * 100));
      const mbTotal = (total / (1024 * 1024)).toFixed(1);
      progressBar.style.width = `${pct}%`;
      progressText.textContent = `Streaming model: ${mbLoaded} / ${mbTotal} MB (${pct}%)`;
    } else {
      progressBar.style.width = '100%';
      progressText.textContent = `Streaming model: ${mbLoaded} MB...`;
    }
  };

  const hideProgress = () => {
    progressWrap.style.display = 'none';
  };

  standardLoadBtn.addEventListener('click', async () => {
    const selectedUrl = standardSelect.value;
    const selectedModel = STANDARD_RETRIEVAL_MODELS.find((m) => m.url === selectedUrl);
    const modelName = selectedModel ? selectedModel.name : selectedUrl;
    const l2Normalize = callbacks.getL2Normalize ? callbacks.getL2Normalize() : true;

    standardStatus.textContent = `Loading ${modelName}...`;
    callbacks.onLoadStart?.(`Loading ${modelName}...`);

    try {
      await retrievalRuntime.initializeFromUrl(selectedUrl, l2Normalize, showProgress);
      hideProgress();
      standardStatus.textContent = `✓ Loaded: ${retrievalRuntime.activeModelLabel}`;
      uploadStatus.textContent = `✓ Loaded: ${retrievalRuntime.activeModelLabel}`;
      await callbacks.onModelReady?.();
    } catch (err: any) {
      hideProgress();
      standardStatus.textContent = `Failed to load ${modelName}`;
      callbacks.onError?.(err);
    }
  });

  fileInput.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    uploadStatus.textContent = `Loading ${file.name}...`;
    const l2Normalize = callbacks.getL2Normalize ? callbacks.getL2Normalize() : true;
    callbacks.onLoadStart?.(`Loading ${file.name}...`);
    try {
      await retrievalRuntime.initializeFromFile(file, l2Normalize, showProgress);
      hideProgress();
      uploadStatus.textContent = `✓ Loaded: ${retrievalRuntime.activeModelLabel}`;
      standardStatus.textContent = `✓ Loaded: ${retrievalRuntime.activeModelLabel}`;
      await callbacks.onModelReady?.();
    } catch (err: any) {
      hideProgress();
      uploadStatus.textContent = `Failed to load ${file.name}`;
      callbacks.onError?.(err);
    }
  });
}
