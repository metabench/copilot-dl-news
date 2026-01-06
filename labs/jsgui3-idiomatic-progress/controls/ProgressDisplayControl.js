/**
 * ProgressDisplayControl - State-driven progress display (idiomatic jsgui3)
 * 
 * A pure display control that shows:
 * - Title and status badge
 * - Progress bar with percentage
 * - Stats row (throughput, ETA)
 * - Message/current item
 * - Warning banner (with smooth visibility transitions)
 * 
 * This control does NOT handle network/polling - that's ProgressConnectorControl's job.
 * Follows separation of concerns: display vs data fetching.
 * 
 * Key patterns demonstrated:
 * - Pattern 1: State Object with centralized sync
 * - Pattern 2: CSS-based visibility transitions
 * - Pattern 3: RAF-based update debouncing
 * - Pattern 4: Control references during compose
 */
'use strict';

const jsgui = require('jsgui3-html');
const { ProgressBarEl } = require('./ProgressBarEl');

class ProgressDisplayControl extends jsgui.Control {
  /**
   * @param {Object} spec
   * @param {Object} spec.context - jsgui3 page context
   * @param {HTMLElement} [spec.el] - Existing DOM element (for activation)
   * @param {string} [spec.title='Progress'] - Title text
   * @param {string} [spec.description] - Optional description
   * @param {boolean} [spec.showStats=true] - Show throughput/ETA row
   */
  constructor(spec = {}) {
    super({
      ...spec,
      tagName: 'div',
      __type_name: 'progress_display'
    });

    // Configuration (immutable after construction)
    this._config = {
      title: spec.title ?? 'Progress',
      description: spec.description ?? null,
      showStats: spec.showStats !== false
    };

    // State (mutable via setState)
    this._state = {
      phase: 'idle',           // 'idle' | 'running' | 'complete' | 'error'
      current: 0,
      total: 0,
      message: '',
      throughput: null,        // { value: number, unit: string }
      etaMs: null,
      warnings: []             // Array of { message: string, level: string }
    };

    // RAF debounce handle
    this._pendingFrame = null;

    this.add_class('pdisplay');
    this.dom.attributes['data-jsgui-control'] = 'progress-display';

    if (!spec.el) {
      this.compose();
    }
  }

  compose() {
    const ctx = this.context;

    // === Header ===
    this._headerEl = new jsgui.Control({ context: ctx, tagName: 'div' });
    this._headerEl.add_class('pdisplay__header');
    this.add(this._headerEl);

    // Title
    this._titleEl = new jsgui.Control({ context: ctx, tagName: 'h3' });
    this._titleEl.add_class('pdisplay__title');
    this._titleEl.add(this._config.title);
    this._headerEl.add(this._titleEl);

    // Status badge
    this._statusEl = new jsgui.Control({ context: ctx, tagName: 'span' });
    this._statusEl.add_class('pdisplay__status');
    this._statusEl.add_class('pdisplay__status--idle');
    this._statusEl.add('Idle');
    this._headerEl.add(this._statusEl);

    // === Description (optional) ===
    if (this._config.description) {
      this._descEl = new jsgui.Control({ context: ctx, tagName: 'p' });
      this._descEl.add_class('pdisplay__desc');
      this._descEl.add(this._config.description);
      this.add(this._descEl);
    }

    // === Progress Bar ===
    this._barEl = new ProgressBarEl({
      context: ctx,
      current: this._state.current,
      total: this._state.total
    });
    this.add(this._barEl);

    // === Stats Row ===
    if (this._config.showStats) {
      this._statsEl = new jsgui.Control({ context: ctx, tagName: 'div' });
      this._statsEl.add_class('pdisplay__stats');
      this.add(this._statsEl);

      // Throughput
      this._throughputEl = new jsgui.Control({ context: ctx, tagName: 'span' });
      this._throughputEl.add_class('pdisplay__stat');
      this._throughputEl.add('—');
      this._statsEl.add(this._throughputEl);

      // ETA
      this._etaEl = new jsgui.Control({ context: ctx, tagName: 'span' });
      this._etaEl.add_class('pdisplay__stat');
      this._etaEl.add('ETA: —');
      this._statsEl.add(this._etaEl);
    }

    // === Message ===
    this._messageEl = new jsgui.Control({ context: ctx, tagName: 'div' });
    this._messageEl.add_class('pdisplay__message');
    this._messageEl.add('Waiting to start...');
    this.add(this._messageEl);

    // === Warning Banner (starts hidden via CSS class) ===
    this._warningEl = new jsgui.Control({ context: ctx, tagName: 'div' });
    this._warningEl.add_class('pdisplay__warning');
    this._warningEl.add_class('pdisplay__warning--hidden');  // Pattern 2: Start hidden
    this._warningEl.add('');  // Empty initially
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

    // Activate child progress bar
    if (this._barEl?.activate) {
      this._barEl.activate();
    }

    // For SSR activation, we need to find DOM elements
    // These are fallbacks if compose() wasn't called (SSR path)
    if (!this._statusEl?.dom?.el) {
      this._statusEl = { dom: { el: el.querySelector('.pdisplay__status') } };
    }
    if (!this._throughputEl?.dom?.el && this._config.showStats) {
      this._throughputEl = { dom: { el: el.querySelector('.pdisplay__stats .pdisplay__stat:first-child') } };
      this._etaEl = { dom: { el: el.querySelector('.pdisplay__stats .pdisplay__stat:last-child') } };
    }
    if (!this._messageEl?.dom?.el) {
      this._messageEl = { dom: { el: el.querySelector('.pdisplay__message') } };
    }
    if (!this._warningEl?.dom?.el) {
      this._warningEl = { 
        dom: { el: el.querySelector('.pdisplay__warning') },
        add_class: (c) => el.querySelector('.pdisplay__warning')?.classList.add(c),
        remove_class: (c) => el.querySelector('.pdisplay__warning')?.classList.remove(c)
      };
    }
  }

  /**
   * Update state and schedule view sync (public API)
   * Pattern 1: Single entry point for state changes
   * 
   * @param {Object} partial - Partial state update
   */
  setState(partial) {
    this._state = { ...this._state, ...partial };
    this._scheduleUpdate();
  }

  /**
   * Pattern 3: RAF-based debouncing
   * Coalesces rapid updates into single frame
   */
  _scheduleUpdate() {
    if (this._pendingFrame) return;  // Already scheduled
    
    this._pendingFrame = requestAnimationFrame(() => {
      this._pendingFrame = null;
      this._syncView();
    });
  }

  /**
   * Pattern 1: Centralized view sync
   * All DOM updates happen here - easy to reason about
   */
  _syncView() {
    // Update progress bar
    if (this._barEl) {
      this._barEl.setProgress(this._state.current, this._state.total);
    }

    // Update status badge
    this._updateStatus();

    // Update stats
    this._updateStats();

    // Update message
    if (this._messageEl?.dom?.el) {
      this._messageEl.dom.el.textContent = this._state.message || 'Processing...';
    }

    // Update warnings (Pattern 2: CSS class transitions)
    this._updateWarnings();
  }

  /**
   * Update status badge based on phase
   */
  _updateStatus() {
    const el = this._statusEl?.dom?.el;
    if (!el) return;

    const statusConfig = {
      idle: { text: 'Idle', modifier: 'idle' },
      running: { text: 'Running', modifier: 'running' },
      complete: { text: 'Complete', modifier: 'complete' },
      error: { text: 'Error', modifier: 'error' }
    };

    const config = statusConfig[this._state.phase] || statusConfig.idle;
    el.textContent = config.text;
    
    // Update class - remove all modifiers first, then add current
    el.className = `pdisplay__status pdisplay__status--${config.modifier}`;
  }

  /**
   * Update throughput and ETA displays
   */
  _updateStats() {
    if (!this._config.showStats) return;

    // Throughput
    if (this._throughputEl?.dom?.el) {
      if (this._state.throughput) {
        const { value, unit } = this._state.throughput;
        this._throughputEl.dom.el.textContent = `${value.toFixed(1)} ${unit}`;
      } else {
        this._throughputEl.dom.el.textContent = '—';
      }
    }

    // ETA
    if (this._etaEl?.dom?.el) {
      if (this._state.etaMs !== null && this._state.etaMs > 0) {
        this._etaEl.dom.el.textContent = `ETA: ${this._formatDuration(this._state.etaMs)}`;
      } else if (this._state.phase === 'complete') {
        this._etaEl.dom.el.textContent = 'Complete';
      } else {
        this._etaEl.dom.el.textContent = 'ETA: —';
      }
    }
  }

  /**
   * Pattern 2: CSS-based visibility for warnings
   * No direct style.display manipulation - use classes for smooth transitions
   */
  _updateWarnings() {
    const warnings = this._state.warnings;
    
    if (warnings && warnings.length > 0) {
      // Show warning with content
      if (this._warningEl?.dom?.el) {
        this._warningEl.dom.el.textContent = `⚠️ ${warnings[0].message}`;
      }
      // Remove hidden class (CSS transition animates this)
      if (this._warningEl?.remove_class) {
        this._warningEl.remove_class('pdisplay__warning--hidden');
      } else if (this._warningEl?.dom?.el) {
        this._warningEl.dom.el.classList.remove('pdisplay__warning--hidden');
      }
    } else {
      // Add hidden class (CSS transition animates this)
      if (this._warningEl?.add_class) {
        this._warningEl.add_class('pdisplay__warning--hidden');
      } else if (this._warningEl?.dom?.el) {
        this._warningEl.dom.el.classList.add('pdisplay__warning--hidden');
      }
    }
  }

  /**
   * Format milliseconds as human-readable duration
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
   * Get current state (for debugging/inspection)
   */
  getState() {
    return { ...this._state };
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this._pendingFrame) {
      cancelAnimationFrame(this._pendingFrame);
      this._pendingFrame = null;
    }
  }
}

// CSS with smooth transitions for all dynamic elements
ProgressDisplayControl.CSS = `
.pdisplay {
  background: #0f3460;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  font-family: system-ui, -apple-system, sans-serif;
}

/* Header */
.pdisplay__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.pdisplay__title {
  font-size: 1.1rem;
  font-weight: 500;
  color: #e8e8e8;
  margin: 0;
}

/* Status badge with transition */
.pdisplay__status {
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 500;
  transition: background-color 0.2s, color 0.2s;
}

.pdisplay__status--idle { background: #2a2a4a; color: #a0a0a0; }
.pdisplay__status--running { background: #00d4ff; color: #1a1a2e; }
.pdisplay__status--complete { background: #00ff88; color: #1a1a2e; }
.pdisplay__status--error { background: #ff4444; color: white; }

/* Description */
.pdisplay__desc {
  font-size: 0.85rem;
  color: #a0a0a0;
  margin: 0 0 1rem 0;
}

/* Stats row */
.pdisplay__stats {
  display: flex;
  gap: 1.5rem;
  margin-top: 0.75rem;
  font-size: 0.85rem;
  color: #a0a0a0;
}

.pdisplay__stat {
  font-variant-numeric: tabular-nums;
}

/* Message */
.pdisplay__message {
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

/* Warning banner with CSS transitions (Pattern 2) */
.pdisplay__warning {
  margin-top: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: #ffcc00;
  color: #1a1a2e;
  border-radius: 6px;
  font-size: 0.85rem;
  
  /* Smooth visibility transition - no flashing! */
  transition: opacity 0.2s ease-out, max-height 0.2s ease-out, padding 0.2s ease-out, margin 0.2s ease-out;
  max-height: 100px;
  opacity: 1;
}

.pdisplay__warning--hidden {
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
  margin-top: 0;
  overflow: hidden;
  pointer-events: none;
}
`;

module.exports = { ProgressDisplayControl };
