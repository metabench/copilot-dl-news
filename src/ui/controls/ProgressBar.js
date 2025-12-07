"use strict";

/**
 * ProgressBarControl - A reusable progress bar control for jsgui3
 * 
 * Features:
 * - Smooth animated fills
 * - Multiple variants (standard, compact, striped)
 * - Segmented progress support
 * - Optional label overlay
 * - Color theming via CSS variables
 * 
 * Usage:
 *   const bar = new ProgressBarControl({
 *     context: this.context,
 *     value: 0.65,           // 0-1
 *     label: '65%',          // optional label
 *     variant: 'standard',   // 'standard', 'compact', 'striped'
 *     color: 'emerald'       // 'emerald', 'gold', 'ruby', 'sapphire', 'amethyst'
 *   });
 *   
 *   // Update dynamically
 *   bar.setValue(0.85);
 *   bar.setLabel('85%');
 */

/**
 * Create ProgressBarControl class with dependency injection
 * @param {object} jsgui - jsgui3 instance (jsgui3-html or jsgui3-client)
 * @returns {class} ProgressBarControl class
 */
function createProgressBarControl(jsgui) {
  const StringControl = jsgui.String_Control;

  class ProgressBarControl extends jsgui.Control {
    /**
     * @param {object} spec
     * @param {object} spec.context - jsgui context
     * @param {number} [spec.value=0] - Progress value 0-1
     * @param {string} [spec.label] - Optional label text
     * @param {string} [spec.variant='standard'] - 'standard', 'compact', 'striped'
     * @param {string} [spec.color='emerald'] - Color theme
     * @param {boolean} [spec.showPercentage=false] - Auto-show percentage
     * @param {boolean} [spec.animated=true] - Enable smooth animation
     */
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
      // Track (background)
      this._track = new jsgui.Control({ context: this.context, tagName: "div" });
      this._track.add_class("progress-bar__track");
      
      // Fill (foreground)
      this._fill = new jsgui.Control({ context: this.context, tagName: "div" });
      this._fill.add_class("progress-bar__fill");
      this._updateFillWidth();
      
      this._track.add(this._fill);
      this.add(this._track);
      
      // Label overlay (optional)
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

    /**
     * Set progress value (0-1)
     * @param {number} value
     */
    setValue(value) {
      this._value = Math.max(0, Math.min(1, value));
      this._updateFillWidth();
      
      // Update DOM if activated
      const fillEl = this._el(this._fill);
      if (fillEl) {
        fillEl.style.width = `${Math.round(this._value * 100)}%`;
      }
      
      // Update percentage label if showing
      if (this._showPercentage && this._labelEl) {
        const labelEl = this._el(this._labelEl);
        if (labelEl) {
          labelEl.textContent = this._formatPercentage();
        }
      }
    }

    /**
     * Get current value
     * @returns {number}
     */
    getValue() {
      return this._value;
    }

    /**
     * Set label text
     * @param {string} text
     */
    setLabel(text) {
      this._label = text;
      if (this._labelEl) {
        const labelEl = this._el(this._labelEl);
        if (labelEl) {
          labelEl.textContent = text;
        }
      }
    }

    /**
     * Set color theme
     * @param {string} color - 'emerald', 'gold', 'ruby', 'sapphire', 'amethyst'
     */
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

    /**
     * Safe element accessor
     */
    _el(ctrl = this) {
      return ctrl?.dom?.el || null;
    }

    activate() {
      if (this.__active) return;
      this.__active = true;
      // Progress bar is display-only, no event handlers needed
    }
  }

  return ProgressBarControl;
}

// ═══════════════════════════════════════════════════════════════════════════
// CSS Styles for ProgressBarControl (Industrial Luxury Obsidian theme)
// ═══════════════════════════════════════════════════════════════════════════

const PROGRESS_BAR_STYLES = `
/* Progress Bar - Industrial Luxury Obsidian */
.progress-bar {
  position: relative;
  width: 100%;
}

.progress-bar__track {
  height: 8px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.progress-bar__fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease-out;
}

.progress-bar--animated .progress-bar__fill {
  transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.progress-bar__label {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 10px;
  font-weight: 600;
  color: #f0f4f8;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  pointer-events: none;
}

/* Compact variant */
.progress-bar--compact .progress-bar__track {
  height: 4px;
}

.progress-bar--compact .progress-bar__label {
  display: none;
}

/* Striped variant */
.progress-bar--striped .progress-bar__fill {
  background-image: linear-gradient(
    45deg,
    rgba(255, 255, 255, 0.15) 25%,
    transparent 25%,
    transparent 50%,
    rgba(255, 255, 255, 0.15) 50%,
    rgba(255, 255, 255, 0.15) 75%,
    transparent 75%,
    transparent
  );
  background-size: 16px 16px;
  animation: progress-stripes 1s linear infinite;
}

@keyframes progress-stripes {
  from { background-position: 16px 0; }
  to { background-position: 0 0; }
}

/* Color variants */
.progress-bar--emerald .progress-bar__fill {
  background: linear-gradient(90deg, #2e8b57, #50c878);
  box-shadow: 0 0 8px rgba(80, 200, 120, 0.4);
}

.progress-bar--gold .progress-bar__fill {
  background: linear-gradient(90deg, #8b7500, #c9a227);
  box-shadow: 0 0 8px rgba(201, 162, 39, 0.4);
}

.progress-bar--ruby .progress-bar__fill {
  background: linear-gradient(90deg, #e31837, #ff6b6b);
  box-shadow: 0 0 8px rgba(255, 107, 107, 0.4);
}

.progress-bar--sapphire .progress-bar__fill {
  background: linear-gradient(90deg, #0f52ba, #6fa8dc);
  box-shadow: 0 0 8px rgba(111, 168, 220, 0.4);
}

.progress-bar--amethyst .progress-bar__fill {
  background: linear-gradient(90deg, #9966cc, #da70d6);
  box-shadow: 0 0 8px rgba(218, 112, 214, 0.4);
}
`;

module.exports = {
  createProgressBarControl,
  PROGRESS_BAR_STYLES
};
