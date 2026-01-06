/**
 * Analysis Progress Client - SSE consumer for analysis progress display
 */
(function() {
  'use strict';

  // Elements
  const els = {
    connectionDot: document.getElementById('connection-dot'),
    connectionText: document.getElementById('connection-text'),
    statusBadge: document.getElementById('status-badge'),
    progressBar: document.getElementById('progress-bar'),
    progressText: document.getElementById('progress-text'),
    currentUrl: document.getElementById('current-url'),
    statProcessed: document.getElementById('stat-processed'),
    statUpdated: document.getElementById('stat-updated'),
    statBytes: document.getElementById('stat-bytes'),
    statElapsed: document.getElementById('stat-elapsed'),
    statEta: document.getElementById('stat-eta'),
    statRecordsSec: document.getElementById('stat-records-sec'),
    chartBars: document.getElementById('chart-bars'),
    btnStart: document.getElementById('btn-start'),
    btnStop: document.getElementById('btn-stop'),
    // New elements
    versionBadge: document.getElementById('version-badge'),
    warningBanner: document.getElementById('warning-banner'),
    warningText: document.getElementById('warning-text'),
    timingInfo: document.getElementById('timing-info'),
    timingAvg: document.getElementById('timing-avg'),
    timingLast: document.getElementById('timing-last'),
    timingPlaces: document.getElementById('timing-places'),
    xpathBadge: document.getElementById('xpath-badge'),
    timingBreakdown: document.getElementById('timing-breakdown'),
    breakdownOverall: document.getElementById('breakdown-overall'),
    breakdownPreparation: document.getElementById('breakdown-preparation'),
    breakdownJsdom: document.getElementById('breakdown-jsdom'),
    breakdownReadability: document.getElementById('breakdown-readability'),
    breakdownXpath: document.getElementById('breakdown-xpath')
  };

  // State
  let eventSource = null;
  let throughputHistory = [];
  const MAX_CHART_BARS = 60;
  let pollTimer = null;
  let pollInUse = false;

  const urlParams = new URLSearchParams(window.location.search);
  const viewMode = (urlParams.get('view') || '').toLowerCase();
  const isKiosk = viewMode === 'kiosk';
  const wantsAutoStart = urlParams.get('autostart') === '1' || isKiosk;

  // Formatters
  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  function formatDuration(ms) {
    if (ms == null || ms < 0) return '--';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return hours + ':' + String(mins).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
    }
    return minutes + ':' + String(seconds).padStart(2, '0');
  }

  function formatNumber(n) {
    if (n == null) return '0';
    return n.toLocaleString();
  }

  async function fetchStateOnce() {
    try {
      const res = await fetch('/api/analysis/state');
      if (!res.ok) return;
      const payload = await res.json();
      if (payload && payload.state) {
        updateUI(payload.state);
      }
    } catch (_) {
      // ignore polling errors
    }
  }

  function startPolling() {
    if (pollTimer) return;
    pollInUse = true;
    els.connectionDot.classList.remove('connected');
    els.connectionText.textContent = 'Polling';
    fetchStateOnce();
    pollTimer = setInterval(fetchStateOnce, 2000);
  }

  function stopPolling() {
    if (!pollTimer) return;
    clearInterval(pollTimer);
    pollTimer = null;
    pollInUse = false;
  }

  // Update timing breakdown value with color coding
  function updateBreakdownValue(el, ms) {
    if (ms == null) {
      el.textContent = '--';
      el.className = 'timing-breakdown-value';
      return;
    }
    el.textContent = ms < 1000 
      ? ms.toFixed(0) + 'ms'
      : (ms / 1000).toFixed(1) + 's';
    
    // Color code based on speed
    if (ms < 1000) {
      el.className = 'timing-breakdown-value fast';
    } else if (ms < 10000) {
      el.className = 'timing-breakdown-value slow';
    } else {
      el.className = 'timing-breakdown-value very-slow';
    }
  }

  // Update UI
  function updateUI(state) {
    if (!state) return;

    // Progress bar
    const percent = state.total > 0 ? (state.processed / state.total) * 100 : 0;
    els.progressBar.style.width = percent.toFixed(1) + '%';
    els.progressText.textContent = formatNumber(state.processed) + ' / ' + formatNumber(state.total);

    // Status badge
    let statusClass = 'status-idle';
    let statusText = 'Idle';
    if (state.phase === 'starting') {
      statusClass = 'status-running';
      statusText = 'Starting';
    } else if (state.phase === 'analyzing') {
      statusClass = 'status-running';
      statusText = 'Analyzing';
    } else if (state.phase === 'complete') {
      statusClass = 'status-complete';
      statusText = 'Complete';
    } else if (state.lastError) {
      statusClass = 'status-error';
      statusText = 'Error';
    }
    els.statusBadge.className = 'status-badge ' + statusClass;
    els.statusBadge.textContent = statusText;

    // Current URL
    if (state.currentUrl) {
      els.currentUrl.textContent = state.currentUrl;
      els.currentUrl.title = state.currentUrl;
    } else if (state.phase === 'complete') {
      els.currentUrl.textContent = 'Analysis complete!';
    } else {
      els.currentUrl.textContent = 'Waiting...';
    }

    // Stats
    els.statProcessed.textContent = formatNumber(state.processed);
    els.statUpdated.textContent = formatNumber(state.updated);
    els.statBytes.textContent = formatBytes(state.bytesProcessed || 0);
    els.statElapsed.textContent = formatDuration(state.elapsedMs);
    els.statEta.textContent = formatDuration(state.etaMs);
    els.statRecordsSec.textContent = (state.recordsPerSecond || 0).toFixed(1);

    // Throughput chart
    if (state.recordsPerSecond != null) {
      throughputHistory.push(state.recordsPerSecond);
      if (throughputHistory.length > MAX_CHART_BARS) {
        throughputHistory.shift();
      }
      updateChart();
    }

    // Button states
    const isRunning = state.phase === 'analyzing' || state.phase === 'starting';
    els.btnStart.disabled = isRunning;
    els.btnStop.disabled = !isRunning;

    // Version badge (from summary if available)
    if (state.summary && state.summary.version) {
      els.versionBadge.textContent = 'v' + state.summary.version;
    }

    // Timing info
    if (state.avgItemMs != null || state.lastItemMs != null) {
      els.timingInfo.style.display = 'flex';
      els.timingAvg.textContent = state.avgItemMs != null
        ? (state.avgItemMs / 1000).toFixed(1) + 's'
        : '--';
      els.timingLast.textContent = state.lastItemMs != null
        ? (state.lastItemMs / 1000).toFixed(1) + 's'
        : '--';
      els.timingPlaces.textContent = formatNumber(state.placesInserted || 0);
    }

    // XPath badge (shows whether fast path was used)
    if (state.timingBreakdown) {
      const usedXPath = state.timingBreakdown.usedXPath;
      els.xpathBadge.style.display = 'inline-block';
      if (usedXPath) {
        els.xpathBadge.textContent = 'XPath ✓';
        els.xpathBadge.className = 'xpath-badge hit';
      } else {
        els.xpathBadge.textContent = 'JSDOM';
        els.xpathBadge.className = 'xpath-badge miss';
      }
    } else {
      els.xpathBadge.style.display = 'none';
    }

    // Timing breakdown panel
    if (state.timingBreakdown) {
      els.timingBreakdown.classList.add('visible');
      updateBreakdownValue(els.breakdownOverall, state.timingBreakdown.overallMs);
      updateBreakdownValue(els.breakdownPreparation, state.timingBreakdown.preparationMs);
      updateBreakdownValue(els.breakdownJsdom, state.timingBreakdown.jsdomMs);
      updateBreakdownValue(els.breakdownReadability, state.timingBreakdown.readabilityMs);
      updateBreakdownValue(els.breakdownXpath, state.timingBreakdown.xpathExtractionMs);
    }

    // Warnings
    if (state.warnings && state.warnings.length > 0) {
      els.warningBanner.classList.add('visible');
      els.warningText.textContent = state.warnings.map(w => w.message).join(' | ');
    } else {
      els.warningBanner.classList.remove('visible');
    }
  }

  function updateChart() {
    if (throughputHistory.length === 0) return;

    const maxVal = Math.max(...throughputHistory, 0.1);
    
    els.chartBars.innerHTML = throughputHistory.map(val => {
      const heightPercent = (val / maxVal) * 100;
      return '<div class="chart-bar" style="height: ' + heightPercent + '%"></div>';
    }).join('');
  }

  // SSE Connection
  function connect() {
    if (eventSource) {
      eventSource.close();
    }

    eventSource = new EventSource('/sse/analysis-progress');

    eventSource.onopen = function() {
      els.connectionDot.classList.add('connected');
      els.connectionText.textContent = 'Connected';
      stopPolling();
    };

    eventSource.onerror = function() {
      els.connectionDot.classList.remove('connected');
      els.connectionText.textContent = pollInUse ? 'Polling' : 'Disconnected';

      // SSE can be flaky in some environments (notably VS Code Simple Browser).
      // Fall back to polling so the progress bar still updates.
      startPolling();
      
      // Reconnect after delay
      setTimeout(connect, 3000);
    };

    eventSource.onmessage = function(event) {
      try {
        const msg = JSON.parse(event.data);
        
        if (msg.type === 'next' && msg.value) {
          updateUI(msg.value);
        } else if (msg.type === 'complete') {
          updateUI({ phase: 'complete', ...msg.value });
        } else if (msg.type === 'error') {
          console.error('Analysis error:', msg.error);
          els.statusBadge.className = 'status-badge status-error';
          els.statusBadge.textContent = 'Error';
          els.currentUrl.textContent = 'Error: ' + (msg.error || 'Unknown error');
        }
      } catch (e) {
        console.error('Failed to parse SSE message:', e);
      }
    };
  }

  // Button handlers
  els.btnStart.addEventListener('click', async function() {
    try {
      // Reset chart
      throughputHistory = [];
      updateChart();

      const res = await fetch('/api/analysis/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      
      if (!res.ok) {
        const err = await res.json();
        alert('Failed to start: ' + (err.error || res.status));
      }
    } catch (e) {
      console.error('Start failed:', e);
      alert('Failed to start analysis: ' + e.message);
    }
  });

  els.btnStop.addEventListener('click', async function() {
    try {
      await fetch('/api/analysis/stop', { method: 'POST' });
    } catch (e) {
      console.error('Stop failed:', e);
    }
  });

  // Fetch version info on load
  async function loadVersionInfo() {
    try {
      const res = await fetch('/api/version-info');
      if (res.ok) {
        const info = await res.json();
        els.versionBadge.textContent = 'v' + info.targetVersion;
        els.versionBadge.title = `Target: v${info.targetVersion} | Max: v${info.currentMaxVersion} | Pending: ${formatNumber(info.pendingRecords)}`;
      }
    } catch (e) {
      console.warn('Failed to load version info:', e);
    }
  }

  // Initialize
  if (isKiosk) {
    document.body.classList.add('kiosk');
  }
  loadVersionInfo();
  connect();

  if (wantsAutoStart) {
    // Give the page a moment to establish SSE; if SSE fails, polling still updates.
    setTimeout(async () => {
      try {
        await fetch('/api/analysis/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
      } catch (_) {
        // ignore
      }
    }, 400);
  }

})();
