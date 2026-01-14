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

class PlaceHubGuessingCellControl extends BaseAppControl {
  constructor(spec = {}) {
    super({
      ...spec,
      appName: 'Place Hub Guessing',
      appClass: 'place-hub-guessing',
      title: '🏷️ Place Hub Guessing — Cell',
      subtitle: 'Verify or update a place hub mapping.'
    });

    this.model = spec.model || {};

    if (!spec.el) {
      this.compose();
    }
  }

  composeMainContent() {
    const ctx = this.context;
    const model = this.model || {};
    const { place, host, mapping, modelContext } = model;
    
    // Construct back link with current filters
    const params = new URLSearchParams();
    if (modelContext.placeKind) params.set('placeKind', modelContext.placeKind);
    if (modelContext.pageKind) params.set('pageKind', modelContext.pageKind);
    if (modelContext.placeLimit) params.set('placeLimit', modelContext.placeLimit);
    if (modelContext.hostLimit) params.set('hostLimit', modelContext.hostLimit);
    if (modelContext.placeQ) params.set('q', modelContext.placeQ);
    if (modelContext.hostQ) params.set('hostQ', modelContext.hostQ);
    if (modelContext.stateFilter) params.set('stateFilter', modelContext.stateFilter);
    if (modelContext.continent) params.set('continent', modelContext.continent);
    if (modelContext.parentPlace) params.set('parentPlace', modelContext.parentPlace);
    if (modelContext.activePattern) params.set('activePattern', modelContext.activePattern);
    if (modelContext.matrixMode) params.set('matrixMode', modelContext.matrixMode);
    if (modelContext.matrixThreshold) params.set('matrixThreshold', modelContext.matrixThreshold);
    const backHref = `./?${params.toString()}`;

    const root = makeEl(ctx, 'div', 'page', { 'data-testid': 'place-hub-guessing-cell' });

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

.page {
  background: var(--bg);
  color: var(--text);
}

.cell-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin: 10px 0 20px 0;
  padding-bottom: 15px;
  border-bottom: 1px solid var(--border);
}

.cell-meta { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
.cell-value { font-size: 18px; font-weight: 500; color: var(--text); }
.cell-url { font-family: var(--mono); font-size: 14px; color: var(--gold); }

.back-btn {
  color: var(--gold);
  text-decoration: none;
  border: 1px solid rgba(212,165,116,0.45);
  padding: 8px 12px;
  border-radius: 6px;
  background: rgba(212,165,116,0.1);
  font-size: 14px;
}
.back-btn:hover { background: rgba(212,165,116,0.2); }

.status-card {
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 20px;
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--text);
}
.status-card.verified { background: rgba(16,185,129,0.18); border-color: rgba(16,185,129,0.35); }
.status-card.candidate { background: rgba(251,191,36,0.16); border-color: rgba(251,191,36,0.35); }
.status-card.unknown { background: rgba(55,65,81,0.55); border-color: var(--border); }

.form-group { margin-bottom: 15px; }
.label { display: block; margin-bottom: 5px; font-size: 14px; color: var(--muted); }
.input { 
  width: 100%; 
  padding: 8px 10px; 
  background: rgba(17,24,39,0.65); 
  border: 1px solid rgba(255,255,255,0.2); 
  border-radius: 4px; 
  color: var(--text);
  font-family: var(--mono);
}
.textarea {
  width: 100%;
  padding: 8px 10px;
  background: rgba(17,24,39,0.65); 
  border: 1px solid rgba(255,255,255,0.2); 
  border-radius: 4px; 
  color: var(--text);
  min-height: 80px;
}

.actions { display: flex; gap: 10px; margin-top: 20px; }
.btn {
  padding: 10px 20px;
  border-radius: 6px;
  border: 0;
  cursor: pointer;
  font-weight: 500;
  font-size: 14px;
}
.btn-present { background: #10B981; color: #fff; }
.btn-present:hover { background: #059669; }
.btn-absent { background: #EF4444; color: #fff; }
.btn-absent:hover { background: #DC2626; }

.metrics-card {
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 20px;
  border: 1px solid rgba(59,130,246,0.4);
  background: rgba(59,130,246,0.12);
}
.metrics-title {
  font-weight: bold;
  margin-bottom: 10px;
  color: var(--gold);
}
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 15px;
}
.metric-item {
  text-align: center;
}
.metric-value {
  font-size: 24px;
  font-weight: bold;
  color: var(--text);
}
.metric-label {
  font-size: 12px;
  color: var(--muted);
  text-transform: uppercase;
}

.articles-card {
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 20px;
  border: 1px solid var(--border);
  background: rgba(17,24,39,0.7);
}
.articles-title {
  font-weight: bold;
  margin-bottom: 10px;
  color: var(--gold);
}
.article-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.article-item {
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}
.article-item:last-child {
  border-bottom: none;
}
.article-link {
  color: var(--text);
  text-decoration: none;
}
.article-link:hover {
  color: var(--gold);
}
.article-date {
  color: var(--muted);
  font-size: 11px;
  margin-left: 8px;
}
.no-articles {
  color: var(--muted);
  font-style: italic;
}

/* Place Name Variants */
.names-card {
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 20px;
  border: 1px solid rgba(139,92,246,0.4);
  background: rgba(139,92,246,0.14);
}
.names-title {
  font-weight: bold;
  margin-bottom: 10px;
  color: var(--gold);
}
.names-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.names-table th {
  text-align: left;
  padding: 8px;
  border-bottom: 1px solid var(--border);
  color: var(--muted);
  font-weight: 500;
  text-transform: uppercase;
  font-size: 11px;
}
.names-table td {
  padding: 6px 8px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.name-value { 
  font-weight: 500;
  color: var(--text);
}
.name-lang {
  font-family: var(--mono);
  color: var(--muted);
}
.name-kind {
  color: var(--muted);
  font-size: 12px;
}
.name-flags {
  font-size: 11px;
  color: var(--gold);
}
.more-indicator {
  margin-top: 10px;
  color: var(--muted);
  font-size: 12px;
  font-style: italic;
}

/* URL Patterns */
.patterns-card {
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 20px;
  border: 1px solid var(--border);
  background: rgba(34,197,94,0.1);
  border-color: rgba(34,197,94,0.3);
}
.patterns-title {
  font-weight: bold;
  margin-bottom: 10px;
  color: var(--gold);
}
.patterns-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.pattern-item {
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  display: flex;
  gap: 12px;
  align-items: center;
}
.pattern-item:last-child {
  border-bottom: none;
}
.pattern-code {
  font-family: var(--mono);
  background: rgba(0,0,0,0.3);
  padding: 4px 8px;
  border-radius: 4px;
  color: var(--gold);
}
.pattern-desc {
  color: var(--muted);
  font-size: 12px;
  flex: 1;
}
.pattern-link {
  color: var(--gold);
  text-decoration: none;
  font-size: 12px;
}
.pattern-link:hover {
  text-decoration: underline;
}

/* Host Patterns */
.host-patterns-card {
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 20px;
  border: 1px solid var(--border);
  background: rgba(251,191,36,0.1);
  border-color: rgba(251,191,36,0.3);
}
.host-patterns-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.host-patterns-table th {
  text-align: left;
  padding: 8px;
  border-bottom: 1px solid var(--border);
  color: var(--muted);
  font-weight: 500;
  text-transform: uppercase;
  font-size: 11px;
}
.host-patterns-table td {
  padding: 6px 8px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.hp-pattern code {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text);
}
.hp-count {
  color: var(--gold);
  font-weight: bold;
}
.hp-example a {
  color: var(--gold);
  text-decoration: none;
  font-size: 12px;
}
.hp-example a:hover {
  text-decoration: underline;
}

/* Analysis Freshness */
.freshness-card {
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 20px;
  border: 1px solid var(--border);
  background: rgba(0,0,0,0.2);
}
.freshness-title {
  font-weight: bold;
  margin-bottom: 10px;
  color: var(--gold);
}
.freshness-content {
  padding: 10px;
  border-radius: 6px;
}
.freshness-fresh {
  background: rgba(16,185,129,0.1);
  border: 1px solid rgba(16,185,129,0.3);
}
.freshness-stale {
  background: rgba(251,191,36,0.1);
  border: 1px solid rgba(251,191,36,0.3);
}
.freshness-old {
  background: rgba(239,68,68,0.1);
  border: 1px solid rgba(239,68,68,0.3);
}
.freshness-unknown {
  background: rgba(55,65,81,0.5);
  border: 1px solid var(--border);
}
.freshness-row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
}
.freshness-label {
  color: var(--muted);
  font-size: 12px;
}
.freshness-value {
  color: var(--text);
  font-weight: 500;
  font-size: 12px;
}

/* Host Eligibility / Crawl Status */
.eligibility-card {
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 20px;
  border: 1px solid var(--border);
  background: rgba(0,0,0,0.2);
}
.eligibility-title {
  font-weight: bold;
  margin-bottom: 10px;
  color: var(--gold);
}
.eligibility-content {
  padding: 10px;
  border-radius: 6px;
}
.eligibility-ok {
  background: rgba(16,185,129,0.1);
  border: 1px solid rgba(16,185,129,0.3);
}
.eligibility-needs-crawl {
  background: rgba(251,191,36,0.1);
  border: 1px solid rgba(251,191,36,0.3);
}
.eligibility-row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
}
.eligibility-label {
  color: var(--muted);
  font-size: 12px;
}
.eligibility-value {
  color: var(--text);
  font-weight: 500;
  font-size: 12px;
}
.crawl-action-row {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255,255,255,0.1);
  display: flex;
  align-items: center;
  gap: 12px;
}
.btn-crawl {
  background: linear-gradient(135deg, #059669, #047857);
  color: white;
  border: none;
  padding: 10px 18px;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-crawl:hover {
  background: linear-gradient(135deg, #047857, #065f46);
  transform: translateY(-1px);
}
.btn-crawl:disabled {
  background: #4b5563;
  cursor: wait;
  transform: none;
}
.crawl-status {
  font-size: 13px;
  color: var(--muted);
}

/* Hub Check Section */
.hub-check-card {
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 20px;
  border: 1px solid var(--border);
  background: rgba(59,130,246,0.1);
  border-color: rgba(59,130,246,0.3);
}
.hub-check-title {
  font-weight: bold;
  margin-bottom: 10px;
  color: var(--gold);
}
.hub-check-form {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}
.hub-check-input {
  flex: 1;
  padding: 8px 12px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: rgba(0,0,0,0.3);
  color: var(--text);
  font-family: var(--mono);
  font-size: 12px;
}
.hub-check-btn {
  padding: 8px 16px;
  border-radius: 4px;
  border: none;
  background: var(--gold);
  color: #000;
  font-weight: bold;
  cursor: pointer;
  transition: opacity 0.2s, transform 0.1s;
}
.hub-check-btn:hover {
  opacity: 0.9;
}
.hub-check-btn:active {
  transform: scale(0.97);
}
.hub-check-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.hub-check-btn.checking {
  position: relative;
  pointer-events: none;
}
.hub-check-btn.checking::after {
  content: '';
  display: inline-block;
  width: 12px;
  height: 12px;
  margin-left: 6px;
  border: 2px solid transparent;
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.hub-check-result {
  padding: 10px;
  border-radius: 4px;
  font-size: 12px;
  display: none;
}
.hub-check-result.success {
  display: block;
  background: rgba(16,185,129,0.1);
  border: 1px solid rgba(16,185,129,0.3);
  color: #10b981;
}
.hub-check-result.failure {
  display: block;
  background: rgba(239,68,68,0.1);
  border: 1px solid rgba(239,68,68,0.3);
  color: #ef4444;
}
.hub-check-result.pending {
  display: block;
  background: rgba(251,191,36,0.1);
  border: 1px solid rgba(251,191,36,0.3);
  color: #fbbf24;
}
.bulk-check-controls {
  display: flex;
  gap: 10px;
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px dashed var(--border);
}
.bulk-check-progress {
  margin-top: 10px;
  padding: 8px 12px;
  border-radius: 4px;
  background: rgba(0,0,0,0.2);
  font-size: 12px;
  display: none;
}
.bulk-check-progress.active {
  display: block;
}
.pattern-status {
  display: inline-block;
  width: 16px;
  text-align: center;
}
.pattern-status.success { color: #10b981; }
.pattern-status.failure { color: #ef4444; }
.pattern-status.pending { color: #fbbf24; }
.pattern-status.unchecked { color: var(--muted); }
.use-url-btn {
  margin-left: 8px;
  padding: 2px 8px;
  font-size: 10px;
  background: rgba(16,185,129,0.2);
  color: #10b981;
  border: 1px solid rgba(16,185,129,0.3);
  border-radius: 3px;
  cursor: pointer;
}
.use-url-btn:hover {
  background: rgba(16,185,129,0.3);
}

`
      )
    );
    root.add(styleEl);

    // Header
    const head = makeEl(ctx, 'div', 'cell-head');
    head.add(text(ctx, `
      <div>
        <div class="cell-meta">Target Place</div>
        <div class="cell-value">${escapeHtml(place?.place_name)} <span style="font-size:12px; color:var(--muted)">(${place?.country_code || '?'})</span></div>
      </div>
      <div>
        <div class="cell-meta">Host</div>
        <div class="cell-url">${escapeHtml(host)}</div>
      </div>
      <div>
        <a class="back-btn" href="${escapeHtml(backHref)}">← Back for another</a>
      </div>
    `));
    root.add(head);

    // Verification Form
    const mappingStatus = mapping?.status || 'unchecked';
    const isCandidate = mappingStatus === 'candidate';
    const currentUrl = mapping?.url || '';
    
    let statusClass = 'unknown';
    let statusText = 'Not Verified';
    
    if (mappingStatus === 'verified') {
      statusClass = 'verified';
      statusText = 'Verified';
    } else if (isCandidate) {
      statusClass = 'candidate';
      statusText = 'Candidate Found';
    }

    const form = makeEl(ctx, 'form', null, { method: 'POST', action: './verify' });
    
    // Hidden inputs for context
    form.add(text(ctx, `
      <input type="hidden" name="placeId" value="${place?.place_id}">
      <input type="hidden" name="host" value="${escapeHtml(host)}">
      <input type="hidden" name="pageKind" value="${escapeHtml(modelContext.pageKind || 'country-hub')}">
      
      <!-- Preserve filters on return -->
      <input type="hidden" name="placeKind" value="${escapeHtml(modelContext.placeKind || '')}">
      <input type="hidden" name="placeLimit" value="${modelContext.placeLimit}">
      <input type="hidden" name="hostLimit" value="${modelContext.hostLimit}">
      <input type="hidden" name="q" value="${escapeHtml(modelContext.placeQ || '')}">
      <input type="hidden" name="hostQ" value="${escapeHtml(modelContext.hostQ || '')}">
      <input type="hidden" name="stateFilter" value="${escapeHtml(modelContext.stateFilter || '')}">
      <input type="hidden" name="continent" value="${escapeHtml(modelContext.continent || '')}">
      <input type="hidden" name="parentPlace" value="${escapeHtml(modelContext.parentPlace || '')}">
      <input type="hidden" name="activePattern" value="${escapeHtml(modelContext.activePattern || '')}">
      <input type="hidden" name="matrixMode" value="${escapeHtml(modelContext.matrixMode || '')}">
      <input type="hidden" name="matrixThreshold" value="${escapeHtml(modelContext.matrixThreshold || '')}">
    `));

    const card = makeEl(ctx, 'div', `status-card ${statusClass}`);
    card.add(text(ctx, `<div style="margin-bottom:10px; font-weight:bold">${statusText}</div>`));
    
    if (mapping?.evidence) {
      const ev = typeof mapping.evidence === 'string' ? JSON.parse(mapping.evidence) : mapping.evidence;
      if (ev) {
        card.add(text(ctx, `<div style="font-size:12px; font-family:var(--mono); white-space:pre-wrap; color:var(--muted)">${escapeHtml(JSON.stringify(ev, null, 2))}</div>`));
      }
    }
    
    form.add(card);

    form.add(text(ctx, `
      <div class="form-group">
        <label class="label">Hub URL</label>
        <input class="input" type="text" name="url" value="${escapeHtml(currentUrl)}" placeholder="https://${escapeHtml(host)}/...">
      </div>
      
      <div class="form-group">
        <label class="label">Notes / Evidence</label>
        <textarea class="textarea" name="note" placeholder="Any specific notes about this verification..."></textarea>
      </div>

      <div class="actions">
        <button type="submit" name="outcome" value="present" class="btn btn-present">✅ Mark Present</button>
        <button type="submit" name="outcome" value="absent" class="btn btn-absent">❌ Mark Absent</button>
      </div>
    `));

    root.add(form);

    // Article Metrics Card (if available)
    const articleMetrics = model.articleMetrics;
    if (articleMetrics && articleMetrics.article_count > 0) {
      const metricsCard = makeEl(ctx, 'div', 'metrics-card');
      metricsCard.dom.attributes['data-testid'] = 'article-metrics';
      
      const earliestDate = articleMetrics.earliest_article 
        ? articleMetrics.earliest_article.slice(0, 10) 
        : 'N/A';
      const latestDate = articleMetrics.latest_article 
        ? articleMetrics.latest_article.slice(0, 10) 
        : 'N/A';
      
      metricsCard.add(text(ctx, `
        <div class="metrics-title">📊 Article Metrics</div>
        <div class="metrics-grid">
          <div class="metric-item">
            <div class="metric-value">${articleMetrics.article_count}</div>
            <div class="metric-label">Articles</div>
          </div>
          <div class="metric-item">
            <div class="metric-value">${articleMetrics.days_span || 0}</div>
            <div class="metric-label">Days Span</div>
          </div>
          <div class="metric-item">
            <div class="metric-value" style="font-size:14px">${earliestDate}</div>
            <div class="metric-label">Earliest</div>
          </div>
          <div class="metric-item">
            <div class="metric-value" style="font-size:14px">${latestDate}</div>
            <div class="metric-label">Latest</div>
          </div>
        </div>
      `));
      root.add(metricsCard);
    }

    // Recent Articles List (if available)
    const recentArticles = model.recentArticles || [];
    if (recentArticles.length > 0) {
      const articlesCard = makeEl(ctx, 'div', 'articles-card');
      articlesCard.dom.attributes['data-testid'] = 'recent-articles';
      
      let articlesHtml = '<div class="articles-title">📰 Recent Articles</div><ul class="article-list">';
      for (const article of recentArticles) {
        const title = article.title || article.url?.split('/').pop() || 'Untitled';
        const date = article.fetched_at ? article.fetched_at.slice(0, 10) : '';
        articlesHtml += `
          <li class="article-item">
            <a class="article-link" href="${escapeHtml(article.url)}" target="_blank" rel="noopener">
              ${escapeHtml(title.slice(0, 80))}${title.length > 80 ? '…' : ''}
            </a>
            <span class="article-date">${date}</span>
          </li>
        `;
      }
      articlesHtml += '</ul>';
      articlesCard.add(text(ctx, articlesHtml));
      root.add(articlesCard);
    } else if (articleMetrics && articleMetrics.article_count === 0) {
      const noArticles = makeEl(ctx, 'div', 'articles-card');
      noArticles.add(text(ctx, '<div class="no-articles">No articles found matching this hub pattern.</div>'));
      root.add(noArticles);
    }

    // Place Name Variants Section (NEW)
    const placeNameVariants = model.placeNameVariants || [];
    if (placeNameVariants.length > 0) {
      const namesCard = makeEl(ctx, 'div', 'names-card');
      namesCard.dom.attributes['data-testid'] = 'place-name-variants';
      
      let namesHtml = '<div class="names-title">🌐 Place Name Variants</div>';
      namesHtml += '<table class="names-table"><thead><tr><th>Name</th><th>Lang</th><th>Kind</th><th>Flags</th></tr></thead><tbody>';
      
      for (const nameVar of placeNameVariants.slice(0, 20)) {
        const flags = [];
        if (nameVar.is_preferred) flags.push('⭐ preferred');
        if (nameVar.is_official) flags.push('🔷 official');
        
        namesHtml += `
          <tr>
            <td class="name-value">${escapeHtml(nameVar.name)}</td>
            <td class="name-lang">${escapeHtml(nameVar.lang || '-')}</td>
            <td class="name-kind">${escapeHtml(nameVar.name_kind || '-')}</td>
            <td class="name-flags">${flags.join(', ') || '-'}</td>
          </tr>
        `;
      }
      
      namesHtml += '</tbody></table>';
      if (placeNameVariants.length > 20) {
        namesHtml += `<div class="more-indicator">+ ${placeNameVariants.length - 20} more variants...</div>`;
      }
      
      namesCard.add(text(ctx, namesHtml));
      root.add(namesCard);
    }

    // URL Patterns Section (NEW)
    const urlPatterns = model.urlPatterns || [];
    if (urlPatterns.length > 0) {
      const patternsCard = makeEl(ctx, 'div', 'patterns-card');
      patternsCard.dom.attributes['data-testid'] = 'url-patterns';
      
      let patternsHtml = '<div class="patterns-title">🔗 Possible URL Patterns</div>';
      patternsHtml += '<ul class="patterns-list" id="patternsList">';
      
      for (let i = 0; i < urlPatterns.length; i++) {
        const pattern = urlPatterns[i];
        patternsHtml += `
          <li class="pattern-item" data-pattern-idx="${i}" data-pattern-url="${escapeHtml(pattern.example)}">
            <span class="pattern-status unchecked" id="patternStatus${i}">○</span>
            <code class="pattern-code">${escapeHtml(pattern.pattern)}</code>
            <span class="pattern-desc">${escapeHtml(pattern.description)}</span>
            <a class="pattern-link" href="${escapeHtml(pattern.example)}" target="_blank" rel="noopener">Try →</a>
            <button type="button" class="hub-check-btn" id="checkBtn${i}" style="padding:4px 8px;font-size:11px" onclick="checkSinglePattern(${i}, '${escapeHtml(pattern.example)}')">🔍 Check</button>
          </li>
        `;
      }
      
      patternsHtml += '</ul>';
      
      // Bulk check controls
      patternsHtml += `
        <div class="bulk-check-controls">
          <button type="button" class="hub-check-btn" id="bulkCheckBtn" onclick="checkAllPatterns()">🔍 Check All Patterns</button>
          <button type="button" class="hub-check-btn" id="stopBulkBtn" style="background:#ef4444;display:none" onclick="stopBulkCheck()">⏹ Stop</button>
        </div>
        <div class="bulk-check-progress" id="bulkProgress"></div>
      `;
      
      patternsCard.add(text(ctx, patternsHtml));
      root.add(patternsCard);
    }

    // Hub Check Section (interactive URL probe)
    const hubCheckCard = makeEl(ctx, 'div', 'hub-check-card');
    hubCheckCard.dom.attributes['data-testid'] = 'hub-check';
    
    hubCheckCard.add(text(ctx, `
      <div class="hub-check-title">🔍 Check Hub URL</div>
      <div class="hub-check-form">
        <input type="text" id="hubCheckUrl" class="hub-check-input" placeholder="https://${escapeHtml(host)}/..." value="">
        <button type="button" class="hub-check-btn" onclick="checkHubUrl(document.getElementById('hubCheckUrl').value)">Check URL</button>
      </div>
      <div id="hubCheckResult" class="hub-check-result"></div>
      <script>
        // Pattern check state
        let bulkCheckRunning = false;
        let bulkCheckAborted = false;
        let patternResults = {};
        
        async function checkHubUrl(url) {
          if (!url) return null;
          const resultEl = document.getElementById('hubCheckResult');
          resultEl.className = 'hub-check-result pending';
          resultEl.style.display = 'block';
          resultEl.textContent = '⏳ Checking...';
          
          try {
            const resp = await fetch('./api/probe-hub', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url })
            });
            const data = await resp.json();
            
            if (data.exists) {
              resultEl.className = 'hub-check-result success';
              resultEl.innerHTML = '✅ <strong>Found!</strong> Status: ' + data.status + ' ' + (data.statusText || '') + 
                (data.redirected ? ' (redirected to ' + data.finalUrl + ')' : '') +
                '<br>Content-Type: ' + (data.contentType || 'unknown') +
                '<button class="use-url-btn" onclick="useFoundUrl(\\'' + (data.finalUrl || url).replace(/'/g, "\\\\'") + '\\')">Use this URL ↑</button>';
              return { success: true, data };
            } else {
              resultEl.className = 'hub-check-result failure';
              resultEl.innerHTML = '❌ <strong>Not Found</strong> Status: ' + data.status + ' ' + (data.error || data.statusText || '');
              return { success: false, data };
            }
          } catch (err) {
            resultEl.className = 'hub-check-result failure';
            resultEl.textContent = '❌ Error: ' + err.message;
            return { success: false, error: err.message };
          }
        }
        
        function useFoundUrl(url) {
          const urlInput = document.querySelector('input[name="url"]');
          if (urlInput) {
            urlInput.value = url;
            urlInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            urlInput.focus();
            urlInput.style.outline = '2px solid #10b981';
            setTimeout(() => { urlInput.style.outline = ''; }, 2000);
          }
        }
        
        async function checkSinglePattern(idx, url) {
          const statusEl = document.getElementById('patternStatus' + idx);
          const btn = document.getElementById('checkBtn' + idx);
          
          statusEl.className = 'pattern-status pending';
          statusEl.textContent = '⏳';
          btn.classList.add('checking');
          btn.disabled = true;
          
          try {
            const resp = await fetch('./api/probe-hub', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url })
            });
            const data = await resp.json();
            patternResults[idx] = data;
            
            if (data.exists) {
              statusEl.className = 'pattern-status success';
              statusEl.textContent = '✓';
              btn.textContent = '✓ Found';
              btn.style.background = '#10b981';
              
              // Add "Use" button after the check button
              const useBtn = document.createElement('button');
              useBtn.className = 'use-url-btn';
              useBtn.textContent = 'Use ↑';
              useBtn.onclick = () => useFoundUrl(data.finalUrl || url);
              btn.parentNode.insertBefore(useBtn, btn.nextSibling);
            } else {
              statusEl.className = 'pattern-status failure';
              statusEl.textContent = '✗';
              btn.textContent = '✗ ' + data.status;
              btn.style.background = '#ef4444';
            }
          } catch (err) {
            statusEl.className = 'pattern-status failure';
            statusEl.textContent = '!';
            btn.textContent = '! Error';
            btn.style.background = '#ef4444';
          }
          
          btn.classList.remove('checking');
          btn.disabled = false;
        }
        
        async function checkAllPatterns() {
          const items = document.querySelectorAll('#patternsList .pattern-item');
          if (items.length === 0) return;
          
          bulkCheckRunning = true;
          bulkCheckAborted = false;
          
          const bulkBtn = document.getElementById('bulkCheckBtn');
          const stopBtn = document.getElementById('stopBulkBtn');
          const progressEl = document.getElementById('bulkProgress');
          
          bulkBtn.style.display = 'none';
          stopBtn.style.display = 'block';
          progressEl.classList.add('active');
          
          let checked = 0, found = 0, notFound = 0;
          
          for (let i = 0; i < items.length; i++) {
            if (bulkCheckAborted) break;
            
            const item = items[i];
            const url = item.dataset.patternUrl;
            const idx = parseInt(item.dataset.patternIdx, 10);
            
            progressEl.textContent = 'Checking ' + (i + 1) + ' of ' + items.length + '... (Found: ' + found + ', Not found: ' + notFound + ')';
            
            await checkSinglePattern(idx, url);
            checked++;
            
            if (patternResults[idx]?.exists) {
              found++;
            } else {
              notFound++;
            }
            
            // Small delay between checks to be polite
            await new Promise(r => setTimeout(r, 300));
          }
          
          bulkCheckRunning = false;
          bulkBtn.style.display = 'block';
          stopBtn.style.display = 'none';
          
          if (bulkCheckAborted) {
            progressEl.textContent = '⏹ Stopped. Checked ' + checked + ' of ' + items.length + '. Found: ' + found + ', Not found: ' + notFound;
          } else {
            progressEl.textContent = '✓ Complete! Found: ' + found + ', Not found: ' + notFound;
            if (found > 0) {
              progressEl.textContent += ' — Click "Use ↑" on a found pattern to populate the URL field.';
            }
          }
        }
        
        function stopBulkCheck() {
          bulkCheckAborted = true;
        }
      </script>
    `));
    root.add(hubCheckCard);

    // Host Patterns Section (discovered from existing URLs)
    const hostPatterns = model.hostPatterns || [];
    if (hostPatterns.length > 0) {
      const hostPatternsCard = makeEl(ctx, 'div', 'host-patterns-card');
      hostPatternsCard.dom.attributes['data-testid'] = 'host-patterns';
      
      let hostHtml = '<div class="patterns-title">📁 Discovered URL Patterns for This Host</div>';
      hostHtml += '<table class="host-patterns-table"><thead><tr><th>Pattern</th><th>Count</th><th>Example</th></tr></thead><tbody>';
      
      for (const hp of hostPatterns.slice(0, 10)) {
        hostHtml += `
          <tr>
            <td class="hp-pattern"><code>${escapeHtml(hp.pattern_prefix || '-')}</code></td>
            <td class="hp-count">${hp.count}</td>
            <td class="hp-example"><a href="${escapeHtml(hp.example_url || '#')}" target="_blank" rel="noopener">View</a></td>
          </tr>
        `;
      }
      
      hostHtml += '</tbody></table>';
      hostPatternsCard.add(text(ctx, hostHtml));
      root.add(hostPatternsCard);
    }

    // Host Eligibility / Crawl Status (for hosts needing more pages)
    const hostEligibility = model.hostEligibility;
    if (hostEligibility) {
      const eligibilityCard = makeEl(ctx, 'div', 'eligibility-card');
      eligibilityCard.dom.attributes['data-testid'] = 'host-eligibility';
      eligibilityCard.dom.attributes['data-host'] = hostEligibility.host || '';
      eligibilityCard.dom.attributes['data-eligible'] = hostEligibility.isEligible ? 'true' : 'false';
      
      const eligibilityClass = hostEligibility.isEligible 
        ? 'eligibility-ok' 
        : 'eligibility-needs-crawl';
      const eligibilityIcon = hostEligibility.isEligible ? '✅' : '📊';
      
      const pageCountFormatted = (hostEligibility.pageCount || 0).toLocaleString();
      const thresholdFormatted = (hostEligibility.threshold || 500).toLocaleString();
      const pagesNeededFormatted = (hostEligibility.pagesNeeded || 0).toLocaleString();
      
      const statusText = hostEligibility.isEligible
        ? `Ready for pattern analysis (${pageCountFormatted} pages)`
        : `Needs ${pagesNeededFormatted} more pages for pattern analysis`;
      
      // Generate crawl button HTML if not eligible
      const crawlButtonHtml = hostEligibility.isEligible ? '' : `
        <div class="crawl-action-row">
          <button type="button" 
                  class="btn btn-crawl" 
                  id="startCrawlBtn"
                  data-host="${escapeHtml(hostEligibility.host)}"
                  data-target="${hostEligibility.target || 600}">
            🕷️ Crawl to ${(hostEligibility.target || 600).toLocaleString()} pages
          </button>
          <span id="crawlStatus" class="crawl-status"></span>
        </div>
      `;
      
      eligibilityCard.add(text(ctx, `
        <div class="eligibility-title">${eligibilityIcon} Host Crawl Status</div>
        <div class="eligibility-content ${eligibilityClass}">
          <div class="eligibility-row">
            <span class="eligibility-label">Current Pages:</span>
            <span class="eligibility-value">${pageCountFormatted}</span>
          </div>
          <div class="eligibility-row">
            <span class="eligibility-label">Threshold:</span>
            <span class="eligibility-value">${thresholdFormatted} pages</span>
          </div>
          <div class="eligibility-row">
            <span class="eligibility-label">Status:</span>
            <span class="eligibility-value">${statusText}</span>
          </div>
          ${crawlButtonHtml}
        </div>
      `));
      
      // Add crawl button script if not eligible
      if (!hostEligibility.isEligible) {
        const crawlScript = makeEl(ctx, 'script');
        crawlScript.add(text(ctx, `
(function() {
  const startBtn = document.getElementById('startCrawlBtn');
  const statusEl = document.getElementById('crawlStatus');
  
  if (startBtn) {
    startBtn.addEventListener('click', async function() {
      const host = this.dataset.host;
      const target = parseInt(this.dataset.target, 10) || 600;
      
      startBtn.disabled = true;
      startBtn.textContent = '⏳ Starting crawl...';
      statusEl.textContent = '';
      
      try {
        const resp = await fetch('./api/hosts/' + encodeURIComponent(host) + '/prepare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target })
        });
        
        const data = await resp.json();
        
        if (data.error) {
          statusEl.textContent = '❌ ' + data.error;
          startBtn.disabled = false;
          startBtn.textContent = '🕷️ Retry Crawl';
        } else if (data.skipped) {
          statusEl.textContent = '✅ Already eligible! ' + data.message;
          startBtn.style.display = 'none';
          // Refresh the page to show updated status
          setTimeout(() => location.reload(), 1500);
        } else {
          statusEl.textContent = '🚀 ' + (data.message || 'Crawl started');
          startBtn.textContent = '⏳ Crawling...';
          
          // Poll for status
          const pollStatus = setInterval(async () => {
            try {
              const statusResp = await fetch('./api/hosts/' + encodeURIComponent(host) + '/status');
              const statusData = await statusResp.json();
              
              if (statusData.activeCrawl) {
                statusEl.textContent = '🕷️ Crawling... (' + statusData.pageCount + ' pages)';
              } else if (statusData.is_eligible) {
                clearInterval(pollStatus);
                statusEl.textContent = '✅ Ready! Reloading...';
                setTimeout(() => location.reload(), 1000);
              }
            } catch (e) {
              console.error('Poll error:', e);
            }
          }, 3000);
          
          // Stop polling after 5 minutes
          setTimeout(() => clearInterval(pollStatus), 5 * 60 * 1000);
        }
      } catch (err) {
        statusEl.textContent = '❌ Error: ' + err.message;
        startBtn.disabled = false;
        startBtn.textContent = '🕷️ Retry Crawl';
      }
    });
  }
})();
        `));
        eligibilityCard.add(crawlScript);
      }
      
      root.add(eligibilityCard);
    }

    // Analysis Freshness Indicator (NEW)
    const analysisFreshness = model.analysisFreshness;
    if (analysisFreshness) {
      const freshnessCard = makeEl(ctx, 'div', 'freshness-card');
      freshnessCard.dom.attributes['data-testid'] = 'analysis-freshness';
      
      let freshnessClass = 'freshness-unknown';
      let freshnessIcon = '⚪';
      
      if (analysisFreshness.daysAgo !== null) {
        if (analysisFreshness.daysAgo <= 7) {
          freshnessClass = 'freshness-fresh';
          freshnessIcon = '🟢';
        } else if (analysisFreshness.daysAgo <= 30) {
          freshnessClass = 'freshness-stale';
          freshnessIcon = '🟡';
        } else {
          freshnessClass = 'freshness-old';
          freshnessIcon = '🔴';
        }
      }
      
      const lastAnalyzedLabel = analysisFreshness.lastAnalyzedAt 
        ? analysisFreshness.lastAnalyzedAt.slice(0, 10) 
        : 'Never';
      const daysLabel = analysisFreshness.daysAgo !== null 
        ? `${analysisFreshness.daysAgo} days ago` 
        : 'Unknown';
      
      freshnessCard.add(text(ctx, `
        <div class="freshness-title">${freshnessIcon} Analysis Freshness</div>
        <div class="freshness-content ${freshnessClass}">
          <div class="freshness-row">
            <span class="freshness-label">Last Analyzed:</span>
            <span class="freshness-value">${lastAnalyzedLabel}</span>
          </div>
          <div class="freshness-row">
            <span class="freshness-label">Time Ago:</span>
            <span class="freshness-value">${daysLabel}</span>
          </div>
          <div class="freshness-row">
            <span class="freshness-label">Articles Analyzed:</span>
            <span class="freshness-value">${analysisFreshness.articleCount}</span>
          </div>
        </div>
      `));
      root.add(freshnessCard);
    }

    this.mainContainer.add(root);
  }
}

module.exports = {
  PlaceHubGuessingCellControl
};
