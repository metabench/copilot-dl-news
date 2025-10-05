const { escapeHtml } = require('../utils/html');

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  if (ms < 1000) return `${ms | 0}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${minutes}m ${remaining}s`;
}

function calculateDuration(startedAt, endedAt) {
  if (!startedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  return end - start;
}

function formatStatus(status) {
  const statusMap = {
    running: '🔄 Running',
    completed: '✅ Completed',
    failed: '❌ Failed'
  };
  return statusMap[status] || status;
}

function ensureRenderNav(fn) {
  if (typeof fn === 'function') return fn;
  return () => '';
}

function renderBenchmarkListPage({ items = [], total = 0, limit = 50, renderNav }) {
  const navRenderer = ensureRenderNav(renderNav);
  const safeLimit = Number.isFinite(limit) ? limit : 50;
  const navHtml = navRenderer('benchmarks', { variant: 'bar' });

  // Calculate overall progress for active runs
  const activeRuns = items.filter(r => r.status === 'running');
  const totalBenchmarks = activeRuns.reduce((sum, r) => sum + (r.progress?.totalSections || 0), 0);
  const completedBenchmarks = activeRuns.reduce((sum, r) => sum + (r.progress?.completedSections || 0), 0);
  
  const progressBarHtml = activeRuns.length > 0 ? `
    <div class="benchmark-progress">
      <div class="benchmark-progress__header">
        <span class="benchmark-progress__label">Active Benchmarks Progress</span>
        <span class="benchmark-progress__count">${completedBenchmarks} / ${totalBenchmarks} sections complete</span>
      </div>
      <div class="benchmark-progress__bar">
        <div class="benchmark-progress__fill" style="width: ${totalBenchmarks > 0 ? (completedBenchmarks / totalBenchmarks * 100) : 0}%"></div>
      </div>
    </div>
  ` : '';

  const rowsHtml = items.length ? items.map((run) => {
    const duration = calculateDuration(run.startedAt, run.endedAt);
    const durationStr = formatDuration(duration);
    const status = formatStatus(run.status);
    const progress = run.progress || {};
    const progressStr = run.status === 'running' 
      ? `${progress.completedSections || 0}/${progress.totalSections || 0}` 
      : '—';
    
    return `
      <tr>
        <td class="text-mono"><a href="/benchmarks/${escapeHtml(run.id)}/ssr">${escapeHtml(run.id)}</a></td>
        <td>${status}</td>
        <td>${progressStr}</td>
        <td class="u-nowrap">${escapeHtml(run.startedAt || '—')}</td>
        <td class="u-nowrap">${escapeHtml(run.endedAt || '—')}</td>
        <td>${durationStr}</td>
        <td>${escapeHtml(String(run.iterations || '—'))}</td>
      </tr>
    `;
  }).join('') : '<tr><td colspan="7" class="ui-meta">No benchmark runs yet.</td></tr>';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Benchmark Runs</title>
  <link rel="stylesheet" href="/ui.css" />
  <link rel="stylesheet" href="/ui-dark.css" />
  <style>
    .benchmark-progress {
      margin: 1.5rem 0;
      padding: 1rem;
      background: var(--color-surface, #f5f5f5);
      border-radius: 4px;
    }
    .benchmark-progress__header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 0.5rem;
      font-weight: 500;
    }
    .benchmark-progress__bar {
      height: 24px;
      background: var(--color-bg-secondary, #e0e0e0);
      border-radius: 4px;
      overflow: hidden;
    }
    .benchmark-progress__fill {
      height: 100%;
      background: linear-gradient(90deg, #4caf50, #81c784);
      transition: width 0.3s ease;
    }
    .benchmark-actions {
      margin: 1rem 0;
    }
    .benchmark-actions__button {
      padding: 0.5rem 1rem;
      background: #2196f3;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 1rem;
    }
    .benchmark-actions__button:hover {
      background: #1976d2;
    }
  </style>
</head><body class="ui-page benchmark-list-page">
  ${navHtml}
  <div class="ui-container benchmark-list-page__layout">
    <header class="benchmark-list-page__header">
      <h1>Benchmark Runs</h1>
    </header>
    
    ${progressBarHtml}
    
    <div class="benchmark-actions">
      <button class="benchmark-actions__button" onclick="startBenchmark()">Start New Benchmark</button>
      <button class="benchmark-actions__button" onclick="location.reload()" style="background: #666; margin-left: 0.5rem;">Refresh</button>
    </div>
    
    <form class="ui-filters" method="GET" action="/benchmarks/ssr">
      <label class="ui-filters__label">Limit <input type="number" min="1" max="200" name="limit" value="${escapeHtml(String(safeLimit))}"/></label>
      <button type="submit" class="ui-button">Apply</button>
      <span class="ui-meta">Total ${escapeHtml(String(total))}</span>
    </form>
    <div class="table-responsive">
      <table class="benchmark-list-page__table">
        <thead><tr><th>ID</th><th>Status</th><th>Progress</th><th>Started</th><th>Ended</th><th>Duration</th><th>Iterations</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  </div>
  
  <script>
    async function startBenchmark() {
      const iterations = prompt('Number of iterations (1-20):', '5');
      if (!iterations) return;
      
      try {
        const response = await fetch('/api/benchmarks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ iterations: parseInt(iterations, 10) })
        });
        
        if (!response.ok) {
          const error = await response.json();
          alert('Failed to start benchmark: ' + (error.message || 'Unknown error'));
          return;
        }
        
        const result = await response.json();
        window.location.href = '/benchmarks/' + result.runId + '/ssr';
      } catch (err) {
        alert('Failed to start benchmark: ' + err.message);
      }
    }
  </script>
</body></html>`;
}

module.exports = { renderBenchmarkListPage };
