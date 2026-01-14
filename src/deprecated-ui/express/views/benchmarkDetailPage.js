const { escapeHtml } = require('../../../shared/utils/html');

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

function renderResultsSection(results) {
  if (!results || !results.sections) {
    return '<p class="ui-meta">No results available yet.</p>';
  }

  const sectionsHtml = results.sections.map(section => {
    const benchmarksHtml = section.benchmarks.map(bench => {
      const stats = bench.stats || {};
      return `
        <tr>
          <td>${escapeHtml(bench.name)}</td>
          <td>${stats.count || 0}</td>
          <td>${formatDuration(stats.minMs)}</td>
          <td>${formatDuration(stats.maxMs)}</td>
          <td>${formatDuration(stats.meanMs)}</td>
          <td>${formatDuration(stats.medianMs)}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="results-section">
        <h3>${escapeHtml(section.name)}</h3>
        <div class="table-responsive">
          <table class="results-table">
            <thead>
              <tr>
                <th>Benchmark</th>
                <th>Runs</th>
                <th>Min</th>
                <th>Max</th>
                <th>Mean</th>
                <th>Median</th>
              </tr>
            </thead>
            <tbody>${benchmarksHtml}</tbody>
          </table>
        </div>
      </div>
    `;
  }).join('');

  return sectionsHtml;
}

function renderBenchmarkDetailPage({ run, renderNav }) {
  const navRenderer = ensureRenderNav(renderNav);
  const navHtml = navRenderer('benchmarks', { variant: 'bar' });
  
  const duration = calculateDuration(run.startedAt, run.endedAt);
  const durationStr = formatDuration(duration);
  const status = formatStatus(run.status);
  const progress = run.progress || {};
  const isRunning = run.status === 'running';
  
  const progressPercent = progress.totalSections > 0 
    ? (progress.completedSections / progress.totalSections * 100) 
    : 0;

  const resultsHtml = renderResultsSection(run.results);

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Benchmark: ${escapeHtml(run.id)}</title>
  <link rel="stylesheet" href="/ui.css" />
  <link rel="stylesheet" href="/ui-dark.css" />
  <style>
    .benchmark-detail {
      max-width: 1200px;
      margin: 0 auto;
    }
    .benchmark-header {
      margin-bottom: 2rem;
    }
    .benchmark-info {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .benchmark-info__item {
      padding: 1rem;
      background: var(--color-surface, #f5f5f5);
      border-radius: 4px;
    }
    .benchmark-info__label {
      font-size: 0.875rem;
      color: var(--color-text-secondary, #666);
      margin-bottom: 0.25rem;
    }
    .benchmark-info__value {
      font-size: 1.25rem;
      font-weight: 500;
    }
    .benchmark-progress {
      margin: 2rem 0;
      padding: 1.5rem;
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
      height: 32px;
      background: var(--color-bg-secondary, #e0e0e0);
      border-radius: 4px;
      overflow: hidden;
      position: relative;
    }
    .benchmark-progress__fill {
      height: 100%;
      background: linear-gradient(90deg, #4caf50, #81c784);
      transition: width 0.3s ease;
    }
    .benchmark-progress__text {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-weight: 600;
      color: #333;
    }
    .benchmark-progress__current {
      margin-top: 0.5rem;
      font-style: italic;
      color: var(--color-text-secondary, #666);
    }
    .results-section {
      margin: 2rem 0;
    }
    .results-section h3 {
      margin-bottom: 1rem;
    }
    .results-table {
      width: 100%;
      border-collapse: collapse;
    }
    .results-table th,
    .results-table td {
      padding: 0.75rem;
      text-align: left;
      border-bottom: 1px solid var(--color-border, #ddd);
    }
    .results-table th {
      font-weight: 600;
      background: var(--color-surface, #f5f5f5);
    }
    .running-indicator {
      display: inline-block;
      animation: pulse 2s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  </style>
</head><body class="ui-page benchmark-detail-page">
  ${navHtml}
  <div class="ui-container benchmark-detail">
    <header class="benchmark-header">
      <h1>Benchmark: ${escapeHtml(run.id)}</h1>
      <p><a href="/benchmarks/ssr">← Back to all benchmarks</a></p>
    </header>
    
    <div class="benchmark-info">
      <div class="benchmark-info__item">
        <div class="benchmark-info__label">Status</div>
        <div class="benchmark-info__value" id="status">${status}</div>
      </div>
      <div class="benchmark-info__item">
        <div class="benchmark-info__label">Duration</div>
        <div class="benchmark-info__value" id="duration">${durationStr}</div>
      </div>
      <div class="benchmark-info__item">
        <div class="benchmark-info__label">Iterations</div>
        <div class="benchmark-info__value">${escapeHtml(String(run.iterations || '—'))}</div>
      </div>
      <div class="benchmark-info__item">
        <div class="benchmark-info__label">Started</div>
        <div class="benchmark-info__value">${escapeHtml(run.startedAt || '—')}</div>
      </div>
    </div>
    
    <div class="benchmark-progress" id="progress-container">
      <div class="benchmark-progress__header">
        <span class="benchmark-progress__label">Progress</span>
        <span class="benchmark-progress__count" id="progress-count">${progress.completedSections || 0} / ${progress.totalSections || 0} sections</span>
      </div>
      <div class="benchmark-progress__bar">
        <div class="benchmark-progress__fill" id="progress-fill" style="width: ${progressPercent}%"></div>
        <div class="benchmark-progress__text" id="progress-text">${Math.round(progressPercent)}%</div>
      </div>
      <div class="benchmark-progress__current" id="current-section">
        ${progress.currentSection ? `Current: ${escapeHtml(progress.currentSection)}` : ''}
      </div>
    </div>
    
    <div id="results-container">
      <h2>Results</h2>
      ${resultsHtml}
    </div>
    
    ${run.error ? `
    <div class="error-container" style="margin: 2rem 0; padding: 1rem; background: #ffebee; border-left: 4px solid #f44336; border-radius: 4px;">
      <h3 style="color: #c62828; margin-top: 0;">Error</h3>
      <pre style="white-space: pre-wrap; color: #d32f2f;">${escapeHtml(run.error)}</pre>
    </div>
    ` : ''}
  </div>
  
  <script>
    const runId = ${JSON.stringify(run.id)};
    const isRunning = ${isRunning};
    let pollInterval = null;
    
    function formatDuration(ms) {
      if (!Number.isFinite(ms) || ms <= 0) return '—';
      if (ms < 1000) return Math.floor(ms) + 'ms';
      const seconds = ms / 1000;
      if (seconds < 60) return seconds.toFixed(1) + 's';
      const minutes = Math.floor(seconds / 60);
      const remaining = Math.round(seconds % 60);
      return minutes + 'm ' + remaining + 's';
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
    
    async function updateProgress() {
      try {
        const response = await fetch('/api/benchmarks/' + runId);
        if (!response.ok) return;
        
        const data = await response.json();
        const run = data.run;
        
        // Update status
        document.getElementById('status').textContent = formatStatus(run.status);
        
        // Update duration
        const duration = calculateDuration(run.startedAt, run.endedAt);
        document.getElementById('duration').textContent = formatDuration(duration);
        
        // Update progress
        const progress = run.progress || {};
        const progressPercent = progress.totalSections > 0 
          ? (progress.completedSections / progress.totalSections * 100) 
          : 0;
        
        document.getElementById('progress-count').textContent = 
          (progress.completedSections || 0) + ' / ' + (progress.totalSections || 0) + ' sections';
        document.getElementById('progress-fill').style.width = progressPercent + '%';
        document.getElementById('progress-text').textContent = Math.round(progressPercent) + '%';
        
        const currentSection = document.getElementById('current-section');
        if (progress.currentSection) {
          currentSection.textContent = 'Current: ' + progress.currentSection;
        } else if (run.status === 'completed') {
          currentSection.textContent = 'Completed!';
        } else {
          currentSection.textContent = '';
        }
        
        // Stop polling if completed or failed
        if (run.status !== 'running' && pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
          
          // Reload to show results
          if (run.status === 'completed') {
            setTimeout(() => location.reload(), 1000);
          }
        }
      } catch (err) {
        console.error('Failed to update progress:', err);
      }
    }
    
    // Start polling if running
    if (isRunning) {
      pollInterval = setInterval(updateProgress, 2000);
      updateProgress(); // Initial update
    }
  </script>
</body></html>`;
}

module.exports = { renderBenchmarkDetailPage };
