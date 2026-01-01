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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderLangOptions({ languages, selected }) {
  const seen = new Set();
  const opts = [];

  for (const entry of languages || []) {
    const lang = entry?.lang;
    if (!lang || seen.has(lang)) continue;
    seen.add(lang);
    const isSel = String(lang) === String(selected);
    opts.push(`<option value="${escapeHtml(lang)}"${isSel ? ' selected' : ''}>${escapeHtml(lang)} (${entry.cnt})</option>`);
  }

  if (!seen.has('und')) {
    opts.unshift(`<option value="und"${String(selected) === 'und' ? ' selected' : ''}>und</option>`);
  }

  if (!seen.has('en')) {
    opts.unshift(`<option value="en"${String(selected) === 'en' ? ' selected' : ''}>en</option>`);
  }

  return opts.join('');
}

class TopicListsControl extends BaseAppControl {
  constructor(spec = {}) {
    super({
      ...spec,
      appName: 'Topic Lists',
      appClass: 'topic-lists',
      title: '🏷️ Topic Lists (Non-Geo)',
      subtitle: 'Edit non-geo topic slugs + multilingual labels (stored in non_geo_topic_slugs).'
    });

    this.basePath = spec.basePath || '';
    this.model = spec.model || {};

    if (!spec.el) {
      this.compose();
    }
  }

  composeMainContent() {
    const ctx = this.context;
    const model = this.model || {};

    const root = makeEl(ctx, 'div', 'page', {
      'data-testid': 'topic-lists'
    });

    // Reuse the same CSS variables as the hub guessing chrome.
    const styleEl = makeEl(ctx, 'style');
    styleEl.add(
      text(
        ctx,
        `
:root {
  --bg: #0f0b08;
  --panel: #17110d;
  --border: #4a3628;
  --text: #f5e6d3;
  --muted: #b8a090;
  --gold: #d4a574;
  --ok: #4ade80;
  --warn: #fbbf24;
  --bad: #f87171;
  --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.page {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  padding: 20px;
}

.panel {
  background: rgba(255,255,255,0.03);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
  margin-bottom: 14px;
}

.h1 { margin: 0 0 4px 0; font-size: 20px; color: var(--gold); }
.sub { margin: 0 0 12px 0; color: var(--muted); font-size: 13px; }

.form-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
.label { font-size: 12px; color: var(--muted); margin-bottom: 4px; }

.input, select, textarea {
  background: rgba(0,0,0,0.25);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 8px;
  padding: 8px;
}

textarea { min-height: 56px; }

.btn {
  background: rgba(212,165,116,0.15);
  border: 1px solid rgba(212,165,116,0.55);
  color: var(--gold);
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
}

.btn:hover { background: rgba(212,165,116,0.25); }

.table-wrap { overflow: auto; }

table {
  width: 100%;
  border-collapse: collapse;
  min-width: 900px;
}

th, td {
  border-bottom: 1px solid rgba(74,54,40,0.7);
  padding: 8px;
  text-align: left;
  vertical-align: top;
}

th { color: var(--gold); font-size: 12px; background: rgba(0,0,0,0.15); position: sticky; top: 0; }

.code { font-family: var(--mono); font-size: 12px; }
.small { font-size: 12px; color: var(--muted); }

.actions { display: flex; gap: 8px; }

`
      )
    );

    root.add(styleEl);

    const header = makeEl(ctx, 'div', 'panel');
    header.add(makeEl(ctx, 'div', 'h1').add(text(ctx, '🏷️ Topic Lists (Non-Geo)')));
    header.add(makeEl(ctx, 'div', 'sub').add(text(ctx, 'Backed by non_geo_topic_slugs; use lang switching to edit labels per language.')));
    root.add(header);

    const lang = String(model.lang || 'und');
    const q = String(model.q || '');

    const filters = makeEl(ctx, 'div', 'panel', { 'data-testid': 'topic-lists-filters' });
    filters.add(
      text(
        ctx,
        `
<form method="GET" action="${escapeHtml(this.basePath || '.')}/">
  <div class="form-row">
    <div>
      <div class="label">Language</div>
      <select name="lang">${renderLangOptions({ languages: model.languages, selected: lang })}</select>
    </div>
    <div style="flex:1; min-width: 220px;">
      <div class="label">Search</div>
      <input class="input" type="text" name="q" value="${escapeHtml(q)}" placeholder="slug or label" style="width:100%;" />
    </div>
    <div>
      <button class="btn" type="submit">🔍 Filter</button>
    </div>
  </div>
</form>
`
      )
    );
    root.add(filters);

    const addPanel = makeEl(ctx, 'div', 'panel', { 'data-testid': 'topic-lists-add' });
    addPanel.add(
      text(
        ctx,
        `
<form method="POST" action="${escapeHtml(this.basePath || '.')}/upsert">
  <input type="hidden" name="returnLang" value="${escapeHtml(lang)}" />
  <input type="hidden" name="returnQ" value="${escapeHtml(q)}" />
  <div class="form-row">
    <div style="min-width: 180px;">
      <div class="label">Slug</div>
      <input class="input code" type="text" name="slug" placeholder="e.g. politics" required />
    </div>
    <div style="min-width: 100px;">
      <div class="label">Lang</div>
      <input class="input code" type="text" name="lang" value="${escapeHtml(lang)}" />
    </div>
    <div style="flex:1; min-width: 220px;">
      <div class="label">Label</div>
      <input class="input" type="text" name="label" placeholder="Human label" style="width:100%;" />
    </div>
    <div style="min-width: 200px;">
      <div class="label">Source</div>
      <input class="input" type="text" name="source" placeholder="manual" />
    </div>
    <div style="flex: 1; min-width: 240px;">
      <div class="label">Notes</div>
      <input class="input" type="text" name="notes" placeholder="optional" style="width:100%;" />
    </div>
    <div>
      <button class="btn" type="submit">➕ Save</button>
    </div>
  </div>
</form>
`
      )
    );
    root.add(addPanel);

    const rows = Array.isArray(model.rows) ? model.rows : [];

    const tablePanel = makeEl(ctx, 'div', 'panel', { 'data-testid': 'topic-lists-table' });
    tablePanel.add(makeEl(ctx, 'div', 'small').add(text(ctx, `${rows.length} row(s) for lang=${lang}`)));

    const tableWrap = makeEl(ctx, 'div', 'table-wrap');

    const tableHtml = [
      '<table>',
      '<thead>',
      '<tr>',
      '<th>Slug</th>',
      '<th>Lang</th>',
      '<th>Label</th>',
      '<th>Source</th>',
      '<th>Notes</th>',
      '<th>Updated</th>',
      '<th>Actions</th>',
      '</tr>',
      '</thead>',
      '<tbody>'
    ];

    for (const row of rows) {
      const slug = String(row.slug || '');
      const rowLang = String(row.lang || '');
      tableHtml.push('<tr>');
      tableHtml.push(`<td class="code">${escapeHtml(slug)}</td>`);
      tableHtml.push(`<td class="code">${escapeHtml(rowLang)}</td>`);
      tableHtml.push(`<td>${escapeHtml(row.label || '')}</td>`);
      tableHtml.push(`<td>${escapeHtml(row.source || '')}</td>`);
      tableHtml.push(`<td>${escapeHtml(row.notes || '')}</td>`);
      tableHtml.push(`<td class="small">${escapeHtml(row.updated_at || '')}</td>`);

      tableHtml.push('<td>');
      tableHtml.push('<div class="actions">');
      tableHtml.push(
        `<form method="POST" action="${escapeHtml(this.basePath || '.')}/delete" onsubmit="return confirm('Delete this translation row?')">` +
          `<input type="hidden" name="slug" value="${escapeHtml(slug)}" />` +
          `<input type="hidden" name="lang" value="${escapeHtml(rowLang)}" />` +
          `<input type="hidden" name="returnLang" value="${escapeHtml(lang)}" />` +
          `<input type="hidden" name="returnQ" value="${escapeHtml(q)}" />` +
          `<button class="btn" type="submit">🗑️ Delete</button>` +
        `</form>`
      );
      tableHtml.push('</div>');
      tableHtml.push('</td>');

      tableHtml.push('</tr>');
    }

    tableHtml.push('</tbody></table>');

    tableWrap.add(text(ctx, tableHtml.join('')));
    tablePanel.add(tableWrap);
    root.add(tablePanel);

    this.mainContainer.add(root);
  }
}

module.exports = {
  TopicListsControl
};
