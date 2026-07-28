'use strict';

/**
 * ActivityHeadlinesControl — D4 slice 2b (cycle 149, owner-signalled TECH-DASH2B):
 * the activity/headline panel. One compact section pairing a live ACTIVITY line
 * (source · active jobs · rates, from the slice-1 normalized model) with the
 * LATEST HEADLINES list.
 *
 * CONTRACT (cycle 72, load-bearing): `normalizeHeadline.title` is RAW at the data
 * layer — a stored-XSS vector if rendered unescaped, because jsgui's String_Control
 * does NOT escape text. Every dynamic string in this control goes through the
 * core's escapeHtml before it touches markup. A regression test proves <script>
 * in a title renders inert.
 *
 * CAPABILITY HONESTY: the remote spool has no analysed headlines
 * (capabilities.headlines === false) — the control renders the model's own note
 * rather than an empty list, so the remote page says WHY there are no headlines.
 *
 * Prop-driven SSR like its siblings: spec.model = the adapter's getModel() output.
 * renderHtml(model) is exposed as a static so a browser entry can re-render the
 * panel without jsgui activation (the remote page's refresh model).
 */

const jsgui = require('jsgui3-html');
const { escapeHtml } = require('./crawlDashboardCore');

function activityLine(model) {
  const t = (model && model.throughput) || {};
  const f = t.formatted || {};
  const parts = [
    escapeHtml((model && model.source) || 'unknown source'),
    `${escapeHtml(String(t.activeCount == null ? 0 : t.activeCount))} active job(s)`,
    `${escapeHtml(f.downloaded || '0.00')}/s docs`,
    `${escapeHtml(f.network || '0.00')} MB/s`
  ];
  return parts.join(' · ');
}

function headlineRows(model) {
  const h = (model && model.headlines) || {};
  if (h.supported === false || !Array.isArray(h.items)) {
    const note = h.note || 'headlines unsupported on this source';
    return `<div class="cdh-note">${escapeHtml(note)}</div>`;
  }
  if (!h.items.length) return '<div class="cdh-note">no analysed headlines yet</div>';
  return h.items.slice(0, 15).map((item) => {
    const meta = [item.host, item.when || item.analyzedAt].filter(Boolean).map(escapeHtml).join(' · ');
    return `<div class="cdh-row"><span class="cdh-title">${escapeHtml(item.title || '(untitled)')}</span>${meta ? `<span class="cdh-meta">${meta}</span>` : ''}</div>`;
  }).join('');
}

/** Pure HTML for the panel body — used by SSR compose AND the browser re-render. */
function renderHtml(model) {
  return `<div class="cdh-activity">${activityLine(model)}</div><div class="cdh-headlines">${headlineRows(model)}</div>`;
}

class ActivityHeadlinesControl extends jsgui.Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: 'section', __type_name: 'crawl_dash_activity_headlines' });
    this.add_class('crawl-dash-activity-headlines');
    this.model = spec.model || null;
    if (!spec.el) this.compose();
  }

  compose() {
    // Composed as a single raw-HTML child; every dynamic string inside renderHtml
    // is escaped at the point it enters markup (the cycle-72 contract).
    this.add(new jsgui.String_Control({ context: this.context, text: renderHtml(this.model) }));
  }
}

ActivityHeadlinesControl.renderHtml = renderHtml;
ActivityHeadlinesControl.css = `
.crawl-dash-activity-headlines { font-family: 'Segoe UI', system-ui, sans-serif; }
.cdh-activity { font-size: 12px; color: #cfcabd; padding: 4px 0 8px; border-bottom: 1px solid #2e3440; margin-bottom: 6px; letter-spacing: 0.02em; }
.cdh-row { display: flex; flex-direction: column; padding: 4px 0; border-bottom: 1px dashed #1b1f26; }
.cdh-title { font-size: 12.5px; color: #e8e4d8; }
.cdh-meta { font-size: 10px; color: #8a8778; margin-top: 2px; }
.cdh-note { font-size: 11px; color: #8a8778; font-style: italic; padding: 6px 0; }
`;

module.exports = ActivityHeadlinesControl;
