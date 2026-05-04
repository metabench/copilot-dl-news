/**
 * ProgressWrapperControl - Full-featured progress wrapper with SSE/polling support
 * 
 * Wraps a progress bar with title, stats, and auto-connection to a progress source.
 * Server-renders initial HTML, client activates and connects to live updates.
 * 
 * @example
 * // Server
 * const wrapper = new ProgressWrapperControl({
 *   context,
 *   title: 'Analyzing Pages',
 *   progressSource: '/sse/analysis-progress',
 *   pollFallback: '/api/analysis/state'
 * });
 * 
 * // Client
 * wrapper.activate();
 * wrapper.on('progress', (state) => console.log(state));
 * wrapper.on('complete', (result) => console.log('Done!', result));
 */
'use strict';

const jsgui = require('jsgui3-html');
const { ProgressBarControl } = require('./ProgressBarControl');

class ProgressWrapperControl extends jsgui.Control {
  /**
   * @param {Object} spec
   * @param {Object} spec.context - jsgui3 page context
   * @param {HTMLElement} [spec.el] - Existing DOM element (for activation)
   * @param {string} [spec.title='Progress'] - Title text
   * @param {string} [spec.description] - Description/subtitle text
   * @param {string} [spec.progressSource] - SSE endpoint URL
   * @param {string} [spec.pollFallback] - Polling endpoint URL (fallback)
   * @param {number} [spec.pollIntervalMs=2000] - Polling interval
   * @param {boolean} [spec.showEta=true] - Show ETA
   * @param {boolean} [spec.showThroughput=true] - Show throughput stats
   * @param {boolean} [spec.showCurrentItem=true] - Show current item URL/name
   * @param {string} [spec.size='normal'] - Progress bar size
   * @param {boolean} [spec.autoStart=false] - Auto-start on activation
   */
  constructor(spec = {}) {
    super({
      ...spec,
      tagName: 'div',
      __type_name: 'progress_wrapper'
    });

    this.title = spec.title ?? 'Progress';
    this.description = spec.description ?? null;
    this.progressSource = spec.progressSource ?? null;
    this.pollFallback = spec.pollFallback ?? null;
    this.pollIntervalMs = spec.pollIntervalMs ?? 2000;
    this.showEta = spec.showEta !== false;
    this.showThroughput = spec.showThroughput !== false;
    this.showCurrentItem = spec.showCurrentItem !== false;
    this.size = spec.size ?? 'normal';
    this.autoStart = spec.autoStart === true;

    // State
    this._state = {
      phase: 'idle',
      processed: 0,
      total: 0,
      updated: 0,
      bytesPerSecond: 0,
      recordsPerSecond: 0,
      elapsedMs: 0,
      etaMs: null,
      currentUrl: null,
      warnings: null
    };

    // Event listeners
    this._listeners = {
      progress: [],
      complete: [],
      error: []
    };

    this.add_class('progress-wrapper');

    // Store config in data attributes
    this.dom.attributes['data-jsgui-control'] = 'progress-wrapper';
    if (this.progressSource) {
      this.dom.attributes['data-progress-source'] = this.progressSource;
    }
    if (this.pollFallback) {
      this.dom.attributes['data-poll-fallback'] = this.pollFallback;
    }
    this.dom.attributes['data-poll-interval'] = String(this.pollIntervalMs);
    this.dom.attributes['data-auto-start'] = this.autoStart ? '1' : '0';

    if (!spec.el) {
      this.compose();
    }
  }

  compose() {
    const ctx = this.context;

    // Header
    this._header = new jsgui.Control({ context: ctx, tagName: 'div' });
    this._header.add_class('progress-wrapper__header');
    this.add(this._header);

    // Title
    this._titleEl = new jsgui.Control({ context: ctx, tagName: 'h3' });
    this._titleEl.add_class('progress-wrapper__title');
    this._titleEl.dom.attributes['data-title'] = 'true';
    this._titleEl.add(this.title);
    this._header.add(this._titleEl);

    // Status badge
    this._statusBadge = new jsgui.Control({ context: ctx, tagName: 'span' });
    this._statusBadge.add_class('progress-wrapper__status');
    this._statusBadge.add_class('status--idle');
    this._statusBadge.dom.attributes['data-status'] = 'true';
    this._statusBadge.add('Idle');
    this._header.add(this._statusBadge);

    // Description
    if (this.description) {
      this._descEl = new jsgui.Control({ context: ctx, tagName: 'p' });
      this._descEl.add_class('progress-wrapper__description');
      this._descEl.add(this.description);
      this.add(this._descEl);
    }

    // Progress bar
    this._progressBar = new ProgressBarControl({
      context: ctx,
      current: 0,
      total: 100,
      size: this.size,
      showCounts: true
    });
    this.add(this._progressBar);

    // Stats row
    if (this.showEta || this.showThroughput) {
      this._statsRow = new jsgui.Control({ context: ctx, tagName: 'div' });
      this._statsRow.add_class('progress-wrapper__stats');
      this.add(this._statsRow);

      if (this.showThroughput) {
        this._throughputEl = new jsgui.Control({ context: ctx, tagName: 'span' });
        this._throughputEl.add_class('progress-wrapper__stat');
        this._throughputEl.dom.attributes['data-stat'] = 'throughput';
        this._throughputEl.add('0.0 rec/s');
        this._statsRow.add(this._throughputEl);
      }

      if (this.showEta) {
        this._etaEl = new jsgui.Control({ context: ctx, tagName: 'span' });
        this._etaEl.add_class('progress-wrapper__stat');
        this._etaEl.dom.attributes['data-stat'] = 'eta';
        this._etaEl.add('ETA: --');
        this._statsRow.add(this._etaEl);
      }
    }

    // Current item display
    if (this.showCurrentItem) {
      this._currentItemEl = new jsgui.Control({ context: ctx, tagName: 'div' });
      this._currentItemEl.add_class('progress-wrapper__current-item');
      this._currentItemEl.dom.attributes['data-current-item'] = 'true';
      this._currentItemEl.add('Waiting to start...');
      this.add(this._currentItemEl);
    }

    // Warning banner (hidden by default)
    this._warningEl = new jsgui.Control({ context: ctx, tagName: 'div' });
    this._warningEl.add_class('progress-wrapper__warning');
    this._warningEl.dom.attributes['data-warning'] = 'true';
    this._warningEl.dom.attributes.style = 'display: none';
    this.add(this._warningEl);
  }

  /**
   * Client-side activation
   */
  activate() {
    if (this.__active) return;
    this.__active = true;

    const el = this.dom?.el;
    if (!el) return;

    // Read config from data attributes
    this.progressSource = el.getAttribute('data-progress-source');
    this.pollFallback = el.getAttribute('data-poll-fallback');
    this.pollIntervalMs = parseInt(el.getAttribute('data-poll-interval') || '2000', 10);
    this.autoStart = el.getAttribute('data-auto-start') === '1';

    // Find DOM elements
    this._statusEl = el.querySelector('[data-status]');
    this._throughputDom = el.querySelector('[data-stat="throughput"]');
    this._etaDom = el.querySelector('[data-stat="eta"]');
    this._currentItemDom = el.querySelector('[data-current-item]');
    this._warningDom = el.querySelector('[data-warning]');

    // Activate child progress bar
    const barEl = el.querySelector('[data-jsgui-control="progress-bar"]');
    if (barEl) {
      this._progressBar = new ProgressBarControl({ context: this.context, el: barEl });
      this._progressBar.activate();
    }

    // Connect to progress source
    if (this.progressSource) {
      this._connectSSE();
    } else if (this.pollFallback) {
      this._startPolling();
    }
  }

  /**
   * Connect to SSE endpoint
   */
  _connectSSE() {
    if (this._eventSource) {
      this._eventSource.close();
    }

    this._eventSource = new EventSource(this.progressSource);

    this._eventSource.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'next' && msg.value) {
          this._handleProgress(msg.value);
        } else if (msg.type === 'complete') {
          this._handleComplete(msg.value);
        } else if (msg.type === 'error') {
          this._handleError(new Error(msg.error));
        }
      } catch (e) {
        console.warn('[ProgressWrapper] Failed to parse SSE message:', e);
      }
    };

    this._eventSource.onerror = () => {
      // Fall back to polling on SSE failure
      if (this.pollFallback) {
        this._eventSource.close();
        this._eventSource = null;
        this._startPolling();
      }
    };
  }

  /**
   * Start polling fallback
   */
  _startPolling() {
    if (this._pollTimer) return;

    const poll = async () => {
      try {
        const res = await fetch(this.pollFallback);
        if (!res.ok) return;
        const data = await res.json();
        if (data.state) {
          this._handleProgress(data.state);
          if (data.state.phase === 'complete') {
            this._handleComplete(data.state.summary);
          }
        }
      } catch (e) {
        // Ignore polling errors
      }
    };

    poll();
    this._pollTimer = setInterval(poll, this.pollIntervalMs);
  }

  /**
   * Stop polling
   */
  _stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  /**
   * Handle progress update
   */
  _handleProgress(state) {
    this._state = { ...this._state, ...state };

    // Update progress bar
    if (this._progressBar) {
      this._progressBar.setProgress(state.processed || 0, state.total || 100);
    }

    // Update status
    this._updateStatus(state.phase);

    // Update stats
    if (this._throughputDom && state.recordsPerSecond !== undefined) {
      this._throughputDom.textContent = `${state.recordsPerSecond.toFixed(1)} rec/s`;
    }

    if (this._etaDom) {
      this._etaDom.textContent = state.etaMs
        ? `ETA: ${this._formatDuration(state.etaMs)}`
        : 'ETA: --';
    }

    // Update current item
    if (this._currentItemDom && state.currentUrl) {
      this._currentItemDom.textContent = state.currentUrl;
    }

    // Update warnings
    if (this._warningDom) {
      if (state.warnings && state.warnings.length > 0) {
        this._warningDom.textContent = `⚠️ ${state.warnings[0].message}`;
        this._warningDom.style.display = 'block';
      } else {
        this._warningDom.style.display = 'none';
      }
    }

    // Emit event
    this._emit('progress', state);
  }

  /**
   * Handle completion
   */
  _handleComplete(result) {
    this._updateStatus('complete');
    this._stopPolling();
    if (this._eventSource) {
      this._eventSource.close();
      this._eventSource = null;
    }
    this._emit('complete', result);
  }

  /**
   * Handle error
   */
  _handleError(error) {
    this._updateStatus('error');
    this._emit('error', error);
  }

  /**
   * Update status badge
   */
  _updateStatus(phase) {
    if (!this._statusEl) return;

    const statusMap = {
      idle: { text: 'Idle', class: 'status--idle' },
      starting: { text: 'Starting', class: 'status--running' },
      analyzing: { text: 'Running', class: 'status--running' },
      running: { text: 'Running', class: 'status--running' },
      complete: { text: 'Complete', class: 'status--complete' },
      error: { text: 'Error', class: 'status--error' }
    };

    const status = statusMap[phase] || statusMap.idle;
    this._statusEl.textContent = status.text;
    this._statusEl.className = `progress-wrapper__status ${status.class}`;
  }

  /**
   * Format duration for display
   */
  _formatDuration(ms) {
    const totalSeconds = Math.round(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  /**
   * Subscribe to events
   * @param {string} event - Event name: 'progress', 'complete', 'error'
   * @param {Function} callback - Event handler
   */
  on(event, callback) {
    if (this._listeners[event]) {
      this._listeners[event].push(callback);
    }
    return () => this.off(event, callback);
  }

  /**
   * Unsubscribe from events
   */
  off(event, callback) {
    if (this._listeners[event]) {
      this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
    }
  }

  /**
   * Emit event
   */
  _emit(event, data) {
    if (this._listeners[event]) {
      for (const cb of this._listeners[event]) {
        try {
          cb(data);
        } catch (e) {
          console.error(`[ProgressWrapper] Error in ${event} handler:`, e);
        }
      }
    }
  }

  /**
   * Get current state
   */
  getState() {
    return { ...this._state };
  }

  /**
   * Manual progress update (for non-SSE use)
   */
  setProgress(current, total, extras = {}) {
    this._handleProgress({
      processed: current,
      total,
      phase: current >= total ? 'complete' : 'running',
      ...extras
    });
  }

  /**
   * Cleanup
   */
  destroy() {
    this._stopPolling();
    if (this._eventSource) {
      this._eventSource.close();
      this._eventSource = null;
    }
    this._listeners = { progress: [], complete: [], error: [] };
  }
}

// CSS for the wrapper control
ProgressWrapperControl.CSS = `
.progress-wrapper {
  background: #0f3460;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.progress-wrapper__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.progress-wrapper__title {
  font-size: 1.1rem;
  font-weight: 500;
  color: #e8e8e8;
  margin: 0;
}

.progress-wrapper__status {
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 500;
}

.status--idle { background: #2a2a4a; color: #a0a0a0; }
.status--running { background: #00d4ff; color: #1a1a2e; }
.status--complete { background: #00ff88; color: #1a1a2e; }
.status--error { background: #ff4444; color: white; }

.progress-wrapper__description {
  font-size: 0.85rem;
  color: #a0a0a0;
  margin-bottom: 1rem;
}

.progress-wrapper__stats {
  display: flex;
  gap: 1.5rem;
  margin-top: 0.75rem;
  font-size: 0.85rem;
  color: #a0a0a0;
}

.progress-wrapper__stat {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.progress-wrapper__current-item {
  margin-top: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: #16213e;
  border-radius: 6px;
  font-size: 0.8rem;
  color: #a0a0a0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.progress-wrapper__warning {
  margin-top: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: #ffcc00;
  color: #1a1a2e;
  border-radius: 6px;
  font-size: 0.85rem;
}
`;

module.exports = { ProgressWrapperControl };
