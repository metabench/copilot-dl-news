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
    if (modelContext.placeQ) params.set('placeQ', modelContext.placeQ);
    if (modelContext.hostQ) params.set('hostQ', modelContext.hostQ);
    const backHref = `./?${params.toString()}`;

    const root = makeEl(ctx, 'div', 'page', { 'data-testid': 'place-hub-guessing-cell' });

    const styleEl = makeEl(ctx, 'style');
    styleEl.add(
      text(
        ctx,
        `
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
}
.status-card.verified { background: rgba(16,185,129,0.1); border-color: rgba(16,185,129,0.3); }
.status-card.candidate { background: rgba(251,191,36,0.1); border-color: rgba(251,191,36,0.3); }
.status-card.unknown { background: rgba(55,65,81,0.5); border-color: var(--border); }

.form-group { margin-bottom: 15px; }
.label { display: block; margin-bottom: 5px; font-size: 14px; color: var(--muted); }
.input { 
  width: 100%; 
  padding: 8px 10px; 
  background: rgba(0,0,0,0.2); 
  border: 1px solid var(--border); 
  border-radius: 4px; 
  color: var(--text);
  font-family: var(--mono);
}
.textarea {
  width: 100%;
  padding: 8px 10px;
  background: rgba(0,0,0,0.2); 
  border: 1px solid var(--border); 
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
      <input type="hidden" name="placeQ" value="${escapeHtml(modelContext.placeQ || '')}">
      <input type="hidden" name="hostQ" value="${escapeHtml(modelContext.hostQ || '')}">
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
    this.mainContainer.add(root);
  }
}

module.exports = {
  PlaceHubGuessingCellControl
};
