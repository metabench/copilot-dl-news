"use strict";

const jsgui = require("../jsgui");

/**
 * Properties Panel Control
 *
 * Presents curated visual controls that update the currently selected canvas component.
 * Emits `property-change` events with shape updates (fill, stroke, opacity, finish).
 */
class PropertiesPanelControl extends jsgui.Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "aside" });
    this.add_class("art-properties");
    this.dom.attributes["data-jsgui-control"] = "art_properties";

    this._selected = null;
    this._swatchButtons = [];
    this._strokeButtons = [];
    this._blendButtons = [];
    this._inputs = {};  // type -> { control, valueCtrl, unit }

    if (!spec.el) this._compose();
  }

  // --- Helpers for concise control creation ---
  
  _ctrl(tagName, className) {
    const c = new jsgui.Control({ context: this.context, tagName });
    if (className) c.add_class(className);
    return c;
  }

  _text(str) {
    return new jsgui.String_Control({ context: this.context, text: str });
  }

  _btn(className, label, attrs = {}) {
    const btn = this._ctrl("button", className);
    const a = btn.dom.attributes;
    a.type = "button";
    Object.assign(a, attrs);
    btn.add(this._text(label));
    return btn;
  }

  _rangeInput(min, max, value, step) {
    const input = this._ctrl("input", "art-properties__range-input");
    const a = input.dom.attributes;
    Object.assign(a, { type: "range", min, max, value, step });
    return input;
  }

  _el(ctrl) {
    return ctrl?.dom?.el || ctrl?.dom;
  }

  // --- Composition ---

  _compose() {
    this._buildHeader();
    this._buildSummary();
    this._buildPaletteSection();
    this._buildStrokeSection();
    this._buildRangeSection("strokeWidth", "Stroke Width", "Edge thickness in pixels", 0, 12, 2, 1, "px");
    this._buildRangeSection("opacity", "Opacity", "Balance transparency vs. solidity", 20, 100, 100, 5, "%");
    this._buildRangeSection("shadow", "Shadow Depth", "Ambient drop shadow intensity", 0, 100, 0, 10, "%");
    this._buildRangeSection("cornerRadius", "Corner Radius", "Softness of edges", 0, 50, 4, 2, "px");
    this._buildBlendSection();
    this._buildFinishSection();
  }

  _buildHeader() {
    const header = this._ctrl("header", "art-properties__header");
    const title = this._ctrl("h2", "art-properties__title");
    title.add(this._text("Visual Options"));
    const subtitle = this._ctrl("p", "art-properties__subtitle");
    subtitle.add(this._text("Curated obsidian + gold finishes"));
    header.add(title);
    header.add(subtitle);
    this.add(header);
  }

  _buildSummary() {
    const summary = this._ctrl("section", "art-properties__summary");
    this._summaryPrimary = this._ctrl("div", "art-properties__summary-primary");
    this._summaryPrimary.add(this._text("Select a component"));
    this._summaryMeta = this._ctrl("div", "art-properties__summary-meta");
    this._summaryMeta.add(this._text(""));
    summary.add(this._summaryPrimary);
    summary.add(this._summaryMeta);
    this.add(summary);
  }

  _buildPaletteSection() {
    const section = this._sectionShell("Palette", "Lux neutrals + obsidian pops");
    const grid = this._ctrl("div", "art-properties__swatches");

    const colors = [
      ["Ivory", "#F2EFE6"], ["Porcelain", "#E6E1D4"],
      ["Obsidian", "#1A1A1A"], ["Midnight", "#2D2D2D"],
      ["Citrine", "#C9A227"], ["Champagne", "#D7B46E"],
      ["Harbor", "#4A90D9"], ["Moss", "#4AD9B3"]
    ];

    for (const [label, value] of colors) {
      const btn = this._btn("art-properties__swatch", label, { "data-color": value });
      this._swatchButtons.push({ color: value, control: btn });
      grid.add(btn);
    }

    section.add(grid);
    this.add(section);
  }

  _buildStrokeSection() {
    const section = this._sectionShell("Edges", "Sculpt light around the shape");
    const group = this._ctrl("div", "art-properties__actions");

    const configs = [
      ["Soft", null, 0],
      ["Obsidian Edge", "#0F0F0F", 2],
      ["Gold Edge", "#C9A227", 2]
    ];

    for (const [label, value, width] of configs) {
      const btn = this._btn("art-properties__pill", label, {
        "data-stroke": value || "none",
        "data-stroke-width": `${width}`
      });
      this._strokeButtons.push({ control: btn, config: { value, width } });
      group.add(btn);
    }

    section.add(group);
    this.add(section);
  }

  _buildRangeSection(type, title, hint, min, max, value, step, unit) {
    const section = this._sectionShell(title, hint);
    const wrapper = this._ctrl("div", "art-properties__range");
    const input = this._rangeInput(`${min}`, `${max}`, `${value}`, `${step}`);
    const valueCtrl = this._ctrl("span", "art-properties__range-value");
    valueCtrl.add(this._text(`${value}${unit}`));

    wrapper.add(input);
    wrapper.add(valueCtrl);
    section.add(wrapper);
    this.add(section);

    this._inputs[type] = { control: input, valueCtrl, unit };
  }

  _buildBlendSection() {
    const section = this._sectionShell("Blend Mode", "Layer compositing style");
    const group = this._ctrl("div", "art-properties__chips");

    const modes = [["Normal", "normal"], ["Multiply", "multiply"], ["Screen", "screen"], ["Overlay", "overlay"]];
    this._blendButtons = [];

    for (const [label, value] of modes) {
      const chip = this._btn("art-properties__chip", label, { "data-blend": value });
      this._blendButtons.push({ value, control: chip });
      group.add(chip);
    }

    section.add(group);
    this.add(section);
  }

  _buildFinishSection() {
    const section = this._sectionShell("Finish", "Ambient glow toggle");
    this._finishButton = this._btn("art-properties__pill", "Golden Halo", { "data-finish": "glow" });
    section.add(this._finishButton);
    this.add(section);
  }

  _sectionShell(title, hint) {
    const section = this._ctrl("section", "art-properties__section");
    const heading = this._ctrl("div", "art-properties__section-heading");
    const titleEl = this._ctrl("h3");
    titleEl.add(this._text(title));
    const hintEl = this._ctrl("span", "art-properties__section-hint");
    hintEl.add(this._text(hint));
    heading.add(titleEl);
    heading.add(hintEl);
    section.add(heading);
    return section;
  }

  // --- Activation & Event Binding ---

  activate() {
    if (this.__active) return;
    this.__active = true;
    this._bindPaletteEvents();
    this._bindStrokeEvents();
    this._bindRangeEvents("opacity", v => ({ opacity: v / 100 }));
    this._bindRangeEvents("strokeWidth", v => ({ strokeWidth: v }));
    this._bindRangeEvents("shadow", v => ({ shadowDepth: v / 100 }));
    this._bindRangeEvents("cornerRadius", v => ({ cornerRadius: v }));
    this._bindBlendEvents();
    this._bindFinishEvents();
    this._setInteractiveState(false);
  }

  _bindPaletteEvents() {
    for (const { color, control } of this._swatchButtons) {
      const el = this._el(control);
      if (!el?.addEventListener) continue;
      el.addEventListener("click", () => {
        this._markActiveSwatch(color);
        this._emitPropertyChange({ fill: color });
      });
    }
  }

  _bindStrokeEvents() {
    for (const { control, config } of this._strokeButtons) {
      const el = this._el(control);
      if (!el?.addEventListener) continue;
      el.addEventListener("click", () => {
        for (const { control: c } of this._strokeButtons) {
          this._el(c)?.classList?.remove("art-properties__pill--active");
        }
        el.classList.add("art-properties__pill--active");
        this._emitPropertyChange(config.value
          ? { stroke: config.value, strokeWidth: config.width }
          : { stroke: null, strokeWidth: 0 });
      });
    }
  }

  _bindRangeEvents(type, patchFn) {
    const entry = this._inputs[type];
    if (!entry) return;
    const el = this._el(entry.control);
    if (!el?.addEventListener) return;
    el.addEventListener("input", () => {
      const v = parseInt(el.value, 10) || 0;
      const valEl = this._el(entry.valueCtrl);
      if (valEl) valEl.innerText = `${v}${entry.unit}`;
      this._emitPropertyChange(patchFn(v));
    });
  }

  _bindBlendEvents() {
    for (const { value, control } of this._blendButtons) {
      const el = this._el(control);
      if (!el?.addEventListener) continue;
      el.addEventListener("click", () => {
        for (const { control: c } of this._blendButtons) {
          this._el(c)?.classList?.remove("art-properties__chip--active");
        }
        el.classList.add("art-properties__chip--active");
        this._emitPropertyChange({ blendMode: value });
      });
    }
  }

  _bindFinishEvents() {
    const el = this._el(this._finishButton);
    if (!el?.addEventListener) return;
    el.addEventListener("click", () => {
      const active = el.classList.toggle("art-properties__pill--active");
      this._emitPropertyChange({ glow: active });
    });
  }

  _emitPropertyChange(patch) {
    if (this._selected) this.raise("property-change", patch);
  }

  // --- Selection Sync ---

  setSelection(comp) {
    this._selected = comp;
    const pEl = this._el(this._summaryPrimary), mEl = this._el(this._summaryMeta);
    if (comp) {
      if (pEl) pEl.innerText = (comp.type || "Component").toUpperCase();
      if (mEl) mEl.innerText = `${Math.round(comp.width)} × ${Math.round(comp.height)} px`;
      this._markActiveSwatch(comp.fill);
      this._syncRange("opacity", (comp.opacity ?? 1) * 100);
      this._syncStroke(comp.stroke);
      this._syncRange("strokeWidth", comp.strokeWidth ?? 2);
      this._syncRange("shadow", (comp.shadowDepth ?? 0) * 100);
      this._syncRange("cornerRadius", comp.cornerRadius ?? 4);
      this._syncBlendMode(comp.blendMode);
      this._syncGlow(comp.glow);
      this._setInteractiveState(true);
    } else {
      if (pEl) pEl.innerText = "Select a component";
      if (mEl) mEl.innerText = "";
      this._markActiveSwatch(null);
      this._syncGlow(false);
      this._setInteractiveState(false);
    }
  }

  _markActiveSwatch(color) {
    const norm = color?.toLowerCase();
    for (const { color: c, control } of this._swatchButtons) {
      this._el(control)?.classList?.toggle("art-properties__swatch--active", norm && c.toLowerCase() === norm);
    }
  }

  _syncRange(type, value) {
    const entry = this._inputs[type];
    if (!entry) return;
    const v = Math.round(value);
    const inputEl = this._el(entry.control), valEl = this._el(entry.valueCtrl);
    if (inputEl) inputEl.value = `${v}`;
    if (valEl) valEl.innerText = `${v}${entry.unit}`;
  }

  _syncStroke(strokeValue) {
    for (const { control, config } of this._strokeButtons) {
      const active = (!strokeValue && !config.value) || (strokeValue && config.value === strokeValue);
      this._el(control)?.classList?.toggle("art-properties__pill--active", !!active);
    }
  }

  _syncBlendMode(blendMode) {
    const active = blendMode || "normal";
    for (const { value, control } of this._blendButtons) {
      this._el(control)?.classList?.toggle("art-properties__chip--active", value === active);
    }
  }

  _syncGlow(glow) {
    this._el(this._finishButton)?.classList?.toggle("art-properties__pill--active", !!glow);
  }

  _setInteractiveState(enabled) {
    this._el(this)?.classList?.toggle("art-properties--empty", !enabled);
    const all = [...this._swatchButtons, ...this._strokeButtons, ...this._blendButtons];
    for (const { control } of all) {
      const el = this._el(control);
      if (el) el.disabled = !enabled;
    }
    for (const { control } of Object.values(this._inputs)) {
      const el = this._el(control);
      if (el) el.disabled = !enabled;
    }
    const finishEl = this._el(this._finishButton);
    if (finishEl) finishEl.disabled = !enabled;
  }
}

module.exports = { PropertiesPanelControl };
