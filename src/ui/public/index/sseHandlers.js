/**
 * SSE (Server-Sent Events) Handlers Factory
 * 
 * Extracted from index.js for better modularity and testability.
 * Uses lang-tools patterns: each(), is_defined(), tof() for cleaner code.
 * 
 * Note: collective() from lang-tools was tested but does NOT work for
 * nested property access (e.g., classList.add). Using each() instead.
 */

import { each, is_defined, tof } from 'lang-tools';

/**
 * Creates SSE event handlers with dependency injection
 * 
 * @param {Object} deps Dependencies
 * @param {Object} deps.elements DOM elements
 * @param {Object} deps.state State management  
 * @param {Object} deps.actions App actions
 * @param {Object} deps.formatters Formatting functions
 * @param {Function} deps.markSseLive Callback to mark SSE as live
 * @param {Function} deps.scheduleFlush Callback to schedule log flush
 * @returns {Object} Event handlers for SSE client
 */
export function createSseHandlers({
  elements = {},
  state = {},
  actions = {},
  formatters = {},
  markSseLive = () => {},
  scheduleFlush = () => {}
} = {}) {
  
  // Extract elements for easier access
  const {
    logs,
    progress,
    pauseBtn,
    resumeBtn,
    inflightDiv,
    inflightList,
    metricVisited,
    metricDownloaded,
    metricSaved,
    metricFound,
    metricErrors,
    metricQueue,
    analysisStatus
  } = elements;

  // Extract formatters
  const {
    formatNumber = (n) => String(n),
    formatRelativeTime = (ts) => new Date(ts).toLocaleString()
  } = formatters;

  // Track last progress event to throttle updates
  let lastProgressAt = 0;

  /**
   * Handle log events
   */
  function handleLog(e) {
    markSseLive();
    try {
      const payload = JSON.parse(e.data);
      const line = String(payload.line || '');
      state.logEntries.push({ text: line, isErr: false });
      scheduleFlush();
    } catch (_) {}
  }

  /**
   * Handle error events
   */
  function handleError(e) {
    markSseLive();
    try {
      const payload = JSON.parse(e.data);
      const message = payload.message || (payload.code ? `HTTP ${payload.code}` : 'Error');
      const url = payload.url || '';
      state.logEntries.push({ text: `[ERROR] ${message} ${url}\n`, isErr: true });
      scheduleFlush();
    } catch (_) {}
  }

  /**
   * Handle jobs events
   */
  function handleJobs(e) {
    markSseLive();
    try {
      const payload = JSON.parse(e.data);
      if (actions.renderJobs) {
        actions.renderJobs(payload);
      }
    } catch (_) {}
  }

  /**
   * Handle problem events
   */
  function handleProblem(e) {
    markSseLive();
    try {
      const payload = JSON.parse(e.data);
      const list = document.getElementById('problemsList');
      if (!list) return;

      const ts = new Date().toLocaleTimeString();
      const kind = payload.kind || 'problem';
      const scope = payload.scope ? ` [${payload.scope}]` : '';
      const target = payload.target ? ` — ${payload.target}` : '';
      const message = payload.message || '';
      
      // Format details, truncate if too long
      let details = '';
      if (is_defined(payload.details)) {
        const detailsStr = tof(payload.details) === 'string' 
          ? payload.details 
          : JSON.stringify(payload.details);
        details = ` · details: ${detailsStr.slice(0, 200)}`;
      }

      const line = `<div><span class="muted">${ts}</span> <strong>${kind}</strong>${scope}${target} — ${message}${details}</div>`;
      
      if (list.classList.contains('muted')) {
        list.classList.remove('muted');
      }
      if (list.textContent === 'None') {
        list.textContent = '';
      }

      try {
        const div = document.createElement('div');
        div.innerHTML = line;
        if (list.firstChild) {
          list.insertBefore(div.firstChild, list.firstChild);
        } else {
          list.appendChild(div.firstChild);
        }

        // Remove old entries, keeping max 200
        let count = 0;
        const max = 200;
        each(Array.from(list.children), (child) => {
          count += 1;
          if (count > max) child.remove();
        });
      } catch (_) {
        list.innerHTML = line + (list.innerHTML || '');
      }
    } catch (_) {}
  }

  /**
   * Handle progress events (main crawler progress updates)
   * This is the largest handler, ~150 lines
   */
  function handleProgress(e) {
    markSseLive();
    
    const now = Date.now();
    // Throttle progress updates to max once per 200ms
    if (now - lastProgressAt < 200) return;
    lastProgressAt = now;

    try {
      const payload = JSON.parse(e.data);
      
      // Update startup status if provided
      if (actions.updateStartupStatus) {
        actions.updateStartupStatus(payload.startup, payload.statusText);
      }

      // Handle structure panel for discover-structure mode
      const incomingType = payload.crawlType || state.currentCrawlType;
      if (payload.structure && incomingType === 'discover-structure') {
        if (actions.renderStructureSummary) {
          actions.renderStructureSummary(payload.structure);
        }
      } else if (!payload.structure && state.structurePanel && 
                 state.structurePanel.dataset.active === '1' && 
                 state.structurePanel.dataset.hasData !== '1') {
        if (actions.renderStructureSummary) {
          actions.renderStructureSummary(null);
        }
      }

      // Log progress periodically (every 2 seconds)
      try {
        const lastLog = window.__lastProgressLogAt || 0;
        if (now - lastLog > 2000) {
          const line = `[PROGRESS] visited=${payload.visited || 0} downloaded=${payload.downloaded || 0} found=${payload.found || 0} saved=${payload.saved || 0} queue=${payload.queueSize || 0}\n`;
          state.logEntries.push({ text: line, isErr: false });
          scheduleFlush();
          window.__lastProgressLogAt = now;
        }
      } catch (_) {}

      // Update stage display with slow mode indicator if applicable
      const baseStage = payload.stage || null;
      let stageDisplay = baseStage;
      if (payload.slowMode) {
        const reason = payload.slowModeReason ? ` (${payload.slowModeReason})` : '';
        stageDisplay = stageDisplay
          ? `${stageDisplay} [slow mode${reason}]`
          : `slow mode${reason}`;
      }
      
      if (is_defined(stageDisplay) && actions.setStage) {
        actions.setStage(stageDisplay);
      } else if (is_defined(baseStage) && actions.setStage) {
        actions.setStage(baseStage);
      }

      // Update paused badge
      if (Object.prototype.hasOwnProperty.call(payload, 'paused') && actions.setPausedBadge) {
        actions.setPausedBadge(!!payload.paused);
      }

      // Update crawl type if changed
      if (payload.crawlType && (!state.currentCrawlType || state.currentCrawlType !== payload.crawlType)) {
        if (actions.setCrawlType) {
          actions.setCrawlType(payload.crawlType);
        }
      }

      // Handle planner active state
      if (!state.currentCrawlType && payload.plannerActive) {
        const fallbackType = payload.crawlType || 'intelligent';
        const plannerType = fallbackType === 'discover-structure' ? 'discover-structure' : 'intelligent';
        if (actions.setCrawlType) {
          actions.setCrawlType(plannerType);
        }
      }

      // Update metric displays using each() for cleaner iteration
      const metricUpdates = [
        { el: metricVisited, value: payload.visited },
        { el: metricDownloaded, value: payload.downloaded },
        { el: metricSaved, value: payload.saved },
        { el: metricFound, value: payload.found },
        { el: metricErrors, value: payload.errors }
      ];

      each(metricUpdates, (update) => {
        if (update.el && is_defined(update.value)) {
          update.el.textContent = formatNumber(update.value || 0);
        }
      });

      // Handle queue metric with special formatting
      const metricsResult = actions.handleMetricsProgress ? actions.handleMetricsProgress(payload, now) : {};
      const queueValue = is_defined(metricsResult.queueDisplay)
        ? metricsResult.queueDisplay
        : (actions.getQueueDisplayValue ? actions.getQueueDisplayValue(payload.queueSize || 0) : payload.queueSize);
      
      if (metricQueue && is_defined(queueValue)) {
        metricQueue.textContent = formatNumber(queueValue);
      }

      // Update progress text
      const stageLabel = payload.stage ? String(payload.stage).replace(/[_-]+/g, ' ') : '';
      const statusLabel = payload.statusText || stageLabel;
      const prefix = statusLabel ? `${statusLabel} · ` : '';
      if (progress) {
        progress.textContent = `${prefix}visited: ${payload.visited || 0}, downloaded: ${payload.downloaded || 0}, found: ${payload.found || 0}, saved: ${payload.saved || 0}`;
      }

      // Update pause/resume button states
      if (tof(payload.paused) === 'boolean') {
        if (pauseBtn) pauseBtn.disabled = !!payload.paused;
        if (resumeBtn) resumeBtn.disabled = !payload.paused;
      }

      // Update inflight downloads display
      const count = payload.currentDownloadsCount || (Array.isArray(payload.currentDownloads) ? payload.currentDownloads.length : 0) || 0;
      if (inflightDiv && inflightDiv.firstChild) {
        inflightDiv.firstChild.nodeValue = `current downloads: ${count}`;
      }

      if (Array.isArray(payload.currentDownloads) && inflightList) {
        // Group downloads by host
        const groups = new Map();
        each(payload.currentDownloads, (download) => {
          let host = '';
          try {
            host = new URL(download.url).hostname.toLowerCase();
          } catch (_) {
            host = '';
          }
          if (!groups.has(host)) groups.set(host, []);
          groups.get(host).push(download);
        });

        const limiterInfo = (payload && payload.perHostLimits) ? payload.perHostLimits : {};
        const lines = [];
        
        for (const [host, arr] of groups.entries()) {
          const items = arr.slice(0, 3).map((download) => {
            const age = tof(download.ageMs) === 'number' 
              ? ` ${(Math.round(download.ageMs / 100) / 10).toFixed(1)}s` 
              : '';
            const displayUrl = String(download.url || '').replace(/^https?:\/\//, '');
            return `<a href="/url?url=${encodeURIComponent(download.url)}">${displayUrl}</a><span style="color:#666;">${age}</span>`;
          }).join(' · ');

          let badge = '';
          try {
            const info = limiterInfo[host];
            if (info && info.rateLimited) {
              const tipParts = [
                `limit: ${info.limit ?? 'n/a'}/min`,
                info.intervalMs != null ? `interval: ~${info.intervalMs}ms` : null,
                info.backoffMs != null ? `backoff: ~${Math.ceil(info.backoffMs / 1000)}s` : null
              ];
              const tip = tipParts.filter(Boolean).join(' \n');
              badge = ` <span class="bad" title="${tip}">RATE LIMITED</span>`;
            }
          } catch (_) {}

          lines.push(`<li><strong>${host || '(unknown)'}</strong>${badge} — ${arr.length} ${items ? '· ' + items : ''}</li>`);
        }
        
        inflightList.innerHTML = lines.join('');
      }

      // Update pipeline execution state
      const executionPatch = {
        jobs: count,
        status: payload.paused ? 'pending' : 'running',
        statusLabel: payload.paused ? 'Paused' : 'Running'
      };
      
      if (tof(payload.queueSize) === 'number') {
        executionPatch.queue = is_defined(queueValue) ? queueValue : payload.queueSize;
      }

      const progressTs = payload.ts ? Date.parse(payload.ts) : now;
      if (actions.patchPipeline) {
        actions.patchPipeline({ execution: executionPatch });
      }

      // Collect insight updates
      const insightDetails = {};
      const insightExtras = { 
        source: 'progress', 
        timestamp: Number.isFinite(progressTs) ? progressTs : now 
      };
      let shouldUpdateInsights = false;

      // Check for various insight sources using is_defined()
      const insightSources = [
        { key: 'coverage', value: payload.coverage },
        { key: 'goalStates', value: payload.goalStates, isArray: true },
        { key: 'goalSummary', value: payload.goalSummary },
        { key: 'seededHubs', value: payload.seededHubs },
        { key: 'problems', value: payload.problems, isArray: true }
      ];

      each(insightSources, (source) => {
        if (source.isArray && Array.isArray(source.value)) {
          insightDetails[source.key] = source.value;
          shouldUpdateInsights = true;
        } else if (!source.isArray && is_defined(source.value)) {
          insightDetails[source.key] = source.value;
          shouldUpdateInsights = true;
        }
      });

      if (payload.queueHeatmap) {
        insightExtras.queueHeatmap = payload.queueHeatmap;
        shouldUpdateInsights = true;
      }

      if (shouldUpdateInsights && actions.updateIntelligentInsights) {
        actions.updateIntelligentInsights(insightDetails, insightExtras);
      }
    } catch (_) {}
  }

  /**
   * Handle milestone events
   */
  function handleMilestone(e) {
    markSseLive();
    try {
      const payload = JSON.parse(e.data);
      if (actions.handleMilestone) {
        actions.handleMilestone(payload);
      }
    } catch (_) {}
  }

  /**
   * Handle planner-stage events
   */
  function handlePlannerStage(e) {
    markSseLive();
    try {
      const payload = JSON.parse(e.data);
      if (actions.handlePlannerStage) {
        actions.handlePlannerStage(payload);
      }
    } catch (_) {}
  }

  /**
   * Handle analysis-progress events
   */
  function handleAnalysisProgress(e) {
    markSseLive();
    try {
      const payload = JSON.parse(e.data);
      if (actions.handleAnalysisProgress) {
        actions.handleAnalysisProgress(payload);
      }
    } catch (_) {}
  }

  /**
   * Handle done events
   */
  function handleDone(e) {
    markSseLive();
    try {
      const key = `done:${e.data}`;
      if (!window.__seenDone) window.__seenDone = new Set();
      if (window.__seenDone.has(key)) return;
      window.__seenDone.add(key);
    } catch (_) {}
    
    if (logs) {
      logs.textContent += `\nDONE: ${e.data}\n`;
    }
  }

  /**
   * Handle cache events
   */
  function handleCache(e) {
    markSseLive();
    try {
      const payload = JSON.parse(e.data);
      if (actions.handleCacheEvent) {
        actions.handleCacheEvent(payload);
      }

      try {
        const src = payload.source || 'cache';
        const age = tof(payload.ageSeconds) === 'number' 
          ? `${payload.ageSeconds}s` 
          : 'unknown';
        const url = payload.url || '';
        const line = `CACHE hit (${src}, age ${age}) ${url}\n`;
        state.logEntries.push({ text: line, isErr: false });
        scheduleFlush();
      } catch (_) {}
    } catch (_) {}
  }

  // Return handler object compatible with EventSource.addEventListener
  return {
    log: handleLog,
    error: handleError,
    jobs: handleJobs,
    problem: handleProblem,
    progress: handleProgress,
    milestone: handleMilestone,
    'planner-stage': handlePlannerStage,
    'analysis-progress': handleAnalysisProgress,
    done: handleDone,
    cache: handleCache
  };
}
