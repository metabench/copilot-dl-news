"use strict";

function createControlButtonControl(jsgui, { StringControl }) {
  class ControlButtonControl extends jsgui.Control {
    constructor(spec = {}) {
      const normalized = {
        ...spec,
        tagName: "button",
        __type_name: "control_button"
      };
      super(normalized);
      this.add_class("zs-btn");
      
      if (spec.variant) {
        this.add_class(`zs-btn--${spec.variant}`);
      }
      
      this._disabled = spec.disabled || false;
      this._onClick = spec.onClick || null;
      this._label = spec.label || "Button";
      
      if (!spec.el) {
        this.compose();
      }
      this._syncState();
    }

    compose() {
      this.add(new StringControl({ context: this.context, text: this._label }));
    }

    _syncState() {
      if (this._disabled) {
        this.dom.attributes.disabled = "disabled";
        this.add_class("zs-btn--disabled");
      } else {
        delete this.dom.attributes.disabled;
        this.remove_class("zs-btn--disabled");
      }
    }

    setDisabled(disabled) {
      this._disabled = disabled;
      this._syncState();
      
      if (this.dom.el) {
        this.dom.el.disabled = disabled;
        if (disabled) {
          this.dom.el.classList.add("zs-btn--disabled");
        } else {
          this.dom.el.classList.remove("zs-btn--disabled");
        }
      }
    }

    activate() {
      if (this.dom.el && this._onClick) {
        this.dom.el.addEventListener("click", () => {
          if (!this._disabled) {
            this._onClick();
          }
        });
      }
    }
  }

  return ControlButtonControl;
}

module.exports = { createControlButtonControl };
