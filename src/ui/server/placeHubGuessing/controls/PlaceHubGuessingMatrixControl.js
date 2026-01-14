'use strict';

const jsgui = require('jsgui3-html');
let Matrix = jsgui.controls.Matrix;
if (!Matrix) {
  try {
    // Dev environment fallback to sibling repo
    Matrix = require('../../../../../../jsgui3-html/controls/matrix/Matrix');
  } catch (e) {
    console.error('Failed to load Matrix control:', e);
  }
}
const { BaseAppControl } = require('../../shared');
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

  _computeCellData(place, host, mapping) {
    const placeId = place.place_id;

    if (!mapping) {
      const href = this._buildHref(place, host);
      return {
        state: 'unchecked',
        className: 'cell--none',
        href,
        title: `Unchecked\n${place.place_name || place.place_id}\n${host}`,
        target: '_self',
        attrs: { 'data-state': 'unchecked' }
      };
    }

    const isVerified = mapping.status === 'verified' || !!mapping.verified_at;
    const isCandidate = mapping.status === 'candidate';
    const outcome = this.props.getMappingOutcome(mapping);

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

    const maxDepth = mapping.max_page_depth || mapping.maxPageDepth || 0;
    const isDeepHub = state === 'verified-present' && maxDepth >= 10;

    if (isDeepHub) {
      glyph = `${glyph}${maxDepth > 999 ? (Math.round(maxDepth / 100) / 10) + 'k' : maxDepth}`;
      className = `${className} cell--deep-hub`;
    }

    const tipParts = [];
    if (mapping.url) tipParts.push(mapping.url);
    tipParts.push(`status=${mapping.status}`);
    if (maxDepth > 0) tipParts.push(`depth=${maxDepth} pages`);
    if (mapping.last_seen_at) tipParts.push(`last_seen_at=${mapping.last_seen_at}`);

    // Evidence metrics
    if (state === 'verified-present' && mapping.evidence) {
      const evidence = typeof mapping.evidence === 'string' ? JSON.parse(mapping.evidence) : mapping.evidence;
      if (evidence.articleLinksCount || evidence.article_links_count) {
        tipParts.push(`articles=${evidence.articleLinksCount || evidence.article_links_count}`);
      }
    }

    const href = this._buildHref(place, host);

    return {
      state,
      glyph,
      className,
      title: tipParts.join('\n'),
      href,
      target: '_self',
      attrs: {
        'data-state': state,
        'data-outcome': outcome,
        'data-depth': maxDepth > 0 ? String(maxDepth) : null
      }
    };
  }

  _buildHref(place, host) {
    const model = this.model;
    return buildCellLink({
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
  }

  composeMainContent() {
    const ctx = this.context;
    const model = this.model;

    const defaultRowCount = model?.places?.length ?? 0;
    const defaultColCount = model?.hosts?.length ?? 0;
    const resolvedMatrixMode = this._resolveMatrixMode({ rowCount: defaultRowCount, colCount: defaultColCount });
    const isVirtual = resolvedMatrixMode === 'virtual';
    const stateFilter = model?.stateFilter || 'all';

    const root = makeEl(ctx, 'div', 'page', {
      'data-testid': 'place-hub-guessing',
      'data-view': 'a',
      'data-matrix-mode': resolvedMatrixMode,
      'data-state-filter': stateFilter
    });

    const styleEl = makeEl(ctx, 'style');
    styleEl.add(text(ctx, this._getEmbeddedCSS()));
    root.add(styleEl);

    const chrome = new HubGuessingMatrixChromeControl({
      context: ctx,
      rootTestId: 'place-hub-guessing',
      basePath: this.basePath || '.',
      initialView: 'a',
      includeFlipAxes: true,
      guessPayloadFields: ['hostQ', 'hostLimit', 'pageKind', 'activePattern', 'parentPlace'],
      guessPayloadDefaults: { apply: true },
      fields: this._getChromeFields(model),
      presets: this._getChromePresets(),
      stats: this._getChromeStats(model),
      legend: this._getChromeLegend()
    });
    root.add(chrome);

    const cellsMapA = new Map();
    const cellsMapB = new Map();

    if (model.mappingByKey && isVirtual) {
      model.mappingByKey.forEach((mapping, key) => {
        const [placeIdRaw, host] = key.split('|');
        const placeId = Number(placeIdRaw);
        const place = { place_id: placeId };
        const cellData = this._computeCellData(place, host, mapping);
        cellsMapA.set(`${placeId}|${host}`, cellData);
        cellsMapB.set(`${host}|${placeId}`, cellData);
      });
    }

    const viewA = makeEl(ctx, 'div', null, { 'data-testid': 'matrix-view-a' });
    const viewB = makeEl(ctx, 'div', null, { 'data-testid': 'matrix-view-b' });

    const matrixA = new Matrix({
      context: ctx,
      rows: model?.places || [],
      cols: model?.hosts || [],
      virtual: isVirtual,
      virtualThreshold: this.matrixThreshold,
      cells: isVirtual ? cellsMapA : null,
      getRowKey: p => p.place_id,
      getRowLabel: p => p.place_name || String(p.place_id),
      getRowTitle: p => p.place_name || String(p.place_id),
      getColKey: h => h,
      getColLabel: h => this._getHostLabel(h, model),
      getColTitle: h => this._getHostTitle(h, model),
      getCellData: (place, host) => {
        const mapping = model.mappingByKey?.get?.(`${place.place_id}|${host}`) || null;
        return this._computeCellData(place, host, mapping);
      },
      header: { mode: 'angle', angleDeg: 45, truncateAt: 18 },
      cornerLabel: 'Place \\ Host'
    });
    viewA.add(matrixA);

    const matrixB = new Matrix({
      context: ctx,
      rows: (model?.hosts || []).map(h => ({ host: h })),
      cols: model?.places || [],
      virtual: isVirtual,
      cells: isVirtual ? cellsMapB : null,
      getRowKey: r => r.host,
      getRowLabel: r => this._getHostLabel(r.host, model),
      getRowTitle: r => this._getHostTitle(r.host, model),
      getColKey: p => p.place_id,
      getColLabel: p => p.place_name || String(p.place_id),
      getColTitle: p => p.place_name || String(p.place_id),
      getCellData: (hostRow, place) => {
        const mapping = model.mappingByKey?.get?.(`${place.place_id}|${hostRow.host}`) || null;
        return this._computeCellData(place, hostRow.host, mapping);
      },
      header: { mode: 'angle', angleDeg: 45, truncateAt: 18 },
      cornerLabel: 'Host \\ Place'
    });
    viewB.add(matrixB);

    root.add(viewA);
    root.add(viewB);

    root.add(this._composeSpeedometerPanel({ model }));
    root.add(this._speedometerScript());
    root.add(this._sseScript());

    this.mainContainer.add(root);
  }

  _getHostLabel(host, model) {
    const pageData = model?.hostPageCounts?.get?.(host.replace(/^www\./, ''));
    if (pageData?.is_eligible) return `${host} ✓`;
    return host;
  }

  _getHostTitle(host, model) {
    const pageData = model?.hostPageCounts?.get?.(host.replace(/^www\./, ''));
    if (!pageData) return host;
    const status = pageData.is_eligible
      ? `✅ Pattern analysis: ELIGIBLE (${pageData.page_count.toLocaleString()} pages)`
      : `📊 ${pageData.page_count.toLocaleString()} pages (need ${(500 - pageData.page_count).toLocaleString()} more)`;
    return `${host}\n${status}`;
  }

  _getEmbeddedCSS() {
    return `
.place-hub-guessing { --bg: #0d1117; --panel: #111827; --border: rgba(255,255,255,0.14); --text: #f8fafc; --muted: #cbd5e1; --gold: #f7c566; --ok: #22c55e; --bad: #ef4444; --warn: #f59e0b; --mono: "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; background: var(--bg); color: var(--text); }
.matrix-wrap { 
  overflow: auto; 
  border: 1px solid var(--border); 
  border-radius: 8px; 
  background: var(--panel); 
  max-height: calc(100vh - 100px); 
  position: relative; /* Context for sticky */
}
table.matrix { 
  border-collapse: separate; 
  border-spacing: 0; 
  min-width: max-content; 
}
.matrix-th-row { 
  position: sticky; 
  left: 0; 
  background: var(--panel); 
  z-index: 10;
  border-right: 1px solid var(--border);
  min-width: 200px;
  max-width: 300px;
}
.matrix-th-col { 
  position: sticky; 
  top: 0; 
  background: var(--panel); 
  z-index: 5;
  border-bottom: 1px solid var(--border);
  height: 140px; 
  vertical-align: bottom;
  white-space: nowrap;
}
.matrix-th-corner {
  position: sticky;
  top: 0;
  left: 0;
  z-index: 20;
  background: var(--panel);
}
.matrix-th-col > div {
  transform: rotate(-45deg);
  width: 30px;
  transform-origin: left bottom;
  margin-bottom: 5px;
  overflow: visible;
  font-size: 0.85rem;
}
.matrix-td { padding: 0 !important; border: 1px solid rgba(255,255,255,0.05); }
.cell--none { background: rgba(255,255,255,0.04); color: var(--muted); }
.cell--guessed { background: rgba(245,158,11,0.24); color: #fbbf24; border-color: rgba(245,158,11,0.35); }
.cell--pending { background: rgba(156,163,175,0.24); color: #e5e7eb; }
.cell--verified-present { background: rgba(34,197,94,0.20); color: var(--ok); }
.cell--verified-absent { background: rgba(239,68,68,0.20); color: var(--bad); }
.cell--deep-hub { background: rgba(34,197,94,0.32); box-shadow: inset 0 -2px 0 var(--ok); }
.host-eligible-badge { color: var(--ok); margin-left: 2px; }
[data-state-filter="unchecked"] .cell:not([data-state="unchecked"]) { opacity: 0.25; }
[data-state-filter="guessed"] .cell:not([data-state="guessed"]) { opacity: 0.25; }
[data-state-filter="pending"] .cell:not([data-state="pending"]) { opacity: 0.25; }
[data-state-filter="verified"] .cell:not([data-state="verified-present"]):not([data-state="verified-absent"]) { opacity: 0.25; }
.speedometer-panel { margin: 1rem 0; background: #16213e; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; overflow: hidden; }
.speedometer-panel-header { display: flex; align-items: center; padding: 0.75rem 1rem; background: #0f172a; border-bottom: 1px solid rgba(255,255,255,0.1); }
.speedometer-toggle { display: flex; align-items: center; gap: 0.5rem; background: transparent; border: none; color: #e0e0e0; font-size: 0.9rem; font-weight: 500; cursor: pointer; padding: 0; }
.speedometer-panel-header[data-collapsed="true"] + .speedometer-panel-body { display: none; }
.job-info { font-size: 0.8rem; color: #9ca3af; text-align: center; } .job-info.active { color: #2e8b57; }
    `;
  }

  _getChromeFields(model) {
    return [
      { kind: 'select', label: 'Kind', name: 'kind', value: model?.placeKind || 'country', options: ['country', 'region', 'city'] },
      { kind: 'select', label: 'Page kind', name: 'pageKind', value: model?.pageKind || 'country-hub', options: ['country-hub', 'region-hub', 'city-hub'] },
      { kind: 'select', label: 'State', name: 'stateFilter', value: model?.stateFilter || 'all', options: [{ value: 'all', label: 'All states' }, { value: 'unchecked', label: 'Unchecked only' }, { value: 'guessed', label: 'Guessed only' }, { value: 'pending', label: 'Pending only' }, { value: 'verified', label: 'Verified only' }, { value: 'verified-present', label: 'Verified (exists)' }, { value: 'verified-absent', label: 'Verified (not found)' }, { value: 'needs-check', label: 'Needs check (unchecked + guessed)' }] },
      { kind: 'input', label: 'Place filter', name: 'q', value: model?.placeQ || '', attrs: { placeholder: 'e.g. california' } },
      { kind: 'input', label: 'Host filter', name: 'hostQ', value: model?.hostQ || '', attrs: { placeholder: 'e.g. news' } },
      { kind: 'input', label: 'Parent Place', name: 'parentPlace', value: model?.parentPlace || '', attrs: { placeholder: 'e.g. Canada' } },
      { kind: 'input', label: 'Active Pattern', name: 'activePattern', value: model?.activePattern || '', attrs: { placeholder: '/news/{slug}' } },
      { kind: 'input', label: 'Places', name: 'placeLimit', value: String(model?.placeLimit ?? 200), attrs: { type: 'number', min: '1', max: '500' } },
      { kind: 'input', label: 'Hosts', name: 'hostLimit', value: String(model?.hostLimit ?? 30), attrs: { type: 'number', min: '1', max: '100' } }
    ];
  }

  _getChromePresets() {
    return [
      { label: '🌍 Countries', params: { kind: 'country', pageKind: 'country-hub', placeLimit: 300, stateFilter: 'all' } },
      { label: '🏙️ Major Cities', params: { kind: 'city', pageKind: 'city-hub', placeLimit: 100, stateFilter: 'all' } },
      { label: '📍 Regions', params: { kind: 'region', pageKind: 'region-hub', placeLimit: 100, stateFilter: 'all' } },
      { label: '🇪🇺 Europe', params: { kind: 'country', pageKind: 'country-hub', continent: 'Europe', placeLimit: 60, stateFilter: 'all' } },
      { label: '⚠️ Needs Check', params: { stateFilter: 'needs-check' } },
      { label: '✅ Verified', params: { stateFilter: 'verified' } }
    ];
  }

  _getChromeStats(model) {
    return [
      { label: 'Places', value: model?.places?.length ?? 0 },
      { label: 'Hosts', value: model?.hosts?.length ?? 0 },
      { label: 'Verified', value: model?.stats?.verifiedCount ?? 0, valueClass: 'stat-value--ok' },
      { label: 'Guessed', value: model?.stats?.guessedCount ?? 0, valueClass: 'stat-value--guess' },
      { label: 'Pending', value: model?.stats?.pendingCount ?? 0, valueClass: 'stat-value--warn' },
      { label: 'Deep Hubs', value: model?.stats?.deepHubCount ?? 0, valueClass: 'stat-value--ok', title: 'Hubs with 10+ pages of history' }
    ];
  }

  _getChromeLegend() {
    return [
      { label: 'Unchecked', className: 'cell--none' },
      { label: 'Guessed', className: 'cell--guessed' },
      { label: 'Pending', className: 'cell--pending' },
      { label: 'Verified', className: 'cell--verified-present' },
      { label: 'Deep Hub', className: 'cell--verified-present cell--deep-hub' },
      { label: 'Not Found', className: 'cell--verified-absent' }
    ];
  }

  _composeSpeedometerPanel({ model }) {
    const ctx = this.context;
    const panel = makeEl(ctx, 'div', 'speedometer-panel', { 'data-testid': 'speedometer-panel', 'data-job-id': '', 'data-base-path': this.basePath || '.', 'data-max-speed': '5' });
    const panelStyle = makeEl(ctx, 'style'); panelStyle.add(text(ctx, CRAWL_SPEEDOMETER_STYLES)); panel.add(panelStyle);
    const header = makeEl(ctx, 'div', 'speedometer-panel-header'); header.dom.attributes['data-collapsed'] = 'false';
    const toggleBtn = makeEl(ctx, 'button', 'speedometer-toggle', { type: 'button', 'aria-label': 'Toggle crawl progress' }); toggleBtn.add(text(ctx, '🏎️ Crawl Progress'));
    const collapseIcon = makeEl(ctx, 'span', 'collapse-icon'); collapseIcon.add(text(ctx, '▼')); toggleBtn.add(collapseIcon); header.add(toggleBtn); panel.add(header);
    const body = makeEl(ctx, 'div', 'speedometer-panel-body');
    body.add(new CrawlSpeedometerControl({ context: ctx, label: 'Hub Verification', maxSpeed: 5, gaugeSize: 160, showStats: true }));
    const jobInfo = makeEl(ctx, 'div', 'job-info'); jobInfo.add(text(ctx, 'No active job')); body.add(jobInfo); panel.add(body);
    const panelStyles = makeEl(ctx, 'style'); panelStyles.add(text(ctx, `
      .speedometer - panel { margin: 1rem 0; background: #16213e; border: 1px solid rgba(255, 255, 255, 0.1); border - radius: 8px; overflow: hidden; }
.speedometer - panel - header { display: flex; align - items: center; padding: 0.75rem 1rem; background: #0f172a; border - bottom: 1px solid rgba(255, 255, 255, 0.1); }
.speedometer - toggle { display: flex; align - items: center; gap: 0.5rem; background: transparent; border: none; color: #e0e0e0; font - size: 0.9rem; font - weight: 500; cursor: pointer; padding: 0; }
.speedometer - panel - header[data - collapsed="true"]+ .speedometer - panel - body { display: none; }
.job - info { font - size: 0.8rem; color: #9ca3af; text - align: center; } .job - info.active { color: #2e8b57; }
    `)); panel.add(panelStyles);
    return panel;
  }

  _speedometerScript() {
    const ctx = this.context;
    const scriptEl = makeEl(ctx, 'script');
    scriptEl.add(text(ctx, `
      (() => {
        const init = () => {
          const panel = document.querySelector('[data-testid="speedometer-panel"]'); if (!panel) return;
          const toggle = panel.querySelector('.speedometer-toggle'); const header = panel.querySelector('.speedometer-panel-header');
          if (toggle) toggle.addEventListener('click', () => { const c = header.getAttribute('data-collapsed') === 'true'; header.setAttribute('data-collapsed', c ? 'false' : 'true'); });
          const info = panel.querySelector('.job-info'); const statValues = panel.querySelectorAll('.stat-item .stat-value');
          const jobsUrl = (panel.getAttribute('data-base-path') || '').replace(/\\/$ /, '') + '/api/jobs';
          let pollTimer = null;
          const poll = async () => {
            try {
              const res = await fetch(jobsUrl); if (!res.ok) return;
              const jobs = await res.json(); const activeJob = jobs.find(j => j.status === 'running' || j.status === 'pending');
              if (activeJob) { info.textContent = 'Running: ' + (activeJob.processedCount || 0) + ' domains'; info.classList.add('active'); if (statValues[0]) statValues[0].textContent = String(activeJob.processedCount || 0); }
              else { info.textContent = 'No active job'; info.classList.remove('active'); }
            } catch (e) { }
          };
          poll(); pollTimer = setInterval(poll, 2000);
          window.addEventListener('beforeunload', () => clearInterval(pollTimer));
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
      })();
    `));
    return scriptEl;
  }

  _sseScript() {
    const ctx = this.context;
    const scriptEl = makeEl(ctx, 'script');
    scriptEl.add(text(ctx, `
      (() => {
        const init = () => {
          const page = document.querySelector('[data-testid="place-hub-guessing"]'); if (!page) return;
          const basePath = window.location.pathname.replace(/\\/$ /, '') || ''; const eventsUrl = basePath + '/events';
          let eventSource = null, reconnectTimer = null;
          const connect = () => {
            if (eventSource) try { eventSource.close(); } catch (e) { }
            try {
              eventSource = new EventSource(eventsUrl);
              eventSource.onmessage = (e) => {
                const event = JSON.parse(e.data);
                if (event.type === 'cell:verified') {
                  // Update cell logic using selectors
                  // ... (simplified updates)
                }
              };
              eventSource.onerror = () => { eventSource.close(); reconnectTimer = setTimeout(connect, 5000); };
            } catch (e) { }
          };
          connect();
          window.addEventListener('beforeunload', () => { if (eventSource) eventSource.close(); clearTimeout(reconnectTimer); });
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
      })();
    `));
    return scriptEl;
  }
}

module.exports = { PlaceHubGuessingMatrixControl };
