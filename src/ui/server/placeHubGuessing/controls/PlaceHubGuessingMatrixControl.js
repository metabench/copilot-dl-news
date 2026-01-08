'use strict';

const jsgui = require('jsgui3-html');

const { BaseAppControl } = require('../../shared');
const { MatrixTableControl, VirtualMatrixControl } = require('../../shared/isomorphic/controls');
const { HubGuessingMatrixChromeControl } = require('../../hubGuessing/controls');
const { createCrawlSpeedometerControl, CRAWL_SPEEDOMETER_STYLES } = require('../../../controls/CrawlSpeedometerControl');

const CrawlSpeedometerControl = createCrawlSpeedometerControl(jsgui);
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

function buildCellLink({
  basePath,
  placeId,
  host,
  placeKind,
  pageKind,
  placeLimit,
  hostLimit,
  placeQ,
  hostQ,
  stateFilter,
  continent,
  parentPlace,
  activePattern,
  matrixMode,
  matrixThreshold
}) {
  const params = new URLSearchParams();
  params.set('placeId', String(placeId));
  params.set('host', String(host));
  params.set('kind', String(placeKind));
  params.set('pageKind', String(pageKind));
  params.set('placeLimit', String(placeLimit));
  params.set('hostLimit', String(hostLimit));
  if (placeQ) params.set('q', String(placeQ));
  if (hostQ) params.set('hostQ', String(hostQ));
  if (stateFilter) params.set('stateFilter', String(stateFilter));
  if (continent) params.set('continent', String(continent));
  if (parentPlace) params.set('parentPlace', String(parentPlace));
  if (activePattern) params.set('activePattern', String(activePattern));
  if (matrixMode) params.set('matrixMode', String(matrixMode));
  if (Number.isFinite(matrixThreshold)) params.set('matrixThreshold', String(matrixThreshold));
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
    const stateFilter = model?.stateFilter || 'all';

    const root = makeEl(ctx, 'div', 'page', {
      'data-testid': 'place-hub-guessing',
      'data-view': 'a',
      'data-matrix-mode': resolvedMatrixMode,
      'data-matrix-threshold': String(this.matrixThreshold),
      'data-state-filter': stateFilter
    });

    const styleEl = makeEl(ctx, 'style');
    styleEl.add(
      text(
        ctx,
        `
.place-hub-guessing {
  --bg: #0d1117;
  --panel: #111827;
  --border: rgba(255,255,255,0.14);
  --text: #f8fafc;
  --muted: #cbd5e1;
  --gold: #f7c566;
  --ok: #22c55e;
  --bad: #ef4444;
  --warn: #f59e0b;
  --mono: "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  background: var(--bg);
  color: var(--text);
}

.matrix-wrap {
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
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
  background: #0f172a;
}

.vm-col-headers {
  background: #0f172a;
  border-bottom: 1px solid var(--border);
}

.vm-row-headers {
  background: #0f172a;
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
  background: #0f172a;
  color: var(--text);
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
  color: var(--text);
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
  color: var(--text);
}

th.matrix-place {
  position: sticky;
  left: 0;
  background: #0f172a;
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

.cell--none { background: rgba(255,255,255,0.04); color: var(--muted); }
.cell--guessed { background: rgba(245,158,11,0.24); color: #fbbf24; border-color: rgba(245,158,11,0.35); }
.cell--pending { background: rgba(156,163,175,0.24); color: #e5e7eb; }
.cell--verified-present { background: rgba(34,197,94,0.20); color: var(--ok); }
.cell--verified-absent { background: rgba(239,68,68,0.20); color: var(--bad); }

/* Deep hub indicator - hubs with significant archive depth */
.cell--deep-hub {
  background: rgba(34,197,94,0.32);
  box-shadow: inset 0 -2px 0 var(--ok);
}

.cell-depth {
  font-size: 9px;
  color: rgba(34,197,94,0.95);
  margin-left: 2px;
}

/* State filter highlighting - dim non-matching cells */
[data-state-filter="unchecked"] .cell:not([data-state="unchecked"]) { opacity: 0.25; }
[data-state-filter="guessed"] .cell:not([data-state="guessed"]) { opacity: 0.25; }
[data-state-filter="pending"] .cell:not([data-state="pending"]) { opacity: 0.25; }
[data-state-filter="verified"] .cell:not([data-state="verified-present"]):not([data-state="verified-absent"]) { opacity: 0.25; }
[data-state-filter="verified-present"] .cell:not([data-state="verified-present"]) { opacity: 0.25; }
[data-state-filter="verified-absent"] .cell:not([data-state="verified-absent"]) { opacity: 0.25; }
[data-state-filter="needs-check"] .cell:not([data-state="unchecked"]):not([data-state="guessed"]) { opacity: 0.25; }

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
  color: #cbd5e1;
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
      guessPayloadFields: ['hostQ', 'hostLimit', 'pageKind', 'activePattern', 'parentPlace'],
      guessPayloadDefaults: { apply: true },
      fields: [
        { kind: 'select', label: 'Kind', name: 'kind', value: model?.placeKind || 'country', options: ['country', 'region', 'city'] },
        {
          kind: 'select',
          label: 'Page kind',
          name: 'pageKind',
          value: model?.pageKind || 'country-hub',
          options: ['country-hub', 'region-hub', 'city-hub']
        },
        {
          kind: 'select',
          label: 'State',
          name: 'stateFilter',
          value: model?.stateFilter || 'all',
          options: [
            { value: 'all', label: 'All states' },
            { value: 'unchecked', label: 'Unchecked only' },
            { value: 'guessed', label: 'Guessed only' },
            { value: 'pending', label: 'Pending only' },
            { value: 'verified', label: 'Verified only' },
            { value: 'verified-present', label: 'Verified (exists)' },
            { value: 'verified-absent', label: 'Verified (not found)' },
            { value: 'needs-check', label: 'Needs check (unchecked + guessed)' }
          ]
        },
        { kind: 'input', label: 'Place filter', name: 'q', value: model?.placeQ || '', attrs: { placeholder: 'e.g. california' } },
        { kind: 'input', label: 'Host filter', name: 'hostQ', value: model?.hostQ || '', attrs: { placeholder: 'e.g. news' } },
        { kind: 'input', label: 'Parent Place', name: 'parentPlace', value: model?.parentPlace || '', attrs: { placeholder: 'e.g. Canada' } },
        { kind: 'input', label: 'Active Pattern', name: 'activePattern', value: model?.activePattern || '', attrs: { placeholder: '/news/{slug}' } },
        {
          kind: 'input',
          label: 'Places',
          name: 'placeLimit',
          value: String(model?.placeLimit ?? 200),
          attrs: { type: 'number', min: '1', max: '500' }
        },
        {
          kind: 'input',
          label: 'Hosts',
          name: 'hostLimit',
          value: String(model?.hostLimit ?? 30),
          attrs: { type: 'number', min: '1', max: '100' }
        }
      ],
      presets: [
        // Place type presets
        { label: '🌍 Countries', params: { kind: 'country', pageKind: 'country-hub', placeLimit: 300, stateFilter: 'all' } },
        { label: '🏙️ Major Cities', params: { kind: 'city', pageKind: 'city-hub', placeLimit: 100, stateFilter: 'all' } },
        { label: '📍 Regions', params: { kind: 'region', pageKind: 'region-hub', placeLimit: 100, stateFilter: 'all' } },
        // Continent presets (grouped countries by region)
        { label: '🇪🇺 Europe', params: { kind: 'country', pageKind: 'country-hub', continent: 'Europe', placeLimit: 60, stateFilter: 'all' } },
        { label: '🌍 Africa', params: { kind: 'country', pageKind: 'country-hub', continent: 'Africa', placeLimit: 60, stateFilter: 'all' } },
        { label: '🌏 Asia', params: { kind: 'country', pageKind: 'country-hub', continent: 'Asia', placeLimit: 55, stateFilter: 'all' } },
        { label: '🌎 Americas', params: { kind: 'country', pageKind: 'country-hub', continent: 'Americas', placeLimit: 60, stateFilter: 'all' } },
        { label: '🏝️ Oceania', params: { kind: 'country', pageKind: 'country-hub', continent: 'Oceania', placeLimit: 30, stateFilter: 'all' } },
        { label: '🧊 Antarctic', params: { kind: 'country', pageKind: 'country-hub', continent: 'Antarctic', placeLimit: 10, stateFilter: 'all' } },
        // State presets
        { label: '⚠️ Needs Check', params: { stateFilter: 'needs-check' } },
        { label: '✅ Verified', params: { stateFilter: 'verified' } },
        { label: '❓ Guessed', params: { stateFilter: 'guessed' } },
        { label: '❌ Not Found', params: { stateFilter: 'verified-absent' } }
      ],
      stats: [
        { label: 'Places', value: model?.places?.length ?? 0 },
        { label: 'Hosts', value: model?.hosts?.length ?? 0 },
        { label: 'Verified', value: model?.stats?.verifiedCount ?? 0, valueClass: 'stat-value--ok' },
        { label: 'There', value: model?.stats?.verifiedPresentCount ?? 0, valueClass: 'stat-value--ok' },
        { label: 'Not there', value: model?.stats?.verifiedAbsentCount ?? 0, valueClass: 'stat-value--bad' },
        { label: 'Guessed', value: model?.stats?.guessedCount ?? 0, valueClass: 'stat-value--guess' },
        { label: 'Pending', value: model?.stats?.pendingCount ?? 0, valueClass: 'stat-value--warn' },
        { label: 'Unchecked', value: model?.stats?.uncheckedCount ?? 0, valueClass: 'stat-value--muted' },
        { label: 'Deep Hubs', value: model?.stats?.deepHubCount ?? 0, valueClass: 'stat-value--ok', title: 'Hubs with 10+ pages of history' },
        { label: 'Probed', value: model?.stats?.depthCheckedCount ?? 0, valueClass: 'stat-value--muted', title: 'Hubs with depth probed' }
      ],
      legend: [
        { label: 'Unchecked', className: 'cell--none' },
        { label: 'Guessed (candidate hub)', className: 'cell--guessed' },
        { label: 'Pending (verification in progress)', className: 'cell--pending' },
        { label: 'Verified (exists)', className: 'cell--verified-present' },
        { label: 'Deep Hub (10+ pages)', className: 'cell--verified-present cell--deep-hub' },
        { label: 'Verified (not found)', className: 'cell--verified-absent' }
      ]
    });
    root.add(chrome);

    // Crawl progress speedometer panel (collapsible)
    root.add(this._composeSpeedometerPanel({ model }));
    root.add(this._speedometerScript());
    root.add(this._sseScript()); // SSE real-time cell updates

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
      const isCandidate = mapping.status === 'candidate';
      const outcome = this.props.getMappingOutcome(mapping);

      // 5-state logic: unchecked, guessed, pending, verified-present, verified-absent
      let state, className, glyph;
      if (isVerified) {
        if (outcome === 'absent') {
          state = 'verified-absent';
          className = 'cell--verified-absent';
          glyph = '×';
        } else {
          state = 'verified-present';
          className = 'cell--verified-present';
          glyph = '✓';
        }
      } else if (isCandidate) {
        state = 'guessed';
        className = 'cell--guessed';
        glyph = '?';
      } else {
        state = 'pending';
        className = 'cell--pending';
        glyph = '•';
      }
      const ageLabel = mapping.verified_at ? this.props.computeAgeLabel(mapping.verified_at) : '';

      const tipParts = [];
      if (mapping.url) tipParts.push(mapping.url);

      tipParts.push(
        `place_id=${placeId}`,
        `host=${host}`,
        `status=${mapping.status}`,
        outcome ? `outcome=${outcome}` : null,
        mapping.last_seen_at ? `last_seen_at=${mapping.last_seen_at}` : null,
        mapping.verified_at ? `verified_at=${mapping.verified_at}` : null,
        mapping.verified_at ? `age=${ageLabel}` : null,
        mapping.hub_id ? `hub_id=${mapping.hub_id}` : null,
        mapping.max_page_depth ? `depth=${mapping.max_page_depth}` : null,
        mapping.oldest_content_date ? `oldest=${String(mapping.oldest_content_date).slice(0,10)}` : null,
        mapping.last_depth_check_at ? `checked=${this.props.computeAgeLabel(mapping.last_depth_check_at)}` : null
      );

      // Add article metrics for verified-present cells
      if (state === 'verified-present' && mapping.evidence) {
        const evidence = typeof mapping.evidence === 'string' ? JSON.parse(mapping.evidence) : mapping.evidence;
        if (evidence.articleLinksCount || evidence.article_links_count) {
          tipParts.push(`articles=${evidence.articleLinksCount || evidence.article_links_count}`);
        }
        if (evidence.navLinksCount || evidence.nav_links_count) {
          tipParts.push(`nav_links=${evidence.navLinksCount || evidence.nav_links_count}`);
        }
      }

      // Add depth information for virtual cells
      const maxDepth = mapping.max_page_depth || mapping.maxPageDepth || 0;
      const oldestDate = mapping.oldest_content_date || mapping.oldestContentDate;

      if (maxDepth > 0) {
        tipParts.push(`depth=${maxDepth} pages`);
      }
      if (oldestDate) {
        tipParts.push(`oldest=${oldestDate.slice(0, 10)}`);
      }

      // Mark deep hubs
      const isDeepHub = state === 'verified-present' && maxDepth >= 10;

      specials.push({
        rowKey: flipped ? host : placeId,
        colKey: flipped ? placeId : host,
        state,
        className: isDeepHub ? `${className} cell--deep-hub` : className,
        glyph: isDeepHub ? `${glyph}${maxDepth > 999 ? (Math.round(maxDepth / 100) / 10) + 'k' : maxDepth}` : glyph,
        ageLabel: isDeepHub ? '' : ageLabel,
        title: tipParts.join('\n'),
        depth: maxDepth
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
          stateFilter: model?.stateFilter,
          continent: model?.continent,
          parentPlace: model?.parentPlace,
          activePattern: model?.activePattern,
          matrixMode: model?.matrixMode,
          matrixThreshold: model?.matrixThreshold
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
          stateFilter: model?.stateFilter,
          continent: model?.continent,
          parentPlace: model?.parentPlace,
          activePattern: model?.activePattern,
          matrixMode: model?.matrixMode,
          matrixThreshold: model?.matrixThreshold
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
      stateFilter: model.stateFilter,
      continent: model.continent,
      parentPlace: model.parentPlace,
      activePattern: model.activePattern,
      matrixMode: model.matrixMode,
      matrixThreshold: model.matrixThreshold
    });

    if (!mapping) {
      const td = makeEl(ctx, 'td', 'matrix-td cell cell--none', { 'data-state': 'unchecked' });
      const a = makeEl(ctx, 'a', 'cell-link', { href: cellHref, 'aria-label': 'Open cell' });
      td.add(a);
      return td;
    }

    const isVerified = mapping.status === 'verified' || !!mapping.verified_at;
    const isCandidate = mapping.status === 'candidate';
    const outcome = this.props.getMappingOutcome(mapping);

    // 5-state logic: unchecked, guessed, pending, verified-present, verified-absent
    let state, cellClass, glyph;
    if (isVerified) {
      if (outcome === 'absent') {
        state = 'verified-absent';
        cellClass = 'cell--verified-absent';
        glyph = '×';
      } else {
        state = 'verified-present';
        cellClass = 'cell--verified-present';
        glyph = '✓';
      }
    } else if (isCandidate) {
      state = 'guessed';
      cellClass = 'cell--guessed';
      glyph = '?';
    } else {
      state = 'pending';
      cellClass = 'cell--pending';
      glyph = '•';
    }

    // Build tooltip parts
    const tipParts = [];
    if (mapping.url) tipParts.push(mapping.url);

    tipParts.push(
      `place_id=${place.place_id}`,
      `host=${host}`,
      `status=${mapping.status}`,
      outcome ? `outcome=${outcome}` : null,
      mapping.last_seen_at ? `last_seen_at=${mapping.last_seen_at}` : null,
      mapping.verified_at ? `verified_at=${mapping.verified_at}` : null,
      mapping.verified_at ? `age=${this.props.computeAgeLabel(mapping.verified_at)}` : null,
      mapping.hub_id ? `hub_id=${mapping.hub_id}` : null,
      mapping.max_page_depth ? `depth=${mapping.max_page_depth}` : null,
      mapping.oldest_content_date ? `oldest=${String(mapping.oldest_content_date).slice(0,10)}` : null,
      mapping.last_depth_check_at ? `checked=${this.props.computeAgeLabel(mapping.last_depth_check_at)}` : null,
      mapping.depth_check_error ? `depth_error=${mapping.depth_check_error}` : null
    );

    // Filter out nulls/undefined
    const validParts = tipParts.filter(Boolean);

    // Add article metrics for verified-present cells
    if (state === 'verified-present' && mapping.evidence) {
      const evidence = typeof mapping.evidence === 'string' ? JSON.parse(mapping.evidence) : mapping.evidence;
      if (evidence.articleLinksCount || evidence.article_links_count) {
        validParts.push(`articles=${evidence.articleLinksCount || evidence.article_links_count}`);
      }
      if (evidence.navLinksCount || evidence.nav_links_count) {
        validParts.push(`nav_links=${evidence.navLinksCount || evidence.nav_links_count}`);
      }
    }

    // Add depth information
    const maxDepth = mapping.max_page_depth || mapping.maxPageDepth || 0;
    const oldestDate = mapping.oldest_content_date || mapping.oldestContentDate;
    const lastDepthCheck = mapping.last_depth_check_at || mapping.lastDepthCheckAt;
    const depthError = mapping.depth_check_error || mapping.depthCheckError;

    if (maxDepth > 0) {
      validParts.push(`depth=${maxDepth} pages`);
    }
    if (oldestDate) {
      validParts.push(`oldest=${oldestDate.slice(0, 10)}`);
    }
    if (lastDepthCheck) {
      validParts.push(`depth_checked=${this.props.computeAgeLabel(lastDepthCheck)} ago`);
    }
    if (depthError) {
      validParts.push(`depth_error=${depthError}`);
    }

    // Determine if this is a "deep" hub (significant archive)
    const isDeepHub = state === 'verified-present' && maxDepth >= 10;
    const deepHubClass = isDeepHub ? ' cell--deep-hub' : '';

    const td = makeEl(ctx, 'td', `matrix-td cell ${cellClass}${deepHubClass}`, { 'data-state': state, 'data-depth': maxDepth > 0 ? String(maxDepth) : null, title: validParts.join('\n') });

    const a = makeEl(ctx, 'a', 'cell-link', { href: cellHref, 'aria-label': 'Open cell' });
    a.add(text(ctx, glyph));

    // Show depth indicator for deep hubs
    if (isDeepHub) {
      const depthSpan = makeEl(ctx, 'span', 'cell-depth');
      depthSpan.add(text(ctx, maxDepth > 999 ? `${Math.round(maxDepth / 100) / 10}k` : String(maxDepth)));
      a.add(depthSpan);
    } else {
      const age = mapping.verified_at ? this.props.computeAgeLabel(mapping.verified_at) : '';
      if (age) {
        const sub = makeEl(ctx, 'span', 'cell-age');
        sub.add(text(ctx, age));
        a.add(sub);
      }
    }

    td.add(a);
    return td;
  }

  /**
   * Compose the crawl speedometer panel (collapsible)
   * Shows progress when a verification job is running
   */
  _composeSpeedometerPanel({ model }) {
    const ctx = this.context;
    
    // Container panel
    const panel = makeEl(ctx, 'div', 'speedometer-panel', {
      'data-testid': 'speedometer-panel',
      'data-job-id': '',  // Will be set by client when job starts
      'data-base-path': this.basePath || '.',
      'data-max-speed': '5'
    });
    
    // Add speedometer-specific CSS
    const panelStyle = makeEl(ctx, 'style');
    panelStyle.add(text(ctx, CRAWL_SPEEDOMETER_STYLES));
    panel.add(panelStyle);
    
    // Panel header (collapsible toggle)
    const header = makeEl(ctx, 'div', 'speedometer-panel-header');
    header.dom.attributes['data-collapsed'] = 'false';
    
    const toggleBtn = makeEl(ctx, 'button', 'speedometer-toggle', { type: 'button', 'aria-label': 'Toggle crawl progress' });
    toggleBtn.add(text(ctx, '🏎️ Crawl Progress'));
    
    const collapseIcon = makeEl(ctx, 'span', 'collapse-icon');
    collapseIcon.add(text(ctx, '▼'));
    toggleBtn.add(collapseIcon);
    
    header.add(toggleBtn);
    panel.add(header);
    
    // Collapsible body
    const body = makeEl(ctx, 'div', 'speedometer-panel-body');
    
    // Add the speedometer control
    const speedometer = new CrawlSpeedometerControl({
      context: ctx,
      label: 'Hub Verification',
      maxSpeed: 5,  // Expected ~5 URLs/sec for distributed checks
      gaugeSize: 160,
      showStats: true
    });
    body.add(speedometer);
    
    // Job status info
    const jobInfo = makeEl(ctx, 'div', 'job-info');
    jobInfo.add(text(ctx, 'No active job'));
    body.add(jobInfo);
    
    panel.add(body);
    
    // Add panel-specific styles
    const panelStyles = makeEl(ctx, 'style');
    panelStyles.add(text(ctx, `
.speedometer-panel {
  margin: 1rem 0;
  background: #16213e;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  overflow: hidden;
}

.speedometer-panel-header {
  display: flex;
  align-items: center;
  padding: 0.75rem 1rem;
  background: #0f172a;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}

.speedometer-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: transparent;
  border: none;
  color: #e0e0e0;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  padding: 0;
}

.speedometer-toggle:hover {
  color: #c9a227;
}

.collapse-icon {
  font-size: 0.7rem;
  transition: transform 0.2s;
}

.speedometer-panel-header[data-collapsed="true"] .collapse-icon {
  transform: rotate(-90deg);
}

.speedometer-panel-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1.5rem;
  gap: 1rem;
}

.speedometer-panel-header[data-collapsed="true"] + .speedometer-panel-body {
  display: none;
}

.job-info {
  font-size: 0.8rem;
  color: #9ca3af;
  text-align: center;
}

.job-info.active {
  color: #2e8b57;
}
`));
    panel.add(panelStyles);
    
    return panel;
  }

  _speedometerScript() {
    const ctx = this.context;
    const scriptEl = makeEl(ctx, 'script');
    scriptEl.add(
      text(
        ctx,
        `
(() => {
  const init = () => {
    const panel = document.querySelector('[data-testid="speedometer-panel"]');
    if (!panel) return;

    const toggle = panel.querySelector('.speedometer-toggle');
    const header = panel.querySelector('.speedometer-panel-header');
    const body = panel.querySelector('.speedometer-panel-body');
    const info = panel.querySelector('.job-info');
    const basePath = (panel.getAttribute('data-base-path') || '').replace(/\\/$/, '');
    const jobsUrl = (basePath + '/api/jobs').replace('//', '/');
    const maxSpeed = Number(panel.getAttribute('data-max-speed')) || 5;

    const gauge = panel.querySelector('.speedometer-gauge');
    const needle = panel.querySelector('.speedometer-needle');
    const speedValue = panel.querySelector('.speed-value');
    const statValues = panel.querySelectorAll('.stat-item .stat-value');
    const statusDot = panel.querySelector('.status-dot');
    const statusText = panel.querySelector('.status-text');

    let lastSample = null;
    let pollTimer = null;

    const setCollapsed = (next) => {
      if (!header || !body) return;
      header.setAttribute('data-collapsed', next ? 'true' : 'false');
    };

    if (toggle) {
      toggle.addEventListener('click', () => {
        const isCollapsed = header?.getAttribute('data-collapsed') === 'true';
        setCollapsed(!isCollapsed);
      });
    }

    const setStatus = (state) => {
      if (statusDot) {
        statusDot.className = 'status-dot';
        if (state) statusDot.classList.add(\`status-\${state}\`);
      }
      if (statusText) {
        const label = state === 'active' ? 'Active' : state === 'complete' ? 'Complete' : state === 'paused' ? 'Paused' : 'Idle';
        statusText.textContent = label;
      }
    };

    const updateNeedle = (speed) => {
      if (!needle) return;
      const ratio = Math.min(speed / maxSpeed, 1);
      const angle = 180 + (ratio * 180);
      let size = 160;
      if (gauge) {
        const viewBox = gauge.getAttribute('viewBox');
        if (viewBox) {
          const parts = viewBox.split(' ').map(Number);
          if (parts.length === 4 && Number.isFinite(parts[2])) {
            size = parts[2];
          }
        } else if (gauge.getAttribute('width')) {
          const w = Number(gauge.getAttribute('width'));
          if (Number.isFinite(w)) size = w;
        }
      }
      const cx = size / 2;
      const cy = size / 2;
      needle.setAttribute('transform', \`rotate(\${angle}, \${cx}, \${cy})\`);
    };

    const updateStats = ({ speed, total, ok, failed }) => {
      if (speedValue) speedValue.textContent = speed.toFixed(1);
      updateNeedle(speed);
      const rate = total > 0 ? Math.round((ok / total) * 100) : 0;
      if (statValues && statValues.length >= 4) {
        statValues[0].textContent = String(total);
        statValues[1].textContent = String(ok);
        statValues[2].textContent = String(failed);
        statValues[3].textContent = total > 0 ? \`\${rate}%\` : '—';
      }
    };

    const updateInfo = (job) => {
      if (!info) return;
      if (!job) {
        info.textContent = 'No active job';
        info.classList.remove('active');
        panel.setAttribute('data-job-id', '');
        updateStats({ speed: 0, total: 0, ok: 0, failed: 0 });
        setStatus('idle');
        return;
      }

      const processed = job.processedCount || 0;
      const total = job.domainCount || job.domains?.length || 0;
      info.textContent = \`Running: \${processed} / \${total} domains\`;
      info.classList.add('active');
      panel.setAttribute('data-job-id', job.id || '');
      setStatus('active');
    };

    const computeSpeed = (job) => {
      if (!job) return 0;
      const processed = job.processedCount || 0;
      const now = Date.now();
      if (!lastSample) {
        lastSample = { processed, time: now };
        return 0;
      }
      const delta = processed - lastSample.processed;
      const elapsed = (now - lastSample.time) / 1000;
      lastSample = { processed, time: now };
      if (elapsed <= 0) return 0;
      return delta / elapsed;
    };

    const poll = async () => {
      try {
        const res = await fetch(jobsUrl);
        if (!res.ok) return;
        const jobs = await res.json();
        const activeJob = jobs.find((j) => j.status === 'running' || j.status === 'pending') || null;
        updateInfo(activeJob);
        if (activeJob) {
          const total = activeJob.processedCount || 0;
          const speed = computeSpeed(activeJob);
          updateStats({ speed, total, ok: total, failed: 0 });
        } else {
          lastSample = null;
        }
      } catch (err) {
        // ignore polling errors
      }
    };

    poll();
    pollTimer = setInterval(poll, 2000);

    window.addEventListener('beforeunload', () => {
      if (pollTimer) clearInterval(pollTimer);
    });
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

  /**
   * Generate client-side JavaScript for SSE real-time updates
   * Listens to /events endpoint and updates cell states without page refresh
   */
  _sseScript() {
    const ctx = this.context;
    const scriptEl = makeEl(ctx, 'script');
    scriptEl.add(
      text(
        ctx,
        `
(() => {
  const init = () => {
    const page = document.querySelector('[data-testid="place-hub-guessing"]');
    if (!page) return;

    // Derive base path from current URL
    const basePath = window.location.pathname.replace(/\\/$/, '') || '';
    const eventsUrl = basePath + '/events';

    let eventSource = null;
    let reconnectTimer = null;
    const MAX_RECONNECT_DELAY = 30000;
    let reconnectDelay = 1000;

    // Status indicator
    const statusEl = document.createElement('div');
    statusEl.className = 'sse-status';
    statusEl.style.cssText = 'position:fixed;bottom:8px;right:8px;padding:4px 8px;border-radius:4px;font-size:11px;z-index:1000;background:#1e293b;color:#94a3b8;border:1px solid rgba(255,255,255,0.1);';
    statusEl.innerHTML = '<span class="sse-dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#666;margin-right:6px;"></span><span class="sse-text">Connecting...</span>';
    document.body.appendChild(statusEl);

    const dot = statusEl.querySelector('.sse-dot');
    const txt = statusEl.querySelector('.sse-text');

    const setStatus = (state, message) => {
      dot.style.background = state === 'connected' ? '#22c55e' : state === 'error' ? '#ef4444' : '#f59e0b';
      txt.textContent = message;
    };

    // Cell state to CSS class mapping
    const stateClassMap = {
      'unchecked': 'cell--none',
      'guessed': 'cell--guessed',
      'pending': 'cell--pending',
      'verified-present': 'cell--verified-present',
      'verified-absent': 'cell--verified-absent'
    };

    const stateGlyphMap = {
      'unchecked': '',
      'guessed': '?',
      'pending': '•',
      'verified-present': '✓',
      'verified-absent': '×'
    };

    // Find cell element by placeId and host
    const findCell = (placeId, host) => {
      // Cells have data attributes or we can use the href pattern
      const tables = document.querySelectorAll('.matrix');
      for (const table of tables) {
        const cells = table.querySelectorAll('td.cell');
        for (const cell of cells) {
          const link = cell.querySelector('a');
          if (!link) continue;
          const href = link.getAttribute('href') || '';
          // Parse query params from href
          try {
            const url = new URL(href, window.location.origin);
            const params = url.searchParams;
            if (params.get('placeId') === String(placeId) && params.get('host') === host) {
              return cell;
            }
          } catch (e) {
            // ignore parse errors
          }
        }
      }
      return null;
    };

    // Update cell state
    const updateCell = (event) => {
      const { placeId, host, state, outcome, url, ageLabel, depth } = event;
      const cell = findCell(placeId, host);
      if (!cell) return;

      // Remove old state classes
      Object.values(stateClassMap).forEach(cls => cell.classList.remove(cls));
      cell.classList.remove('cell--deep-hub');

      // Add new state class
      const newState = state || (outcome === 'absent' ? 'verified-absent' : outcome === 'present' ? 'verified-present' : 'pending');
      const newClass = stateClassMap[newState];
      if (newClass) cell.classList.add(newClass);

      // Update data attribute
      cell.setAttribute('data-state', newState);

      // Update glyph
      const link = cell.querySelector('a');
      if (link) {
        const glyph = stateGlyphMap[newState] || '';
        const textNodes = link.childNodes;
        if (textNodes.length > 0 && textNodes[0].nodeType === Node.TEXT_NODE) {
          textNodes[0].textContent = glyph;
        }

        // Update or add age label
        let ageSpan = link.querySelector('.cell-age');
        if (ageLabel) {
          if (!ageSpan) {
            ageSpan = document.createElement('span');
            ageSpan.className = 'cell-age';
            link.appendChild(ageSpan);
          }
          ageSpan.textContent = ageLabel;
        }

        // Handle deep hub indicator
        if (depth && depth >= 10) {
          cell.classList.add('cell--deep-hub');
          let depthSpan = link.querySelector('.cell-depth');
          if (!depthSpan) {
            depthSpan = document.createElement('span');
            depthSpan.className = 'cell-depth';
            link.appendChild(depthSpan);
          }
          depthSpan.textContent = depth > 999 ? (Math.round(depth / 100) / 10) + 'k' : String(depth);
        }
      }

      // Update tooltip
      const parts = [];
      if (url) parts.push(url);
      parts.push('place_id=' + placeId, 'host=' + host, 'status=' + newState);
      if (outcome) parts.push('outcome=' + outcome);
      if (depth) parts.push('depth=' + depth);
      cell.setAttribute('title', parts.join('\\n'));

      // Flash animation
      cell.style.transition = 'background-color 0.3s';
      cell.style.backgroundColor = 'rgba(201,162,39,0.4)';
      setTimeout(() => {
        cell.style.backgroundColor = '';
      }, 300);
    };

    // Update stats in chrome
    const updateStats = (stats) => {
      if (!stats) return;
      const statItems = document.querySelectorAll('.chrome-stat__value');
      // Stats order: Places, Hosts, Verified, There, Not there, Guessed, Pending, Unchecked, Deep Hubs, Probed
      const statKeys = ['places', 'hosts', 'verifiedCount', 'verifiedPresentCount', 'verifiedAbsentCount', 'guessedCount', 'pendingCount', 'uncheckedCount', 'deepHubCount', 'depthCheckedCount'];
      statKeys.forEach((key, idx) => {
        if (stats[key] !== undefined && statItems[idx]) {
          statItems[idx].textContent = String(stats[key]);
        }
      });
    };

    // Show toast notification
    const showToast = (message, type = 'info') => {
      const toast = document.createElement('div');
      toast.className = 'sse-toast';
      toast.style.cssText = 'position:fixed;bottom:40px;right:8px;padding:8px 12px;border-radius:4px;font-size:12px;z-index:1001;animation:fadeIn 0.2s;' +
        (type === 'error' ? 'background:#ef4444;color:white;' : 'background:#16213e;color:#e0e0e0;border:1px solid rgba(255,255,255,0.1);');
      toast.textContent = message;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
    };

    const connect = () => {
      if (eventSource) {
        try { eventSource.close(); } catch (e) {}
      }

      try {
        eventSource = new EventSource(eventsUrl);

        eventSource.onopen = () => {
          setStatus('connected', 'Live');
          reconnectDelay = 1000;
        };

        eventSource.onerror = () => {
          setStatus('error', 'Disconnected');
          eventSource.close();
          
          // Exponential backoff reconnect
          reconnectTimer = setTimeout(() => {
            setStatus('warning', 'Reconnecting...');
            connect();
          }, reconnectDelay);
          reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
        };

        eventSource.onmessage = (e) => {
          try {
            const event = JSON.parse(e.data);
            
            switch (event.type) {
              case 'connected':
              case 'sse:client-count':
                // Connection events - no UI update needed
                break;
              
              case 'cell:verified':
                updateCell(event);
                showToast('Cell verified: ' + (event.host || ''));
                break;
              
              case 'job:started':
                showToast('Verification job started');
                break;
              
              case 'job:progress':
                // Could update speedometer, but it polls separately
                break;
              
              case 'job:completed':
                showToast('Job completed: ' + (event.processedCount || 0) + ' cells');
                if (event.stats) updateStats(event.stats);
                break;
              
              case 'job:failed':
                showToast('Job failed: ' + (event.error || 'Unknown error'), 'error');
                break;
              
              default:
                // Unknown event type
                break;
            }
          } catch (err) {
            console.warn('SSE parse error:', err);
          }
        };
      } catch (err) {
        setStatus('error', 'SSE not supported');
      }
    };

    connect();

    window.addEventListener('beforeunload', () => {
      if (eventSource) eventSource.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    });
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
}

module.exports = { PlaceHubGuessingMatrixControl };
