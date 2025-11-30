const DEFAULT_COLOR_PALETTES = [
  {
    name: 'Luxury Core',
    emoji: '💎',
    colors: [
      { value: '#1A1A1A', label: 'Obsidian' },
      { value: '#C9A227', label: 'Gold' },
      { value: '#F5F5F0', label: 'Cream' },
      { value: '#4A90D9', label: 'Cobalt' },
      { value: '#D94A4A', label: 'Crimson' },
      { value: '#4AD9D9', label: 'Glacier' }
    ]
  },
  {
    name: 'Vibrant Studio',
    emoji: '🎨',
    colors: [
      { value: '#FF6B6B', label: 'Coral' },
      { value: '#FFD166', label: 'Amber' },
      { value: '#06D6A0', label: 'Mint' },
      { value: '#118AB2', label: 'Sky' },
      { value: '#8338EC', label: 'Violet' },
      { value: '#EF476F', label: 'Fuchsia' }
    ]
  }
];

const DEFAULT_VARIANT_STEPS = [-24, -12, 0, 12, 24];

function createColorSelectorControl(jsgui, opts = {}) {
  const identifier = opts.identifier || 'color_selector';

  return class ColorSelectorControl extends jsgui.Control {
    constructor(spec = {}) {
      super({ ...spec, tagName: 'div' });
      this.add_class('color-selector');
      this.dom.attributes['data-jsgui-control'] = identifier;

      this._palettes = spec.palettes || DEFAULT_COLOR_PALETTES;
      this._variantSteps = spec.variantSteps || DEFAULT_VARIANT_STEPS;
      this._selectedColor = this._normalizeColor(spec.value || '#4A90D9');
      this._controls = {};

      if (!spec.el) {
        this._build();
      }
    }

    _build() {
      this._renderHeader();
      this._renderPreview();
      this._renderPalettes();
      this._renderVariants();
      this._renderCustomInputs();
    }

    _renderHeader() {
      const header = new jsgui.Control({ context: this.context, tagName: 'div' });
      header.add_class('color-selector__header');

      const title = new jsgui.Control({ context: this.context, tagName: 'span' });
      title.add_class('color-selector__title');
      title.add('🎨 Colour Studio');

      const subtitle = new jsgui.Control({ context: this.context, tagName: 'span' });
      subtitle.add_class('color-selector__subtitle');
      subtitle.add('Curated palettes + smart variants');

      header.add(title);
      header.add(subtitle);
      this.add(header);
    }

    _renderPreview() {
      const preview = new jsgui.Control({ context: this.context, tagName: 'div' });
      preview.add_class('color-selector__preview');

      const chip = new jsgui.Control({ context: this.context, tagName: 'div' });
      chip.add_class('color-selector__preview-chip');
      chip.dom.attributes['data-role'] = 'preview-chip';
      chip.dom.attributes.style = `background: ${this._selectedColor};`;

      const caption = new jsgui.Control({ context: this.context, tagName: 'div' });
      caption.add_class('color-selector__preview-caption');

      const hexLabel = new jsgui.Control({ context: this.context, tagName: 'span' });
      hexLabel.add_class('color-selector__preview-hex');
      hexLabel.dom.attributes['data-role'] = 'preview-hex';
      hexLabel.add(this._selectedColor);

      caption.add(new jsgui.String_Control({ context: this.context, text: 'Active fill' }));
      caption.add(hexLabel);

      preview.add(chip);
      preview.add(caption);
      this.add(preview);

      this._controls.previewChip = chip;
      this._controls.previewHex = hexLabel;
    }

    _renderPalettes() {
      const palettesWrap = new jsgui.Control({ context: this.context, tagName: 'div' });
      palettesWrap.add_class('color-selector__palettes');

      this._palettes.forEach((palette) => {
        const section = new jsgui.Control({ context: this.context, tagName: 'div' });
        section.add_class('color-selector__palette');

        const label = new jsgui.Control({ context: this.context, tagName: 'div' });
        label.add_class('color-selector__palette-label');
        label.add(`${palette.emoji || ''} ${palette.name}`.trim());

        const grid = new jsgui.Control({ context: this.context, tagName: 'div' });
        grid.add_class('color-selector__swatch-grid');

        palette.colors.forEach((swatch) => {
          const btn = this._createSwatch(swatch.value, swatch.label);
          grid.add(btn);
        });

        section.add(label);
        section.add(grid);
        palettesWrap.add(section);
      });

      this.add(palettesWrap);
    }

    _renderVariants() {
      const variantSection = new jsgui.Control({ context: this.context, tagName: 'div' });
      variantSection.add_class('color-selector__variants');

      const label = new jsgui.Control({ context: this.context, tagName: 'div' });
      label.add_class('color-selector__palette-label');
      label.add('Tonal variants');

      const grid = new jsgui.Control({ context: this.context, tagName: 'div' });
      grid.add_class('color-selector__swatch-grid');
      grid.dom.attributes['data-role'] = 'variant-grid';

      this._variantSteps.forEach((step) => {
        const variantColor = this._adjustLightness(this._selectedColor, step);
        const btn = this._createSwatch(
          variantColor,
          step === 0 ? 'Base' : step > 0 ? `+${step}` : `${step}`
        );
        btn.dom.attributes['data-variant-step'] = step;
        btn.dom.attributes['data-role'] = 'variant-swatch';
        grid.add(btn);
      });

      variantSection.add(label);
      variantSection.add(grid);
      this.add(variantSection);

      this._controls.variantGrid = grid;
    }

    _renderCustomInputs() {
      const custom = new jsgui.Control({ context: this.context, tagName: 'div' });
      custom.add_class('color-selector__custom');

      const colorPicker = new jsgui.Control({ context: this.context, tagName: 'input' });
      colorPicker.dom.attributes.type = 'color';
      colorPicker.dom.attributes.value = this._selectedColor;
      colorPicker.dom.attributes['data-role'] = 'color-input';

      const hexInput = new jsgui.Control({ context: this.context, tagName: 'input' });
      hexInput.add_class('color-selector__hex-input');
      hexInput.dom.attributes.type = 'text';
      hexInput.dom.attributes.value = this._selectedColor;
      hexInput.dom.attributes.maxLength = 7;
      hexInput.dom.attributes['data-role'] = 'hex-input';

      const randomize = new jsgui.Control({ context: this.context, tagName: 'button' });
      randomize.add_class('color-selector__randomize');
      randomize.dom.attributes['data-role'] = 'randomize-button';
      randomize.add('Shuffle palette');

      custom.add(colorPicker);
      custom.add(hexInput);
      custom.add(randomize);
      this.add(custom);

      this._controls.colorInput = colorPicker;
      this._controls.hexInput = hexInput;
      this._controls.randomizeButton = randomize;
    }

    _createSwatch(color, label) {
      const normalized = this._normalizeColor(color);
      const btn = new jsgui.Control({ context: this.context, tagName: 'button' });
      btn.add_class('color-selector__swatch');
      btn.dom.attributes['data-color'] = normalized;
      btn.dom.attributes['data-role'] = 'palette-swatch';

      const chip = new jsgui.Control({ context: this.context, tagName: 'span' });
      chip.add_class('color-selector__swatch-chip');
      chip.dom.attributes.style = `background: ${normalized};`;

      const caption = new jsgui.Control({ context: this.context, tagName: 'span' });
      caption.add_class('color-selector__swatch-label');
      caption.add(label || normalized);

      btn.add(chip);
      btn.add(caption);
      return btn;
    }

    activate() {
      if (this.__active) return;
      super.activate();
      this.__active = true;

      this._rootEl = this.dom.el || this.dom;
      if (!this._rootEl) return;

      this._collectInteractives();
      this._bindEvents();
      this._syncUI();
    }

    _collectInteractives() {
      const queryAll = (selector) => Array.from(this._rootEl.querySelectorAll(selector));
      this._els = {
        previewChip: this._rootEl.querySelector('[data-role="preview-chip"]'),
        previewHex: this._rootEl.querySelector('[data-role="preview-hex"]'),
        colorInput: this._rootEl.querySelector('[data-role="color-input"]'),
        hexInput: this._rootEl.querySelector('[data-role="hex-input"]'),
        randomize: this._rootEl.querySelector('[data-role="randomize-button"]'),
        paletteSwatches: queryAll('[data-role="palette-swatch"]'),
        variantSwatches: queryAll('[data-role="variant-swatch"]'),
        variantGrid: this._rootEl.querySelector('[data-role="variant-grid"]')
      };
    }

    _bindEvents() {
      this._els.paletteSwatches?.forEach((el) => {
        el.addEventListener('click', () => {
          const color = el.getAttribute('data-color');
          this._setColor(color, { source: 'palette' });
        });
      });

      this._els.variantSwatches?.forEach((el) => {
        el.addEventListener('click', () => {
          const color = el.getAttribute('data-color');
          this._setColor(color, { source: 'variant' });
        });
      });

      if (this._els.colorInput) {
        this._els.colorInput.addEventListener('input', (evt) => {
          this._setColor(evt.target.value, { source: 'picker' });
        });
      }

      if (this._els.hexInput) {
        this._els.hexInput.addEventListener('change', (evt) => {
          this._setColor(evt.target.value, { source: 'hex' });
        });
        this._els.hexInput.addEventListener('keydown', (evt) => {
          if (evt.key === 'Enter') {
            this._setColor(evt.target.value, { source: 'hex' });
          }
        });
      }

      if (this._els.randomize) {
        this._els.randomize.addEventListener('click', () => {
          const palette = this._palettes[Math.floor(Math.random() * this._palettes.length)];
          if (!palette || !palette.colors || !palette.colors.length) return;
          const color = palette.colors[Math.floor(Math.random() * palette.colors.length)].value;
          this._setColor(color, { source: 'randomize' });
        });
      }
    }

    _syncUI() {
      this._updatePreview();
      this._highlightActiveSwatches();
      this._updateVariantSwatches();
      this._syncInputs();
    }

    _updatePreview() {
      const color = this._selectedColor;
      if (this._els?.previewChip) {
        this._els.previewChip.style.background = color;
      }
      if (this._els?.previewHex) {
        this._els.previewHex.textContent = color;
      }
    }

    _highlightActiveSwatches() {
      const matchColor = (value) => this._normalizeColor(value) === this._selectedColor;
      const toggle = (el) => {
        if (!el) return;
        el.classList.toggle('color-selector__swatch--active', matchColor(el.getAttribute('data-color')));
      };

      this._els.paletteSwatches?.forEach(toggle);
      this._els.variantSwatches?.forEach(toggle);
    }

    _updateVariantSwatches() {
      if (!this._els?.variantSwatches || !this._variantSteps) return;
      this._els.variantSwatches.forEach((el) => {
        const step = parseInt(el.getAttribute('data-variant-step'), 10);
        const variantColor = this._adjustLightness(this._selectedColor, step || 0);
        el.setAttribute('data-color', variantColor);
        const chip = el.querySelector('.color-selector__swatch-chip');
        if (chip) {
          chip.style.background = variantColor;
        }
      });
    }

    _syncInputs() {
      const color = this._selectedColor;
      if (this._els?.colorInput) {
        this._els.colorInput.value = color;
      }
      if (this._els?.hexInput) {
        this._els.hexInput.value = color;
      }
    }

    _setColor(value, meta = {}) {
      const normalized = this._normalizeColor(value);
      if (!normalized) return;

      this._selectedColor = normalized;
      this._updatePreview();
      this._highlightActiveSwatches();
      this._updateVariantSwatches();
      this._syncInputs();

      this.raise('color-change', {
        color: normalized,
        source: meta.source || 'unknown'
      });
    }

    getSelectedColor() {
      return this._selectedColor;
    }

    _normalizeColor(value) {
      if (!value) return null;
      let str = String(value).trim();
      if (!str) return null;
      if (!str.startsWith('#')) {
        str = `#${str}`;
      }
      const hex = str.toUpperCase();
      if (/^#([0-9A-F]{3}|[0-9A-F]{6})$/.test(hex)) {
        return hex.length === 4 ? this._expandShortHex(hex) : hex;
      }
      return null;
    }

    _expandShortHex(hex) {
      return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`.toUpperCase();
    }

    _adjustLightness(hexColor, delta) {
      const rgb = this._hexToRgb(hexColor);
      if (!rgb) return hexColor;
      const hsl = this._rgbToHsl(rgb);
      hsl.l = this._clamp(hsl.l + delta / 100, 0, 1);
      const adjusted = this._hslToRgb(hsl);
      return this._rgbToHex(adjusted);
    }

    _hexToRgb(hex) {
      const normalized = this._normalizeColor(hex);
      if (!normalized) return null;
      const num = parseInt(normalized.slice(1), 16);
      return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255
      };
    }

    _rgbToHex({ r, g, b }) {
      const toHex = (v) => v.toString(16).padStart(2, '0');
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
    }

    _rgbToHsl({ r, g, b }) {
      const nr = r / 255;
      const ng = g / 255;
      const nb = b / 255;
      const max = Math.max(nr, ng, nb);
      const min = Math.min(nr, ng, nb);
      let h;
      const l = (max + min) / 2;
      let s = 0;

      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case nr:
            h = (ng - nb) / d + (ng < nb ? 6 : 0);
            break;
          case ng:
            h = (nb - nr) / d + 2;
            break;
          default:
            h = (nr - ng) / d + 4;
        }
        h /= 6;
      } else {
        h = 0;
      }

      return { h, s, l };
    }

    _hslToRgb({ h, s, l }) {
      if (s === 0) {
        const val = Math.round(l * 255);
        return { r: val, g: val, b: val };
      }

      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;

      return {
        r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
        g: Math.round(hue2rgb(p, q, h) * 255),
        b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255)
      };
    }

    _clamp(val, min, max) {
      return Math.min(Math.max(val, min), max);
    }
  };
}

module.exports = {
  createColorSelectorControl,
  DEFAULT_COLOR_PALETTES,
  DEFAULT_VARIANT_STEPS
};
