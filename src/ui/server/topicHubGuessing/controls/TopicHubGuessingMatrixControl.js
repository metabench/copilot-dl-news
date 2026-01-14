'use strict';

const jsgui = require('jsgui3-html');

const { BaseAppControl } = require('../../shared');
const { MatrixTableControl, VirtualMatrixControl } = require('../../../../shared/isomorphic/controls');
const { HubGuessingMatrixChromeControl } = require('../../hubGuessing/controls');

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

function clampInt(value, { min, max, fallback }) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

function computeAgeLabel(isoString) {
  if (!isoString) return '';
  const ts = new Date(isoString).getTime();
  if (!Number.isFinite(ts)) return '';
  const deltaMs = Date.now() - ts;
  if (!Number.isFinite(deltaMs) || deltaMs < 0) return '';
  const mins = Math.floor(deltaMs / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function buildCellLink({ basePath, topicSlug, host, lang, topicLimit, hostLimit, topicQ, hostQ, state }) {
  const params = new URLSearchParams();
  params.set('topicSlug', String(topicSlug));
  params.set('host', String(host));
  if (lang) params.set('lang', String(lang));
  params.set('topicLimit', String(topicLimit));
  params.set('hostLimit', String(hostLimit));
  if (topicQ) params.set('q', String(topicQ));
  if (hostQ) params.set('hostQ', String(hostQ));
  if (state) params.set('state', String(state));
  return `${basePath}/cell?${params.toString()}`;
}

class TopicHubGuessingMatrixControl extends BaseAppControl {
  constructor(spec = {}) {
    super({
      ...spec,
      appName: 'Topic Hub Guessing',
      appClass: 'topic-hub-guessing',
      title: '🏷️ Topic Hub Guessing — Coverage Matrix',
      subtitle: 'Matrix from place_hubs_with_urls. Click a cell for drilldown.'
    });

    this.basePath = spec.basePath || '';
    this.model = spec.model || null;

    this.matrixMode = spec.matrixMode || 'auto';
    this.matrixThreshold = Number.isFinite(spec.matrixThreshold) ? Math.max(1, Math.trunc(spec.matrixThreshold)) : 50000;

    if (!spec.el) {
      this.compose();
    }
  }

  _resolveMatrixMode({ rowCount, colCount }) {
    const mode = String(this.matrixMode || 'auto').toLowerCase();
    if (mode === 'table' || mode === 'virtual') return mode;
    const cells = Math.max(0, (Number(rowCount) || 0) * (Number(colCount) || 0));
    return cells > this.matrixThreshold ? 'virtual' : 'table';
  }

  composeMainContent() {
    const ctx = this.context;
    const model = this.model;

    const defaultRowCount = model?.topics?.length ?? 0;
    const defaultColCount = model?.hosts?.length ?? 0;
    const resolvedMatrixMode = this._resolveMatrixMode({ rowCount: defaultRowCount, colCount: defaultColCount });

    const root = makeEl(ctx, 'div', 'page', {
      'data-testid': 'topic-hub-guessing',
      'data-view': 'a',
      'data-matrix-mode': resolvedMatrixMode,
      'data-matrix-threshold': String(this.matrixThreshold)
    });

    const styleEl = makeEl(ctx, 'style');
    styleEl.add(
      text(
        ctx,
        `
.matrix-wrap {
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: rgba(0,0,0,0.25);
}

table.matrix {
  width: 100%;
  border-collapse: collapse;
  min-width: 900px;
}

.virtual-matrix {
  position: relative;
}

.vm-viewport {
  position: relative;
  overflow: auto;
  max-height: 70vh;
  background: rgba(0,0,0,0.10);
}

.vm-col-headers {
  background: #120e0b;
  border-bottom: 1px solid var(--border);
}

.vm-row-headers {
  background: #120e0b;
  border-right: 1px solid var(--border);
}

.vm-row-header {
  padding: 0 8px;
  display: flex;
  align-items: center;
  font-weight: 600;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text);
}

.vm-col-header-inner {
  position: relative;
  height: 120px;
  width: 44px;
}

.vm-col-label {
  position: absolute;
  left: 6px;
  bottom: 6px;
  transform-origin: left bottom;
  transform: rotate(-45deg);
  white-space: nowrap;
  font-size: 11px;
  color: var(--gold);
}

.vm-cell {
  border-bottom: 1px solid rgba(74,54,40,0.7);
  border-right: 1px solid rgba(74,54,40,0.4);
  padding: 0;
  text-align: center;
  font-family: var(--mono);
  font-size: 12px;
}

th.matrix-th {
  position: sticky;
  top: 0;
  background: #120e0b;
  color: var(--gold);
  font-weight: 600;
  font-size: 12px;
  padding: 8px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  white-space: nowrap;
}

th.matrix-th-corner { left: 0; z-index: 3; }

th.matrix-th-col {
  text-align: left;
  padding: 0;
  vertical-align: bottom;
  height: 120px;
  min-width: 44px;
  width: 44px;
  max-width: 44px;
}

.matrix-th-col-inner { position: relative; height: 120px; width: 44px; }

th.matrix-th-col--angle .matrix-th-col-label {
  position: absolute;
  left: 6px;
  bottom: 6px;
  transform-origin: left bottom;
  transform: rotate(calc(-1 * var(--matrix-angle, 45deg)));
  white-space: nowrap;
  font-size: 11px;
  color: var(--gold);
}

th.matrix-row {
  position: sticky;
  left: 0;
  background: #120e0b;
  color: var(--text);
  font-weight: 600;
  font-size: 12px;
  padding: 8px;
  border-right: 1px solid var(--border);
  white-space: nowrap;
  text-align: left;
}

td.matrix-td {
  border-bottom: 1px solid rgba(74,54,40,0.7);
  border-right: 1px solid rgba(74,54,40,0.4);
  padding: 0;
  text-align: center;
  font-family: var(--mono);
  font-size: 12px;
  width: 44px;
  height: 26px;
}

.cell { cursor: default; user-select: none; }

.cell--empty { background: rgba(255,255,255,0.02); }
.cell--present { background: rgba(74,222,128,0.18); color: var(--ok); }

.cell-link {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 100%;
  text-decoration: none;
  color: inherit;
}

.cell-count { font-size: 11px; opacity: 0.95; }
.cell-age { font-size: 10px; opacity: 0.75; }
`
      )
    );

    root.add(styleEl);

    const chrome = new HubGuessingMatrixChromeControl({
      context: ctx,
      rootTestId: 'topic-hub-guessing',
      basePath: this.basePath || '.',
      guessPayloadFields: ['lang', 'topicLimit', 'hostLimit', 'q', 'hostQ'],
      guessPayloadDefaults: { apply: true, enableTopicDiscovery: true },
      fields: [
        {
          label: 'lang',
          name: 'lang',
          value: model?.lang || 'und',
          attrs: { type: 'text' }
        },
        {
          label: 'topicLimit',
          name: 'topicLimit',
          value: model?.topicLimit ?? 120,
          attrs: { type: 'number', min: 1, max: 2000 }
        },
        {
          label: 'hostLimit',
          name: 'hostLimit',
          value: model?.hostLimit ?? 40,
          attrs: { type: 'number', min: 1, max: 400 }
        },
        {
          label: 'q',
          name: 'q',
          value: model?.topicQ || '',
          attrs: { placeholder: 'topic slug/label' }
        },
        {
          label: 'hostQ',
          name: 'hostQ',
          value: model?.hostQ || '',
          attrs: { placeholder: 'host filter' }
        },
        {
          kind: 'select',
          label: 'matrixMode',
          name: 'matrixMode',
          value: model?.matrixMode || this.matrixMode || 'auto',
          options: [
            { value: 'auto', label: 'auto' },
            { value: 'table', label: 'table' },
            { value: 'virtual', label: 'virtual' }
          ]
        },
        {
          label: 'matrixThreshold',
          name: 'matrixThreshold',
          value: model?.matrixThreshold ?? this.matrixThreshold,
          attrs: { type: 'number', min: 1, max: 10000000 }
        }
      ],
      stats: [
        { label: 'Topics', value: model?.topics?.length ?? 0 },
        { label: 'Hosts', value: model?.hosts?.length ?? 0 },
        { label: 'Mappings', value: model?.stats?.mappingCount ?? 0, valueClass: 'stat-value--ok' }
      ],
      legend: [
        { label: 'Empty', className: 'cell--empty' },
        { label: 'Stored mapping', className: 'cell--present' }
      ]
    });

    root.add(chrome);

    const viewA = makeEl(ctx, 'div', null, { 'data-testid': 'matrix-view-a' });
    const viewB = makeEl(ctx, 'div', null, { 'data-testid': 'matrix-view-b' });

    if (resolvedMatrixMode === 'virtual') {
      viewA.add(this._virtualMatrixA({ model }));
      viewB.add(this._virtualMatrixB({ model }));
    } else {
      const matrixA = new MatrixTableControl({
        context: ctx,
        tableTestId: 'matrix-table',
        cornerLabel: 'Topic \\ Host',
        rows: model?.topics || [],
        cols: model?.hosts || [],
        getRowKey: (topic) => topic.slug,
        getRowLabel: (topic) => topic.label || topic.slug,
        getRowTitle: (topic) => topic.slug,
        getColKey: (host) => host,
        getColLabel: (host) => host,
        getColTitle: (host) => host,
        header: { mode: 'angle', angleDeg: 45, truncateAt: 18 },
        renderCellTd: ({ row: topic, col: host }) => {
          const mapping = model.mappingByKey?.get?.(`${topic.slug}|${host}`) || null;
          return this._cellTd({ model, topic, host, mapping });
        }
      });

      const matrixB = new MatrixTableControl({
        context: ctx,
        tableTestId: 'matrix-table-flipped',
        cornerLabel: 'Host \\ Topic',
        rows: (model?.hosts || []).map((host) => ({ host })),
        cols: model?.topics || [],
        getRowKey: (row) => row.host,
        getRowLabel: (row) => row.host,
        getRowTitle: (row) => row.host,
        getColKey: (topic) => topic.slug,
        getColLabel: (topic) => topic.label || topic.slug,
        getColTitle: (topic) => topic.slug,
        header: { mode: 'angle', angleDeg: 45, truncateAt: 18 },
        renderCellTd: ({ row: hostRow, col: topic }) => {
          const host = hostRow.host;
          const mapping = model.mappingByKey?.get?.(`${topic.slug}|${host}`) || null;
          return this._cellTd({ model, topic, host, mapping });
        }
      });

      viewA.add(matrixA);
      viewB.add(matrixB);
    }

    root.add(viewA);
    root.add(viewB);

    this.mainContainer.add(root);
  }

  _buildVirtualSpecialCells({ model, flipped }) {
    const specials = [];
    if (!model?.mappingByKey?.forEach) return specials;

    model.mappingByKey.forEach((mapping, key) => {
      if (!mapping) return;
      const [topicSlug, host] = String(key).split('|');
      if (!topicSlug || !host) return;

      const state = 'present';
      const className = 'cell--present';
      const ageLabel = mapping.last_seen_at ? computeAgeLabel(mapping.last_seen_at) : '';
      const glyph = '✓';
      const title = [`topic=${topicSlug}`, `host=${host}`, `count=${mapping.cnt}`, mapping.last_seen_at ? `last_seen_at=${mapping.last_seen_at}` : null]
        .filter(Boolean)
        .join('\n');

      specials.push({
        rowKey: flipped ? host : topicSlug,
        colKey: flipped ? topicSlug : host,
        state,
        className,
        glyph,
        ageLabel,
        title
      });
    });

    return specials;
  }

  _virtualMatrixA({ model }) {
    const ctx = this.context;
    const rows = model?.topics || [];
    const cols = model?.hosts || [];

    return new VirtualMatrixControl({
      context: ctx,
      testId: 'matrix-virtual',
      viewportTestId: 'thg-vm-viewport-a',
      cornerLabel: 'Topic \\ Host',
      rowKeys: rows.map((t) => t.slug),
      rowLabels: rows.map((t) => t.label || t.slug),
      rowTitles: rows.map((t) => t.slug),
      colKeys: cols,
      colLabels: cols.map((h) => String(h)),
      colTitles: cols.map((h) => String(h)),
      specialCells: this._buildVirtualSpecialCells({ model, flipped: false }),
      cellLink: {
        path: `${this.basePath || ''}/cell`,
        rowParam: 'topicSlug',
        colParam: 'host',
        params: {
          lang: model?.lang,
          topicLimit: model?.topicLimit,
          hostLimit: model?.hostLimit,
          q: model?.topicQ,
          hostQ: model?.hostQ
        }
      },
      layout: {
        cellW: 44,
        cellH: 26,
        rowHeaderW: 280,
        colHeaderH: 120,
        bufferRows: 4,
        bufferCols: 4
      }
    });
  }

  _virtualMatrixB({ model }) {
    const ctx = this.context;
    const rows = model?.hosts || [];
    const cols = model?.topics || [];

    return new VirtualMatrixControl({
      context: ctx,
      testId: 'matrix-virtual-flipped',
      viewportTestId: 'thg-vm-viewport-b',
      cornerLabel: 'Host \\ Topic',
      rowKeys: rows,
      rowLabels: rows.map((h) => String(h)),
      rowTitles: rows.map((h) => String(h)),
      colKeys: cols.map((t) => t.slug),
      colLabels: cols.map((t) => t.label || t.slug),
      colTitles: cols.map((t) => t.slug),
      specialCells: this._buildVirtualSpecialCells({ model, flipped: true }),
      cellLink: {
        path: `${this.basePath || ''}/cell`,
        rowParam: 'host',
        colParam: 'topicSlug',
        params: {
          lang: model?.lang,
          topicLimit: model?.topicLimit,
          hostLimit: model?.hostLimit,
          q: model?.topicQ,
          hostQ: model?.hostQ
        }
      },
      layout: {
        cellW: 44,
        cellH: 26,
        rowHeaderW: 220,
        colHeaderH: 120,
        bufferRows: 4,
        bufferCols: 4
      }
    });
  }

  _cellTd({ model, topic, host, mapping }) {
    const ctx = this.context;

    const cellHref = buildCellLink({
      basePath: this.basePath || '',
      topicSlug: topic.slug,
      host,
      lang: model.lang,
      topicLimit: model.topicLimit,
      hostLimit: model.hostLimit,
      topicQ: model.topicQ,
      hostQ: model.hostQ,
      state: model.state
    });

    if (!mapping) {
      const td = makeEl(ctx, 'td', 'matrix-td cell cell--empty', { 'data-state': 'empty' });
      const a = makeEl(ctx, 'a', 'cell-link', { href: cellHref, 'aria-label': 'Open cell' });
      td.add(a);
      return td;
    }

    const ageLabel = mapping.last_seen_at ? computeAgeLabel(mapping.last_seen_at) : '';

    const tipParts = [
      `topic=${topic.slug}`,
      `host=${host}`,
      `count=${mapping.cnt}`,
      mapping.last_seen_at ? `last_seen_at=${mapping.last_seen_at}` : null,
      ageLabel ? `age=${ageLabel}` : null
    ].filter(Boolean);

    const td = makeEl(ctx, 'td', 'matrix-td cell cell--present', {
      'data-state': 'present',
      title: tipParts.join('\n')
    });

    const a = makeEl(ctx, 'a', 'cell-link', { href: cellHref, 'aria-label': 'Open cell' });
    a.add(makeEl(ctx, 'span', null).add(text(ctx, '✓')));
    a.add(makeEl(ctx, 'span', 'cell-count').add(text(ctx, mapping.cnt)));
    if (ageLabel) {
      a.add(makeEl(ctx, 'span', 'cell-age').add(text(ctx, ageLabel)));
    }

    td.add(a);
    return td;
  }
}

module.exports = {
  TopicHubGuessingMatrixControl,
  clampInt
};
