'use strict';

const jsgui = require('jsgui3-html');

const { BaseAppControl } = require('../../shared');
const { MatrixTableControl, VirtualMatrixControl } = require('../../shared/isomorphic/controls');
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

function buildCellLink({ basePath, placeId, host, placeKind, pageKind, placeLimit, hostLimit, placeQ, hostQ, state }) {
  const params = new URLSearchParams();
  params.set('placeId', String(placeId));
  params.set('host', String(host));
  params.set('kind', String(placeKind));
  params.set('pageKind', String(pageKind));
  params.set('placeLimit', String(placeLimit));
  params.set('hostLimit', String(hostLimit));
  if (placeQ) params.set('q', String(placeQ));
  if (hostQ) params.set('hostQ', String(hostQ));
  if (state) params.set('state', String(state));
  return `${basePath}/cell?${params.toString()}`;
}

class PlaceHubGuessingMatrixControl extends BaseAppControl {
  constructor(spec = {}) {
    super({
      ...spec,
      appName: 'Place Hub Guessing',
      appClass: 'place-hub-guessing',
      title: '🧭 Place Hub Guessing — Coverage Matrix',
      subtitle: 'Matrix from place_page_mappings. Click a cell for drilldown + mark verified.'
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

    const defaultRowCount = model?.places?.length ?? 0;
    const defaultColCount = model?.hosts?.length ?? 0;
    const resolvedMatrixMode = this._resolveMatrixMode({ rowCount: defaultRowCount, colCount: defaultColCount });

    const root = makeEl(ctx, 'div', 'page', {
      'data-testid': 'place-hub-guessing',
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

th.matrix-th-corner {
  left: 0;
  z-index: 3;
}

th.matrix-th-col {
  text-align: left;
  padding: 0;
  vertical-align: bottom;
  height: 120px;
  min-width: 44px;
  width: 44px;
  max-width: 44px;
}

.matrix-th-col-inner {
  position: relative;
  height: 120px;
  width: 44px;
}

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

th.matrix-th-col--vertical .matrix-th-col-label {
  position: absolute;
  left: 50%;
  bottom: 6px;
  transform: translateX(-50%);
  writing-mode: vertical-rl;
  text-orientation: mixed;
  white-space: nowrap;
  font-size: 11px;
  color: var(--gold);
}

th.matrix-place {
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

.cell--none { background: rgba(255,255,255,0.02); }
.cell--pending { background: rgba(251,191,36,0.18); color: var(--warn); }
.cell--verified-present { background: rgba(74,222,128,0.18); color: var(--ok); }
.cell--verified-absent { background: rgba(248,113,113,0.18); color: var(--bad); }

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

.cell-age {
  font-size: 10px;
  color: rgba(245, 230, 211, 0.65);
}
`
      )
    );
    root.add(styleEl);

    const chrome = new HubGuessingMatrixChromeControl({
      context: ctx,
      rootTestId: 'place-hub-guessing',
      basePath: this.basePath || '.',
      initialView: 'a',
      includeFlipAxes: true,
      fields: [
        { kind: 'select', label: 'Kind', name: 'kind', value: model?.placeKind || 'country', options: ['country', 'region', 'city'] },
        {
          kind: 'select',
          label: 'Page kind',
          name: 'pageKind',
          value: model?.pageKind || 'country-hub',
          options: ['country-hub', 'region-hub', 'city-hub']
        },
        { kind: 'input', label: 'Place filter', name: 'q', value: model?.placeQ || '', attrs: { placeholder: 'e.g. california' } },
        { kind: 'input', label: 'Host filter', name: 'hostQ', value: model?.hostQ || '', attrs: { placeholder: 'e.g. news' } },
        { kind: 'input', label: 'Parent Place', name: 'parentPlace', value: model?.parentPlace || '', attrs: { placeholder: 'e.g. Canada' } },
        { kind: 'input', label: 'Active Pattern', name: 'activePattern', value: model?.activePattern || '', attrs: { placeholder: '/news/{slug}' } },
        {
          kind: 'input',
          label: 'Places',
          name: 'placeLimit',
          value: String(model?.placeLimit ?? 30),
          attrs: { type: 'number', min: '1', max: '200' }
        },
        {
          kind: 'input',
          label: 'Hosts',
          name: 'hostLimit',
          value: String(model?.hostLimit ?? 12),
          attrs: { type: 'number', min: '1', max: '50' }
        }
      ],
      stats: [
        { label: 'Places', value: model?.places?.length ?? 0 },
        { label: 'Hosts', value: model?.hosts?.length ?? 0 },
        { label: 'Verified', value: model?.stats?.verifiedCount ?? 0, valueClass: 'stat-value--ok' },
        { label: 'There', value: model?.stats?.verifiedPresentCount ?? 0, valueClass: 'stat-value--ok' },
        { label: 'Not there', value: model?.stats?.verifiedAbsentCount ?? 0, valueClass: 'stat-value--bad' },
        { label: 'Pending', value: model?.stats?.pendingCount ?? 0, valueClass: 'stat-value--warn' },
        { label: 'Unchecked', value: model?.stats?.uncheckedCount ?? 0, valueClass: 'stat-value--muted' }
      ],
      legend: [
        { label: 'Unchecked', className: 'cell--none' },
        { label: 'Checked (pending/missing)', className: 'cell--pending' },
        { label: 'Verified (there)', className: 'cell--verified-present' },
        { label: 'Verified (not there)', className: 'cell--verified-absent' }
      ]
    });
    root.add(chrome);

    // Views: A + B (flip axes)
    const viewA = makeEl(ctx, 'div', null, { 'data-testid': 'matrix-view-a' });
    const viewB = makeEl(ctx, 'div', null, { 'data-testid': 'matrix-view-b' });

    if (resolvedMatrixMode === 'virtual') {
      viewA.add(this._virtualMatrixA({ model }));
      viewB.add(this._virtualMatrixB({ model }));
    } else {
      const matrixA = new MatrixTableControl({
        context: ctx,
        tableTestId: 'matrix-table',
        cornerLabel: 'Place \\ Host',
        rows: model?.places || [],
        cols: model?.hosts || [],
        getRowKey: (place) => place.place_id,
        getRowLabel: (place) => place.place_name || place.country_code || String(place.place_id),
        getRowTitle: (place) => place.place_name || place.country_code || String(place.place_id),
        getColKey: (host) => host,
        getColLabel: (host) => host,
        getColTitle: (host) => host,
        header: {
          mode: 'angle',
          angleDeg: 45,
          truncateAt: 18
        },
        renderCellTd: ({ row: place, col: host }) => {
          const mapping = model.mappingByKey?.get?.(`${place.place_id}|${host}`) || null;
          return this._cellTd({ model, place, host, mapping });
        }
      });

      const matrixB = new MatrixTableControl({
        context: ctx,
        tableTestId: 'matrix-table-flipped',
        cornerLabel: 'Host \\ Place',
        rows: (model?.hosts || []).map((host) => ({ host })),
        cols: model?.places || [],
        getRowKey: (row) => row.host,
        getRowLabel: (row) => row.host,
        getRowTitle: (row) => row.host,
        getColKey: (place) => place.place_id,
        getColLabel: (place) => place.place_name || place.country_code || String(place.place_id),
        getColTitle: (place) => place.place_name || place.country_code || String(place.place_id),
        header: {
          mode: 'angle',
          angleDeg: 45,
          truncateAt: 18
        },
        renderCellTd: ({ row: hostRow, col: place }) => {
          const host = hostRow.host;
          const mapping = model.mappingByKey?.get?.(`${place.place_id}|${host}`) || null;
          return this._cellTd({ model, place, host, mapping });
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
      const [placeIdRaw, host] = String(key).split('|');
      const placeId = Number(placeIdRaw);

      const isVerified = mapping.status === 'verified' || !!mapping.verified_at;
      const outcome = this.props.getMappingOutcome(mapping);

      const state = isVerified ? (outcome === 'absent' ? 'verified-absent' : 'verified-present') : 'pending';
      const className = isVerified
        ? (outcome === 'absent' ? 'cell--verified-absent' : 'cell--verified-present')
        : 'cell--pending';
      const glyph = isVerified ? (outcome === 'absent' ? '×' : '✓') : '?';
      const ageLabel = mapping.verified_at ? this.props.computeAgeLabel(mapping.verified_at) : '';

      const tipParts = [
        `place_id=${placeId}`,
        `host=${host}`,
        `status=${mapping.status}`,
        outcome ? `outcome=${outcome}` : null,
        mapping.url ? `url=${mapping.url}` : null,
        mapping.last_seen_at ? `last_seen_at=${mapping.last_seen_at}` : null,
        mapping.verified_at ? `verified_at=${mapping.verified_at}` : null,
        mapping.verified_at ? `age=${ageLabel}` : null,
        mapping.hub_id ? `hub_id=${mapping.hub_id}` : null
      ].filter(Boolean);

      specials.push({
        rowKey: flipped ? host : placeId,
        colKey: flipped ? placeId : host,
        state,
        className,
        glyph,
        ageLabel,
        title: tipParts.join('\n')
      });
    });

    return specials;
  }

  _virtualMatrixA({ model }) {
    const ctx = this.context;
    const rows = model?.places || [];
    const cols = model?.hosts || [];

    return new VirtualMatrixControl({
      context: ctx,
      testId: 'matrix-virtual',
      viewportTestId: 'phg-vm-viewport-a',
      cornerLabel: 'Place \\ Host',
      rowKeys: rows.map((p) => p.place_id),
      rowLabels: rows.map((p) => p.place_name || p.country_code || String(p.place_id)),
      rowTitles: rows.map((p) => p.place_name || p.country_code || String(p.place_id)),
      colKeys: cols,
      colLabels: cols.map((h) => String(h)),
      colTitles: cols.map((h) => String(h)),
      specialCells: this._buildVirtualSpecialCells({ model, flipped: false }),
      cellLink: {
        path: `${this.basePath || ''}/cell`,
        rowParam: 'placeId',
        colParam: 'host',
        params: {
          kind: model?.placeKind,
          pageKind: model?.pageKind,
          placeLimit: model?.placeLimit,
          hostLimit: model?.hostLimit,
          q: model?.placeQ,
          hostQ: model?.hostQ,
          state: model?.state
        }
      },
      layout: {
        cellW: 44,
        cellH: 26,
        rowHeaderW: 260,
        colHeaderH: 120,
        bufferRows: 4,
        bufferCols: 4
      }
    });
  }

  _virtualMatrixB({ model }) {
    const ctx = this.context;
    const rows = model?.hosts || [];
    const cols = model?.places || [];

    return new VirtualMatrixControl({
      context: ctx,
      testId: 'matrix-virtual-flipped',
      viewportTestId: 'phg-vm-viewport-b',
      cornerLabel: 'Host \\ Place',
      rowKeys: rows,
      rowLabels: rows.map((h) => String(h)),
      rowTitles: rows.map((h) => String(h)),
      colKeys: cols.map((p) => p.place_id),
      colLabels: cols.map((p) => p.place_name || p.country_code || String(p.place_id)),
      colTitles: cols.map((p) => p.place_name || p.country_code || String(p.place_id)),
      specialCells: this._buildVirtualSpecialCells({ model, flipped: true }),
      cellLink: {
        path: `${this.basePath || ''}/cell`,
        rowParam: 'host',
        colParam: 'placeId',
        params: {
          kind: model?.placeKind,
          pageKind: model?.pageKind,
          placeLimit: model?.placeLimit,
          hostLimit: model?.hostLimit,
          q: model?.placeQ,
          hostQ: model?.hostQ,
          state: model?.state
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

  _cellTd({ model, place, host, mapping }) {
    const ctx = this.context;

    const cellHref = buildCellLink({
      basePath: this.basePath || '',
      placeId: place.place_id,
      host,
      placeKind: model.placeKind,
      pageKind: model.pageKind,
      placeLimit: model.placeLimit,
      hostLimit: model.hostLimit,
      placeQ: model.placeQ,
      hostQ: model.hostQ,
      state: model.state
    });

    if (!mapping) {
      const td = makeEl(ctx, 'td', 'matrix-td cell cell--none', { 'data-state': 'unchecked' });
      const a = makeEl(ctx, 'a', 'cell-link', { href: cellHref, 'aria-label': 'Open cell' });
      td.add(a);
      return td;
    }

    const isVerified = mapping.status === 'verified' || !!mapping.verified_at;
    const outcome = this.props.getMappingOutcome(mapping);

    const state = isVerified ? (outcome === 'absent' ? 'verified-absent' : 'verified-present') : 'pending';
    const cellClass = isVerified
      ? (outcome === 'absent' ? 'cell--verified-absent' : 'cell--verified-present')
      : 'cell--pending';

    const tipParts = [
      `place_id=${place.place_id}`,
      `host=${host}`,
      `status=${mapping.status}`,
      outcome ? `outcome=${outcome}` : null,
      mapping.url ? `url=${mapping.url}` : null,
      mapping.last_seen_at ? `last_seen_at=${mapping.last_seen_at}` : null,
      mapping.verified_at ? `verified_at=${mapping.verified_at}` : null,
      mapping.verified_at ? `age=${this.props.computeAgeLabel(mapping.verified_at)}` : null,
      mapping.hub_id ? `hub_id=${mapping.hub_id}` : null
    ].filter(Boolean);

    const td = makeEl(ctx, 'td', `matrix-td cell ${cellClass}`, { 'data-state': state, title: tipParts.join('\n') });

    const a = makeEl(ctx, 'a', 'cell-link', { href: cellHref, 'aria-label': 'Open cell' });

    const glyph = isVerified ? (outcome === 'absent' ? '×' : '✓') : '?';
    a.add(text(ctx, glyph));

    const age = mapping.verified_at ? this.props.computeAgeLabel(mapping.verified_at) : '';
    if (age) {
      const sub = makeEl(ctx, 'span', 'cell-age');
      sub.add(text(ctx, age));
      a.add(sub);
    }

    td.add(a);
    return td;
  }
}

module.exports = { PlaceHubGuessingMatrixControl };
