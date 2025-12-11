/**
 * Lab Check: Platform Helpers (style proxy, comp model, registration, persisted fields)
 *
 * Run: node src/ui/lab/experiments/002-platform-helpers/check.js
 */

'use strict';

const jsgui = require('jsgui3-html');

const results = [];
const log = (label, pass, detail) => {
  const status = pass ? '✅' : '❌';
  results.push({ label, pass, detail });
  console.log(`${status} ${label}${detail ? ' — ' + detail : ''}`);
};

const context = new jsgui.Page_Context();

// Helpers to render HTML safely
const renderHtml = (ctrl) => {
  try {
    return ctrl.all_html_render();
  } catch (err) {
    log('renderHtml error', false, err.message);
    return '';
  }
};

// Control definitions used in composition tests
class TitleControl extends jsgui.Control {
  constructor(spec = {}) {
    super({ ...spec, context: spec.context || context, tagName: 'h1', __type_name: 'title_ctrl' });
    this.text = spec.text || 'untitled';
    if (!spec.el) this.compose();
  }
  compose() {
    this.add_text(this.text);
  }
}

class TextSpan extends jsgui.Control {
  constructor(spec = {}) {
    super({ ...spec, context: spec.context || context, tagName: 'span', __type_name: 'text_span' });
    this.text = spec.text || '';
    if (!spec.el) this.compose();
  }
  compose() {
    this.add_text(this.text);
  }
}

// ── TEST 1: Style proxy (px coercion) and background propagation ─────────────
(() => {
  const ctrl = new jsgui.Control({ context, tagName: 'div', size: [20, 30], background: { color: '#ff0000' } });
  // style proxy auto-adds px
  const { style } = ctrl.dom.attrs;
  const pxOk = style.width === '20px' && style.height === '30px';
  const bgOk = style['background-color'] === '#ff0000';
  const html = renderHtml(ctrl);
  const htmlHasId = html.includes('data-jsgui-id');
  log('Style proxy adds px + background', pxOk && bgOk, `style=${JSON.stringify(style)}`);
  log('Rendered control has data-jsgui-id', htmlHasId, html.slice(0, 80) + '...');
})();

// ── TEST 2: Compositional model (comp) wiring ────────────────────────────────
(() => {
  const compModel = [
    TitleControl,
    ['subtitle', TextSpan, { text: 'world' }],
  ];
  const host = new jsgui.Control({ context, tagName: 'section', comp: compModel, __type_name: 'comp_host' });
  const hasFields = host._ctrl_fields && host._ctrl_fields.subtitle instanceof TextSpan;
  const childCount = host.content && host.content._arr ? host.content._arr.length : 0;
  const html = renderHtml(host);
  const hasChildHtml = html.includes('world');
  log('Compositional model builds children', childCount === 2, `children=${childCount}`);
  log('Named ctrl stored in _ctrl_fields', hasFields, `fields=${Object.keys(host._ctrl_fields || {})}`);
  log('Compositional HTML contains child text', hasChildHtml, html.slice(0, 120) + '...');
})();

// ── TEST 3: Control registration helper ─────────────────────────────────────
(() => {
  const panel = new jsgui.Control({ context, tagName: 'div', __type_name: 'reg_panel' });
  panel.add(new TitleControl({ context, text: 'inside' }));
  panel.register_this_and_subcontrols();
  const ids = Object.keys(context.map_controls || {});
  const hasPanel = ids.some(id => context.map_controls[id].__type_name === 'reg_panel');
  log('register_this_and_subcontrols populates map_controls', hasPanel && ids.length >= 2, `ids=${ids.length}`);
})();

// ── TEST 4: Persisted fields hydration from data-jsgui-fields ───────────────
(() => {
  // Fake element with data-jsgui-fields
  const el = {
    getAttribute(name) {
      if (name === 'data-jsgui-fields') return '{"foo":"bar","count":3}';
      if (name === 'data-jsgui-type') return 'persisted_demo';
      if (name === 'data-jsgui-id') return 'persisted_1';
      return null;
    },
    hasAttribute(name) {
      return this.getAttribute(name) !== null;
    }
  };
  const persisted = new jsgui.Control({ context, el });
  const fields = persisted._persisted_fields || {};
  const ok = fields.foo === 'bar' && fields.count === 3;
  log('Persisted fields parsed from data-jsgui-fields', ok, `fields=${JSON.stringify(fields)}`);
})();

// ── Summary ─────────────────────────────────────────────────────────────────
(() => {
  const failed = results.filter(r => !r.pass);
  console.log('\nSummary:', `${results.length - failed.length}/${results.length} passed`);
  failed.forEach(f => console.log(' - FAIL', f.label, f.detail ? `(${f.detail})` : ''));
  if (failed.length) {
    process.exitCode = 1;
  }
})();
