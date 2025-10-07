/**
 * @fileoverview Jobs and Resume Queue Manager - manages job rendering and resume queue operations
 * Extracted from index.js to improve modularity and testability using lang-tools patterns.
 * 
 * Handles:
 * - Job list rendering (/api/crawls data)
 * - Resume queue inventory display
 * - Resume queue actions (resume selected/all queues)
 * - Resume suggestions and auto-refresh
 * 
 * Uses dependency injection for all external dependencies (no globals).
 * Patterns used: each() for iteration, is_defined() for safety checks.
 */

import { each, is_defined } from 'lang-tools';

// Resume state priority weights for sorting (lower = higher priority)
const RESUME_STATE_WEIGHT = {
  recommended: 1,
  ready: 2,
  available: 3,
  blocked: 4,
  waiting: 5
};

// Human-readable labels for resume reasons
const RESUME_REASON_LABELS = {
  'no-slot': 'No available slots',
  'concurrency-limit': 'Concurrency limit reached',
  'running': 'Already running',
  'recent-failure': 'Recent failures detected',
  'rate-limited': 'Rate limited'
};

/**
 * Creates jobs and resume queue manager with full dependency injection
 * 
 * @param {Object} deps - Dependencies object
 * @param {Object} deps.elements - DOM elements
 * @param {HTMLElement} deps.elements.jobsList - Jobs list container
 * @param {HTMLElement} deps.elements.logs - Logs display area
 * @param {HTMLElement} deps.elements.resumeSection - Resume section container
 * @param {HTMLElement} deps.elements.resumeSummary - Resume summary text
 * @param {HTMLButtonElement} deps.elements.resumeAllBtn - Resume all button
 * @param {HTMLButtonElement} deps.elements.resumeRefreshBtn - Resume refresh button
 * @param {HTMLUListElement} deps.elements.resumeList - Resume queue list
 * @param {HTMLElement} deps.elements.resumeStatus - Resume status text
 * @param {Object} deps.actions - Action functions
 * @param {Function} deps.actions.setStage - Set current stage
 * @param {Function} deps.actions.setPausedBadge - Set paused badge
 * @param {Function} deps.actions.hidePausedBadge - Hide paused badge
 * @param {Function} deps.actions.setCrawlType - Set crawl type
 * @param {Function} deps.actions.updateStartupStatus - Update startup status
 * @param {Function} deps.actions.scheduleResumeInventoryRefresh - Schedule resume refresh
 * @returns {Object} Manager object with methods: renderJobs, fetchResumeInventory, setupResumeControls
 */
export function createJobsAndResumeManager(deps) {
  const {
    elements,
    actions
  } = deps;

  // Resume inventory state
  const resumeInventoryState = {
    data: null,
    loading: false,
    lastFetch: 0
  };

  let resumeActionPending = false;
  let resumeRefreshTimer = null;

  /**
   * Helper: Calculate priority weight for resume state
   */
  function stateWeight(value) {
    return RESUME_STATE_WEIGHT[value] != null ? RESUME_STATE_WEIGHT[value] : 3;
  }

  /**
   * Helper: Extract hostname from URL
   */
  function extractHostname(url) {
    if (!url) return null;
    try {
      return new URL(url).hostname;
    } catch (err) {
      return null;
    }
  }

  /**
   * Helper: Convert resume reason codes to human-readable text
   */
  function describeResumeReasons(reasons) {
    if (!Array.isArray(reasons) || reasons.length === 0) {
      return null;
    }
    const labels = [];
    each(reasons, (code) => {
      const label = RESUME_REASON_LABELS[code] || (code ? code.replace(/[-_]/g, ' ') : null);
      if (label) labels.push(label);
    });
    if (labels.length === 0) {
      return null;
    }
    return labels.join(' · ');
  }

  /**
   * Helper: Set resume status message with state styling
   */
  function setResumeStatus(message, options = {}) {
    if (!is_defined(elements.resumeStatus)) return;
    elements.resumeStatus.textContent = message || '';
    if (options.error) {
      elements.resumeStatus.dataset.state = 'error';
    } else if (options.busy) {
      elements.resumeStatus.dataset.state = 'busy';
    } else if (options.ok) {
      elements.resumeStatus.dataset.state = 'ok';
    } else {
      elements.resumeStatus.dataset.state = 'idle';
    }
  }

  /**
   * Render resume queue inventory
   */
  function renderResumeInventory(data) {
    if (!is_defined(elements.resumeSection)) return;
    resumeInventoryState.data = data || null;
    const total = data?.total ?? 0;
    const recommendedCount = Array.isArray(data?.recommendedIds) ? data.recommendedIds.length : 0;
    const availableSlots = Number.isFinite(data?.availableSlots) ? data.availableSlots : null;

    elements.resumeSection.dataset.hasData = total > 0 ? '1' : '0';
    
    if (is_defined(elements.resumeSummary)) {
      const summaryParts = [];
      summaryParts.push(recommendedCount ? `${recommendedCount} ready to resume` : 'No resumable queues detected');
      if (availableSlots != null) {
        summaryParts.push(`slots free: ${availableSlots}`);
      }
      summaryParts.push(`paused total: ${total}`);
      elements.resumeSummary.textContent = summaryParts.join(' · ');
    }

    if (is_defined(elements.resumeAllBtn)) {
      elements.resumeAllBtn.disabled = recommendedCount === 0 || resumeActionPending;
      elements.resumeAllBtn.textContent = recommendedCount
        ? `Resume ${recommendedCount} queue${recommendedCount === 1 ? '' : 's'}`
        : 'Resume suggestions';
    }

    if (!is_defined(elements.resumeList)) return;
    elements.resumeList.innerHTML = '';
    const queues = Array.isArray(data?.queues) ? data.queues.slice() : [];
    
    if (queues.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'resume-item resume-item--empty';
      empty.textContent = 'No paused or incomplete queues.';
      elements.resumeList.appendChild(empty);
      return;
    }

    // Sort queues by state weight and timestamp
    queues.sort((a, b) => {
      const weightDiff = stateWeight(a?.state) - stateWeight(b?.state);
      if (weightDiff !== 0) return weightDiff;
      const aTs = Number.isFinite(a?.startedAtMs) ? a.startedAtMs : Number(a?.startedAt) || 0;
      const bTs = Number.isFinite(b?.startedAtMs) ? b.startedAtMs : Number(b?.startedAt) || 0;
      return bTs - aTs;
    });

    // Render each queue item
    each(queues, (queue) => {
      const li = document.createElement('li');
      li.className = 'resume-item';
      li.dataset.state = queue?.state || 'blocked';

      const header = document.createElement('div');
      header.className = 'resume-item__header';

      const title = document.createElement('div');
      title.className = 'resume-item__title';
      const domain = queue?.domain || extractHostname(queue?.url);
      title.textContent = domain || queue?.url || `Queue ${queue?.id}`;
      header.appendChild(title);

      const link = document.createElement('a');
      link.className = 'resume-item__link';
      link.href = queue?.url || '#';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = '↗';
      header.appendChild(link);

      li.appendChild(header);

      const meta = document.createElement('div');
      meta.className = 'resume-item__meta';
      const metaParts = [];
      if (queue?.state) metaParts.push(`state: ${queue.state}`);
      if (Number.isFinite(queue?.queueSize)) metaParts.push(`queue: ${queue.queueSize}`);
      if (Number.isFinite(queue?.visited)) metaParts.push(`visited: ${queue.visited}`);
      meta.textContent = metaParts.join(' · ');
      li.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'resume-item__actions';

      if (queue?.state === 'recommended' || queue?.state === 'ready' || queue?.state === 'available') {
        const resumeBtn = document.createElement('button');
        resumeBtn.type = 'button';
        resumeBtn.className = 'button button--small resume-item__button';
        resumeBtn.textContent = 'Resume';
        resumeBtn.dataset.resumeQueue = String(queue?.id || '');
        resumeBtn.disabled = resumeActionPending;
        actions.appendChild(resumeBtn);
      } else if (queue?.state === 'waiting') {
        const reasonLabel = describeResumeReasons(queue?.reasons);
        const waitBtn = document.createElement('button');
        waitBtn.type = 'button';
        waitBtn.className = 'button button--ghost resume-item__button';
        waitBtn.textContent = 'Waiting for slot';
        waitBtn.disabled = true;
        actions.appendChild(waitBtn);
      } else {
        const reasonLabel = describeResumeReasons(queue?.reasons);
        const badge = document.createElement('span');
        badge.className = 'resume-item__badge';
        badge.textContent = reasonLabel || 'Blocked';
        actions.appendChild(badge);
      }

      li.appendChild(actions);
      elements.resumeList.appendChild(li);
    });
  }

  /**
   * Schedule a refresh of resume inventory
   */
  function scheduleResumeInventoryRefresh(delayMs = 1500) {
    if (!is_defined(elements.resumeSection)) return;
    if (resumeRefreshTimer) {
      try {
        clearTimeout(resumeRefreshTimer);
      } catch (_) {}
    }
    resumeRefreshTimer = setTimeout(() => {
      fetchResumeInventory({ silent: true }).catch(() => {});
    }, delayMs);
  }

  /**
   * Fetch resume inventory from server
   */
  async function fetchResumeInventory({ silent = false } = {}) {
    if (!is_defined(elements.resumeSection) || resumeInventoryState.loading) return;
    resumeInventoryState.loading = true;
    
    if (!silent) {
      setResumeStatus('Checking paused queues…', { busy: true });
    }
    
    try {
      const res = await fetch('/api/resume-all');
      const data = await res.json().catch(() => ({}));
      
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      
      renderResumeInventory(data);
      
      if (!silent) {
        setResumeStatus('Resume suggestions updated.', { ok: true });
      }
    } catch (err) {
      if (!silent) {
        setResumeStatus(`Resume inventory error: ${err?.message || err}`, { error: true });
      }
    } finally {
      resumeInventoryState.loading = false;
      resumeInventoryState.lastFetch = Date.now();
      scheduleResumeInventoryRefresh(60000);
    }
  }

  /**
   * Trigger resume request for selected queues or all recommended queues
   */
  async function triggerResumeRequest({ queueIds = null, sourceButton = null } = {}) {
    if (resumeActionPending) return;
    resumeActionPending = true;
    
    if (sourceButton) sourceButton.disabled = true;
    if (is_defined(elements.resumeAllBtn)) elements.resumeAllBtn.disabled = true;
    
    setResumeStatus('Resuming crawl queue…', { busy: true });
    
    try {
      const body = {};
      if (Array.isArray(queueIds) && queueIds.length) {
        body.queueIds = queueIds;
      }
      body.maxConcurrent = 8;
      
      const res = await fetch('/api/resume-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      const payload = await res.json().catch(() => ({}));
      
      if (!res.ok) {
        throw new Error(payload?.error || `HTTP ${res.status}`);
      }
      
      const resumed = payload?.resumed || 0;
      const message = payload?.message || (resumed ? `Resumed ${resumed} crawl(s)` : 'No crawls resumed');
      const hasErrors = Array.isArray(payload?.errors) && payload.errors.length > 0;
      const skippedReason = Array.isArray(payload?.skipped) && payload.skipped.length
        ? describeResumeReasons(payload.skipped[0].reasons)
        : null;
      
      if (is_defined(elements.logs)) {
        elements.logs.textContent += `\n${message}\n`;
        
        if (Array.isArray(payload?.queues)) {
          each(payload.queues, (q) => {
            elements.logs.textContent += `  - resumed queue ${q.id} ${q.url ? `(${q.url})` : ''}\n`;
          });
        }
        
        if (hasErrors) {
          elements.logs.textContent += `  Errors: ${payload.errors.length}\n`;
          const errorSlice = payload.errors.slice(0, 3);
          each(errorSlice, (err) => {
            elements.logs.textContent += `    - ${err.error || err}\n`;
          });
        }
        
        if (skippedReason) {
          elements.logs.textContent += `  Skipped: ${skippedReason}\n`;
        }
      }
      
      if (hasErrors || skippedReason || resumed === 0) {
        setResumeStatus(skippedReason ? `${message}. ${skippedReason}` : message, { error: hasErrors || resumed === 0 });
      } else {
        setResumeStatus(message, { ok: true });
      }
      
      await fetchResumeInventory({ silent: resumed === 0 && !hasErrors && !skippedReason });
      scheduleResumeInventoryRefresh(4000);
    } catch (err) {
      if (is_defined(elements.logs)) {
        elements.logs.textContent += `\nResume error: ${err?.message || err}\n`;
      }
      setResumeStatus(`Resume failed: ${err?.message || err}`, { error: true });
      await fetchResumeInventory({ silent: true });
    } finally {
      resumeActionPending = false;
      if (sourceButton) sourceButton.disabled = false;
      if (is_defined(elements.resumeAllBtn) && resumeInventoryState?.data) {
        const recommended = Array.isArray(resumeInventoryState.data.recommendedIds)
          ? resumeInventoryState.data.recommendedIds.length
          : 0;
        elements.resumeAllBtn.disabled = recommended === 0;
      }
    }
  }

  /**
   * Render jobs list from /api/crawls data
   */
  function renderJobs(jobs) {
    try {
      const el = elements.jobsList;
      if (!is_defined(el)) return;
      
      el.setAttribute('aria-busy', 'true');
      
      if (!jobs || !Array.isArray(jobs.items) || jobs.items.length === 0) {
        el.textContent = 'None';
        actions.setStage('idle');
        actions.hidePausedBadge();
        scheduleResumeInventoryRefresh(600);
        el.setAttribute('aria-busy', 'false');
        return;
      }
      
      const rows = [];
      each(jobs.items, (it) => {
        const url = it.url || '(unknown)';
        const v = it.visited ?? 0;
        const d = it.downloaded ?? 0;
        const e = it.errors ?? 0;
        const q = it.queueSize ?? 0;
        const act = it.lastActivityAt ? ` · active ${Math.round((Date.now() - it.lastActivityAt) / 1000)}s ago` : '';
        const pid = it.pid ? ` · pid ${it.pid}` : '';
        const stage = it.stage || '';
        const status = it.status || stage || 'running';
        const stageHint = stage && stage !== status ? ` (${stage})` : '';
        const statusLine = [];
        
        if (it.statusText) statusLine.push(it.statusText);
        
        const startupSummary = it.startup && typeof it.startup === 'object' ? it.startup.summary : null;
        if (startupSummary && startupSummary.done === false && Number.isFinite(startupSummary.progress)) {
          statusLine.push(`startup ${(Math.round(Math.max(0, Math.min(1, startupSummary.progress)) * 100))}%`);
        }
        
        const statusMeta = statusLine.length ? ` · ${statusLine.join(' · ')}` : '';
        rows.push(`<div><strong>${status}${stageHint}</strong>${pid}${statusMeta} — <a href="/url?url=${encodeURIComponent(url)}">${url}</a> — v:${v} d:${d} e:${e} q:${q}${act}</div>`);
      });
      
      el.innerHTML = rows.join('');
      el.setAttribute('aria-busy', 'false');
      
      if (jobs.items.length === 1) {
        const job = jobs.items[0];
        if (job.startup || job.statusText) {
          actions.updateStartupStatus(job.startup, job.statusText);
        }
        actions.setStage(job.stage || job.status || 'running');
        if (job.paused != null) {
          actions.setPausedBadge(!!job.paused);
        } else if (job.status === 'done') {
          actions.hidePausedBadge();
        }
        if (job.stage && /intelligent/i.test(job.stage)) {
          const stageType = job.crawlType === 'discover-structure' ? 'discover-structure' : 'intelligent';
          actions.setCrawlType(stageType);
        }
      } else {
        actions.setStage('multi-run');
        actions.setPausedBadge(null);
        actions.updateStartupStatus(null, null);
      }
      
      scheduleResumeInventoryRefresh(1200);
    } catch (_) {
    } finally {
      const el = elements.jobsList;
      if (is_defined(el)) el.setAttribute('aria-busy', 'false');
    }
  }

  /**
   * Setup resume control event listeners
   */
  function setupResumeControls() {
    if (is_defined(elements.resumeRefreshBtn)) {
      elements.resumeRefreshBtn.addEventListener('click', () => {
        fetchResumeInventory().catch(() => {});
      });
    }

    if (is_defined(elements.resumeAllBtn)) {
      elements.resumeAllBtn.addEventListener('click', () => {
        triggerResumeRequest({}).catch(() => {});
      });
    }

    if (is_defined(elements.resumeList)) {
      elements.resumeList.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-resume-queue]');
        if (!btn || btn.disabled) return;
        const id = Number(btn.dataset.resumeQueue);
        if (!Number.isFinite(id) || id <= 0) return;
        triggerResumeRequest({ queueIds: [id], sourceButton: btn }).catch(() => {});
      });
    }

    // Initial fetch if resume section exists
    if (is_defined(elements.resumeSection)) {
      fetchResumeInventory().catch(() => {});
    }
  }

  /**
   * Initial jobs poll (fallback if SSE arrives late)
   */
  async function initialJobsPoll() {
    try {
      const r = await fetch('/api/crawls');
      if (!r.ok) return;
      const j = await r.json();
      renderJobs(j);
    } catch (_) {}
  }

  // Export public API
  return {
    renderJobs,
    fetchResumeInventory,
    setupResumeControls,
    initialJobsPoll,
    scheduleResumeInventoryRefresh
  };
}
