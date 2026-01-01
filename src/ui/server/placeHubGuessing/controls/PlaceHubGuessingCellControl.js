'use strict';

const jsgui = require('jsgui3-html');

const { BaseAppControl } = require('../../shared');

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

class PlaceHubGuessingCellControl extends BaseAppControl {
  constructor(spec = {}) {
    super({
      ...spec,
      appName: 'Place Hub Guessing',
      appClass: 'place-hub-guessing',
      title: '🧭 Place Hub Guessing — Cell',
      subtitle: null
    });

    this.basePath = spec.basePath || '';
    this.model = spec.model || null;

    if (!spec.el) {
      this.compose();
    }
  }

  composeMainContent() {
    const ctx = this.context;
    const model = this.model;

    const root = makeEl(ctx, 'div', 'page', { 'data-testid': 'place-hub-guessing-cell' });

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

.place-hub-guessing { padding: 0; }

.page { padding: 18px 22px; max-width: 1100px; margin: 0 auto; }
.panel { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin: 12px 0; }
.kv { display: grid; grid-template-columns: 140px 1fr; gap: 6px 10px; font-size: 12px; }
.k { color: var(--muted); }
code, pre { font-family: var(--mono); }
a { color: var(--gold); text-decoration: none; }
a:hover { text-decoration: underline; }
.actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end; }
.ff { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); }
.ff input, .ff select { background: #120e0b; border: 1px solid rgba(245, 230, 211, 0.22); border-radius: 6px; padding: 6px 8px; color: var(--text); font-size: 12px; min-width: 220px; }
.btn { background: #120e0b; border: 1px solid rgba(245, 230, 211, 0.22); border-radius: 6px; padding: 7px 10px; color: var(--text); font-size: 12px; cursor: pointer; }
.btn-ok { border-color: rgba(74, 222, 128, 0.45); }
.btn-bad { border-color: rgba(248, 113, 113, 0.45); }
`
      )
    );

    root.add(styleEl);

    const backHref = model?.backHref || `${this.basePath || '.'}/`;
    const sub = makeEl(ctx, 'p', 'subtitle');
    const backLink = makeEl(ctx, 'a', null, { href: backHref });
    backLink.add(text(ctx, '← Back to matrix'));
    sub.add(backLink);
    root.add(sub);

    const placeLabel = model?.placeLabel || '';

    const panel = makeEl(ctx, 'div', 'panel');
    const kv = makeEl(ctx, 'div', 'kv');

    const kPlace = makeEl(ctx, 'div', 'k');
    kPlace.add(text(ctx, 'Place'));
    kv.add(kPlace);
    const vPlace = makeEl(ctx, 'div');
    vPlace.add(text(ctx, placeLabel));
    kv.add(vPlace);

    const kHost = makeEl(ctx, 'div', 'k');
    kHost.add(text(ctx, 'Host'));
    kv.add(kHost);
    const vHost = makeEl(ctx, 'div');
    vHost.add(text(ctx, model?.host || ''));
    kv.add(vHost);

    const kPageKind = makeEl(ctx, 'div', 'k');
    kPageKind.add(text(ctx, 'Page kind'));
    kv.add(kPageKind);
    const vPageKind = makeEl(ctx, 'div');
    vPageKind.add(text(ctx, model?.pageKind || ''));
    kv.add(vPageKind);

    const kState = makeEl(ctx, 'div', 'k');
    kState.add(text(ctx, 'State'));
    kv.add(kState);
    const vState = makeEl(ctx, 'div');
    vState.add(text(ctx, model?.cellState || ''));
    kv.add(vState);

    const kUrl = makeEl(ctx, 'div', 'k');
    kUrl.add(text(ctx, 'URL'));
    kv.add(kUrl);
    const vUrl = makeEl(ctx, 'div');
    vUrl.add(text(ctx, model?.currentUrl || '(none)'));
    kv.add(vUrl);

    const kVerified = makeEl(ctx, 'div', 'k');
    kVerified.add(text(ctx, 'Verified'));
    kv.add(kVerified);
    const vVerified = makeEl(ctx, 'div');
    vVerified.add(text(ctx, model?.verifiedLabel || ''));
    kv.add(vVerified);

    panel.add(kv);
    root.add(panel);

    const actionsPanel = makeEl(ctx, 'div', 'panel');
    const h2 = makeEl(ctx, 'h2', null, { style: 'margin:0 0 8px 0; font-size: 14px; color: var(--gold);' });
    h2.add(text(ctx, 'Mark verified'));
    actionsPanel.add(h2);

    const form = makeEl(ctx, 'form', 'actions', { method: 'POST', action: `${this.basePath}/cell/verify` });

    for (const [name, value] of Object.entries(model?.hidden || {})) {
      const input = makeEl(ctx, 'input', null, { type: 'hidden', name, value: String(value ?? '') });
      form.add(input);
    }

    const outcomeField = makeEl(ctx, 'label', 'ff');
    outcomeField.add(text(ctx, 'Outcome'));
    const select = makeEl(ctx, 'select', null, { name: 'outcome' });
    const optThere = makeEl(ctx, 'option', null, { value: 'present' });
    optThere.add(text(ctx, 'there'));
    const optNotThere = makeEl(ctx, 'option', null, { value: 'absent' });
    optNotThere.add(text(ctx, 'not there'));
    select.add(optThere);
    select.add(optNotThere);
    outcomeField.add(select);
    form.add(outcomeField);

    const urlField = makeEl(ctx, 'label', 'ff');
    urlField.add(text(ctx, 'Checked URL'));
    urlField.add(makeEl(ctx, 'input', null, { name: 'url', value: model?.currentUrl || '', placeholder: 'https://example.com/...' }));
    form.add(urlField);

    const noteField = makeEl(ctx, 'label', 'ff');
    noteField.add(text(ctx, 'Note (optional)'));
    noteField.add(makeEl(ctx, 'input', null, { name: 'note', value: '', placeholder: 'e.g. 404, redirects, paywall' }));
    form.add(noteField);

    const btn = makeEl(ctx, 'button', 'btn btn-ok', { type: 'submit' });
    btn.add(text(ctx, 'Save verification'));
    form.add(btn);

    actionsPanel.add(form);
    root.add(actionsPanel);

    const rawPanel = makeEl(ctx, 'div', 'panel');
    const rawH2 = makeEl(ctx, 'h2', null, { style: 'margin:0 0 8px 0; font-size: 14px; color: var(--gold);' });
    rawH2.add(text(ctx, 'Raw mapping'));
    rawPanel.add(rawH2);

    if (model?.mappingJson) {
      const pre = makeEl(ctx, 'pre', null, { 'data-testid': 'cell-mapping' });
      pre.add(text(ctx, model.mappingJson));
      rawPanel.add(pre);
    } else {
      const empty = makeEl(ctx, 'div', null, { 'data-testid': 'cell-mapping-empty', style: 'color: var(--muted);' });
      empty.add(text(ctx, 'No row in place_page_mappings yet.'));
      rawPanel.add(empty);
    }

    root.add(rawPanel);

    this.mainContainer.add(root);
  }
}

module.exports = { PlaceHubGuessingCellControl };
