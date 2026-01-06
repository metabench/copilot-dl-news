'use strict';

/**
 * ProgressBar - Pure progress bar component with anti-jitter patterns
 * 
 * Features:
 * - CSS containment for isolated reflows
 * - RAF-batched updates
 * - Fixed height for layout stability
 * - GPU-accelerated fill animation
 * - Tabular numerics for stable text width
 * 
 * @module src/ui/controls/dashboard/ProgressBar
 */

// RAF polyfill for Node.js (server-side rendering)
const raf = typeof requestAnimationFrame !== 'undefined'
  ? requestAnimationFrame
  : (fn) => setTimeout(fn, 16);
const caf = typeof cancelAnimationFrame !== 'undefined'
  ? cancelAnimationFrame
  : clearTimeout;

/**
 * Factory to create ProgressBar class bound to jsgui instance
 * @param {Object} jsgui - jsgui3-html or jsgui3-client
 * @returns {Function} ProgressBar class
 */
function createProgressBar(jsgui) {
  const { Control, String_Control } = jsgui;

  class ProgressBar extends Control {
    /**
     * @param {Object} spec
     * @param {Object} spec.context - jsgui3 page context
     * @param {number} [spec.current=0] - Current progress value
     * @param {number} [spec.total=100] - Total value
     * @param {string} [spec.size='medium'] - 'small' | 'medium' | 'large'
     * @param {string} [spec.variant='default'] - 'default' | 'success' | 'warning' | 'error'
     * @param {boolean} [spec.showText=true] - Show percentage text
     */
    constructor(spec = {}) {
      super({
        ...spec,
        tagName: 'div',
        __type_name: 'dashboard_progress_bar'
      });

      // Configuration
      this._config = {
        size: spec.size ?? 'medium',
        variant: spec.variant ?? 'default',
        showText: spec.showText !== false
      };

      // State
      this._state = {
        current: spec.current ?? 0,
        total: spec.total ?? 100
      };

      // RAF handle for debouncing
      this._pendingFrame = null;

      // Setup
      this.add_class('dprogress');
      this.add_class(`dprogress--${this._config.size}`);
      this.add_class(`dprogress--${this._config.variant}`);
      this.dom.attributes['data-jsgui-control'] = 'dashboard-progress-bar';

      if (!spec.el) {
        this.compose();
      }
    }

    compose() {
      const ctx = this.context;

      // Background track
      this._trackEl = new Control({ context: ctx, tagName: 'div' });
      this._trackEl.add_class('dprogress__track');
      this.add(this._trackEl);

      // Fill bar (GPU-accelerated with transform instead of width)
      this._fillEl = new Control({ context: ctx, tagName: 'div' });
      this._fillEl.add_class('dprogress__fill');
      const pct = this._calcPercent();
      // Use transform: scaleX for GPU acceleration (no layout)
      this._fillEl.dom.attributes.style = `transform: scaleX(${pct / 100})`;
      this._trackEl.add(this._fillEl);

      // Text overlay
      if (this._config.showText) {
        this._textEl = new Control({ context: ctx, tagName: 'span' });
        this._textEl.add_class('dprogress__text');
        this._textEl.add(new String_Control({ context: ctx, text: `${pct}%` }));
        this._trackEl.add(this._textEl);
      }
    }

    /**
     * Client-side activation
     */
    activate() {
      if (this.__active) return;
      this.__active = true;

      const el = this.dom?.el;
      if (!el) return;

      // Find DOM elements for activation from SSR
      if (!this._fillEl?.dom?.el) {
        this._fillEl = { dom: { el: el.querySelector('.dprogress__fill') } };
      }
      if (this._config.showText && !this._textEl?.dom?.el) {
        this._textEl = { dom: { el: el.querySelector('.dprogress__text') } };
      }
    }

    /**
     * Update progress (public API)
     * @param {number} current
     * @param {number} [total]
     */
    setProgress(current, total) {
      this._state.current = current;
      if (total !== undefined) this._state.total = total;
      this._scheduleUpdate();
    }

    /**
     * Set variant (color scheme)
     * @param {string} variant - 'default' | 'success' | 'warning' | 'error'
     */
    setVariant(variant) {
      const el = this.dom?.el;
      if (!el) return;

      // Remove old, add new
      el.classList.remove(`dprogress--${this._config.variant}`);
      this._config.variant = variant;
      el.classList.add(`dprogress--${this._config.variant}`);
    }

    /**
     * RAF-based update batching
     */
    _scheduleUpdate() {
      if (this._pendingFrame) return;

      this._pendingFrame = raf(() => {
        this._pendingFrame = null;
        this._syncView();
      });
    }

    /**
     * Sync DOM with state
     */
    _syncView() {
      const pct = this._calcPercent();

      // Update fill using transform (GPU-accelerated, no layout)
      const fillEl = this._fillEl?.dom?.el;
      if (fillEl) {
        fillEl.style.transform = `scaleX(${pct / 100})`;
      }

      // Update text
      if (this._config.showText) {
        const textEl = this._textEl?.dom?.el;
        if (textEl) {
          textEl.textContent = `${pct}%`;
        }
      }
    }

    /**
     * Calculate percentage
     * @returns {number} 0-100
     */
    _calcPercent() {
      const { current, total } = this._state;
      if (total <= 0) return 0;
      return Math.min(100, Math.round((current / total) * 100));
    }

    /**
     * Get current state
     */
    getState() {
      return { ...this._state };
    }

    /**
     * Cleanup
     */
    destroy() {
      if (this._pendingFrame) {
        caf(this._pendingFrame);
        this._pendingFrame = null;
      }
    }
  }

  // CSS with anti-jitter patterns
  ProgressBar.CSS = `
/* Progress Bar - Anti-jitter patterns enabled */
.dprogress {
  /* ANTI-JITTER: Isolate layout calculations */
  contain: layout style;
  position: relative;
}

.dprogress__track {
  /* ANTI-JITTER: Fixed height prevents layout shift */
  height: 40px;
  background: var(--dprogress-track-bg, #2a2a4a);
  border-radius: 12px;
  overflow: hidden;
  position: relative;
}

.dprogress__fill {
  /* ANTI-JITTER: Use transform instead of width for GPU acceleration */
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 100%;  /* Full width, scaled by transform */
  background: var(--dprogress-fill-bg, linear-gradient(90deg, #00d4ff, #00ff88));
  border-radius: 12px;
  transform-origin: left center;
  
  /* GPU layer for smooth animation */
  will-change: transform;
  transition: transform 0.15s ease-out;
}

.dprogress__text {
  /* ANTI-JITTER: Absolute position doesn't affect layout */
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  
  /* ANTI-JITTER: Tabular numerics for stable width */
  font-variant-numeric: tabular-nums;
  font-size: 1rem;
  font-weight: 600;
  color: var(--dprogress-text-color, #fff);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  
  /* Prevent text selection during rapid updates */
  user-select: none;
  pointer-events: none;
}

/* Size variants */
.dprogress--small .dprogress__track { height: 24px; border-radius: 8px; }
.dprogress--small .dprogress__fill { border-radius: 8px; }
.dprogress--small .dprogress__text { font-size: 0.75rem; }

.dprogress--large .dprogress__track { height: 56px; border-radius: 16px; }
.dprogress--large .dprogress__fill { border-radius: 16px; }
.dprogress--large .dprogress__text { font-size: 1.25rem; }

/* Color variants */
.dprogress--success .dprogress__fill {
  background: var(--dprogress-success-bg, linear-gradient(90deg, #00ff88, #00cc6a));
}

.dprogress--warning .dprogress__fill {
  background: var(--dprogress-warning-bg, linear-gradient(90deg, #ffcc00, #ff9500));
}

.dprogress--error .dprogress__fill {
  background: var(--dprogress-error-bg, linear-gradient(90deg, #ff4444, #cc0000));
}
`;

  return ProgressBar;
}

module.exports = { createProgressBar };
