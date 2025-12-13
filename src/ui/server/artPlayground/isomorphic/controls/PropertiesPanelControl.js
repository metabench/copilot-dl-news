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
    this._palettes = {};
    
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
    fillSection.add(this._palettes.fill = this._colorPalette("fill"));
    this.add(fillSection);
    
    // Stroke section
    const strokeSection = this._section();
    strokeSection.add(this._label("Stroke"));
    const strokeRow = this._row();
    strokeRow.add(this._strokeSwatch = this._colorSwatch("transparent", "stroke"));
    strokeRow.add(this._inputs.stroke = this._input("", "none", "stroke"));
    strokeSection.add(strokeRow);
    strokeSection.add(this._palettes.stroke = this._colorPalette("stroke"));
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

  _getPaletteSpec(propName) {
    // Keep as literal hex strings so emitted values are stable and testable.
    // WLILO reference palette + pragmatic accents.
    const base = [
      { label: "Cool highlight", value: "#4a9eff" },
      { label: "Cool highlight (deep)", value: "#2d7dd2" },
      { label: "Gold", value: "#c9a962" },
      { label: "Gold (light)", value: "#e8d5a3" },
      { label: "Success", value: "#2ecc71" },
      { label: "Danger", value: "#d94a4a" },
      { label: "Obsidian", value: "#2d2d2d" },
      { label: "Gray (secondary)", value: "#888888" },
      { label: "Gray (tertiary)", value: "#666666" },
      { label: "Leather", value: "#ebe8e2" },
      { label: "White", value: "#faf9f7" },
    ];

    if (propName === "stroke") {
      return [{ label: "None", value: "none", kind: "none" }, ...base];
    }

    return base;
  }

  _colorPalette(propName) {
    const palette = new Control({ context: this.context, tagName: "div" });
    palette.add_class("ap-color-palette");
    palette.dom.attributes["data-role"] = propName === "fill" ? "ap-fill-palette" : "ap-stroke-palette";
    palette.dom.attributes["data-prop"] = propName;
    palette.dom.attributes.role = "radiogroup";
    palette.dom.attributes["aria-label"] = propName === "fill" ? "Fill color" : "Stroke color";

    const swatches = this._getPaletteSpec(propName);
    swatches.forEach((s, idx) => {
      const btn = new Control({ context: this.context, tagName: "button" });
      btn.add_class("ap-color-palette__swatch");
      btn.dom.attributes.type = "button";
      btn.dom.attributes["data-role"] = "ap-color-swatch";
      btn.dom.attributes["data-prop"] = propName;
      btn.dom.attributes["data-value"] = s.value;
      btn.dom.attributes.title = s.label;
      btn.dom.attributes["aria-label"] = `${propName}: ${s.label}`;
      btn.dom.attributes.role = "radio";
      btn.dom.attributes["aria-checked"] = "false";
      btn.dom.attributes.tabindex = idx === 0 ? "0" : "-1";

      if (s.kind === "none") {
        btn.add_class("ap-color-palette__swatch--none");
      } else {
        btn.dom.attributes.style = `background: ${s.value};`;
      }

      palette.add(btn);
    });

    return palette;
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

      // Palettes
      if (!this._palettes || Object.keys(this._palettes).length === 0) {
        this._palettes = {};
      }
      if (!this._palettes.fill) {
        const el = root.querySelector('[data-role="ap-fill-palette"]');
        if (el) this._palettes.fill = { dom: { el } };
      }
      if (!this._palettes.stroke) {
        const el = root.querySelector('[data-role="ap-stroke-palette"]');
        if (el) this._palettes.stroke = { dom: { el } };
      }
    }

    // Two-way editing (client only)
    this._bindInputHandlers();
    this._bindPaletteHandlers();

    // Ensure palettes are keyboard-accessible even before a selection exists.
    // (Roving tabindex + aria-checked sync will be updated again in updateSelection.)
    this._syncPaletteA11yFromUi();
  }

  _getPaletteButtons(paletteEl) {
    if (!paletteEl) return [];
    return Array.from(paletteEl.querySelectorAll('button[data-role="ap-color-swatch"]'));
  }

  _getPaletteColumns(paletteEl) {
    try {
      const style = window.getComputedStyle(paletteEl);
      const cols = String(style.gridTemplateColumns || "").trim();
      if (cols) {
        const count = cols.split(/\s+/).filter(Boolean).length;
        if (count > 0) return count;
      }
    } catch (_e) {
      // Ignore and fallback.
    }
    return 6;
  }

  _setPaletteRovingTabindex(paletteEl, activeBtn) {
    const buttons = this._getPaletteButtons(paletteEl);
    if (buttons.length === 0) return;
    const fallback = buttons[0];
    const active = activeBtn && buttons.includes(activeBtn) ? activeBtn : fallback;
    buttons.forEach((b) => {
      b.setAttribute("tabindex", b === active ? "0" : "-1");
    });
  }

  _activatePaletteSwatchButton(btn) {
    if (!btn) return;
    const prop = btn.getAttribute("data-prop");
    const value = btn.getAttribute("data-value");
    if (!prop || value == null) return;

    // Keep UI in sync immediately.
    this._applyPropToUi(prop, value);

    // Emit change through the same command path as manual input.
    this._emitPropertyChange(prop, value);
  }

  _syncPaletteA11yFromUi() {
    if (typeof document === "undefined") return;

    const fillVal = this._inputs?.fill?._inputEl?.dom?.el?.value;
    const strokeVal = this._inputs?.stroke?._inputEl?.dom?.el?.value;
    this._updatePaletteSelected("fill", fillVal ?? "");
    this._updatePaletteSelected("stroke", strokeVal ?? "none");
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

        this._emitPropertyChange(prop, raw);
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

  _bindPaletteHandlers() {
    if (typeof document === "undefined") return;
    if (this._palettesBound) return;
    this._palettesBound = true;

    const root = this.dom?.el;
    if (!root) return;

    root.addEventListener("click", (e) => {
      const target = e.target;
      if (!target) return;

      const btn = target.closest?.('button[data-role="ap-color-swatch"]');
      if (!btn) return;

      this._activatePaletteSwatchButton(btn);
    });

    root.addEventListener("keydown", (e) => {
      const target = e.target;
      if (!target) return;

      const btn = target.closest?.('button[data-role="ap-color-swatch"]');
      if (!btn) return;

      const paletteEl = btn.closest?.(".ap-color-palette");
      if (!paletteEl) return;

      const buttons = this._getPaletteButtons(paletteEl);
      if (buttons.length === 0) return;

      const idx = buttons.indexOf(btn);
      if (idx < 0) return;

      const key = e.key;
      const cols = this._getPaletteColumns(paletteEl);

      // Activate (prevent native button click generation to avoid double emits)
      if (key === "Enter" || key === " ") {
        e.preventDefault();
        e.stopPropagation();
        this._activatePaletteSwatchButton(btn);
        return;
      }

      let nextIdx = null;
      if (key === "ArrowLeft") nextIdx = idx - 1;
      if (key === "ArrowRight") nextIdx = idx + 1;
      if (key === "ArrowUp") nextIdx = idx - cols;
      if (key === "ArrowDown") nextIdx = idx + cols;
      if (key === "Home") nextIdx = 0;
      if (key === "End") nextIdx = buttons.length - 1;

      if (nextIdx === null) return;

      e.preventDefault();
      e.stopPropagation();

      nextIdx = Math.max(0, Math.min(buttons.length - 1, nextIdx));
      const nextBtn = buttons[nextIdx];
      if (!nextBtn) return;

      this._setPaletteRovingTabindex(paletteEl, nextBtn);
      nextBtn.focus();
    });
  }

  _emitPropertyChange(prop, rawValue) {
    const selectionId = this._selection?.id;
    if (!selectionId) return;

    const raw = String(rawValue ?? "").trim();

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
  }

  _applyPropToUi(prop, value) {
    if (prop === "fill") {
      this._setInputValue("fill", value);
      this._updateSwatch(this._fillSwatch, value);
      this._updatePaletteSelected("fill", value);
    }
    if (prop === "stroke") {
      this._setInputValue("stroke", value);
      this._updateSwatch(this._strokeSwatch, value === "none" ? "transparent" : value);
      this._updatePaletteSelected("stroke", value);
    }
  }

  _updatePaletteSelected(prop, value) {
    const paletteEl = this._palettes?.[prop]?.dom?.el;
    if (!paletteEl) return;

    const normalized = String(value ?? "").trim().toLowerCase();
    const buttons = Array.from(paletteEl.querySelectorAll('button[data-role="ap-color-swatch"]'));
    buttons.forEach((b) => {
      b.classList.remove("ap-color-palette__swatch--selected");
      b.setAttribute("aria-checked", "false");
    });

    const match = buttons.find((b) => String(b.getAttribute("data-value") ?? "").trim().toLowerCase() === normalized);
    if (match) {
      match.classList.add("ap-color-palette__swatch--selected");
      match.setAttribute("aria-checked", "true");
      this._setPaletteRovingTabindex(paletteEl, match);
    } else {
      // No exact match: keep palette tabbable by ensuring first swatch is in tab order.
      this._setPaletteRovingTabindex(paletteEl, buttons[0]);
    }
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
      this._updatePaletteSelected("fill", "");
      this._updatePaletteSelected("stroke", "");
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

    this._updatePaletteSelected("fill", selection.fill || "");
    this._updatePaletteSelected("stroke", selection.stroke || "none");
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
