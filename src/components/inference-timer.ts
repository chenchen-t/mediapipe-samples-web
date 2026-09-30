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

import './inference-timer.css';

export interface InferenceSample {
  time: number;
  delegate: 'CPU' | 'GPU';
}

interface CumulativeStats {
  gpuSum: number;
  gpuCount: number;
  cpuSum: number;
  cpuCount: number;
  history: InferenceSample[];
}

const GPU_COLOR = '#007f8b';
const GPU_FILL = 'rgba(0, 127, 139, 0.16)';
const CPU_COLOR = '#d97706';
const CPU_FILL = 'rgba(217, 119, 6, 0.16)';

// Persist cumulative averages and history per route since page load
const sessionStatsByRoute = new Map<string, CumulativeStats>();

function getRouteStats(): CumulativeStats {
  const key = window.location.hash || '#/vision/object_detector';
  let stats = sessionStatsByRoute.get(key);
  if (!stats) {
    stats = {
      gpuSum: 0,
      gpuCount: 0,
      cpuSum: 0,
      cpuCount: 0,
      history: [],
    };
    sessionStatsByRoute.set(key, stats);
  }
  return stats;
}

export class InferenceTimer {
  private readonly rollingWindowSize: number;
  private readonly maxHistorySize: number;
  private readonly textUpdateIntervalMs: number;

  private rollingSamples: number[] = [];
  private lastTextUpdateMs = 0;
  private lastDisplayedAvg = 0;
  private pendingUpdateTimer: number | undefined;

  private canvas: HTMLCanvasElement | null = null;
  private valueBadgeEl: HTMLElement | null = null;
  private gpuAvgEl: HTMLElement | null = null;
  private cpuAvgEl: HTMLElement | null = null;

  constructor(rollingWindowSize = 10, maxHistorySize = 50, textUpdateIntervalMs = 180) {
    this.rollingWindowSize = rollingWindowSize;
    this.maxHistorySize = maxHistorySize;
    this.textUpdateIntervalMs = textUpdateIntervalMs;
  }

  public mount() {
    const statusGroup = document.querySelector('.status-group');
    if (!statusGroup) return;

    const statusEl = document.getElementById('status-message');
    if (statusEl) {
      statusEl.classList.add('sr-only-status');
    }

    const stats = getRouteStats();
    const lastTime = stats.history.length > 0 ? stats.history[stats.history.length - 1].time : null;
    const initialBadgeText = lastTime !== null ? `${lastTime.toFixed(2)} ms` : '- ms';

    const inferenceTimeEl = document.getElementById('inference-time');
    if (inferenceTimeEl) {
      inferenceTimeEl.className = 'inference-header-row';
      inferenceTimeEl.innerHTML = `<span class="inference-section-title">Inference Time<span class="inference-sr-colon">: </span></span><span id="inference-time-value" class="inference-current-badge">${initialBadgeText}</span>`;
      this.valueBadgeEl = inferenceTimeEl.querySelector('#inference-time-value');
    }

    if (statusEl && inferenceTimeEl) {
      statusGroup.insertBefore(statusEl, inferenceTimeEl.nextSibling);
    }

    let container = document.getElementById('inference-history-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'inference-history-container';
      container.className = 'inference-history-body';
      container.innerHTML = `
        <div class="inference-graph-wrapper">
          <canvas id="inference-history-canvas" class="inference-history-canvas"></canvas>
        </div>
        <div class="inference-delegate-summary">
          <span class="inference-delegate-stat">
            <span class="inference-legend-dot gpu"></span>
            GPU: <strong id="inference-gpu-avg">--</strong>
          </span>
          <span class="inference-delegate-stat">
            <span class="inference-legend-dot cpu"></span>
            CPU: <strong id="inference-cpu-avg">--</strong>
          </span>
        </div>
      `;

      statusGroup.appendChild(container);
    }

    this.canvas = container.querySelector('#inference-history-canvas') as HTMLCanvasElement | null;
    this.gpuAvgEl = container.querySelector('#inference-gpu-avg') as HTMLElement | null;
    this.cpuAvgEl = container.querySelector('#inference-cpu-avg') as HTMLElement | null;

    this.drawGraph();
    this.updateDelegateSummaries();
  }

  /**
   * Keeps #status-message accessible in the DOM for tests/screen-readers while showing
   * loading/error states in the Inference Time badge until inference time is available.
   */
  public syncStatusVisibility(msg: string) {
    const statusEl = document.getElementById('status-message');

    if (!this.valueBadgeEl || !this.valueBadgeEl.isConnected) {
      this.valueBadgeEl = document.getElementById('inference-time-value');
    }
    if (!this.valueBadgeEl) return;

    const isError = /^error\b/i.test(msg.trim()) || msg.toLowerCase().includes('failed');
    const isDoneOrReady =
      msg.startsWith('Done') || msg === 'Ready' || msg === 'Webcam running...' || msg.includes('Ready');

    if (isError) {
      if (statusEl) {
        statusEl.classList.remove('sr-only-status');
        statusEl.classList.add('status-error');
      }
      this.valueBadgeEl.classList.add('error');
      this.valueBadgeEl.textContent = 'Error';
      return;
    }

    if (statusEl) {
      statusEl.classList.remove('status-error');
      statusEl.classList.add('sr-only-status');
    }
    this.valueBadgeEl.classList.remove('error');

    if (!isDoneOrReady) {
      this.valueBadgeEl.textContent = msg.length > 24 ? `${msg.slice(0, 22)}…` : msg;
    } else if (this.lastDisplayedAvg > 0) {
      this.valueBadgeEl.textContent = `${this.lastDisplayedAvg.toFixed(2)} ms`;
    } else if (msg.includes('Ready') && this.valueBadgeEl.textContent === 'Loading Model...') {
      this.valueBadgeEl.textContent = '- ms';
    }
  }

  /**
   * Resets the short-term rolling average window (e.g. when switching between CPU and GPU)
   * while preserving cumulative CPU/GPU averages and graph history since page load.
   */
  public resetRollingWindow() {
    this.rollingSamples = [];
    this.lastTextUpdateMs = 0;
    if (this.pendingUpdateTimer !== undefined) {
      window.clearTimeout(this.pendingUpdateTimer);
      this.pendingUpdateTimer = undefined;
    }
  }

  public record(time: number, delegate: 'CPU' | 'GPU'): number {
    if (!Number.isFinite(time) || time < 0) {
      return this.lastDisplayedAvg;
    }

    const stats = getRouteStats();

    if (stats.history.length > 0 && stats.history[stats.history.length - 1].delegate !== delegate) {
      this.rollingSamples = [];
      this.lastTextUpdateMs = 0;
    }

    this.rollingSamples.push(time);
    if (this.rollingSamples.length > this.rollingWindowSize) {
      this.rollingSamples.shift();
    }

    if (delegate === 'GPU') {
      stats.gpuSum += time;
      stats.gpuCount += 1;
    } else {
      stats.cpuSum += time;
      stats.cpuCount += 1;
    }

    stats.history.push({ time, delegate });
    if (stats.history.length > this.maxHistorySize) {
      stats.history.shift();
    }

    const avg = this.computeRollingAverage();
    const now = performance.now();

    if (this.rollingSamples.length === 1 || now - this.lastTextUpdateMs >= this.textUpdateIntervalMs) {
      this.applyTextUpdate(avg);
      this.lastTextUpdateMs = now;
    } else if (this.pendingUpdateTimer === undefined) {
      const remaining = this.textUpdateIntervalMs - (now - this.lastTextUpdateMs);
      this.pendingUpdateTimer = window.setTimeout(
        () => {
          this.pendingUpdateTimer = undefined;
          this.applyTextUpdate(this.computeRollingAverage());
          this.lastTextUpdateMs = performance.now();
        },
        Math.max(16, remaining)
      );
    }

    if (!this.canvas || !this.canvas.isConnected) {
      this.mount();
    } else {
      this.drawGraph();
      this.updateDelegateSummaries();
    }

    return this.lastDisplayedAvg;
  }

  public cleanup() {
    if (this.pendingUpdateTimer !== undefined) {
      window.clearTimeout(this.pendingUpdateTimer);
      this.pendingUpdateTimer = undefined;
    }
  }

  private computeRollingAverage(): number {
    if (this.rollingSamples.length === 0) return 0;
    const sum = this.rollingSamples.reduce((acc, v) => acc + v, 0);
    return sum / this.rollingSamples.length;
  }

  private applyTextUpdate(avg: number) {
    this.lastDisplayedAvg = avg;
    const statusEl = document.getElementById('status-message');
    if (statusEl && statusEl.classList.contains('status-error')) {
      statusEl.classList.remove('status-error');
      statusEl.classList.add('sr-only-status');
    }
    if (!this.valueBadgeEl || !this.valueBadgeEl.isConnected) {
      this.valueBadgeEl = document.getElementById('inference-time-value');
    }
    if (this.valueBadgeEl) {
      this.valueBadgeEl.classList.remove('error');
      this.valueBadgeEl.textContent = `${avg.toFixed(2)} ms`;
    } else {
      const el = document.getElementById('inference-time');
      if (el) {
        el.innerText = `Inference Time: ${avg.toFixed(2)} ms`;
      }
    }
  }

  private updateDelegateSummaries() {
    const stats = getRouteStats();

    if (this.gpuAvgEl) {
      if (stats.gpuCount > 0) {
        const avg = stats.gpuSum / stats.gpuCount;
        this.gpuAvgEl.textContent = `${avg.toFixed(1)} ms`;
      } else {
        this.gpuAvgEl.textContent = '--';
      }
    }

    if (this.cpuAvgEl) {
      if (stats.cpuCount > 0) {
        const avg = stats.cpuSum / stats.cpuCount;
        this.cpuAvgEl.textContent = `${avg.toFixed(1)} ms`;
      } else {
        this.cpuAvgEl.textContent = '--';
      }
    }
  }

  private drawGraph() {
    if (!this.canvas) return;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    const stats = getRouteStats();
    const history = stats.history;

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = this.canvas.clientWidth || 248;
    const cssHeight = this.canvas.clientHeight || 64;

    if (this.canvas.width !== Math.round(cssWidth * dpr) || this.canvas.height !== Math.round(cssHeight * dpr)) {
      this.canvas.width = Math.round(cssWidth * dpr);
      this.canvas.height = Math.round(cssHeight * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const padLeft = 40;
    const padRight = 8;
    const padTop = 8;
    const padBottom = 8;
    const plotWidth = Math.max(10, cssWidth - padLeft - padRight);
    const plotHeight = Math.max(10, cssHeight - padTop - padBottom);

    // Subtle horizontal grid lines
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    for (const frac of [0, 0.5, 1]) {
      const y = padTop + plotHeight * frac;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + plotWidth, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    if (history.length === 0) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px "Google Sans", "Roboto", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No data yet', cssWidth / 2, cssHeight / 2);
      ctx.restore();
      return;
    }

    const maxVal = Math.max(...history.map((d) => d.time), 5);
    const yMax = maxVal * 1.2;

    const formatAxisLabel = (ms: number) => {
      if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
      return `${Math.round(ms)}ms`;
    };

    // Y-axis labels
    ctx.fillStyle = '#64748b';
    ctx.font = '9px "Roboto Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(formatAxisLabel(yMax), padLeft - 5, padTop + 2);
    ctx.fillText('0ms', padLeft - 5, padTop + plotHeight - 1);

    const getY = (val: number) => {
      const clamped = Math.max(0, Math.min(yMax, val));
      return padTop + plotHeight - (clamped / yMax) * plotHeight;
    };

    const n = history.length;
    const baseLineY = padTop + plotHeight;

    if (n === 1) {
      const sample = history[0];
      const y = getY(sample.time);
      const color = sample.delegate === 'GPU' ? GPU_COLOR : CPU_COLOR;
      const fill = sample.delegate === 'GPU' ? GPU_FILL : CPU_FILL;

      ctx.fillStyle = fill;
      ctx.fillRect(padLeft, y, plotWidth, baseLineY - y);

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + plotWidth, y);
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(padLeft + plotWidth / 2, y, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
      return;
    }

    const getX = (index: number) => padLeft + (index / (n - 1)) * plotWidth;

    // Build contiguous delegate segments splitting at the midpoint when delegate switches
    interface Point {
      x: number;
      y: number;
    }
    interface Segment {
      delegate: 'CPU' | 'GPU';
      points: Point[];
    }

    const segments: Segment[] = [
      {
        delegate: history[0].delegate,
        points: [{ x: getX(0), y: getY(history[0].time) }],
      },
    ];
    const transitionXs: number[] = [];

    for (let i = 1; i < n; i++) {
      const prev = history[i - 1];
      const curr = history[i];
      const xPrev = getX(i - 1);
      const yPrev = getY(prev.time);
      const xCurr = getX(i);
      const yCurr = getY(curr.time);

      if (curr.delegate === prev.delegate) {
        segments[segments.length - 1].points.push({ x: xCurr, y: yCurr });
      } else {
        const midX = (xPrev + xCurr) / 2;
        const midY = (yPrev + yCurr) / 2;
        segments[segments.length - 1].points.push({ x: midX, y: midY });
        transitionXs.push(midX);
        segments.push({
          delegate: curr.delegate,
          points: [
            { x: midX, y: midY },
            { x: xCurr, y: yCurr },
          ],
        });
      }
    }

    for (const seg of segments) {
      if (seg.points.length < 2) continue;
      const strokeColor = seg.delegate === 'GPU' ? GPU_COLOR : CPU_COLOR;
      const fillColor = seg.delegate === 'GPU' ? GPU_FILL : CPU_FILL;

      ctx.fillStyle = fillColor;
      ctx.beginPath();
      ctx.moveTo(seg.points[0].x, baseLineY);
      for (const pt of seg.points) {
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.lineTo(seg.points[seg.points.length - 1].x, baseLineY);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      seg.points.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();
    }

    for (const markerX of transitionXs) {
      ctx.save();
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(markerX, padTop);
      ctx.lineTo(markerX, baseLineY);
      ctx.stroke();
      ctx.restore();
    }

    if (n <= 15) {
      for (let i = 0; i < n; i++) {
        const x = getX(i);
        const y = getY(history[i].time);
        ctx.fillStyle = history[i].delegate === 'GPU' ? GPU_COLOR : CPU_COLOR;
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }
}
