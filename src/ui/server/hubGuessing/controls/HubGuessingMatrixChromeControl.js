'use strict';

const jsgui = require('jsgui3-html');

const StringControl = jsgui.String_Control;

function text(ctx, value) {
  return new StringControl({ context: ctx, text: String(value ?? '') });
}

function makeEl(ctx, tagName, className = null, attrs = null) {
  const el = new jsgui.Control({ context: ctx, tagName });
  if (className) el.add_class(className);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined) continue;
      el.dom.attributes[key] = String(value);
    }
  }
  return el;
}

function normalizeFieldOptions(options) {
  if (!Array.isArray(options)) return [];
  return options
    .map((opt) => {
      if (opt && typeof opt === 'object' && 'value' in opt) {
        return { value: String(opt.value), label: String(opt.label ?? opt.value) };
      }
      return { value: String(opt), label: String(opt) };
    })
    .filter((opt) => opt.value.length > 0);
}

class HubGuessingMatrixChromeControl extends jsgui.Control {
  constructor(spec = {}) {
    super(spec);

    this.rootTestId = spec.rootTestId;
    this.basePath = spec.basePath;
    this.fields = Array.isArray(spec.fields) ? spec.fields : [];
    this.stats = Array.isArray(spec.stats) ? spec.stats : [];
    this.legend = Array.isArray(spec.legend) ? spec.legend : [];
    this.includeFlipAxes = spec.includeFlipAxes !== false;
    this.initialView = spec.initialView === 'b' ? 'b' : 'a';

    if (!spec.el) {
      this.compose();
    }
  }

  compose() {
    const ctx = this.context;

    this.add(this._styleEl());
    this.add(this._viewToggleScript());
    this.add(this._filtersForm());
    this.add(this._statsRow());
    this.add(this._legendRow());
    this.add(this._actionsRow());
  }

  _styleEl() {
    const ctx = this.context;

    const styleEl = makeEl(ctx, 'style');
    styleEl.add(
      text(
        ctx,
        `
:root {
  --bg: #1a1410;
  --panel: #241a14;
  --border: #4a3628;
  --text: #f5e6d3;
  --muted: #b8a090;
  --gold: #d4a574;
  --ok: #4ade80;
  --warn: #fbbf24;
  --bad: #f87171;
  --mono: Consolas, Monaco, monospace;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.page {
  padding: 18px 22px;
  max-width: 1600px;
  margin: 0 auto;
}

.matrix-legend {
  display: flex;
  gap: 14px;
  align-items: center;
  padding: 10px 12px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin: 12px 0;
  flex-wrap: wrap;
  font-size: 13px;
}

.legend-item { display: inline-flex; gap: 8px; align-items: center; }

.legend-swatch {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  border: 1px solid rgba(245, 230, 211, 0.25);
  display: inline-block;
}

.matrix-stats {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin: 12px 0;
}

.stat {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
}

.stat-label { color: var(--muted); margin-right: 6px; }
.stat-value { font-family: var(--mono); }
.stat-value--ok { color: var(--ok); }
.stat-value--warn { color: var(--warn); }
.stat-value--bad { color: var(--bad); }
.stat-value--muted { color: var(--muted); }

.matrix-actions {
  display: flex;
  justify-content: flex-end;
  margin: 10px 0 0;
}

.page[data-view="a"] [data-testid="matrix-view-b"],
.page[data-view="b"] [data-testid="matrix-view-a"] {
  display: none;
}

.filters-form {
  margin: 10px 0 2px;
  padding: 10px 12px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: flex-end;
}

.ff {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--muted);
}

.ff input, .ff select {
  background: #120e0b;
  border: 1px solid rgba(245, 230, 211, 0.22);
  border-radius: 6px;
  padding: 6px 8px;
  color: var(--text);
  font-size: 12px;
  min-width: 140px;
}

.ff input[type="number"] { min-width: 110px; width: 110px; }

.btn {
  background: #120e0b;
  border: 1px solid rgba(245, 230, 211, 0.22);
  border-radius: 6px;
  padding: 7px 10px;
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
}

.btn:hover { border-color: rgba(212,165,116,0.55); }

.filters {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin: 12px 0 6px;
  color: var(--muted);
  font-size: 12px;
}

.filters code { font-family: var(--mono); color: var(--text); }
`
      )
    );

    return styleEl;
  }

  _viewToggleScript() {
    const ctx = this.context;

    const rootTestId = String(this.rootTestId || '').trim();
    const rootSelector = rootTestId ? `[data-testid="${rootTestId.replace(/"/g, '')}"]` : null;
    if (!rootSelector || rootTestId.length === 0) {
      return makeEl(ctx, 'script');
    }

    const scriptEl = makeEl(ctx, 'script');
    scriptEl.add(
      text(
        ctx,
        `
(() => {
  const init = () => {
    const root = document.querySelector(${JSON.stringify(rootSelector)});
    if (!root) return;

    const btn = root.querySelector('[data-testid="flip-axes"]');
    const getView = () => (root.getAttribute('data-view') === 'b' ? 'b' : 'a');
    const setView = (next) => root.setAttribute('data-view', next === 'b' ? 'b' : 'a');

    if (!root.getAttribute('data-view')) setView(${JSON.stringify(this.initialView)});
    setView(getView());

    if (!btn) return;
    btn.addEventListener('click', () => setView(getView() === 'a' ? 'b' : 'a'));
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
`
      )
    );

    return scriptEl;
  }

  _filtersForm() {
    const ctx = this.context;

    const action = this.basePath || '.';

    const form = makeEl(ctx, 'form', 'filters-form', {
      'data-testid': 'filters-form',
      method: 'GET',
      action
    });

    for (const field of this.fields) {
      if (!field || typeof field !== 'object') continue;
      const kind = String(field.kind || '').toLowerCase();
      const label = field.label;
      const name = field.name;
      const value = field.value;
      const attrs = field.attrs && typeof field.attrs === 'object' ? field.attrs : null;

      if (kind === 'select') {
        form.add(this._selectField(label, name, field.options, value, attrs));
      } else {
        form.add(this._inputField(label, name, value, attrs));
      }
    }

    const btn = makeEl(ctx, 'button', 'btn', { type: 'submit' });
    btn.add(text(ctx, 'Apply'));
    form.add(btn);

    return form;
  }

  _statsRow() {
    const ctx = this.context;
    const stats = makeEl(ctx, 'div', 'matrix-stats');

    for (const item of this.stats) {
      if (!item || typeof item !== 'object') continue;
      stats.add(this._stat(item.label, item.value, item.valueClass));
    }

    return stats;
  }

  _legendRow() {
    const ctx = this.context;
    const legend = makeEl(ctx, 'div', 'matrix-legend', { 'data-testid': 'matrix-legend' });

    for (const item of this.legend) {
      if (!item || typeof item !== 'object') continue;
      legend.add(this._legendItem(item.label, item.className));
    }

    return legend;
  }

  _actionsRow() {
    const ctx = this.context;
    const actions = makeEl(ctx, 'div', 'matrix-actions');

    if (this.includeFlipAxes) {
      const flipBtn = makeEl(ctx, 'button', 'btn', { type: 'button', 'data-testid': 'flip-axes' });
      flipBtn.add(text(ctx, 'Flip axes'));
      actions.add(flipBtn);
    }

    return actions;
  }

  _legendItem(label, swatchClass) {
    const ctx = this.context;
    const item = makeEl(ctx, 'span', 'legend-item');
    const swatch = makeEl(ctx, 'span', `legend-swatch ${swatchClass || ''}`);
    item.add(swatch);
    item.add(text(ctx, label));
    return item;
  }

  _stat(label, value, valueClass = null) {
    const ctx = this.context;
    const el = makeEl(ctx, 'div', 'stat');

    const labelEl = makeEl(ctx, 'span', 'stat-label');
    labelEl.add(text(ctx, label));

    const valueEl = makeEl(ctx, 'span', `stat-value${valueClass ? ` ${valueClass}` : ''}`);
    valueEl.add(text(ctx, value));

    el.add(labelEl);
    el.add(valueEl);
    return el;
  }

  _selectField(label, name, options, selectedValue, attrs) {
    const ctx = this.context;
    const wrapper = makeEl(ctx, 'label', 'ff');
    wrapper.add(text(ctx, label));

    const selectAttrs = { name };
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        if (value === undefined) continue;
        selectAttrs[key] = value;
      }
    }

    const select = makeEl(ctx, 'select', null, selectAttrs);
    const normalizedOptions = normalizeFieldOptions(options);
    for (const opt of normalizedOptions) {
      const optEl = makeEl(ctx, 'option', null, { value: opt.value });
      if (String(opt.value) === String(selectedValue)) {
        optEl.dom.attributes.selected = 'selected';
      }
      optEl.add(text(ctx, opt.label));
      select.add(optEl);
    }

    wrapper.add(select);
    return wrapper;
  }

  _inputField(label, name, value, attrs) {
    const ctx = this.context;
    const wrapper = makeEl(ctx, 'label', 'ff');
    wrapper.add(text(ctx, label));

    const inputAttrs = { name, value };
    if (attrs) {
      for (const [key, v] of Object.entries(attrs)) {
        if (v === undefined) continue;
        inputAttrs[key] = v;
      }
    }

    const input = makeEl(ctx, 'input', null, inputAttrs);
    wrapper.add(input);
    return wrapper;
  }
}

module.exports = { HubGuessingMatrixChromeControl };
