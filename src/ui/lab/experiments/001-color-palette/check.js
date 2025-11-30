/**
 * Lab Check: Color Palette Controls
 * 
 * Verifies that jsgui3 color controls render correctly and
 * obext observable properties work as expected.
 * 
 * Run: node src/ui/lab/experiments/001-color-palette/check.js
 */

'use strict';

const path = require('path');

// Setup jsgui3 context
const jsgui = require('jsgui3-html');
const { prop, field } = require('obext');

// Resolve color controls - these are deep in jsgui3-html
let Color_Palette, Color_Grid, Grid;
try {
  Color_Palette = require('jsgui3-html/controls/organised/0-core/0-basic/1-compositional/color-palette');
  Color_Grid = require('jsgui3-html/controls/organised/0-core/0-basic/1-compositional/color-grid');
  Grid = require('jsgui3-html/controls/organised/0-core/0-basic/1-compositional/grid');
} catch (err) {
  console.error('Failed to load color controls:', err.message);
  console.log('\nTrying alternative paths...');
  
  // Alternative: check node_modules structure
  const fs = require('fs');
  const controlsBase = path.join(__dirname, '../../../../node_modules/jsgui3-html/controls');
  if (fs.existsSync(controlsBase)) {
    console.log('Controls base exists:', controlsBase);
    // List available organized directories
    const organised = path.join(controlsBase, 'organised');
    if (fs.existsSync(organised)) {
      console.log('Organised controls:', fs.readdirSync(organised));
    }
  }
  process.exit(1);
}

console.log('✅ Color control imports successful\n');

// Create a basic jsgui context
const context = new jsgui.Page_Context();

// ===== TEST 1: obext prop() with jsgui.Control =====
console.log('TEST 1: obext prop() observable properties');
console.log('──────────────────────────────────────────');

const testCtrl = new jsgui.Control({ context, tagName: 'div' });
prop(testCtrl, 'fg_color', '#000000');
prop(testCtrl, 'bg_color', '#FFFFFF');
prop(testCtrl, 'active', 'foreground');

// Track changes
const changes = [];
testCtrl.on('change', (e) => {
  changes.push({ name: e.name, value: e.value });
});

// Trigger changes
testCtrl.fg_color = '#FF0000';
testCtrl.bg_color = '#00FF00';
testCtrl.active = 'background';

console.log('Changes captured:', changes);
console.log('Expected: 3 changes (fg_color, bg_color, active)');
console.log('Status:', changes.length === 3 ? '✅ PASS' : '❌ FAIL');
console.log();

// ===== TEST 2: Grid control creation =====
console.log('TEST 2: Grid control');
console.log('──────────────────────────────────────────');

const grid = new Grid({
  context,
  grid_size: [4, 4],
  size: [100, 100],
  cell_selection: 'single'
});

const gridHtml = grid.all_html_render();
console.log('Grid rendered:', gridHtml.length, 'chars');
console.log('Contains grid class:', gridHtml.includes('class=') ? '✅' : '❌');
console.log('Contains data-jsgui-id:', gridHtml.includes('data-jsgui-id') ? '✅' : '❌');
console.log();

// ===== TEST 3: Color_Grid with palette =====
console.log('TEST 3: Color_Grid control');
console.log('──────────────────────────────────────────');

const customPalette = [
  '#FF0000', '#FF7F00', '#FFFF00', '#00FF00',
  '#0000FF', '#4B0082', '#9400D3', '#FFFFFF',
  '#000000', '#808080', '#C0C0C0', '#FF00FF'
];

const colorGrid = new Color_Grid({
  context,
  grid_size: [4, 3],
  palette: customPalette,
  size: [120, 90],
  cell_selection: 'single'
});

const colorGridHtml = colorGrid.all_html_render();
console.log('Color_Grid rendered:', colorGridHtml.length, 'chars');

// Check for color backgrounds in style
const hasColorStyles = customPalette.some(c => 
  colorGridHtml.toLowerCase().includes(c.toLowerCase()) ||
  colorGridHtml.includes('background')
);
console.log('Contains color styling:', hasColorStyles ? '✅' : '⚠️ (may be applied via CSS class)');
console.log();

// ===== TEST 4: Full Color_Palette =====
console.log('TEST 4: Color_Palette control');
console.log('──────────────────────────────────────────');

const colorPalette = new Color_Palette({
  context,
  grid_size: [8, 8],
  size: [200, 250]
});

const paletteHtml = colorPalette.all_html_render();
console.log('Color_Palette rendered:', paletteHtml.length, 'chars');
console.log('Has nested structure (multiple controls):', 
  (paletteHtml.match(/data-jsgui-id/g) || []).length > 3 ? '✅' : '❌');
console.log();

// ===== TEST 5: Custom ColorSelectorControl =====
console.log('TEST 5: Custom ColorSelectorControl (obext-based)');
console.log('──────────────────────────────────────────');

/**
 * Simple color selector control using obext for observability.
 * Demonstrates the recommended pattern for Art Playground.
 */
class ColorSelectorControl extends jsgui.Control {
  constructor(spec = {}) {
    spec.context = spec.context || context;
    spec.tagName = spec.tagName || 'div';
    super(spec);
    
    // Observable properties
    prop(this, 'foreground_color', spec.foreground || '#000000');
    prop(this, 'background_color', spec.background || '#FFFFFF');
    prop(this, 'active_target', spec.active_target || 'foreground');
    
    // Non-observable storage
    field(this, 'color_history', []);
    
    if (!spec.el) this._compose();
  }
  
  _compose() {
    this.dom.attributes.class = 'color-selector';
    
    // Preview section
    const preview = new jsgui.Control({ context: this.context, tagName: 'div' });
    preview.dom.attributes.class = 'color-selector__preview';
    
    // FG preview
    this._fgPreview = new jsgui.Control({ context: this.context, tagName: 'div' });
    this._fgPreview.dom.attributes.class = 'color-selector__fg';
    this._fgPreview.dom.attributes['data-target'] = 'foreground';
    this._fgPreview.dom.attributes.style = `background-color: ${this.foreground_color}; width: 24px; height: 24px;`;
    preview.add(this._fgPreview);
    
    // BG preview
    this._bgPreview = new jsgui.Control({ context: this.context, tagName: 'div' });
    this._bgPreview.dom.attributes.class = 'color-selector__bg';
    this._bgPreview.dom.attributes['data-target'] = 'background';
    this._bgPreview.dom.attributes.style = `background-color: ${this.background_color}; width: 24px; height: 24px;`;
    preview.add(this._bgPreview);
    
    this.add(preview);
    
    // Color grid
    const miniPalette = [
      '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF',
      '#FFFF00', '#FF00FF', '#00FFFF', '#808080', '#C0C0C0'
    ];
    
    this._colorGrid = new Color_Grid({
      context: this.context,
      grid_size: [5, 2],
      palette: miniPalette,
      size: [100, 40],
      cell_selection: 'single'
    });
    this.add(this._colorGrid);
  }
  
  activate() {
    if (this.__active) return;
    this.__active = true;
    
    // Wire color selection
    this._colorGrid.on('choose-color', (e) => {
      this.setActiveColor(e.value);
    });
    
    // Wire own changes to UI updates
    this.on('change', (e) => {
      if (e.name === 'foreground_color') {
        this._updatePreviewStyle(this._fgPreview, e.value);
      } else if (e.name === 'background_color') {
        this._updatePreviewStyle(this._bgPreview, e.value);
      }
    });
  }
  
  _updatePreviewStyle(previewCtrl, color) {
    const el = previewCtrl?.dom?.el;
    if (el) {
      el.style.backgroundColor = color;
    }
  }
  
  setActiveColor(color) {
    const oldColor = this.active_target === 'foreground' 
      ? this.foreground_color 
      : this.background_color;
      
    // Store history
    this.color_history.push({
      target: this.active_target,
      from: oldColor,
      to: color,
      timestamp: Date.now()
    });
    
    // Apply
    if (this.active_target === 'foreground') {
      this.foreground_color = color;
    } else {
      this.background_color = color;
    }
  }
  
  swapColors() {
    const temp = this.foreground_color;
    this.foreground_color = this.background_color;
    this.background_color = temp;
  }
}

const colorSelector = new ColorSelectorControl({
  foreground: '#FF0000',
  background: '#0000FF'
});

const selectorHtml = colorSelector.all_html_render();
console.log('ColorSelectorControl rendered:', selectorHtml.length, 'chars');
console.log('Has preview boxes:', selectorHtml.includes('color-selector__fg') ? '✅' : '❌');
console.log('Has color grid:', selectorHtml.includes('data-jsgui-id') ? '✅' : '❌');

// Test observable properties
const selectorChanges = [];
colorSelector.on('change', e => selectorChanges.push(e.name));

colorSelector.foreground_color = '#00FF00';
colorSelector.background_color = '#FF00FF';
colorSelector.swapColors();

console.log('Property changes fired:', selectorChanges.length);
console.log('Expected: 4 (fg, bg, fg-swap, bg-swap):', selectorChanges.length === 4 ? '✅' : '❌');
console.log();

// ===== SUMMARY =====
console.log('═══════════════════════════════════════════════════');
console.log('                    SUMMARY                         ');
console.log('═══════════════════════════════════════════════════');
console.log();
console.log('Available Controls:');
console.log('  • Grid           - Base selectable grid');
console.log('  • Color_Grid     - Grid with color palette');
console.log('  • Color_Palette  - Full FG/BG + grid picker');
console.log('  • [Custom]       - ColorSelectorControl (obext-based)');
console.log();
console.log('Key Pattern:');
console.log('  const { prop } = require("obext");');
console.log('  prop(ctrl, "color", "#FF0000");');
console.log('  ctrl.on("change", e => { /* e.name, e.value */ });');
console.log();
console.log('Lab check complete! ✅');
