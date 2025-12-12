"use strict";

const jsgui = require("../jsgui");
const { Control, String_Control } = jsgui;

/**
 * Properties Panel Control - Right panel (160px) showing selected element properties.
 * 
 * Sections:
 * - Properties header
 * - Position (X, Y)
 * - Size (W, H)
 * - Fill color
 * - Stroke color
 * - Layers list
 */
class PropertiesPanelControl extends Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "aside" });
    this.add_class("ap-properties-panel");
    this.add_class("ap-panel-medium");
    this.dom.attributes["data-jsgui-control"] = "ap_properties_panel";
    
    this._selection = null;
    this._layers = [];
    this._inputs = {};
    this._lastEmitted = { id: null, byProp: Object.create(null) };
    
    if (!spec.el) this.compose();
  }
  
  compose() {
    const ctx = this.context;
    
    // Properties header
    this.add(this._header("Properties"));
    
    // Position section
    const posSection = this._section();
    posSection.add(this._label("Position"));
    const posRow = this._row();
    posRow.add(this._inputs.x = this._input("X", "0", "x"));
    posRow.add(this._inputs.y = this._input("Y", "0", "y"));
    posSection.add(posRow);
    this.add(posSection);
    
    // Size section
    const sizeSection = this._section();
    sizeSection.add(this._label("Size"));
    const sizeRow = this._row();
    sizeRow.add(this._inputs.width = this._input("W", "0", "width"));
    sizeRow.add(this._inputs.height = this._input("H", "0", "height"));
    sizeSection.add(sizeRow);
    this.add(sizeSection);
    
    // Fill section
    const fillSection = this._section();
    fillSection.add(this._label("Fill"));
    const fillRow = this._row();
    fillRow.add(this._fillSwatch = this._colorSwatch("#4A90D9", "fill"));
    fillRow.add(this._inputs.fill = this._input("", "#4A90D9", "fill"));
    fillSection.add(fillRow);
    this.add(fillSection);
    
    // Stroke section
    const strokeSection = this._section();
    strokeSection.add(this._label("Stroke"));
    const strokeRow = this._row();
    strokeRow.add(this._strokeSwatch = this._colorSwatch("transparent", "stroke"));
    strokeRow.add(this._inputs.stroke = this._input("", "none", "stroke"));
    strokeSection.add(strokeRow);
    this.add(strokeSection);
    
    // Layers header
    this.add(this._header("Layers"));
    
    // Layers list container
    this._layersContainer = new Control({ context: ctx, tagName: "div" });
    this._layersContainer.add_class("ap-layers");
    this.add(this._layersContainer);
  }
  
  _header(text) {
    const ctx = this.context;
    const header = new Control({ context: ctx, tagName: "div" });
    header.add_class("ap-properties-panel__header");
    header.add(new String_Control({ context: ctx, text }));
    return header;
  }
  
  _section() {
    const section = new Control({ context: this.context, tagName: "div" });
    section.add_class("ap-properties-panel__section");
    return section;
  }
  
  _label(text) {
    const ctx = this.context;
    const label = new Control({ context: ctx, tagName: "span" });
    label.add_class("ap-properties-panel__label");
    label.add(new String_Control({ context: ctx, text }));
    return label;
  }
  
  _row() {
    const row = new Control({ context: this.context, tagName: "div" });
    row.add_class("ap-properties-panel__row");
    return row;
  }
  
  _input(prefix, value, propName) {
    const ctx = this.context;
    const wrapper = new Control({ context: ctx, tagName: "div" });
    wrapper.dom.attributes.style = "flex: 1; display: flex; align-items: center; gap: 4px;";
    
    if (prefix) {
      const prefixEl = new Control({ context: ctx, tagName: "span" });
      prefixEl.dom.attributes.style = "color: var(--ap-leather); font-size: 10px;";
      prefixEl.add(new String_Control({ context: ctx, text: prefix + ":" }));
      wrapper.add(prefixEl);
    }
    
    const input = new Control({ context: ctx, tagName: "input" });
    input.add_class("ap-properties-panel__input");
    input.dom.attributes.type = "text";
    input.dom.attributes.value = value;
    if (propName) input.dom.attributes["data-prop"] = propName;
    wrapper.add(input);
    
    wrapper._inputEl = input;
    return wrapper;
  }
  
  _colorSwatch(color, propName) {
    const swatch = new Control({ context: this.context, tagName: "div" });
    swatch.add_class("ap-properties-panel__color-swatch");
    swatch.dom.attributes.style = `background: ${color};`;
    if (propName) swatch.dom.attributes["data-prop"] = propName;
    return swatch;
  }
  
  activate() {
    if (this.__active) return;
    this.__active = true;

    // Activation path: when constructed with { el }, compose() was skipped.
    // Reconnect DOM references for inputs/swatches/layers container.
    if (this.dom?.el) {
      const root = this.dom.el;

      // Inputs
      if (!this._inputs || Object.keys(this._inputs).length === 0) {
        this._inputs = {};
        const inputEls = Array.from(root.querySelectorAll("input.ap-properties-panel__input"));

        // Prefer explicit data-prop markers.
        inputEls.forEach((inputEl) => {
          const prop = inputEl.getAttribute("data-prop");
          if (!prop) return;
          this._inputs[prop] = { _inputEl: { dom: { el: inputEl } } };
        });

        // Fallback to positional mapping if needed.
        const orderedProps = ["x", "y", "width", "height", "fill", "stroke"];
        orderedProps.forEach((prop, idx) => {
          if (this._inputs[prop]?._inputEl?.dom?.el) return;
          const inputEl = inputEls[idx];
          if (!inputEl) return;
          this._inputs[prop] = { _inputEl: { dom: { el: inputEl } } };
        });
      }

      // Swatches
      if (!this._fillSwatch || !this._strokeSwatch) {
        const swatches = Array.from(root.querySelectorAll(".ap-properties-panel__color-swatch"));
        const byProp = new Map(swatches.map((el) => [el.getAttribute("data-prop"), el]));
        this._fillSwatch = this._fillSwatch || { dom: { el: byProp.get("fill") || swatches[0] } };
        this._strokeSwatch = this._strokeSwatch || { dom: { el: byProp.get("stroke") || swatches[1] } };
      }

      // Layers container
      if (!this._layersContainer) {
        this._layersContainer = { dom: { el: root.querySelector(".ap-layers") } };
      }
    }

    // Two-way editing (client only)
    this._bindInputHandlers();
  }

  _bindInputHandlers() {
    if (typeof document === "undefined") return;
    if (this._inputsBound) return;
    this._inputsBound = true;

    const bind = (prop) => {
      const inputEl = this._inputs?.[prop]?._inputEl?.dom?.el;
      if (!inputEl) return;

      const emit = () => {
        const selectionId = this._selection?.id;
        if (!selectionId) return;
        const raw = String(inputEl.value ?? "").trim();

        // Avoid redundant emits (notably on blur/click transitions) when nothing
        // actually changed for the current selection.
        if (this._lastEmitted.id !== selectionId) {
          this._lastEmitted.id = selectionId;
          this._lastEmitted.byProp = Object.create(null);
        }

        const last = this._lastEmitted.byProp[prop];
        if (last === raw) return;

        const sel = this._selection;
        if (sel && Object.prototype.hasOwnProperty.call(sel, prop)) {
          const current = sel[prop];
          const currentStr = current === undefined || current === null ? null : String(current);
          if (currentStr !== null && currentStr === raw) return;
        }

        this._lastEmitted.byProp[prop] = raw;
        this.raise("property-change", { id: selectionId, prop, value: raw });
      };

      inputEl.addEventListener("change", emit);
      inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          emit();
          inputEl.blur();
        }
      });
    };

    ["x", "y", "width", "height", "fill", "stroke"].forEach(bind);
  }
  
  /**
   * Update the properties panel with selection data.
   * @param {object|null} selection - { id, type, x, y, width, height, fill, stroke }
   */
  updateSelection(selection) {
    this._selection = selection;
    
    if (!selection) {
      this._setInputValue("x", "—");
      this._setInputValue("y", "—");
      this._setInputValue("width", "—");
      this._setInputValue("height", "—");
      this._setInputValue("fill", "—");
      this._setInputValue("stroke", "—");
      this._updateSwatch(this._fillSwatch, "#ccc");
      this._updateSwatch(this._strokeSwatch, "#ccc");
      return;
    }
    
    this._setInputValue("x", Math.round(selection.x));
    this._setInputValue("y", Math.round(selection.y));
    this._setInputValue("width", Math.round(selection.width));
    this._setInputValue("height", Math.round(selection.height));
    this._setInputValue("fill", selection.fill || "#000");
    this._setInputValue("stroke", selection.stroke || "none");
    this._updateSwatch(this._fillSwatch, selection.fill || "#ccc");
    this._updateSwatch(this._strokeSwatch, selection.stroke || "transparent");
  }
  
  _setInputValue(name, value) {
    const wrapper = this._inputs[name];
    const inputEl = wrapper?._inputEl?.dom?.el;
    if (inputEl) {
      inputEl.value = value;
    }
  }
  
  _updateSwatch(swatch, color) {
    const el = swatch?.dom?.el;
    if (el) {
      el.style.background = color;
    }
  }
  
  /**
   * Update the layers list.
   * @param {Array} layers - [{ id, type, name, selected }]
   */
  updateLayers(layers) {
    this._layers = layers;
    
    const container = this._layersContainer?.dom?.el;
    if (!container) return;
    
    // Clear existing layers
    container.innerHTML = "";
    
    // Add layer items
    layers.forEach(layer => {
      const item = document.createElement("div");
      item.className = "ap-layers__item" + (layer.selected ? " ap-layers__item--selected" : "");
      item.dataset.layerId = layer.id;
      
      const icon = document.createElement("span");
      icon.className = "ap-layers__icon";
      icon.textContent = this._getLayerIcon(layer.type);
      item.appendChild(icon);
      
      const name = document.createElement("span");
      name.textContent = layer.name || `${layer.type} ${layer.id}`;
      item.appendChild(name);
      
      item.addEventListener("click", () => {
        this.raise("layer-select", layer.id);
      });
      
      container.appendChild(item);
    });
  }
  
  _getLayerIcon(type) {
    const icons = {
      rect: "▢",
      ellipse: "○",
      text: "T",
      line: "⟋",
    };
    return icons[type] || "?";
  }
}

module.exports = { PropertiesPanelControl };
