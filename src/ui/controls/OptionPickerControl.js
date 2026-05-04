"use strict";

const jsgui = require("jsgui3-html");

const StringControl = jsgui.String_Control;

function normalizeOptions(options) {
  if (!Array.isArray(options)) return [];
  return options
    .filter(Boolean)
    .map((option, index) => ({
      value: String(option.value ?? option.id ?? index),
      label: String(option.label ?? option.text ?? option.value ?? option.id ?? `Option ${index + 1}`),
      icon: option.icon ? String(option.icon) : "",
      description: option.description ? String(option.description) : "",
      disabled: !!option.disabled,
      classNames: option.classNames || option.className || null
    }));
}

function toClassList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  return String(value).split(/\s+/).filter(Boolean);
}

class OptionPickerControl extends jsgui.Control {
  /**
   * Generic option picker that replaces one-off crawl type and URL selectors.
   * It SSR-renders a compact display button, hidden input, and option menu.
   *
   * @param {object} spec
   * @param {object} spec.context jsgui context
   * @param {string} [spec.name] Hidden input name
   * @param {string} [spec.label] Visible field label
   * @param {string} [spec.placeholder]
   * @param {Array<object>} [spec.options]
   * @param {string} [spec.selectedValue]
   */
  constructor(spec = {}) {
    super({ ...spec, tagName: "div", __type_name: "option_picker" });
    this.name = spec.name || null;
    this.label = spec.label || null;
    this.placeholder = spec.placeholder || "Select an option";
    this.options = normalizeOptions(spec.options);
    this.selectedValue = spec.selectedValue ?? spec.value ?? "";
    this._onChange = typeof spec.onChange === "function" ? spec.onChange : null;
    this._optionButtons = new Map();

    this.add_class("option-picker");
    this.dom.attributes["data-option-picker"] = this.name || "default";
    this.dom.attributes["data-selected-value"] = String(this.selectedValue || "");

    if (!spec.el) this.compose();
  }

  compose() {
    const selected = this._selectedOption();

    if (this.label) {
      const label = new jsgui.Control({ context: this.context, tagName: "span" });
      label.add_class("option-picker__field-label");
      label.add(new StringControl({ context: this.context, text: this.label }));
      this.add(label);
    }

    this._button = new jsgui.Control({ context: this.context, tagName: "button" });
    this._button.add_class("option-picker__button");
    this._button.dom.attributes.type = "button";
    this._button.dom.attributes["aria-haspopup"] = "listbox";
    this._button.dom.attributes["aria-expanded"] = "false";

    this._buttonIcon = new jsgui.Control({ context: this.context, tagName: "span" });
    this._buttonIcon.add_class("option-picker__icon");
    this._buttonIcon.add(new StringControl({ context: this.context, text: selected?.icon || "" }));
    this._button.add(this._buttonIcon);

    this._buttonLabel = new jsgui.Control({ context: this.context, tagName: "span" });
    this._buttonLabel.add_class("option-picker__label");
    this._buttonLabel.add(new StringControl({ context: this.context, text: selected?.label || this.placeholder }));
    this._button.add(this._buttonLabel);

    const caret = new jsgui.Control({ context: this.context, tagName: "span" });
    caret.add_class("option-picker__caret");
    caret.add(new StringControl({ context: this.context, text: "v" }));
    this._button.add(caret);
    this.add(this._button);

    if (this.name) {
      this._input = new jsgui.Control({ context: this.context, tagName: "input" });
      this._input.dom.attributes.type = "hidden";
      this._input.dom.attributes.name = this.name;
      this._input.dom.attributes.value = String(this.selectedValue || "");
      this.add(this._input);
    }

    this._menu = new jsgui.Control({ context: this.context, tagName: "div" });
    this._menu.add_class("option-picker__menu");
    this._menu.dom.attributes.role = "listbox";
    this._menu.dom.attributes.hidden = "hidden";
    this.options.forEach((option) => this._menu.add(this._createOptionButton(option)));
    this.add(this._menu);
  }

  _createOptionButton(option) {
    const button = new jsgui.Control({ context: this.context, tagName: "button" });
    button.add_class("option-picker__option");
    toClassList(option.classNames).forEach((cls) => button.add_class(cls));
    button.dom.attributes.type = "button";
    button.dom.attributes.role = "option";
    button.dom.attributes["data-value"] = option.value;
    button.dom.attributes["aria-selected"] = option.value === String(this.selectedValue) ? "true" : "false";
    if (option.disabled) button.dom.attributes.disabled = "disabled";

    const icon = new jsgui.Control({ context: this.context, tagName: "span" });
    icon.add_class("option-picker__option-icon");
    icon.add(new StringControl({ context: this.context, text: option.icon || "" }));
    button.add(icon);

    const text = new jsgui.Control({ context: this.context, tagName: "span" });
    text.add_class("option-picker__option-text");
    const optionLabel = new jsgui.Control({ context: this.context, tagName: "span" });
    optionLabel.add_class("option-picker__option-label");
    optionLabel.add(new StringControl({ context: this.context, text: option.label }));
    text.add(optionLabel);
    if (option.description) {
      const desc = new jsgui.Control({ context: this.context, tagName: "span" });
      desc.add_class("option-picker__option-description");
      desc.add(new StringControl({ context: this.context, text: option.description }));
      text.add(desc);
    }
    button.add(text);
    this._optionButtons.set(option.value, button);
    return button;
  }

  _selectedOption() {
    return this.options.find((option) => option.value === String(this.selectedValue)) || null;
  }

  getSelectedValue() {
    return this.selectedValue;
  }

  setSelectedValue(value) {
    this.selectedValue = String(value ?? "");
    this.dom.attributes["data-selected-value"] = this.selectedValue;
    const selected = this._selectedOption();
    const inputEl = this._input?.dom?.el;
    if (inputEl) inputEl.value = this.selectedValue;
    if (this._input && !inputEl) this._input.dom.attributes.value = this.selectedValue;
    const labelEl = this._buttonLabel?.dom?.el;
    if (labelEl) labelEl.textContent = selected?.label || this.placeholder;
    const iconEl = this._buttonIcon?.dom?.el;
    if (iconEl) iconEl.textContent = selected?.icon || "";
  }

  activate() {
    if (this.__active) return;
    super.activate();
    const buttonEl = this._button?.dom?.el;
    const menuEl = this._menu?.dom?.el;
    if (!buttonEl || !menuEl) return;

    this._button.on("click", () => {
      const open = menuEl.hasAttribute("hidden");
      if (open) {
        menuEl.removeAttribute("hidden");
      } else {
        menuEl.setAttribute("hidden", "hidden");
      }
      buttonEl.setAttribute("aria-expanded", open ? "true" : "false");
    });

    this.options.forEach((option) => {
      const optionButton = this._optionButtons.get(option.value);
      optionButton?.on?.("click", () => {
        if (option.disabled) return;
        this.setSelectedValue(option.value);
        menuEl.setAttribute("hidden", "hidden");
        buttonEl.setAttribute("aria-expanded", "false");
        if (this._onChange) this._onChange(option.value, option);
      });
    });
  }
}

module.exports = { OptionPickerControl };
