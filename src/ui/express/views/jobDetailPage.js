'use strict';

const { escapeHtml } = require('../utils/html');

/**
 * Renders the job detail SSR page with isomorphic components
 * Supports progressive enhancement with client-side hydration
 */
function renderJobDetailPage({ job, renderNav }) {
  const jobId = escapeHtml(job.id || 'unknown');
  const url = escapeHtml(job.url || 'N/A');
  const status = escapeHtml(job.status || 'unknown');
  const statusText = escapeHtml(job.statusText || '');
  const stage = escapeHtml(job.stage || 'N/A');
  
  const visited = job.visited || 0;
  const downloaded = job.downloaded || 0;
  const errors = job.errors || 0;
  const queueSize = job.queueSize || 0;
  const paused = job.paused || false;

  const startedAt = job.startedAt ? new Date(job.startedAt).toISOString() : 'N/A';
  const lastActivityAt = job.lastActivityAt ? new Date(job.lastActivityAt).toISOString() : 'N/A';
  const stageChangedAt = job.stageChangedAt ? new Date(job.stageChangedAt).toISOString() : 'N/A';

  const achievements = job.achievements || [];
  const lifecycle = job.lifecycle || null;

  const successRate = visited > 0 ? ((downloaded / visited) * 100).toFixed(1) : '0.0';
  const errorRate = visited > 0 ? ((errors / visited) * 100).toFixed(1) : '0.0';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Job ${jobId} - Crawl Detail</title>
  <link rel="stylesheet" href="/theme/theme.css">
  <link rel="stylesheet" href="/styles/ui.css">
  <style>
    .job-detail {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem 1rem;
    }
    .job-header {
      background: var(--surface-1);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 2rem;
    }
    .job-header h1 {
      margin: 0 0 0.5rem 0;
      font-size: 1.75rem;
    }
    .job-header .url {
      color: var(--text-2);
      word-break: break-all;
      margin-bottom: 1rem;
    }
    .job-status {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.25rem 0.75rem;
      border-radius: 4px;
      font-weight: 500;
      font-size: 0.875rem;
    }
    .job-status--running { background: #10b981; color: white; }
    .job-status--paused { background: #f59e0b; color: white; }
    .job-status--completed { background: #6366f1; color: white; }
    .job-status--error { background: #ef4444; color: white; }
    .job-status--unknown { background: #6b7280; color: white; }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .metric-card {
      background: var(--surface-1);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.25rem;
      text-align: center;
    }
    .metric-card__value {
      font-size: 2rem;
      font-weight: 700;
      color: var(--text-1);
      display: block;
      margin-bottom: 0.25rem;
    }
    .metric-card__label {
      color: var(--text-2);
      font-size: 0.875rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .metric-card--success .metric-card__value { color: #10b981; }
    .metric-card--error .metric-card__value { color: #ef4444; }
    .metric-card--warning .metric-card__value { color: #f59e0b; }

    .info-section {
      background: var(--surface-1);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 2rem;
    }
    .info-section h2 {
      margin: 0 0 1rem 0;
      font-size: 1.25rem;
      color: var(--text-1);
    }
    .info-grid {
      display: grid;
      gap: 0.75rem;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 0.5rem 0;
      border-bottom: 1px solid var(--border-subtle);
    }
    .info-row:last-child {
      border-bottom: none;
    }
    .info-row__label {
      color: var(--text-2);
      font-weight: 500;
    }
    .info-row__value {
      color: var(--text-1);
      font-family: 'Courier New', monospace;
      text-align: right;
    }

    .achievements-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .achievement-item {
      background: var(--surface-2);
      border-left: 3px solid #10b981;
      padding: 0.75rem 1rem;
      margin-bottom: 0.5rem;
      border-radius: 4px;
    }
    .achievement-item__title {
      font-weight: 600;
      color: var(--text-1);
      margin-bottom: 0.25rem;
    }
    .achievement-item__timestamp {
      font-size: 0.75rem;
      color: var(--text-3);
      font-family: 'Courier New', monospace;
    }

    .back-link {
      display: inline-block;
      margin-bottom: 1rem;
      color: var(--link);
      text-decoration: none;
    }
    .back-link:hover {
      text-decoration: underline;
    }

    @media (prefers-color-scheme: dark) {
      .job-header, .metric-card, .info-section {
        background: var(--surface-2);
      }
    }
  </style>
</head>
<body>
  ${renderNav('crawls')}
  
  <div class="job-detail">
    <a href="/crawls/ssr" class="back-link">← Back to Crawls List</a>

    <div class="job-header">
      <h1>Job ${jobId}</h1>
      <div class="url">${url}</div>
      <div>
        <span class="job-status job-status--${status}">${status}</span>
        ${statusText ? `<span style="margin-left: 1rem; color: var(--text-2);">${statusText}</span>` : ''}
      </div>
    </div>

    <div class="metrics-grid">
      <div class="metric-card">
        <span class="metric-card__value">${visited}</span>
        <span class="metric-card__label">Visited</span>
      </div>
      <div class="metric-card metric-card--success">
        <span class="metric-card__value">${downloaded}</span>
        <span class="metric-card__label">Downloaded</span>
      </div>
      <div class="metric-card metric-card--error">
        <span class="metric-card__value">${errors}</span>
        <span class="metric-card__label">Errors</span>
      </div>
      <div class="metric-card metric-card--warning">
        <span class="metric-card__value">${queueSize}</span>
        <span class="metric-card__label">Queue Size</span>
      </div>
      <div class="metric-card metric-card--success">
        <span class="metric-card__value">${successRate}%</span>
        <span class="metric-card__label">Success Rate</span>
      </div>
      <div class="metric-card metric-card--error">
        <span class="metric-card__value">${errorRate}%</span>
        <span class="metric-card__label">Error Rate</span>
      </div>
    </div>

    <div class="info-section">
      <h2>Job Information</h2>
      <div class="info-grid">
        <div class="info-row">
          <span class="info-row__label">Job ID</span>
          <span class="info-row__value">${jobId}</span>
        </div>
        <div class="info-row">
          <span class="info-row__label">Status</span>
          <span class="info-row__value">${status}</span>
        </div>
        <div class="info-row">
          <span class="info-row__label">Stage</span>
          <span class="info-row__value">${stage}</span>
        </div>
        <div class="info-row">
          <span class="info-row__label">Paused</span>
          <span class="info-row__value">${paused ? 'Yes' : 'No'}</span>
        </div>
        <div class="info-row">
          <span class="info-row__label">Started At</span>
          <span class="info-row__value">${escapeHtml(startedAt)}</span>
        </div>
        <div class="info-row">
          <span class="info-row__label">Last Activity</span>
          <span class="info-row__value">${escapeHtml(lastActivityAt)}</span>
        </div>
        <div class="info-row">
          <span class="info-row__label">Stage Changed At</span>
          <span class="info-row__value">${escapeHtml(stageChangedAt)}</span>
        </div>
        ${job.pid ? `
        <div class="info-row">
          <span class="info-row__label">Process ID</span>
          <span class="info-row__value">${escapeHtml(String(job.pid))}</span>
        </div>
        ` : ''}
      </div>
    </div>

    ${achievements.length > 0 ? `
    <div class="info-section">
      <h2>Recent Achievements</h2>
      <ul class="achievements-list" id="achievements-list">
        ${achievements.map(achievement => `
          <li class="achievement-item">
            <div class="achievement-item__title">${escapeHtml(achievement.type || achievement.message || 'Achievement')}</div>
            ${achievement.timestamp ? `<div class="achievement-item__timestamp">${escapeHtml(new Date(achievement.timestamp).toISOString())}</div>` : ''}
            ${achievement.details ? `<div style="font-size: 0.875rem; color: var(--text-2); margin-top: 0.25rem;">${escapeHtml(JSON.stringify(achievement.details))}</div>` : ''}
          </li>
        `).join('')}
      </ul>
    </div>
    ` : ''}

    ${lifecycle ? `
    <div class="info-section">
      <h2>Lifecycle</h2>
      <pre style="background: var(--surface-3); padding: 1rem; border-radius: 4px; overflow-x: auto; font-size: 0.875rem;">${escapeHtml(JSON.stringify(lifecycle, null, 2))}</pre>
    </div>
    ` : ''}
  </div>

  <!-- Progressive Enhancement Script -->
  <script type="module">
    // Isomorphic component - hydrates the server-rendered page with real-time updates
    class JobDetailPage {
      constructor(jobId) {
        this.jobId = jobId;
        this.eventSource = null;
        this.updateInterval = null;
      }

      async init() {
        console.log('[JobDetail] Initializing client-side enhancements for job:', this.jobId);
        
        // Connect to SSE for real-time updates
        this.connectSSE();
        
        // Poll for updates every 2 seconds as fallback
        this.startPolling();
      }

      connectSSE() {
        this.eventSource = new EventSource('/events');
        
        this.eventSource.addEventListener('jobs', (e) => {
          try {
            const data = JSON.parse(e.data);
            const job = data.items?.find(item => item.id === this.jobId);
            if (job) {
              this.updateMetrics(job);
            }
          } catch (err) {
            console.error('[JobDetail] SSE jobs event error:', err);
          }
        });

        this.eventSource.addEventListener('milestone', (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data.jobId === this.jobId) {
              this.addAchievement(data);
            }
          } catch (err) {
            console.error('[JobDetail] SSE milestone event error:', err);
          }
        });

        this.eventSource.addEventListener('done', (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data.jobId === this.jobId) {
              console.log('[JobDetail] Job completed, refreshing page...');
              this.eventSource.close();
              clearInterval(this.updateInterval);
              // Optionally reload to show final state
              setTimeout(() => window.location.reload(), 1000);
            }
          } catch (err) {
            console.error('[JobDetail] SSE done event error:', err);
          }
        });

        this.eventSource.onerror = (err) => {
          console.error('[JobDetail] SSE connection error:', err);
        };

        console.log('[JobDetail] SSE connection established');
      }

      startPolling() {
        this.updateInterval = setInterval(() => {
          this.fetchJobData();
        }, 2000);
      }

      async fetchJobData() {
        try {
          const response = await fetch('/api/crawls/summary');
          const data = await response.json();
          const job = data.items?.find(item => item.id === this.jobId);
          if (job) {
            this.updateMetrics(job);
          }
        } catch (err) {
          console.error('[JobDetail] Polling error:', err);
        }
      }

      updateMetrics(job) {
        // Update metric cards
        const metrics = [
          { selector: '.metric-card:nth-child(1) .metric-card__value', value: job.visited || 0 },
          { selector: '.metric-card:nth-child(2) .metric-card__value', value: job.downloaded || 0 },
          { selector: '.metric-card:nth-child(3) .metric-card__value', value: job.errors || 0 },
          { selector: '.metric-card:nth-child(4) .metric-card__value', value: job.queueSize || 0 }
        ];

        metrics.forEach(({ selector, value }) => {
          const el = document.querySelector(selector);
          if (el && el.textContent !== String(value)) {
            el.textContent = value;
            el.style.transition = 'color 0.3s';
            el.style.color = '#10b981';
            setTimeout(() => { el.style.color = ''; }, 300);
          }
        });

        // Update success/error rates
        const visited = job.visited || 0;
        if (visited > 0) {
          const successRate = ((job.downloaded / visited) * 100).toFixed(1);
          const errorRate = ((job.errors / visited) * 100).toFixed(1);
          
          const successEl = document.querySelector('.metric-card:nth-child(5) .metric-card__value');
          const errorEl = document.querySelector('.metric-card:nth-child(6) .metric-card__value');
          
          if (successEl) successEl.textContent = successRate + '%';
          if (errorEl) errorEl.textContent = errorRate + '%';
        }

        // Update status
        const statusEl = document.querySelector('.job-status');
        if (statusEl && job.status) {
          const currentStatus = statusEl.textContent.trim();
          if (currentStatus !== job.status) {
            statusEl.textContent = job.status;
            statusEl.className = \`job-status job-status--\${job.status}\`;
          }
        }
      }

      addAchievement(achievement) {
        const list = document.getElementById('achievements-list');
        if (!list) return;

        const item = document.createElement('li');
        item.className = 'achievement-item';
        item.innerHTML = \`
          <div class="achievement-item__title">\${this.escapeHtml(achievement.type || achievement.message || 'Achievement')}</div>
          \${achievement.timestamp ? \`<div class="achievement-item__timestamp">\${this.escapeHtml(new Date(achievement.timestamp).toISOString())}</div>\` : ''}
        \`;
        
        list.insertBefore(item, list.firstChild);
        
        // Highlight animation
        item.style.animation = 'fadeIn 0.5s';
      }

      escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
      }

      destroy() {
        if (this.eventSource) {
          this.eventSource.close();
        }
        if (this.updateInterval) {
          clearInterval(this.updateInterval);
        }
      }
    }

    // Auto-initialize on page load
    const jobId = '${jobId.replace(/'/g, "\\'")}';
    const page = new JobDetailPage(jobId);
    page.init();

    // Cleanup on unload
    window.addEventListener('beforeunload', () => {
      page.destroy();
    });
  </script>

  <style>
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }
  </style>
</body>
</html>`;
}

module.exports = { renderJobDetailPage };
