"use strict";

/**
 * ProgressBarControl - A reusable progress bar control for jsgui3
 * Local copy for crawl-widget bundling compatibility
 */

/**
 * Create ProgressBarControl class with dependency injection
 * @param {object} jsgui - jsgui3 instance (jsgui3-client)
 * @returns {class} ProgressBarControl class
 */
function createProgressBarControl(jsgui) {
  const StringControl = jsgui.String_Control;

  class ProgressBarControl extends jsgui.Control {
    constructor(spec = {}) {
      super({ ...spec, tagName: "div" });
      
      this._value = Math.max(0, Math.min(1, spec.value || 0));
      this._label = spec.label || null;
      this._variant = spec.variant || "standard";
      this._color = spec.color || "emerald";
      this._showPercentage = spec.showPercentage || false;
      this._animated = spec.animated !== false;
      
      this.add_class("progress-bar");
      this.add_class(`progress-bar--${this._variant}`);
      this.add_class(`progress-bar--${this._color}`);
      
      if (this._animated) {
        this.add_class("progress-bar--animated");
      }
      
      if (!spec.el) {
        this.compose();
      }
    }

    compose() {
      this._track = new jsgui.Control({ context: this.context, tagName: "div" });
      this._track.add_class("progress-bar__track");
      
      this._fill = new jsgui.Control({ context: this.context, tagName: "div" });
      this._fill.add_class("progress-bar__fill");
      this._updateFillWidth();
      
      this._track.add(this._fill);
      this.add(this._track);
      
      if (this._label || this._showPercentage) {
        this._labelEl = new jsgui.Control({ context: this.context, tagName: "span" });
        this._labelEl.add_class("progress-bar__label");
        this._labelEl.add(new StringControl({ 
          context: this.context, 
          text: this._label || this._formatPercentage()
        }));
        this.add(this._labelEl);
      }
    }

    _updateFillWidth() {
      if (this._fill) {
        const width = `${Math.round(this._value * 100)}%`;
        this._fill.dom.attributes.style = `width: ${width};`;
      }
    }

    _formatPercentage() {
      return `${Math.round(this._value * 100)}%`;
    }

    setValue(value) {
      this._value = Math.max(0, Math.min(1, value));
      this._updateFillWidth();
      
      const fillEl = this._el(this._fill);
      if (fillEl) {
        fillEl.style.width = `${Math.round(this._value * 100)}%`;
      }
      
      if (this._showPercentage && this._labelEl) {
        const labelEl = this._el(this._labelEl);
        if (labelEl) {
          labelEl.textContent = this._formatPercentage();
        }
      }
    }

    getValue() {
      return this._value;
    }

    setLabel(text) {
      this._label = text;
      if (this._labelEl) {
        const labelEl = this._el(this._labelEl);
        if (labelEl) {
          labelEl.textContent = text;
        }
      }
    }

    setColor(color) {
      const el = this._el();
      if (el) {
        el.classList.remove(`progress-bar--${this._color}`);
        this._color = color;
        el.classList.add(`progress-bar--${this._color}`);
      } else {
        this._color = color;
      }
    }

    _el(ctrl = this) {
      return ctrl?.dom?.el || null;
    }

    activate() {
      if (this.__active) return;
      this.__active = true;
    }
  }

  return ProgressBarControl;
}

module.exports = { createProgressBarControl };
