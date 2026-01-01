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

class TopicHubGuessingCellControl extends BaseAppControl {
  constructor(spec = {}) {
    super({
      ...spec,
      appName: 'Topic Hub Guessing',
      appClass: 'topic-hub-guessing',
      title: '🏷️ Topic Hub Guessing — Cell',
      subtitle: 'Drilldown for a single (topic, host) cell.'
    });

    this.model = spec.model || {};

    if (!spec.el) {
      this.compose();
    }
  }

  composeMainContent() {
    const ctx = this.context;
    const model = this.model || {};

    const root = makeEl(ctx, 'div', 'page', { 'data-testid': 'topic-hub-guessing-cell' });

    const styleEl = makeEl(ctx, 'style');
    styleEl.add(
      text(
        ctx,
        `
.cell-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin: 10px 0;
}

.cell-meta { color: var(--muted); font-size: 12px; }

.back {
  color: var(--gold);
  text-decoration: none;
  border: 1px solid rgba(212,165,116,0.45);
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(212,165,116,0.1);
}

.back:hover { background: rgba(212,165,116,0.2); }

.list {
  margin: 12px 0;
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}

.row {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(74,54,40,0.6);
}

.row:last-child { border-bottom: 0; }

.url { font-family: var(--mono); font-size: 12px; color: var(--text); }

.small { font-size: 12px; color: var(--muted); }

`
      )
    );

    root.add(styleEl);

    const head = makeEl(ctx, 'div', 'cell-head');
    head.add(text(ctx, `<div><div class="cell-meta">Topic</div><div class="url">${escapeHtml(model.topicLabel || model.topicSlug || '')}</div></div>`));
    head.add(text(ctx, `<div><div class="cell-meta">Host</div><div class="url">${escapeHtml(model.host || '')}</div></div>`));
    head.add(text(ctx, `<div><a class="back" href="${escapeHtml(model.backHref || '#')}">← Back</a></div>`));
    root.add(head);

    root.add(text(ctx, `<div class="small">Rows: ${Number(model.rows?.length || 0)}</div>`));

    const list = makeEl(ctx, 'div', 'list');

    const rows = Array.isArray(model.rows) ? model.rows : [];
    for (const row of rows) {
      const url = row.url || '';
      const title = row.title || '';
      const ts = row.last_seen_at || row.first_seen_at || '';
      const meta = [
        row.topic_kind ? `topic_kind=${row.topic_kind}` : null,
        row.nav_links_count != null ? `nav=${row.nav_links_count}` : null,
        row.article_links_count != null ? `articles=${row.article_links_count}` : null,
        ts ? `seen=${ts}` : null
      ].filter(Boolean);

      list.add(
        text(
          ctx,
          `<div class="row">` +
            `<div class="url">${escapeHtml(url)}</div>` +
            (title ? `<div class="small">${escapeHtml(title)}</div>` : '') +
            (meta.length ? `<div class="small">${escapeHtml(meta.join(' • '))}</div>` : '') +
          `</div>`
        )
      );
    }

    root.add(list);

    this.mainContainer.add(root);
  }
}

module.exports = {
  TopicHubGuessingCellControl
};
