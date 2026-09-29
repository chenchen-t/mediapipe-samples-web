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

import './banner.css';

export const MEDIAPIPE_DOCS_OVERVIEW_URL = 'https://developers.google.com/edge/mediapipe/solutions/guide';

export interface TaskBannerLinks {
  label: string;
  docsUrl: string;
  sampleCodeUrl: string;
  stackblitzUrl: string;
}

export const TASK_BANNER_LINKS: Record<string, TaskBannerLinks> = {
  '/vision/object_detector': {
    label: 'Object Detector',
    docsUrl: 'https://developers.google.com/edge/mediapipe/solutions/vision/object_detector/web_js',
    sampleCodeUrl: 'https://github.com/google-ai-edge/mediapipe-samples-web/blob/main/src/tasks/object-detector.ts',
    stackblitzUrl:
      'https://stackblitz.com/github/google-ai-edge/mediapipe-samples-web?file=src%2Ftasks%2Fobject-detector.ts',
  },
  '/vision/face_detector': {
    label: 'Face Detector',
    docsUrl: 'https://developers.google.com/edge/mediapipe/solutions/vision/face_detector/web_js',
    sampleCodeUrl: 'https://github.com/google-ai-edge/mediapipe-samples-web/blob/main/src/tasks/face-detector.ts',
    stackblitzUrl:
      'https://stackblitz.com/github/google-ai-edge/mediapipe-samples-web?file=src%2Ftasks%2Fface-detector.ts',
  },
  '/vision/face_landmarker': {
    label: 'Face Landmarker',
    docsUrl: 'https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js',
    sampleCodeUrl: 'https://github.com/google-ai-edge/mediapipe-samples-web/blob/main/src/tasks/face-landmarker.ts',
    stackblitzUrl:
      'https://stackblitz.com/github/google-ai-edge/mediapipe-samples-web?file=src%2Ftasks%2Fface-landmarker.ts',
  },
  '/vision/hand_landmarker': {
    label: 'Hand Landmarker',
    docsUrl: 'https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js',
    sampleCodeUrl: 'https://github.com/google-ai-edge/mediapipe-samples-web/blob/main/src/tasks/hand-landmarker.ts',
    stackblitzUrl:
      'https://stackblitz.com/github/google-ai-edge/mediapipe-samples-web?file=src%2Ftasks%2Fhand-landmarker.ts',
  },
  '/vision/pose_landmarker': {
    label: 'Pose Landmarker',
    docsUrl: 'https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js',
    sampleCodeUrl: 'https://github.com/google-ai-edge/mediapipe-samples-web/blob/main/src/tasks/pose-landmarker.ts',
    stackblitzUrl:
      'https://stackblitz.com/github/google-ai-edge/mediapipe-samples-web?file=src%2Ftasks%2Fpose-landmarker.ts',
  },
  '/vision/holistic_landmarker': {
    label: 'Holistic Landmarker',
    docsUrl: 'https://developers.google.com/edge/mediapipe/solutions/vision/holistic_landmarker/web_js',
    sampleCodeUrl: 'https://github.com/google-ai-edge/mediapipe-samples-web/blob/main/src/tasks/holistic-landmarker.ts',
    stackblitzUrl:
      'https://stackblitz.com/github/google-ai-edge/mediapipe-samples-web?file=src%2Ftasks%2Fholistic-landmarker.ts',
  },
  '/vision/image_classifier': {
    label: 'Image Classifier',
    docsUrl: 'https://developers.google.com/edge/mediapipe/solutions/vision/image_classifier/web_js',
    sampleCodeUrl: 'https://github.com/google-ai-edge/mediapipe-samples-web/blob/main/src/tasks/image-classifier.ts',
    stackblitzUrl:
      'https://stackblitz.com/github/google-ai-edge/mediapipe-samples-web?file=src%2Ftasks%2Fimage-classifier.ts',
  },
  '/vision/gesture_recognizer': {
    label: 'Gesture Recognizer',
    docsUrl: 'https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer/web_js',
    sampleCodeUrl: 'https://github.com/google-ai-edge/mediapipe-samples-web/blob/main/src/tasks/gesture-recognizer.ts',
    stackblitzUrl:
      'https://stackblitz.com/github/google-ai-edge/mediapipe-samples-web?file=src%2Ftasks%2Fgesture-recognizer.ts',
  },
  '/vision/interactive_segmenter': {
    label: 'Interactive Segmenter',
    docsUrl: 'https://developers.google.com/edge/mediapipe/solutions/vision/interactive_segmenter/web_js',
    sampleCodeUrl:
      'https://github.com/google-ai-edge/mediapipe-samples-web/blob/main/src/tasks/interactive-segmenter.ts',
    stackblitzUrl:
      'https://stackblitz.com/github/google-ai-edge/mediapipe-samples-web?file=src%2Ftasks%2Finteractive-segmenter.ts',
  },
  '/vision/image_segmenter': {
    label: 'Image Segmenter',
    docsUrl: 'https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter/web_js',
    sampleCodeUrl: 'https://github.com/google-ai-edge/mediapipe-samples-web/blob/main/src/tasks/image-segmenter.ts',
    stackblitzUrl:
      'https://stackblitz.com/github/google-ai-edge/mediapipe-samples-web?file=src%2Ftasks%2Fimage-segmenter.ts',
  },
  '/vision/image_embedder': {
    label: 'Image Embedder',
    docsUrl: 'https://developers.google.com/edge/mediapipe/solutions/vision/image_embedder/web_js',
    sampleCodeUrl: 'https://github.com/google-ai-edge/mediapipe-samples-web/blob/main/src/tasks/image-embedder.ts',
    stackblitzUrl:
      'https://stackblitz.com/github/google-ai-edge/mediapipe-samples-web?file=src%2Ftasks%2Fimage-embedder.ts',
  },
  '/audio/audio_classifier': {
    label: 'Audio Classifier',
    docsUrl: 'https://developers.google.com/edge/mediapipe/solutions/audio/audio_classifier/web_js',
    sampleCodeUrl: 'https://github.com/google-ai-edge/mediapipe-samples-web/blob/main/src/tasks/audio-classifier.ts',
    stackblitzUrl:
      'https://stackblitz.com/github/google-ai-edge/mediapipe-samples-web?file=src%2Ftasks%2Faudio-classifier.ts',
  },
  '/text/text_classifier': {
    label: 'Text Classifier',
    docsUrl: 'https://developers.google.com/edge/mediapipe/solutions/text/text_classifier/web_js',
    sampleCodeUrl: 'https://github.com/google-ai-edge/mediapipe-samples-web/blob/main/src/tasks/text-classifier.ts',
    stackblitzUrl:
      'https://stackblitz.com/github/google-ai-edge/mediapipe-samples-web?file=src%2Ftasks%2Ftext-classifier.ts',
  },
  '/text/language_detector': {
    label: 'Language Detector',
    docsUrl: 'https://developers.google.com/edge/mediapipe/solutions/text/language_detector/web_js',
    sampleCodeUrl: 'https://github.com/google-ai-edge/mediapipe-samples-web/blob/main/src/tasks/language-detector.ts',
    stackblitzUrl:
      'https://stackblitz.com/github/google-ai-edge/mediapipe-samples-web?file=src%2Ftasks%2Flanguage-detector.ts',
  },
  '/text/text_embedder': {
    label: 'Text Embedder',
    docsUrl: 'https://developers.google.com/edge/mediapipe/solutions/text/text_embedder/web_js',
    sampleCodeUrl: 'https://github.com/google-ai-edge/mediapipe-samples-web/blob/main/src/tasks/text-embedder.ts',
    stackblitzUrl:
      'https://stackblitz.com/github/google-ai-edge/mediapipe-samples-web?file=src%2Ftasks%2Ftext-embedder.ts',
  },
};

export function renderBanner(container: HTMLElement) {
  const defaultLinks = TASK_BANNER_LINKS['/vision/object_detector'];
  container.innerHTML = `
    <div class="docs-banner" role="region" aria-label="Documentation and code links">
      <div class="docs-banner-left">
        <a
          id="banner-docs-overview"
          href="${MEDIAPIPE_DOCS_OVERVIEW_URL}"
          target="_blank"
          rel="noopener noreferrer"
          class="docs-banner-link"
        >
          <span class="material-icons docs-banner-icon">menu_book</span>
          <span>MediaPipe Docs</span>
          <span class="material-icons docs-banner-external">open_in_new</span>
        </a>
        <span class="docs-banner-separator" aria-hidden="true">/</span>
        <a
          id="banner-task-docs"
          href="${defaultLinks.docsUrl}"
          target="_blank"
          rel="noopener noreferrer"
          class="docs-banner-link task-guide-link"
        >
          <span id="banner-task-docs-label">${defaultLinks.label} Guide</span>
          <span class="material-icons docs-banner-external">open_in_new</span>
        </a>
      </div>
      <div class="docs-banner-actions">
        <a
          id="banner-sample-code"
          href="${defaultLinks.sampleCodeUrl}"
          target="_blank"
          rel="noopener noreferrer"
          class="docs-banner-chip"
        >
          <span class="material-icons">code</span>
          <span>Code Sample</span>
        </a>
        <a
          id="banner-stackblitz"
          href="${defaultLinks.stackblitzUrl}"
          target="_blank"
          rel="noopener noreferrer"
          class="docs-banner-chip stackblitz-chip"
        >
          <span class="material-icons">bolt</span>
          <span>Edit in StackBlitz</span>
        </a>
      </div>
    </div>
  `;
}

export function updateBanner(routeKey: string) {
  const links = TASK_BANNER_LINKS[routeKey] || TASK_BANNER_LINKS['/vision/object_detector'];

  const taskDocsLink = document.getElementById('banner-task-docs') as HTMLAnchorElement | null;
  const taskDocsLabel = document.getElementById('banner-task-docs-label');
  const sampleCodeLink = document.getElementById('banner-sample-code') as HTMLAnchorElement | null;
  const stackblitzLink = document.getElementById('banner-stackblitz') as HTMLAnchorElement | null;

  if (taskDocsLink) {
    taskDocsLink.href = links.docsUrl;
  }
  if (taskDocsLabel) {
    taskDocsLabel.textContent = `${links.label} Guide`;
  }
  if (sampleCodeLink) {
    sampleCodeLink.href = links.sampleCodeUrl;
  }
  if (stackblitzLink) {
    stackblitzLink.href = links.stackblitzUrl;
  }
}
