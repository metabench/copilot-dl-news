"use strict";

const jsgui = require("jsgui3-html");

const StringControl = jsgui.String_Control;

const ACTION_VARIANTS = Object.freeze({
  DEFAULT: "default",
  PRIMARY: "primary",
  SUCCESS: "success",
  WARNING: "warning",
  DANGER: "danger",
  QUIET: "quiet"
});

function normalizeActions(actions) {
  if (!Array.isArray(actions)) return [];
  return actions
    .filter(Boolean)
    .map((action, index) => ({
      id: String(action.id || action.name || `action-${index}`),
      label: String(action.label || action.text || action.id || `Action ${index + 1}`),
      icon: action.icon ? String(action.icon) : "",
      title: action.title ? String(action.title) : null,
      variant: action.variant || ACTION_VARIANTS.DEFAULT,
      disabled: !!action.disabled,
      type: action.type || "button",
      classNames: action.classNames || action.className || null,
      onClick: typeof action.onClick === "function" ? action.onClick : null
    }));
}

function toClassList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  return String(value).split(/\s+/).filter(Boolean);
}

class ActionButtonGroupControl extends jsgui.Control {
  /**
   * Shared configurable button group for toolbars, forms, and crawl controls.
   *
   * @param {object} spec
   * @param {object} spec.context jsgui context
   * @param {Array<object>} [spec.actions] Action definitions
   * @param {string} [spec.orientation="horizontal"] horizontal or vertical
   * @param {string} [spec.size="md"] sm, md, or lg
   * @param {string} [spec.ariaLabel] Accessible group label
   */
  constructor(spec = {}) {
    super({ ...spec, tagName: "div", __type_name: "action_button_group" });
    this.actions = normalizeActions(spec.actions);
    this.orientation = spec.orientation === "vertical" ? "vertical" : "horizontal";
    this.size = spec.size || "md";
    this.ariaLabel = spec.ariaLabel || spec.label || "Actions";
    this._buttons = new Map();

    this.add_class("action-button-group");
    this.add_class(`action-button-group--${this.orientation}`);
    this.add_class(`action-button-group--${this.size}`);
    this.dom.attributes.role = "group";
    this.dom.attributes["aria-label"] = this.ariaLabel;

    if (!spec.el) this.compose();
  }

  compose() {
    this.actions.forEach((action) => {
      const button = new jsgui.Control({ context: this.context, tagName: "button" });
      button.add_class("action-button-group__button");
      button.add_class(`action-button-group__button--${action.variant}`);
      toClassList(action.classNames).forEach((cls) => button.add_class(cls));
      button.dom.attributes.type = action.type;
      button.dom.attributes["data-action-id"] = action.id;
      if (action.title) button.dom.attributes.title = action.title;
      if (action.disabled) {
        button.dom.attributes.disabled = "disabled";
        button.add_class("action-button-group__button--disabled");
      }

      if (action.icon) {
        const icon = new jsgui.Control({ context: this.context, tagName: "span" });
        icon.add_class("action-button-group__icon");
        icon.add(new StringControl({ context: this.context, text: action.icon }));
        button.add(icon);
      }

      const label = new jsgui.Control({ context: this.context, tagName: "span" });
      label.add_class("action-button-group__label");
      label.add(new StringControl({ context: this.context, text: action.label }));
      button.add(label);

      this._buttons.set(action.id, button);
      this.add(button);
    });
  }

  setDisabled(actionId, disabled) {
    const action = this.actions.find((entry) => entry.id === actionId);
    if (action) action.disabled = !!disabled;

    const button = this._buttons.get(actionId);
    const el = button?.dom?.el;
    if (el) {
      el.disabled = !!disabled;
      el.classList.toggle("action-button-group__button--disabled", !!disabled);
    } else if (button) {
      if (disabled) {
        button.dom.attributes.disabled = "disabled";
        button.add_class("action-button-group__button--disabled");
      } else {
        delete button.dom.attributes.disabled;
      }
    }
  }

  activate() {
    if (this.__active) return;
    super.activate();
    this.actions.forEach((action) => {
      if (!action.onClick) return;
      const button = this._buttons.get(action.id);
      button?.on?.("click", (event) => {
        if (action.disabled) return;
        action.onClick({ action, event, group: this });
      });
    });
  }
}

module.exports = { ActionButtonGroupControl, ACTION_VARIANTS };
