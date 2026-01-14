'use strict';

const jsgui = require('jsgui3-html');
const { addText, makeTextEl, makeTd, makeTh, makeButton, makeLink } = require('../../shared/utils/jsgui3Helpers');

class TaskDetailControl extends jsgui.Control {
  constructor(spec) {
    super(spec);
    this._taskId = spec.taskId;
    this._summary = spec.summary || {};
    this._events = spec.events || [];
    this._problems = spec.problems || [];
    this._timeline = spec.timeline || [];
    this._pageInfo = spec.pageInfo || null;
    this._basePath = spec.basePath ? String(spec.basePath) : '';
  }

  _withBasePath(routePath) {
    const base = this._basePath;
    const p = routePath ? String(routePath) : '';
    if (!base) return p;
    if (p === '/') return base + '/';
    return base + p;
  }

  compose() {
    const container = this.add(new jsgui.Control({
      context: this.context,
      tagName: 'div',
      style: { padding: '16px' }
    }));

    const header = container.add(new jsgui.Control({
      context: this.context,
      tagName: 'div',
      style: { marginBottom: '24px' }
    }));

    const backLink = header.add(makeLink(this.context, '← Back to list', this._withBasePath('/'), {
      marginBottom: '8px', display: 'block'
    }));

    header.add(makeTextEl(this.context, 'h2', `🕷️ ${this._taskId}`));

    this._renderSummary(container);

    if (this._problems.length > 0) {
      this._renderProblems(container);
    }

    if (this._timeline.length > 0) {
      this._renderTimeline(container);
    }

    this._renderLiveControls(container);
    this._renderEvents(container);
    this._renderLiveScript(container);
  }

  _renderLiveControls(container) {
    const maxSeq = Number(this._summary?.max_seq) || 0;

    const panel = container.add(new jsgui.Control({
      context: this.context,
      tagName: 'div',
      attr: {
        id: 'co-live-panel',
        'data-task-id': String(this._taskId),
        'data-max-seq': String(maxSeq),
        'data-base-path': String(this._basePath || '')
      },
      style: {
        marginTop: '24px',
        marginBottom: '16px',
        padding: '12px',
        borderRadius: '8px',
        border: '1px solid #2a3a5a',
        background: '#16213e'
      }
    }));

    panel.add(makeTextEl(this.context, 'h3', '⏯️ Live updates + stop conditions', { style: { margin: '0 0 8px 0' } }));

    panel.add(makeTextEl(this.context, 'div', 'Enable polling for new events. If a new event matches any enabled stop condition, the observer pauses (polling stops) and highlights the triggering event.', { style: { fontSize: '12px', color: '#b9c0d0', marginBottom: '12px', lineHeight: '1.4' } }));

    const statusEl = panel.add(new jsgui.Control({
      context: this.context,
      tagName: 'div',
      attr: { id: 'co-live-status' },
      style: {
        padding: '8px 10px',
        borderRadius: '6px',
        background: '#0f1a33',
        border: '1px solid #223155',
        marginBottom: '12px',
        fontSize: '12px',
        color: '#cfe7ff'
      }
    }));
    addText(this.context, statusEl, 'Live updates are off.');

    const form = panel.add(new jsgui.Control({
      context: this.context,
      tagName: 'div',
      attr: { id: 'co-live-form' },
      style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', alignItems: 'start' }
    }));

    const left = form.add(new jsgui.Control({ context: this.context, tagName: 'div' }));
    const right = form.add(new jsgui.Control({ context: this.context, tagName: 'div' }));

    left.add(makeTextEl(this.context, 'div', 'Stop on severity', { style: { fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: '#d7def0' } }));

    {
      const label = left.add(new jsgui.Control({
        context: this.context,
        tagName: 'label',
        style: { display: 'block', fontSize: '12px', marginBottom: '4px' }
      }));
      label.add(new jsgui.Control({ context: this.context, tagName: 'input', attr: { id: 'co-stop-error', type: 'checkbox' }, style: { marginRight: '6px' } }));
      label.add(new jsgui.Text_Node({ context: this.context, text: 'Stop on errors (severity=error)' }));
    }

    {
      const label = left.add(new jsgui.Control({
        context: this.context,
        tagName: 'label',
        style: { display: 'block', fontSize: '12px', marginBottom: '8px' }
      }));
      label.add(new jsgui.Control({ context: this.context, tagName: 'input', attr: { id: 'co-stop-warn', type: 'checkbox' }, style: { marginRight: '6px' } }));
      label.add(new jsgui.Text_Node({ context: this.context, text: 'Stop on warnings (severity=warn)' }));
    }

    left.add(makeTextEl(this.context, 'div', 'Stop on category', { style: { fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: '#d7def0' } }));

    const categories = ['lifecycle', 'work', 'error', 'metric', 'decision'];
    for (const c of categories) {
      const label = left.add(new jsgui.Control({
        context: this.context,
        tagName: 'label',
        style: { display: 'block', fontSize: '12px', marginBottom: '4px' }
      }));
      label.add(new jsgui.Control({
        context: this.context,
        tagName: 'input',
        attr: { id: `co-stop-cat-${c}`, type: 'checkbox', 'data-cat': c },
        style: { marginRight: '6px' }
      }));
      label.add(new jsgui.Text_Node({ context: this.context, text: `Stop on category: ${c}` }));
    }

    right.add(makeTextEl(this.context, 'div', 'Stop on text match', { style: { fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: '#d7def0' } }));

    {
      const label = right.add(new jsgui.Control({
        context: this.context,
        tagName: 'label',
        style: { display: 'block', fontSize: '12px', marginBottom: '6px' }
      }));
      label.add(new jsgui.Text_Node({ context: this.context, text: 'Event type contains' }));
      label.add(new jsgui.Control({
        context: this.context,
        tagName: 'input',
        attr: { id: 'co-stop-event-type', type: 'text', placeholder: 'e.g. decision, classify, hub' },
        style: { display: 'block', width: '100%', padding: '6px', marginTop: '4px', borderRadius: '4px', border: '1px solid #2a3a5a', background: '#0f1a33', color: '#e6eefc' }
      }));
    }

    {
      const label = right.add(new jsgui.Control({
        context: this.context,
        tagName: 'label',
        style: { display: 'block', fontSize: '12px', marginBottom: '10px' }
      }));
      label.add(new jsgui.Text_Node({ context: this.context, text: 'Scope contains' }));
      label.add(new jsgui.Control({
        context: this.context,
        tagName: 'input',
        attr: { id: 'co-stop-scope', type: 'text', placeholder: 'e.g. domain:example.com' },
        style: { display: 'block', width: '100%', padding: '6px', marginTop: '4px', borderRadius: '4px', border: '1px solid #2a3a5a', background: '#0f1a33', color: '#e6eefc' }
      }));
    }

    right.add(makeTextEl(this.context, 'div', 'Decision matching', { style: { fontSize: '12px', fontWeight: 'bold', marginTop: '14px', marginBottom: '6px', color: '#d7def0' } }));

    {
      const label = right.add(new jsgui.Control({
        context: this.context,
        tagName: 'label',
        style: { display: 'block', fontSize: '12px', marginBottom: '6px' }
      }));
      label.add(new jsgui.Control({
        context: this.context,
        tagName: 'input',
        attr: { id: 'co-stop-every-decision', type: 'checkbox' },
        style: { marginRight: '6px' }
      }));
      label.add(new jsgui.Text_Node({ context: this.context, text: 'Stop on every decision (category=decision or decision-like)' }));
    }

    {
      const label = right.add(new jsgui.Control({
        context: this.context,
        tagName: 'label',
        style: { display: 'block', fontSize: '12px', marginBottom: '6px' }
      }));
      label.add(new jsgui.Text_Node({ context: this.context, text: 'Decision key contains (optional)' }));
      label.add(new jsgui.Control({
        context: this.context,
        tagName: 'input',
        attr: { id: 'co-stop-decision-key', type: 'text', placeholder: 'e.g. chooseHub, classifyTopic, placeHubGuess' },
        style: { display: 'block', width: '100%', padding: '6px', marginTop: '4px', borderRadius: '4px', border: '1px solid #2a3a5a', background: '#0f1a33', color: '#e6eefc' }
      }));
    }

    {
      const label = right.add(new jsgui.Control({
        context: this.context,
        tagName: 'label',
        style: { display: 'block', fontSize: '12px', marginBottom: '6px' }
      }));
      label.add(new jsgui.Text_Node({ context: this.context, text: 'Decision outcome contains (optional)' }));
      label.add(new jsgui.Control({
        context: this.context,
        tagName: 'input',
        attr: { id: 'co-stop-decision-outcome', type: 'text', placeholder: 'e.g. accept, reject, hub:' },
        style: { display: 'block', width: '100%', padding: '6px', marginTop: '4px', borderRadius: '4px', border: '1px solid #2a3a5a', background: '#0f1a33', color: '#e6eefc' }
      }));
    }

    {
      const label = right.add(new jsgui.Control({
        context: this.context,
        tagName: 'label',
        style: { display: 'block', fontSize: '12px', marginBottom: '8px' }
      }));
      label.add(new jsgui.Control({
        context: this.context,
        tagName: 'input',
        attr: { id: 'co-stop-decision-once', type: 'checkbox' },
        style: { marginRight: '6px' }
      }));
      label.add(new jsgui.Text_Node({ context: this.context, text: 'Only stop once per decision key (dedupe)' }));
    }

    const clearBtn = right.add(new jsgui.Control({
      context: this.context,
      tagName: 'button',
      attr: { id: 'co-stop-decision-clear', type: 'button' },
      style: {
        padding: '8px 10px',
        borderRadius: '6px',
        border: '1px solid #2a3a5a',
        background: '#0f1a33',
        color: '#e6eefc',
        cursor: 'pointer',
        fontSize: '12px'
      }
    }));
    addText(this.context, clearBtn, '🧹 Clear seen decisions');

    const controlsRow = panel.add(new jsgui.Control({
      context: this.context,
      tagName: 'div',
      style: { display: 'flex', gap: '8px', marginTop: '10px', alignItems: 'center', flexWrap: 'wrap' }
    }));

    const btnStyle = {
      padding: '8px 10px',
      borderRadius: '6px',
      border: '1px solid #2a3a5a',
      background: '#0f1a33',
      color: '#e6eefc',
      cursor: 'pointer',
      fontSize: '12px'
    };

    const startBtn = controlsRow.add(new jsgui.Control({ context: this.context, tagName: 'button', attr: { id: 'co-live-start', type: 'button' }, style: btnStyle }));
    addText(this.context, startBtn, '▶ Start live');
    const pauseBtn = controlsRow.add(new jsgui.Control({ context: this.context, tagName: 'button', attr: { id: 'co-live-pause', type: 'button' }, style: btnStyle }));
    addText(this.context, pauseBtn, '⏸ Pause');
    const pollBtn = controlsRow.add(new jsgui.Control({ context: this.context, tagName: 'button', attr: { id: 'co-live-poll', type: 'button' }, style: btnStyle }));
    addText(this.context, pollBtn, '🔄 Poll now');

    {
      const label = controlsRow.add(new jsgui.Control({
        context: this.context,
        tagName: 'label',
        style: { display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto', fontSize: '12px', color: '#d7def0' }
      }));
      label.add(new jsgui.Control({
        context: this.context,
        tagName: 'input',
        attr: { id: 'co-live-interval', type: 'number', min: '200', step: '100' },
        style: { width: '90px', padding: '6px', borderRadius: '4px', border: '1px solid #2a3a5a', background: '#0f1a33', color: '#e6eefc' }
      }));
      label.add(new jsgui.Text_Node({ context: this.context, text: 'Poll ms' }));
    }
  }

  _renderLiveScript(container) {
    const script = container.add(new jsgui.Control({ context: this.context, tagName: 'script' }));
    script.add(new jsgui.Text_Node({
      context: this.context,
      text: `
(function(){
  const panel = document.getElementById('co-live-panel');
  if (!panel) return;

  const taskId = panel.getAttribute('data-task-id');
  let lastSeq = Number(panel.getAttribute('data-max-seq') || '0') || 0;
  const basePath = String(panel.getAttribute('data-base-path') || '');

  function withBasePath(p) {
    const route = String(p || '');
    if (!basePath) return route;
    if (route === '/') return basePath + '/';
    return basePath + route;
  }

  const statusEl = document.getElementById('co-live-status');
  const startBtn = document.getElementById('co-live-start');
  const pauseBtn = document.getElementById('co-live-pause');
  const pollBtn = document.getElementById('co-live-poll');
  const intervalInput = document.getElementById('co-live-interval');

  const stopError = document.getElementById('co-stop-error');
  const stopWarn = document.getElementById('co-stop-warn');
  const stopEventType = document.getElementById('co-stop-event-type');
  const stopScope = document.getElementById('co-stop-scope');
  const stopCats = Array.from(panel.querySelectorAll('input[data-cat]'));
  const stopEveryDecision = document.getElementById('co-stop-every-decision');
  const stopDecisionKey = document.getElementById('co-stop-decision-key');
  const stopDecisionOutcome = document.getElementById('co-stop-decision-outcome');
  const stopDecisionOnce = document.getElementById('co-stop-decision-once');
  const stopDecisionClear = document.getElementById('co-stop-decision-clear');

  const tbody = document.getElementById('co-events-tbody');
  if (!tbody) return;

  const storageKey = 'co-live:' + taskId;
  const defaultConfig = {
    enabled: false,
    intervalMs: 1000,
    stopOnError: true,
    stopOnWarn: false,
    stopCategories: ['decision'],
    eventTypeContains: 'decision',
    scopeContains: '',
    stopOnEveryDecision: true,
    decisionKeyContains: '',
    decisionOutcomeContains: '',
    stopOncePerDecisionKey: false
  };

  function loadConfig() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return { ...defaultConfig };
      const parsed = JSON.parse(raw);
      return { ...defaultConfig, ...parsed };
    } catch {
      return { ...defaultConfig };
    }
  }

  function saveConfig(cfg) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(cfg));
    } catch {
      // ignore
    }
  }

  function readConfigFromForm(existing) {
    const selectedCats = stopCats.filter(i => i.checked).map(i => i.getAttribute('data-cat'));
    return {
      ...existing,
      intervalMs: Math.max(200, Number(intervalInput.value || 1000) || 1000),
      stopOnError: !!stopError.checked,
      stopOnWarn: !!stopWarn.checked,
      stopCategories: selectedCats,
      eventTypeContains: String(stopEventType.value || '').trim(),
      scopeContains: String(stopScope.value || '').trim(),
      stopOnEveryDecision: !!(stopEveryDecision && stopEveryDecision.checked),
      decisionKeyContains: String(stopDecisionKey ? stopDecisionKey.value : '').trim(),
      decisionOutcomeContains: String(stopDecisionOutcome ? stopDecisionOutcome.value : '').trim(),
      stopOncePerDecisionKey: !!(stopDecisionOnce && stopDecisionOnce.checked)
    };
  }

  function applyConfigToForm(cfg) {
    intervalInput.value = String(cfg.intervalMs || 1000);
    stopError.checked = !!cfg.stopOnError;
    stopWarn.checked = !!cfg.stopOnWarn;
    stopEventType.value = cfg.eventTypeContains || '';
    stopScope.value = cfg.scopeContains || '';
    if (stopEveryDecision) stopEveryDecision.checked = !!cfg.stopOnEveryDecision;
    if (stopDecisionKey) stopDecisionKey.value = cfg.decisionKeyContains || '';
    if (stopDecisionOutcome) stopDecisionOutcome.value = cfg.decisionOutcomeContains || '';
    if (stopDecisionOnce) stopDecisionOnce.checked = !!cfg.stopOncePerDecisionKey;
    const catSet = new Set(cfg.stopCategories || []);
    stopCats.forEach(i => { i.checked = catSet.has(i.getAttribute('data-cat')); });
  }

  function setStatus(text, kind) {
    if (!statusEl) return;
    statusEl.textContent = text;
    if (kind === 'paused') {
      statusEl.style.borderColor = '#e1b64a';
      statusEl.style.color = '#ffe8b3';
      statusEl.style.background = '#2a220f';
    } else if (kind === 'running') {
      statusEl.style.borderColor = '#2f8f6b';
      statusEl.style.color = '#c8ffe8';
      statusEl.style.background = '#0f2a1e';
    } else {
      statusEl.style.borderColor = '#223155';
      statusEl.style.color = '#cfe7ff';
      statusEl.style.background = '#0f1a33';
    }
  }

  let cfg = loadConfig();
  applyConfigToForm(cfg);
  setStatus(cfg.enabled ? 'Live updates are on.' : 'Live updates are off.');

  function onFormChange() {
    cfg = readConfigFromForm(cfg);
    saveConfig(cfg);
  }

  [stopError, stopWarn, stopEventType, stopScope, intervalInput, stopEveryDecision, stopDecisionKey, stopDecisionOutcome, stopDecisionOnce, ...stopCats].forEach(el => {
    if (!el) return;
    el.addEventListener('change', onFormChange);
    el.addEventListener('input', onFormChange);
  });

  const seenDecisionKeys = new Set();
  if (stopDecisionClear) {
    stopDecisionClear.addEventListener('click', () => {
      seenDecisionKeys.clear();
      setStatus('Cleared seen decisions (still ' + (cfg.enabled ? 'running' : 'paused') + ').', cfg.enabled ? 'running' : 'paused');
    });
  }

  function safeLower(s) {
    return String(s || '').toLowerCase();
  }

  function tryParseJson(text) {
    if (!text) return null;
    if (typeof text !== 'string') return null;
    const trimmed = text.trim();
    if (!trimmed) return null;
    if (trimmed[0] !== '{' && trimmed[0] !== '[') return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }

  function extractDecisionInfo(event) {
    const payloadText = event && event.payload ? String(event.payload) : '';
    const payload = tryParseJson(payloadText);
    const candidates = payload && typeof payload === 'object' ? payload : null;

    const decisionKey = candidates ? (
      candidates.decisionKey ??
      candidates.decision_id ??
      candidates.decisionId ??
      candidates.rule ??
      candidates.node ??
      candidates.name ??
      candidates.decision
    ) : null;

    const outcome = candidates ? (
      candidates.outcome ??
      candidates.result ??
      candidates.value ??
      candidates.choice ??
      candidates.decisionOutcome
    ) : null;

    return {
      payloadText,
      decisionKey: decisionKey == null ? '' : String(decisionKey),
      outcome: outcome == null ? '' : String(outcome)
    };
  }

  function eventMatchesStopRules(event) {
    const severity = safeLower(event.severity);
    const category = safeLower(event.event_category);
    const type = safeLower(event.event_type);
    const scope = safeLower(event.scope);
    const decisionInfo = extractDecisionInfo(event);
    const decisionKeyLower = safeLower(decisionInfo.decisionKey);
    const decisionOutcomeLower = safeLower(decisionInfo.outcome);
    const payloadLower = safeLower(decisionInfo.payloadText);

    if (cfg.stopOnError && severity === 'error') return { hit: true, why: 'severity=error' };
    if (cfg.stopOnWarn && severity === 'warn') return { hit: true, why: 'severity=warn' };

    if (cfg.stopOnEveryDecision || cfg.decisionKeyContains || cfg.decisionOutcomeContains) {
      const isDecisionLike = (
        category === 'decision' ||
        type.includes('decision') ||
        scope.includes('decision') ||
        !!decisionKeyLower
      );

      if (isDecisionLike) {
        if (cfg.decisionKeyContains) {
          const q = safeLower(cfg.decisionKeyContains);
          if (q && !(decisionKeyLower.includes(q) || payloadLower.includes(q) || type.includes(q))) {
            // Decision-like, but not the specific decision asked for.
          } else {
            if (cfg.stopOncePerDecisionKey && decisionKeyLower) {
              if (seenDecisionKeys.has(decisionKeyLower)) return { hit: false, why: '' };
              seenDecisionKeys.add(decisionKeyLower);
            }
            return { hit: true, why: 'decision key match' + (decisionKeyLower ? ' (' + decisionInfo.decisionKey + ')' : '') };
          }
        }

        if (cfg.decisionOutcomeContains) {
          const q = safeLower(cfg.decisionOutcomeContains);
          if (q && !(decisionOutcomeLower.includes(q) || payloadLower.includes(q))) {
            // not this outcome
          } else {
            if (cfg.stopOncePerDecisionKey && decisionKeyLower) {
              if (seenDecisionKeys.has(decisionKeyLower)) return { hit: false, why: '' };
              seenDecisionKeys.add(decisionKeyLower);
            }
            return { hit: true, why: 'decision outcome match' + (decisionOutcomeLower ? ' (' + decisionInfo.outcome + ')' : '') };
          }
        }

        if (cfg.stopOnEveryDecision) {
          if (cfg.stopOncePerDecisionKey && decisionKeyLower) {
            if (seenDecisionKeys.has(decisionKeyLower)) return { hit: false, why: '' };
            seenDecisionKeys.add(decisionKeyLower);
          }
          return { hit: true, why: 'decision' + (decisionKeyLower ? ' (' + decisionInfo.decisionKey + ')' : '') };
        }
      }
    }

    if (Array.isArray(cfg.stopCategories) && cfg.stopCategories.length > 0) {
      const cats = new Set(cfg.stopCategories.map(c => String(c || '').toLowerCase()));
      if (category && cats.has(category)) return { hit: true, why: 'category=' + category };
      if (cats.has('decision') && (type.includes('decision') || scope.includes('decision'))) {
        return { hit: true, why: 'decision-like event' };
      }
    }

    if (cfg.eventTypeContains) {
      const q = String(cfg.eventTypeContains).toLowerCase();
      if (q && type.includes(q)) return { hit: true, why: 'event_type contains "' + cfg.eventTypeContains + '"' };
    }
    if (cfg.scopeContains) {
      const q = String(cfg.scopeContains).toLowerCase();
      if (q && scope.includes(q)) return { hit: true, why: 'scope contains "' + cfg.scopeContains + '"' };
    }
    return { hit: false, why: '' };
  }

  function renderEventRow(event) {
    const tr = document.createElement('tr');
    tr.dataset.seq = String(event.seq ?? '');
    tr.dataset.eventType = String(event.event_type ?? '');
    tr.dataset.eventCategory = String(event.event_category ?? '');
    tr.dataset.severity = String(event.severity ?? '');
    tr.dataset.scope = String(event.scope ?? '');

    const severity = (event.severity || '').toLowerCase();
    if (severity === 'error') tr.style.background = '#fff0f0';
    else if (severity === 'warn') tr.style.background = '#fffbe6';

    function td(text, style) {
      const cell = document.createElement('td');
      cell.style.padding = '6px';
      cell.style.borderBottom = '1px solid #eee';
      if (style) Object.assign(cell.style, style);
      cell.textContent = text;
      return cell;
    }

    const ts = event.ts ? new Date(event.ts).toLocaleTimeString() : '-';
    const icon = severity === 'error' ? '❌' : severity === 'warn' ? '⚠️' : '';
    const scopeText = event.scope ? (event.scope.length > 25 ? event.scope.slice(0, 22) + '...' : event.scope) : '-';
    const targetText = event.target ? (event.target.length > 40 ? event.target.slice(0, 37) + '...' : event.target) : '-';
    let dur = '-';
    if (event.duration_ms) {
      dur = event.duration_ms < 1000 ? event.duration_ms + 'ms' : (event.duration_ms / 1000).toFixed(1) + 's';
    }

    tr.appendChild(td(String(event.seq ?? '')));
    tr.appendChild(td(ts, { fontSize: '11px' }));
    tr.appendChild(td(String(event.event_type ?? '')));
    tr.appendChild(td(icon));
    tr.appendChild(td(scopeText, { fontSize: '11px' }));
    tr.appendChild(td(targetText, { fontSize: '11px' }));
    tr.appendChild(td(dur));

    return tr;
  }

  let timer = null;
  let paused = false;

  function stopLive(reason) {
    cfg.enabled = false;
    paused = true;
    saveConfig(cfg);
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    setStatus('Paused: ' + reason, 'paused');
  }

  async function pollOnce() {
    if (!cfg.enabled) return;
    try {
      const needsPayload = !!(cfg.stopOnEveryDecision || cfg.decisionKeyContains || cfg.decisionOutcomeContains || cfg.stopOncePerDecisionKey);
      const url = withBasePath('/api/task/' + encodeURIComponent(taskId)
        + '/events?sinceSeq=' + encodeURIComponent(String(lastSeq))
        + '&limit=200'
        + '&includePayload=' + (needsPayload ? '1' : '0'));
      const res = await fetch(url, { headers: { 'accept': 'application/json' } });
      if (!res.ok) return;
      const data = await res.json();
      const events = Array.isArray(data.events) ? data.events : [];
      if (events.length === 0) return;

      for (const ev of events) {
        const row = renderEventRow(ev);
        tbody.appendChild(row);
        lastSeq = Math.max(lastSeq, Number(ev.seq || 0) || 0);
        const match = eventMatchesStopRules(ev);
        if (match.hit) {
          row.style.outline = '2px solid #e1b64a';
          row.scrollIntoView({ block: 'center' });
          stopLive('hit stop rule (' + match.why + ') at seq ' + (ev.seq ?? '?') + ' ' + (ev.event_type ?? '')); 
          return;
        }
      }

      setStatus('Live: running (last seq ' + lastSeq + ')', 'running');
    } catch {
      // ignore polling errors
    }
  }

  function startLive() {
    cfg = readConfigFromForm(cfg);
    cfg.enabled = true;
    paused = false;
    saveConfig(cfg);
    if (timer) clearInterval(timer);
    setStatus('Live: running (last seq ' + lastSeq + ')', 'running');
    timer = setInterval(pollOnce, cfg.intervalMs || 1000);
    pollOnce();
  }

  startBtn.addEventListener('click', () => startLive());
  pauseBtn.addEventListener('click', () => stopLive('manual pause'));
  pollBtn.addEventListener('click', () => { cfg.enabled = true; saveConfig(cfg); pollOnce(); });

  if (cfg.enabled) {
    startLive();
  }
})();
      `.trim()
    }));
  }

  _renderSummary(container) {
    const s = this._summary;
    const grid = container.add(new jsgui.Control({
      context: this.context,
      tagName: 'div',
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }
    }));

    const cards = [
      { labtagName: 'Task Type', value: s.task_type || '-', icon: '📋' },
      { labtagName: 'Total Events', value: s.total_events || 0, icon: '📊' },
      { labtagName: 'Errors', value: s.error_count || 0, icon: '❌', bad: s.error_count > 0 },
      { labtagName: 'Warnings', value: s.warn_count || 0, icon: '⚠️', bad: s.warn_count > 0 },
      { labtagName: 'Unique Scopes', value: s.unique_scopes || 0, icon: '🌐' }
    ];

    for (const card of cards) {
      const cardEl = grid.add(new jsgui.Control({
        context: this.context,
        tagName: 'div',
        style: {
          background: card.bad ? '#fff0f0' : '#f9f9f9',
          padding: '16px',
          borderRadius: '8px',
          border: card.bad ? '1px solid #fcc' : '1px solid #eee'
        }
      }));
      cardEl.add(makeTextEl(this.context, 'div', `${card.icon} ${card.label}`, {
        style: { fontSize: '12px', color: '#666', marginBottom: '4px' }
      }));
      cardEl.add(makeTextEl(this.context, 'div', String(card.value), {
        style: { fontSize: '24px', fontWeight: 'bold', color: card.bad ? '#c00' : '#333' }
      }));
    }
  }

  _renderProblems(container) {
    container.add(makeTextEl(this.context, 'h3', `❌ Problems (${this._problems.length})`, {
      style: { marginTop: '24px', marginBottom: '12px' }
    }));

    const list = container.add(new jsgui.Control({
      context: this.context,
      tagName: 'div',
      style: { marginBottom: '24px' }
    }));

    for (const p of this._problems.slice(0, 20)) {
      const item = list.add(new jsgui.Control({
        context: this.context,
        tagName: 'div',
        style: {
          background: p.severity === 'error' ? '#fff0f0' : '#fffbe6',
          padding: '12px',
          borderRadius: '4px',
          marginBottom: '8px',
          borderLeft: `4px solid ${p.severity === 'error' ? '#c00' : '#f90'}`
        }
      }));

      item.add(makeTextEl(this.context, 'div', `[${p.seq}] ${p.event_type}`, {
        style: { fontWeight: 'bold', marginBottom: '4px' }
      }));

      if (p.target) {
        item.add(makeTextEl(this.context, 'div', p.target.length > 80 ? p.target.slice(0, 77) + '...' : p.target, {
          style: { fontSize: '12px', color: '#666', wordBreak: 'break-all' }
        }));
      }

      if (p.payload) {
        try {
          const data = JSON.parse(p.payload);
          if (data.error || data.message) {
            item.add(makeTextEl(this.context, 'div', data.error || data.message, {
              style: { fontSize: '12px', color: '#900', marginTop: '4px' }
            }));
          }
        } catch { /* ignore */ }
      }
    }
  }

  _renderTimeline(container) {
    container.add(makeTextEl(this.context, 'h3', '📍 Timeline', {
      style: { marginTop: '24px', marginBottom: '12px' }
    }));

    const timeline = container.add(new jsgui.Control({
      context: this.context,
      tagName: 'div',
      style: {
        borderLeft: '2px solid #0066cc',
        paddingLeft: '20px',
        marginBottom: '24px'
      }
    }));

    for (const e of this._timeline) {
      const item = timeline.add(new jsgui.Control({
        context: this.context,
        tagName: 'div',
        style: {
          position: 'relative',
          marginBottom: '16px'
        }
      }));

      item.add(new jsgui.Control({
        context: this.context,
        tagName: 'div',
        style: {
          position: 'absolute',
          left: '-26px',
          top: '4px',
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          background: '#0066cc'
        }
      }));

      item.add(makeTextEl(this.context, 'div', e.event_type, {
        style: { fontWeight: 'bold' }
      }));

      const ts = e.ts ? new Date(e.ts).toLocaleString() : '-';
      item.add(makeTextEl(this.context, 'div', ts, {
        style: { fontSize: '12px', color: '#666' }
      }));

      if (e.scope) {
        item.add(makeTextEl(this.context, 'div', e.scope, {
          style: { fontSize: '12px', color: '#0066cc' }
        }));
      }
    }
  }

  _renderEvents(container) {
    container.add(makeTextEl(this.context, 'h3', `📊 Events (${this._events.length})`, {
      style: { marginTop: '24px', marginBottom: '12px' }
    }));

    if (this._pageInfo) {
      const nav = container.add(new jsgui.Control({
        context: this.context,
        tagName: 'div',
        style: {
          display: 'flex',
          gap: '10px',
          alignItems: 'center',
          flexWrap: 'wrap',
          padding: '8px 10px',
          borderRadius: '8px',
          border: '1px solid #223155',
          background: '#0f1a33',
          marginBottom: '10px',
          fontSize: '12px',
          color: '#cfe7ff'
        }
      }));

      const infoText = `seq ${this._pageInfo.minSeq ?? '?'} → ${this._pageInfo.maxSeq ?? '?'} (limit ${this._pageInfo.limit ?? '?'})`;
      nav.add(makeTextEl(this.context, 'div', infoText, { style: { marginRight: 'auto' } }));

      const makeLocalLink = (label, href, enabled) => {
        if (!enabled) {
          return nav.add(makeTextEl(this.context, 'span', label, {
            style: { opacity: 0.45 }
          }));
        }
        return nav.add(makeLink(this.context, label, href, { color: '#7ec8e3', textDecoration: 'none' }));
      };

      const base = this._withBasePath(`/task/${encodeURIComponent(this._taskId)}`);
      const lim = this._pageInfo.limit || 200;
      const minSeq = Number(this._pageInfo.minSeq || 0) || 0;
      const maxSeq = Number(this._pageInfo.maxSeq || 0) || 0;

      makeLocalLink('⏮ Latest', `${base}?limit=${encodeURIComponent(String(lim))}`, true);
      makeLocalLink('⬅ Older', `${base}?beforeSeq=${encodeURIComponent(String(minSeq))}&limit=${encodeURIComponent(String(lim))}`, !!this._pageInfo.hasOlder);
      makeLocalLink('Newer ➡', `${base}?afterSeq=${encodeURIComponent(String(maxSeq))}&limit=${encodeURIComponent(String(lim))}`, !!this._pageInfo.hasNewer);
    }

    const table = container.add(new jsgui.Control({
      context: this.context,
      tagName: 'table',
      attr: { id: 'co-events-table' },
      style: {
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '13px'
      }
    }));

    const thead = table.add(new jsgui.Control({ context: this.context, tagName: 'thead' }));
    const headerRow = thead.add(new jsgui.Control({ context: this.context, tagName: 'tr' }));
    ['Seq', 'Time', 'Type', '', 'Scope', 'Target', 'Duration'].forEach(h => {
      headerRow.add(makeTextEl(this.context, 'th', h, {
        style: {
          textAlign: 'left',
          padding: '6px',
          borderBottom: '2px solid #ddd',
          background: '#f5f5f5'
        }
      }));
    });

    const tbody = table.add(new jsgui.Control({ context: this.context, tagName: 'tbody', attr: { id: 'co-events-tbody' } }));
    for (const e of this._events) {
      const row = tbody.add(new jsgui.Control({
        context: this.context,
        tagName: 'tr',
        attr: {
          'data-seq': String(e.seq ?? ''),
          'data-event-type': String(e.event_type ?? ''),
          'data-event-category': String(e.event_category ?? ''),
          'data-severity': String(e.severity ?? ''),
          'data-scope': String(e.scope ?? '')
        }
      }));

      const severityIcon = e.severity === 'error' ? '❌' : e.severity === 'warn' ? '⚠️' : '';
      const rowStyle = { padding: '6px', borderBottom: '1px solid #eee' };
      if (e.severity === 'error') rowStyle.background = '#fff0f0';
      else if (e.severity === 'warn') rowStyle.background = '#fffbe6';

      row.add(makeTextEl(this.context, 'td', String(e.seq), { style: rowStyle }));

      const ts = e.ts ? new Date(e.ts).toLocaleTimeString() : '-';
      row.add(makeTextEl(this.context, 'td', ts, { style: { ...rowStyle, fontSize: '11px' } }));

      row.add(makeTextEl(this.context, 'td', e.event_type, { style: rowStyle }));
      row.add(makeTextEl(this.context, 'td', severityIcon, { style: rowStyle }));

      const scope = e.scope ? (e.scope.length > 25 ? e.scope.slice(0, 22) + '...' : e.scope) : '-';
      row.add(makeTextEl(this.context, 'td', scope, { style: { ...rowStyle, fontSize: '11px' } }));

      const target = e.target ? (e.target.length > 40 ? e.target.slice(0, 37) + '...' : e.target) : '-';
      row.add(makeTextEl(this.context, 'td', target, { style: { ...rowStyle, fontSize: '11px' } }));

      let dur = '-';
      if (e.duration_ms) {
        dur = e.duration_ms < 1000 ? `${e.duration_ms}ms` : `${(e.duration_ms / 1000).toFixed(1)}s`;
      }
      row.add(makeTextEl(this.context, 'td', dur, { style: rowStyle }));
    }
  }
}

module.exports = { TaskDetailControl };
