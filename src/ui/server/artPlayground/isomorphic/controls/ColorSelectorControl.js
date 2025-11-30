"use strict";

const jsgui = require("../jsgui");
const { prop } = require("obext");
const Color_Grid = require("jsgui3-html/controls/organised/0-core/0-basic/1-compositional/color-grid");

const { Control, String_Control } = jsgui;

/**
 * Color Selector Control - FG/BG color selection for Art Playground toolbar.
 * 
 * @fires color-change {{ fg: string, bg: string, target: 'foreground'|'background' }}
 * @property {string} foreground_color - Observable hex color
 * @property {string} background_color - Observable hex color  
 * @property {string} active_target - 'foreground' | 'background'
 */
class ColorSelectorControl extends Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "div" });
    this.add_class("color-selector");
    this.dom.attributes["data-jsgui-control"] = "color_selector";
    
    prop(this, 'foreground_color', spec.foreground || '#000000');
    prop(this, 'background_color', spec.background || '#FFFFFF');
    prop(this, 'active_target', 'foreground');
    
    if (!spec.el) this.compose();
  }
  
  compose() {
    const ctx = this.context;
    
    // === Preview Section ===
    const preview = new Control({ context: ctx, tagName: "div" });
    preview.add_class("color-selector__preview");
    
    const fg = this._fgBox = new Control({ context: ctx, tagName: "div" });
    fg.add_class("color-selector__fg");
    Object.assign(fg.dom.attributes, {
      "data-target": "foreground",
      style: `background-color: ${this.foreground_color};`,
      title: "Foreground color (click to select)"
    });
    preview.add(fg);
    
    const bg = this._bgBox = new Control({ context: ctx, tagName: "div" });
    bg.add_class("color-selector__bg");
    Object.assign(bg.dom.attributes, {
      "data-target": "background",
      style: `background-color: ${this.background_color};`,
      title: "Background color (click to select)"
    });
    preview.add(bg);
    
    const swap = this._swapBtn = new Control({ context: ctx, tagName: "button" });
    swap.add_class("color-selector__swap");
    Object.assign(swap.dom.attributes, { title: "Swap colors", type: "button" });
    swap.add(new String_Control({ context: ctx, text: "⇄" }));
    preview.add(swap);
    
    const reset = this._resetBtn = new Control({ context: ctx, tagName: "button" });
    reset.add_class("color-selector__reset");
    Object.assign(reset.dom.attributes, { title: "Reset to default", type: "button" });
    reset.add(new String_Control({ context: ctx, text: "⟲" }));
    preview.add(reset);
    
    this.add(preview);
    
    // === Color Grid Section ===
    const gridWrapper = new Control({ context: ctx, tagName: "div" });
    gridWrapper.add_class("color-selector__grid-wrapper");
    
    gridWrapper.add(this._colorGrid = new Color_Grid({
      context: ctx,
      grid_size: [5, 4],
      palette: [
        '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF',
        '#FFFF00', '#FF00FF', '#00FFFF', '#808080', '#C0C0C0',
        '#FF6B6B', '#FF8C42', '#FFD93D', '#FFF89A', '#F5E6CA',
        '#6BCB77', '#4D96FF', '#845EC2', '#D65DB1', '#2C3E50'
      ],
      size: [100, 80],
      cell_selection: 'single'
    }));
    
    this.add(gridWrapper);
  }
  
  activate() {
    if (this.__active) return;
    this.__active = true;
    
    const fgEl = this._fgBox?.dom?.el;
    const bgEl = this._bgBox?.dom?.el;
    const swapEl = this._swapBtn?.dom?.el;
    const resetEl = this._resetBtn?.dom?.el;
    
    // Preview clicks
    fgEl?.addEventListener?.('click', () => { this.active_target = 'foreground'; });
    bgEl?.addEventListener?.('click', () => { this.active_target = 'background'; });
    
    // Action buttons
    swapEl?.addEventListener?.('click', () => this.swapColors());
    resetEl?.addEventListener?.('click', () => this.resetColors());
    
    // Color grid
    this._colorGrid.on('choose-color', (e) => this.setActiveColor(e.value));
    
    // Property changes
    this.on('change', (e) => {
      const { name, value } = e;
      if (name === 'foreground_color') {
        if (fgEl) fgEl.style.backgroundColor = value;
        this._emitColorChange();
      } else if (name === 'background_color') {
        if (bgEl) bgEl.style.backgroundColor = value;
        this._emitColorChange();
      } else if (name === 'active_target') {
        fgEl?.classList?.toggle('color-selector__fg--active', value === 'foreground');
        bgEl?.classList?.toggle('color-selector__bg--active', value === 'background');
      }
    });
    
    // Initial state
    fgEl?.classList?.toggle('color-selector__fg--active', this.active_target === 'foreground');
    bgEl?.classList?.toggle('color-selector__bg--active', this.active_target === 'background');
  }
  
  _emitColorChange() {
    this.raise('color-change', {
      fg: this.foreground_color,
      bg: this.background_color,
      target: this.active_target
    });
  }
  
  /** Set the active color (fg or bg based on active_target) */
  setActiveColor(color) {
    this[this.active_target === 'foreground' ? 'foreground_color' : 'background_color'] = color;
  }
  
  /** Swap foreground and background colors */
  swapColors() {
    [this.foreground_color, this.background_color] = [this.background_color, this.foreground_color];
  }
  
  /** Reset to default black/white */
  resetColors() {
    this.foreground_color = '#000000';
    this.background_color = '#FFFFFF';
  }

  /** @returns {{ foreground: string, background: string }} */
  getColors() {
    return { foreground: this.foreground_color, background: this.background_color };
  }
  
  setForeground(color) { this.foreground_color = color; }
  setBackground(color) { this.background_color = color; }
}

module.exports = { ColorSelectorControl };
