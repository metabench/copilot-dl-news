'use strict';

const jsgui = require('jsgui3-html');

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

function normalizeFieldOptions(options) {
  if (!Array.isArray(options)) return [];
  return options
    .map((opt) => {
      if (opt && typeof opt === 'object' && 'value' in opt) {
        return { value: String(opt.value), label: String(opt.label ?? opt.value) };
      }
      return { value: String(opt), label: String(opt) };
    })
    .filter((opt) => opt.value.length > 0);
}

class HubGuessingMatrixChromeControl extends jsgui.Control {
  constructor(spec = {}) {
    super(spec);

    this.rootTestId = spec.rootTestId;
    this.basePath = spec.basePath;
    this.fields = Array.isArray(spec.fields) ? spec.fields : [];
    this.stats = Array.isArray(spec.stats) ? spec.stats : [];
    this.legend = Array.isArray(spec.legend) ? spec.legend : [];
    this.includeFlipAxes = spec.includeFlipAxes !== false;
    this.initialView = spec.initialView === 'b' ? 'b' : 'a';

    if (!spec.el) {
      this.compose();
    }
  }

  compose() {
    const ctx = this.context;

    this.add(this._styleEl());
    this.add(this._viewToggleScript());
    this.add(this._runGuessingScript());
    this.add(this._filtersForm());
    this.add(this._statsRow());
    this.add(this._legendRow());
    this.add(this._actionsRow());
    this.add(this._logModal());
  }

  _logModal() {
    const ctx = this.context;
    const backdrop = makeEl(ctx, 'div', 'log-modal-backdrop', { 'data-testid': 'log-modal-backdrop' });
    
    const modal = makeEl(ctx, 'div', 'log-modal');
    backdrop.add(modal);
    
    const header = makeEl(ctx, 'div', 'log-modal-header');
    modal.add(header);
    
    const title = makeEl(ctx, 'div', 'log-modal-title');
    title.add(text(ctx, 'Job Logs'));
    header.add(title);
    
    const closeBtn = makeEl(ctx, 'button', 'log-modal-close', { 'data-testid': 'log-modal-close' });
    closeBtn.add(text(ctx, '×'));
    header.add(closeBtn);
    
    const body = makeEl(ctx, 'div', 'log-modal-body', { 'data-testid': 'log-modal-body' });
    modal.add(body);
    
    return backdrop;
  }

  _styleEl() {
    const ctx = this.context;

    const styleEl = makeEl(ctx, 'style');
    styleEl.add(
      text(
        ctx,
        `
:root {
  --bg: #1a1410;
  --panel: #241a14;
  --border: #4a3628;
  --text: #f5e6d3;
  --muted: #b8a090;
  --gold: #d4a574;
  --ok: #4ade80;
  --warn: #fbbf24;
  --bad: #f87171;
  --mono: Consolas, Monaco, monospace;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.page {
  padding: 18px 22px;
  max-width: 1600px;
  margin: 0 auto;
}

.matrix-legend {
  display: flex;
  gap: 14px;
  align-items: center;
  padding: 10px 12px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin: 12px 0;
  flex-wrap: wrap;
  font-size: 13px;
}

.legend-item { display: inline-flex; gap: 8px; align-items: center; }

.legend-swatch {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  border: 1px solid rgba(245, 230, 211, 0.25);
  display: inline-block;
}

.matrix-stats {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin: 12px 0;
}

.stat {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
}

.stat-label { color: var(--muted); margin-right: 6px; }
.stat-value { font-family: var(--mono); }
.stat-value--ok { color: var(--ok); }
.stat-value--warn { color: var(--warn); }
.stat-value--bad { color: var(--bad); }
.stat-value--muted { color: var(--muted); }

.matrix-actions {
  display: flex;
  justify-content: flex-end;
  margin: 10px 0 0;
}

.page[data-view="a"] [data-testid="matrix-view-b"],
.page[data-view="b"] [data-testid="matrix-view-a"] {
  display: none;
}

.filters-form {
  margin: 10px 0 2px;
  padding: 10px 12px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: flex-end;
}

.ff {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--muted);
}

.ff input, .ff select {
  background: #120e0b;
  border: 1px solid rgba(245, 230, 211, 0.22);
  border-radius: 6px;
  padding: 6px 8px;
  color: var(--text);
  font-size: 12px;
  min-width: 140px;
}

.ff input[type="number"] { min-width: 110px; width: 110px; }

.btn {
  background: #120e0b;
  border: 1px solid rgba(245, 230, 211, 0.22);
  border-radius: 6px;
  padding: 7px 10px;
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
}

.btn:hover { border-color: rgba(212,165,116,0.55); }

.filters {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin: 12px 0 6px;
  color: var(--muted);
  font-size: 12px;
}

.filters code { font-family: var(--mono); color: var(--text); }

.job-status {
  margin-right: auto;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
}

.job-status--running { color: var(--warn); }
.job-status--completed { color: var(--ok); }
.job-status--failed { color: var(--bad); }

.spinner {
  width: 12px;
  height: 12px;
  border: 2px solid var(--muted);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  display: inline-block;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.job-progress {
  display: inline-block;
  width: 100px;
  height: 4px;
  background: rgba(255,255,255,0.1);
  border-radius: 2px;
  margin-right: 8px;
  vertical-align: middle;
  overflow: hidden;
}

.job-progress-fill {
  height: 100%;
  background: #fbbf24;
  transition: width 0.3s ease;
}

.refresh-btn {
  background: none;
  border: 1px solid var(--ok);
  color: var(--ok);
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  margin-left: 8px;
}
.refresh-btn:hover {
  background: rgba(74,222,128,0.1);
}

.log-modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0,0,0,0.7);
  z-index: 999;
  display: none;
  align-items: center;
  justify-content: center;
}

.log-modal {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  width: 800px;
  max-width: 90vw;
  height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 10px 25px rgba(0,0,0,0.5);
}

.log-modal-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #120e0b;
  border-radius: 8px 8px 0 0;
}

.log-modal-title {
  font-weight: 600;
  color: var(--gold);
}

.log-modal-close {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 20px;
  padding: 0 4px;
}
.log-modal-close:hover { color: var(--text); }

.log-modal-body {
  flex: 1;
  overflow: auto;
  padding: 16px;
  font-family: var(--mono);
  font-size: 12px;
  background: #000;
}

.log-entry {
  margin-bottom: 4px;
  white-space: pre-wrap;
  word-break: break-word;
  display: flex;
  gap: 8px;
}

.log-time { color: var(--muted); min-width: 70px; }
.log-level-info { color: var(--text); }
.log-level-warn { color: var(--warn); }
.log-level-error { color: var(--bad); }
`
      )
    );

    return styleEl;
  }

  _viewToggleScript() {
    const ctx = this.context;

    const rootTestId = String(this.rootTestId || '').trim();
    const rootSelector = rootTestId ? `[data-testid="${rootTestId.replace(/"/g, '')}"]` : null;
    if (!rootSelector || rootTestId.length === 0) {
      return makeEl(ctx, 'script');
    }

    const scriptEl = makeEl(ctx, 'script');
    scriptEl.add(
      text(
        ctx,
        `
(() => {
  const init = () => {
    const root = document.querySelector(${JSON.stringify(rootSelector)});
    if (!root) return;

    const btn = root.querySelector('[data-testid="flip-axes"]');
    const getView = () => (root.getAttribute('data-view') === 'b' ? 'b' : 'a');
    const setView = (next) => root.setAttribute('data-view', next === 'b' ? 'b' : 'a');

    if (!root.getAttribute('data-view')) setView(${JSON.stringify(this.initialView)});
    setView(getView());

    if (!btn) return;
    btn.addEventListener('click', () => setView(getView() === 'a' ? 'b' : 'a'));
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

  _runGuessingScript() {
    const ctx = this.context;
    const scriptEl = makeEl(ctx, 'script');
    scriptEl.add(
      text(
        ctx,
        `
(() => {
  const init = () => {
    const btn = document.querySelector('[data-testid="run-guessing"]');
    const statusEl = document.querySelector('[data-testid="job-status"]');
    const modalBackdrop = document.querySelector('[data-testid="log-modal-backdrop"]');
    const modalClose = document.querySelector('[data-testid="log-modal-close"]');
    const modalBody = document.querySelector('[data-testid="log-modal-body"]');
    
    if (!btn) return;

    const basePath = (btn.getAttribute('data-base-path') || '').replace(/\\/$/, '');
    const jobsUrl = (basePath + '/api/jobs').replace('//', '/');
    const guessUrl = (basePath + '/api/guess').replace('//', '/');

    let pollInterval = null;

    const showLogs = async (jobId) => {
      try {
        modalBody.innerHTML = 'Loading logs...';
        modalBackdrop.style.display = 'flex';
        
        const res = await fetch(\`\${jobsUrl}/\${jobId}\`);
        if (!res.ok) throw new Error('Failed to fetch logs');
        
        const job = await res.json();
        const logs = job.logs || [];
        
        if (logs.length === 0) {
          modalBody.innerHTML = '<div class="log-entry"><span class="log-time">--:--:--</span><span class="log-level-info">No logs available</span></div>';
          return;
        }
        
        modalBody.innerHTML = logs.map(log => {
          const time = new Date(log.time).toLocaleTimeString();
          const levelClass = \`log-level-\${log.level || 'info'}\`;
          return \`<div class="log-entry"><span class="log-time">\${time}</span><span class="\${levelClass}">\${log.msg}</span></div>\`;
        }).join('');
        
        // Scroll to bottom
        modalBody.scrollTop = modalBody.scrollHeight;
      } catch (err) {
        modalBody.innerHTML = \`<div class="log-entry"><span class="log-level-error">Error loading logs: \${err.message}</span></div>\`;
      }
    };

    const closeModal = () => {
      modalBackdrop.style.display = 'none';
    };

    if (modalClose) modalClose.onclick = closeModal;
    if (modalBackdrop) {
      modalBackdrop.onclick = (e) => {
        if (e.target === modalBackdrop) closeModal();
      };
    }

    // Expose showLogs globally so onclick handlers can use it
    window.showJobLogs = showLogs;

    const updateStatus = async () => {
      try {
        const res = await fetch(jobsUrl);
        if (!res.ok) return;
        const jobs = await res.json();
        
        // Find active or most recent job
        const activeJob = jobs.find(j => j.status === 'running' || j.status === 'pending');
        const lastJob = jobs[0]; // Sorted by time desc in server

        if (activeJob) {
          btn.disabled = true;
          btn.textContent = 'Running...';
          
          let msg = \`Running (\${activeJob.domainCount} domains)\`;
          if (activeJob.lastMessage) msg += \`: \${activeJob.lastMessage}\`;
          
          let progressHtml = '';
          if (activeJob.domainCount > 0) {
            const pct = Math.round(((activeJob.processedCount || 0) / activeJob.domainCount) * 100);
            progressHtml = \`<div class="job-progress" title="\${activeJob.processedCount || 0} / \${activeJob.domainCount}"><div class="job-progress-fill" style="width: \${pct}%"></div></div>\`;
          }
          
          statusEl.innerHTML = \`\${progressHtml}<span class="spinner"></span> \${msg} <button class="refresh-btn" onclick="window.showJobLogs('\${activeJob.id}')">Logs</button> <button class="refresh-btn" id="cancel-job-btn" data-id="\${activeJob.id}" style="border-color: var(--bad); color: var(--bad);">Stop</button>\`;
          statusEl.className = 'job-status job-status--running';
          
          const cancelBtn = document.getElementById('cancel-job-btn');
          if (cancelBtn) {
            cancelBtn.onclick = async (e) => {
              e.preventDefault();
              if (!confirm('Stop this job?')) return;
              try {
                await fetch(\`\${jobsUrl}/\${activeJob.id}/cancel\`, { method: 'POST' });
                updateStatus();
              } catch (err) {
                console.error(err);
              }
            };
          }
          
          if (!pollInterval) pollInterval = setInterval(updateStatus, 2000);
        } else {
          btn.disabled = false;
          btn.textContent = 'Run Guessing';
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
          
          if (lastJob) {
            const time = new Date(lastJob.endTime || lastJob.startTime).toLocaleTimeString();
            if (lastJob.status === 'completed') {
              statusEl.innerHTML = \`Last job completed at \${time} (\${lastJob.domainCount} domains) <button class="refresh-btn" onclick="window.showJobLogs('\${lastJob.id}')">Logs</button> <button class="refresh-btn" onclick="location.reload()">Refresh Page</button>\`;
              statusEl.className = 'job-status job-status--completed';
            } else if (lastJob.status === 'failed') {
              const errorMsg = lastJob.error || 'Unknown error';
              statusEl.innerHTML = \`Last job failed at \${time}: <span title="\${errorMsg}">\${errorMsg}</span> <button class="refresh-btn" onclick="window.showJobLogs('\${lastJob.id}')">Logs</button>\`;
              statusEl.className = 'job-status job-status--failed';
            } else {
              statusEl.textContent = '';
              statusEl.className = 'job-status';
            }
          } else {
            statusEl.textContent = '';
            statusEl.className = 'job-status';
          }
        }
      } catch (err) {
        console.error('Failed to poll jobs:', err);
      }
    };

    // Initial check
    updateStatus();

    btn.addEventListener('click', async () => {
      if (!confirm('Start background guessing job with current filters?')) return;
      
      const form = document.querySelector('[data-testid="filters-form"]');
      const formData = new FormData(form);
      const params = Object.fromEntries(formData.entries());
      
      const payload = {
        hostQ: params.hostQ,
        hostLimit: params.hostLimit,
        activePattern: params.activePattern,
        parentPlace: params.parentPlace,
        apply: true
      };

      try {
        btn.disabled = true;
        btn.textContent = 'Starting...';
        
        const res = await fetch(guessUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        if (!res.ok) throw new Error(await res.text());
        
        // Start polling immediately
        updateStatus();
      } catch (err) {
        alert('Error: ' + err.message);
        btn.disabled = false;
        btn.textContent = 'Run Guessing';
      }
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

  _filtersForm() {
    const ctx = this.context;

    const action = this.basePath || '.';

    const form = makeEl(ctx, 'form', 'filters-form', {
      'data-testid': 'filters-form',
      method: 'GET',
      action
    });

    for (const field of this.fields) {
      if (!field || typeof field !== 'object') continue;
      const kind = String(field.kind || '').toLowerCase();
      const label = field.label;
      const name = field.name;
      const value = field.value;
      const attrs = field.attrs && typeof field.attrs === 'object' ? field.attrs : null;

      if (kind === 'select') {
        form.add(this._selectField(label, name, field.options, value, attrs));
      } else {
        form.add(this._inputField(label, name, value, attrs));
      }
    }

    const btn = makeEl(ctx, 'button', 'btn', { type: 'submit' });
    btn.add(text(ctx, 'Apply'));
    form.add(btn);

    return form;
  }

  _statsRow() {
    const ctx = this.context;
    const stats = makeEl(ctx, 'div', 'matrix-stats');

    for (const item of this.stats) {
      if (!item || typeof item !== 'object') continue;
      stats.add(this._stat(item.label, item.value, item.valueClass));
    }

    return stats;
  }

  _legendRow() {
    const ctx = this.context;
    const legend = makeEl(ctx, 'div', 'matrix-legend', { 'data-testid': 'matrix-legend' });

    for (const item of this.legend) {
      if (!item || typeof item !== 'object') continue;
      legend.add(this._legendItem(item.label, item.className));
    }

    return legend;
  }

  _actionsRow() {
    const ctx = this.context;
    const actions = makeEl(ctx, 'div', 'matrix-actions');

    const status = makeEl(ctx, 'div', 'job-status', { 'data-testid': 'job-status' });
    actions.add(status);

    if (this.includeFlipAxes) {
      const flipBtn = makeEl(ctx, 'button', 'btn', { type: 'button', 'data-testid': 'flip-axes' });
      flipBtn.add(text(ctx, 'Flip axes'));
      actions.add(flipBtn);
    }

    const runBtn = makeEl(ctx, 'button', 'btn', {
      type: 'button',
      'data-testid': 'run-guessing',
      'data-base-path': this.basePath || '',
      style: 'margin-left: 10px;'
    });
    runBtn.add(text(ctx, 'Run Guessing'));
    actions.add(runBtn);

    return actions;
  }

  _legendItem(label, swatchClass) {
    const ctx = this.context;
    const item = makeEl(ctx, 'span', 'legend-item');
    const swatch = makeEl(ctx, 'span', `legend-swatch ${swatchClass || ''}`);
    item.add(swatch);
    item.add(text(ctx, label));
    return item;
  }

  _stat(label, value, valueClass = null) {
    const ctx = this.context;
    const el = makeEl(ctx, 'div', 'stat');

    const labelEl = makeEl(ctx, 'span', 'stat-label');
    labelEl.add(text(ctx, label));

    const valueEl = makeEl(ctx, 'span', `stat-value${valueClass ? ` ${valueClass}` : ''}`);
    valueEl.add(text(ctx, value));

    el.add(labelEl);
    el.add(valueEl);
    return el;
  }

  _selectField(label, name, options, selectedValue, attrs) {
    const ctx = this.context;
    const wrapper = makeEl(ctx, 'label', 'ff');
    wrapper.add(text(ctx, label));

    const selectAttrs = { name };
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        if (value === undefined) continue;
        selectAttrs[key] = value;
      }
    }

    const select = makeEl(ctx, 'select', null, selectAttrs);
    const normalizedOptions = normalizeFieldOptions(options);
    for (const opt of normalizedOptions) {
      const optEl = makeEl(ctx, 'option', null, { value: opt.value });
      if (String(opt.value) === String(selectedValue)) {
        optEl.dom.attributes.selected = 'selected';
      }
      optEl.add(text(ctx, opt.label));
      select.add(optEl);
    }

    wrapper.add(select);
    return wrapper;
  }

  _inputField(label, name, value, attrs) {
    const ctx = this.context;
    const wrapper = makeEl(ctx, 'label', 'ff');
    wrapper.add(text(ctx, label));

    const inputAttrs = { name, value };
    if (attrs) {
      for (const [key, v] of Object.entries(attrs)) {
        if (v === undefined) continue;
        inputAttrs[key] = v;
      }
    }

    const input = makeEl(ctx, 'input', null, inputAttrs);
    wrapper.add(input);
    return wrapper;
  }
}

module.exports = { HubGuessingMatrixChromeControl };
