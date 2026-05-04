/**
 * Place Matching App
 * Handles SSE connection and UI updates for the place matching backfill.
 */

const elements = {
  statusBadge: document.getElementById('status-badge'),
  progressFill: document.getElementById('progress-fill'),
  progressText: document.getElementById('progress-text'),
  statProcessed: document.getElementById('stat-processed'),
  statMatched: document.getElementById('stat-matched'),
  statRelations: document.getElementById('stat-relations'),
  statRate: document.getElementById('stat-rate'),
  statEta: document.getElementById('stat-eta'),
  diagId: document.getElementById('diag-id'),
  diagMatches: document.getElementById('diag-matches'),
  diagAvg: document.getElementById('diag-avg'),
  diagJson: document.getElementById('diag-json'),
  btnStart: document.getElementById('btn-start'),
  btnStop: document.getElementById('btn-stop')
};

let eventSource = null;

function connectSSE() {
  if (eventSource) return;

  eventSource = new EventSource('/sse/place-matching-progress');

  eventSource.onopen = () => {
    console.log('SSE Connected');
  };

  eventSource.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleMessage(msg);
    } catch (e) {
      console.error('Parse error:', e);
    }
  };

  eventSource.onerror = () => {
    console.log('SSE Disconnected');
    eventSource.close();
    eventSource = null;
    setTimeout(connectSSE, 2000);
  };
}

function handleMessage(msg) {
  if (msg.type === 'next') {
    updateState(msg.value);
  } else if (msg.type === 'complete') {
    updateState(msg.value);
    elements.statusBadge.textContent = 'Complete';
    elements.statusBadge.className = 'status-badge status-complete';
    elements.btnStart.disabled = false;
    elements.btnStop.disabled = true;
  } else if (msg.type === 'error') {
    console.error('Server error:', msg.error);
    elements.statusBadge.textContent = 'Error';
    elements.statusBadge.className = 'status-badge status-error';
  }
}

function updateState(state) {
  if (!state) return;

  // Status
  if (state.phase === 'running') {
    elements.statusBadge.textContent = 'Running';
    elements.statusBadge.className = 'status-badge status-running';
    elements.btnStart.disabled = true;
    elements.btnStop.disabled = false;
  }

  // Progress Bar
  const pct = state.total > 0 ? Math.min(100, (state.processed / state.total) * 100) : 0;
  elements.progressFill.style.transform = `scaleX(${pct / 100})`;
  elements.progressText.textContent = `${Math.round(pct)}%`;

  // Stats
  elements.statProcessed.textContent = state.processed.toLocaleString();
  elements.statMatched.textContent = state.matched.toLocaleString();
  elements.statRelations.textContent = state.relations.toLocaleString();
  elements.statRate.textContent = state.recordsPerSecond.toFixed(1);
  
  if (state.etaMs) {
    const seconds = Math.round(state.etaMs / 1000);
    if (seconds < 60) elements.statEta.textContent = `${seconds}s`;
    else elements.statEta.textContent = `${Math.round(seconds / 60)}m`;
  } else {
    elements.statEta.textContent = '--';
  }

  // Diagnostics
  if (state.currentArticleId) {
    elements.diagId.textContent = state.currentArticleId;
    elements.diagMatches.textContent = state.lastMatchCount;
    elements.diagAvg.textContent = state.avgItemMs;
    
    // Show last relations in JSON dump
    if (state.lastRelations && state.lastRelations.length > 0) {
      elements.diagJson.textContent = JSON.stringify(state.lastRelations, null, 2);
    } else {
      elements.diagJson.textContent = '(no matches in last item)';
    }
  }
}

// Controls
elements.btnStart.addEventListener('click', async () => {
  try {
    const res = await fetch('/api/start', { method: 'POST' });
    const data = await res.json();
    if (data.error) alert(data.error);
  } catch (e) {
    alert('Failed to start: ' + e.message);
  }
});

elements.btnStop.addEventListener('click', async () => {
  try {
    await fetch('/api/stop', { method: 'POST' });
  } catch (e) {
    alert('Failed to stop: ' + e.message);
  }
});

// Init
connectSSE();
