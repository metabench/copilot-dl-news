/**
 * ProgressBarControl - Minimal, reusable progress bar using jsgui3
 * 
 * Works both server-side (SSR) and client-side (activation).
 * 
 * @example Server-side
 * const bar = new ProgressBarControl({ context, current: 0, total: 100 });
 * const html = bar.all_html_render();
 * 
 * @example Client-side activation
 * const bar = new ProgressBarControl({ context, el: existingEl });
 * bar.activate();
 * bar.setProgress(50, 100);
 */
'use strict';

const jsgui = require('jsgui3-html');

class ProgressBarControl extends jsgui.Control {
  /**
   * @param {Object} spec
   * @param {Object} spec.context - jsgui3 page context
   * @param {HTMLElement} [spec.el] - Existing DOM element (for activation)
   * @param {number} [spec.current=0] - Current progress value
   * @param {number} [spec.total=100] - Total/max value
   * @param {string} [spec.label] - Optional label text
   * @param {string} [spec.size='normal'] - Size: 'small', 'normal', 'large', 'kiosk'
   * @param {boolean} [spec.showPercent=true] - Show percentage text
   * @param {boolean} [spec.showCounts=false] - Show "X / Y" counts
   */
  constructor(spec = {}) {
    super({
      ...spec,
      tagName: 'div',
      __type_name: 'progress_bar'
    });

    this.current = spec.current ?? 0;
    this.total = spec.total ?? 100;
    this.label = spec.label ?? null;
    this.size = spec.size ?? 'normal';
    this.showPercent = spec.showPercent !== false;
    this.showCounts = spec.showCounts === true;

    this.add_class('progress-bar-control');
    this.add_class(`progress-bar--${this.size}`);

    // Store config in data attributes for client activation
    this.dom.attributes['data-jsgui-control'] = 'progress-bar';
    this.dom.attributes['data-current'] = String(this.current);
    this.dom.attributes['data-total'] = String(this.total);

    // Only compose if not activating existing DOM
    if (!spec.el) {
      this.compose();
    }
  }

  compose() {
    const ctx = this.context;

    // Optional label
    if (this.label) {
      this._labelEl = new jsgui.Control({ context: ctx, tagName: 'div' });
      this._labelEl.add_class('progress-bar__label');
      this._labelEl.add(this.label);
      this.add(this._labelEl);
    }

    // Progress container
    this._container = new jsgui.Control({ context: ctx, tagName: 'div' });
    this._container.add_class('progress-bar__container');
    this.add(this._container);

    // Background track
    this._track = new jsgui.Control({ context: ctx, tagName: 'div' });
    this._track.add_class('progress-bar__track');
    this._container.add(this._track);

    // Fill bar
    this._fill = new jsgui.Control({ context: ctx, tagName: 'div' });
    this._fill.add_class('progress-bar__fill');
    this._fill.dom.attributes['data-fill'] = 'true';
    const pct = this._calcPercent();
    this._fill.dom.attributes.style = `width: ${pct}%`;
    this._track.add(this._fill);

    // Text overlay
    this._text = new jsgui.Control({ context: ctx, tagName: 'span' });
    this._text.add_class('progress-bar__text');
    this._text.dom.attributes['data-text'] = 'true';
    this._text.add(this._formatText());
    this._track.add(this._text);
  }

  _calcPercent() {
    if (this.total <= 0) return 0;
    return Math.min(100, Math.round((this.current / this.total) * 100));
  }

  _formatText() {
    const pct = this._calcPercent();
    if (this.showCounts) {
      return `${this.current.toLocaleString()} / ${this.total.toLocaleString()}`;
    }
    if (this.showPercent) {
      return `${pct}%`;
    }
    return '';
  }

  /**
   * Client-side activation - binds to existing DOM
   */
  activate() {
    if (this.__active) return;
    this.__active = true;

    const el = this.dom?.el;
    if (!el) return;

    // Read initial state from data attributes
    this.current = parseInt(el.getAttribute('data-current') || '0', 10);
    this.total = parseInt(el.getAttribute('data-total') || '100', 10);

    // Find DOM elements
    this._fillEl = el.querySelector('[data-fill]');
    this._textEl = el.querySelector('[data-text]');
  }

  /**
   * Update progress (client-side)
   * @param {number} current - Current value
   * @param {number} [total] - Total value (optional, uses existing if not provided)
   */
  setProgress(current, total) {
    this.current = current;
    if (total !== undefined) this.total = total;

    const el = this.dom?.el;
    if (el) {
      el.setAttribute('data-current', String(this.current));
      el.setAttribute('data-total', String(this.total));
    }

    if (this._fillEl) {
      this._fillEl.style.width = `${this._calcPercent()}%`;
    }
    if (this._textEl) {
      this._textEl.textContent = this._formatText();
    }
  }

  /**
   * Get current progress as percentage
   */
  getPercent() {
    return this._calcPercent();
  }
}

// CSS for the control (can be included via style tag or external CSS)
ProgressBarControl.CSS = `
.progress-bar-control {
  width: 100%;
}

.progress-bar__label {
  font-size: 0.85rem;
  color: #a0a0a0;
  margin-bottom: 0.5rem;
}

.progress-bar__container {
  position: relative;
}

.progress-bar__track {
  height: 32px;
  background: #2a2a4a;
  border-radius: 8px;
  overflow: hidden;
  position: relative;
}

.progress-bar--small .progress-bar__track { height: 16px; border-radius: 4px; }
.progress-bar--large .progress-bar__track { height: 48px; border-radius: 12px; }
.progress-bar--kiosk .progress-bar__track { height: 64px; border-radius: 16px; }

.progress-bar__fill {
  height: 100%;
  background: linear-gradient(90deg, #00d4ff, #00ff88);
  border-radius: inherit;
  transition: width 0.2s ease-out;
  min-width: 0;
}

.progress-bar__text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 0.95rem;
  font-weight: 600;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.progress-bar--small .progress-bar__text { font-size: 0.75rem; }
.progress-bar--large .progress-bar__text { font-size: 1.1rem; }
.progress-bar--kiosk .progress-bar__text { font-size: 1.4rem; letter-spacing: 0.02em; }
`;

module.exports = { ProgressBarControl };
