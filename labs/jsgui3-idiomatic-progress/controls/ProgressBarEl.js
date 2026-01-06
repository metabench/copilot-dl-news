/**
 * ProgressBarEl - Minimal progress bar element (idiomatic jsgui3)
 * 
 * A simple, focused control that renders a progress bar with smooth transitions.
 * Follows Pattern 1 (State Object) and Pattern 2 (CSS Transitions).
 * 
 * This control does ONE thing well: display progress as a bar with percentage.
 */
'use strict';

const jsgui = require('jsgui3-html');

class ProgressBarEl extends jsgui.Control {
  /**
   * @param {Object} spec
   * @param {Object} spec.context - jsgui3 page context
   * @param {HTMLElement} [spec.el] - Existing DOM element (for activation)
   * @param {number} [spec.current=0] - Current progress value
   * @param {number} [spec.total=100] - Total/max value
   * @param {string} [spec.size='normal'] - Size: 'small', 'normal', 'large'
   * @param {string} [spec.color] - Optional fill color (CSS custom property)
   */
  constructor(spec = {}) {
    super({
      ...spec,
      tagName: 'div',
      __type_name: 'progress_bar_el'
    });

    // State object - single source of truth
    this._state = {
      current: spec.current ?? 0,
      total: spec.total ?? 100
    };

    // Configuration (immutable)
    this._config = {
      size: spec.size ?? 'normal',
      color: spec.color ?? null
    };

    this.add_class('pbar');
    this.add_class(`pbar--${this._config.size}`);
    
    // For client-side activation
    this.dom.attributes['data-jsgui-control'] = 'progress-bar-el';
    this.dom.attributes['data-current'] = String(this._state.current);
    this.dom.attributes['data-total'] = String(this._state.total);

    // Custom color via CSS variable
    if (this._config.color) {
      this.dom.attributes.style = `--pbar-fill-color: ${this._config.color}`;
    }

    if (!spec.el) {
      this.compose();
    }
  }

  compose() {
    const ctx = this.context;

    // Track element - background
    this._trackEl = new jsgui.Control({ context: ctx, tagName: 'div' });
    this._trackEl.add_class('pbar__track');
    this.add(this._trackEl);

    // Fill element - the actual bar
    this._fillEl = new jsgui.Control({ context: ctx, tagName: 'div' });
    this._fillEl.add_class('pbar__fill');
    const pct = this._calcPercent();
    this._fillEl.dom.attributes.style = `width: ${pct}%`;
    this._trackEl.add(this._fillEl);

    // Text overlay - percentage display
    this._textEl = new jsgui.Control({ context: ctx, tagName: 'span' });
    this._textEl.add_class('pbar__text');
    this._textEl.add(this._formatText());
    this._trackEl.add(this._textEl);
  }

  /**
   * Calculate percentage from current state
   */
  _calcPercent() {
    const { current, total } = this._state;
    if (total <= 0) return 0;
    return Math.min(100, Math.round((current / total) * 100));
  }

  /**
   * Format display text
   */
  _formatText() {
    return `${this._calcPercent()}%`;
  }

  /**
   * Sync view to current state (Pattern 1)
   * Called after any state change - single update point
   */
  _syncView() {
    const pct = this._calcPercent();
    
    // Update fill width (CSS transition handles animation)
    if (this._fillEl?.dom?.el) {
      this._fillEl.dom.el.style.width = `${pct}%`;
    }
    
    // Update text
    if (this._textEl?.dom?.el) {
      this._textEl.dom.el.textContent = this._formatText();
    }
    
    // Update data attributes for state inspection
    if (this.dom?.el) {
      this.dom.el.setAttribute('data-current', String(this._state.current));
      this.dom.el.setAttribute('data-total', String(this._state.total));
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

    // Read state from data attributes
    this._state.current = parseInt(el.getAttribute('data-current') || '0', 10);
    this._state.total = parseInt(el.getAttribute('data-total') || '100', 10);

    // Find DOM element references for existing controls
    // Note: compose() stored control refs, but for activation from SSR HTML
    // we need to find the actual DOM elements
    this._fillEl = { dom: { el: el.querySelector('.pbar__fill') } };
    this._textEl = { dom: { el: el.querySelector('.pbar__text') } };
  }

  /**
   * Update progress (public API)
   * @param {number} current - Current value
   * @param {number} [total] - Total value (optional)
   */
  setProgress(current, total) {
    this._state.current = current;
    if (total !== undefined) {
      this._state.total = total;
    }
    this._syncView();
  }

  /**
   * Get current percentage
   */
  getPercent() {
    return this._calcPercent();
  }

  /**
   * Get current state
   */
  getState() {
    return { ...this._state };
  }
}

// CSS - uses CSS transitions for smooth animation (Pattern 2)
ProgressBarEl.CSS = `
.pbar {
  width: 100%;
  font-family: system-ui, -apple-system, sans-serif;
}

.pbar__track {
  height: 32px;
  background: var(--pbar-track-color, #2a2a4a);
  border-radius: 8px;
  overflow: hidden;
  position: relative;
}

.pbar--small .pbar__track { height: 16px; border-radius: 4px; }
.pbar--large .pbar__track { height: 48px; border-radius: 12px; }

.pbar__fill {
  height: 100%;
  background: var(--pbar-fill-color, linear-gradient(90deg, #00d4ff, #00ff88));
  border-radius: inherit;
  min-width: 0;
  
  /* KEY: CSS transition prevents jitter */
  transition: width 0.15s ease-out;
}

.pbar__text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 0.95rem;
  font-weight: 600;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  
  /* Tabular numbers prevent width jitter */
  font-variant-numeric: tabular-nums;
}

.pbar--small .pbar__text { font-size: 0.75rem; }
.pbar--large .pbar__text { font-size: 1.1rem; }
`;

module.exports = { ProgressBarEl };
