import { each, is_defined } from 'lang-tools';

/**
 * Jobs Manager factory responsible for rendering active crawl jobs and
 * synchronizing UI state (stage badges, paused indicators, coverage hints).
 */
export function createJobsManager({
  elements = {},
  actions = {},
  scheduleResumeInventoryRefresh = () => {}
} = {}) {
  const {
    jobsList
  } = elements;

  const {
    setStage = () => {},
    setPausedBadge = () => {},
    hidePausedBadge = () => {},
    setCrawlType = () => {},
    updateStartupStatus = () => {}
  } = actions;

  function renderEmptyState(target) {
    if (!target) {
      return;
    }
    target.innerHTML = '<div class="jobs-empty-state"><span class="jobs-empty-icon">📭</span><p>No active crawls</p></div>';
    setStage('idle');
    hidePausedBadge();
    scheduleResumeInventoryRefresh(600);
    target.setAttribute('aria-busy', 'false');
  }

  function renderJobs(jobs) {
    try {
      const target = jobsList;
      if (!is_defined(target)) {
        return;
      }
      target.setAttribute('aria-busy', 'true');

      if (!jobs || !Array.isArray(jobs.items) || jobs.items.length === 0) {
        renderEmptyState(target);
        return;
      }

      const cards = [];
      each(jobs.items, (job) => {
        const url = job.url || '(unknown)';
        const visited = job.visited ?? 0;
        const downloaded = job.downloaded ?? 0;
        const errors = job.errors ?? 0;
        const queueSize = job.queueSize ?? 0;
        const stage = job.stage || '';
        const status = job.status || stage || 'running';
        const pid = job.pid ? job.pid : null;

        const startedAt = job.startedAt ? new Date(job.startedAt).toLocaleString() : 'Unknown';
        const lastActivity = job.lastActivityAt ? Math.round((Date.now() - job.lastActivityAt) / 1000) : null;
        const activityClass = lastActivity && lastActivity < 10
          ? 'activity-recent'
          : lastActivity && lastActivity < 60
            ? 'activity-active'
            : 'activity-stale';
        const activityText = lastActivity !== null ? `${lastActivity}s ago` : 'No recent activity';

        let statusBadgeClass = 'status-badge';
        if (status === 'running' && !job.paused) statusBadgeClass += ' status-badge--running';
        else if (job.paused) statusBadgeClass += ' status-badge--paused';
        else if (status === 'done') statusBadgeClass += ' status-badge--done';
        else statusBadgeClass += ' status-badge--neutral';

        const startupSummary = job.startup && typeof job.startup === 'object' ? job.startup.summary : null;
        const startupProgress = startupSummary && startupSummary.done === false && Number.isFinite(startupSummary.progress)
          ? Math.round(Math.max(0, Math.min(1, startupSummary.progress)) * 100)
          : null;
        const startupHtml = startupProgress !== null
          ? `<div class="job-card-startup"><span class="job-card-startup-label">Startup:</span><span class="job-card-startup-value">${startupProgress}%</span></div>`
          : '';

        const statusTextHtml = job.statusText
          ? `<div class="job-card-status-text">${job.statusText}</div>`
          : '';

        cards.push(`
          <div class="job-card">
            <div class="job-card-header">
              <div class="job-card-status">
                <span class="${statusBadgeClass}">${status}</span>
                ${stage && stage !== status ? `<span class="job-card-stage">${stage}</span>` : ''}
                ${job.paused ? '<span class="job-card-paused-indicator">⏸ Paused</span>' : ''}
              </div>
              ${pid ? `<span class="job-card-pid">PID: ${pid}</span>` : ''}
            </div>

            <div class="job-card-url">
              <a href="/url?url=${encodeURIComponent(url)}" class="job-card-link" title="${url}">${url}</a>
            </div>

            ${statusTextHtml}
            ${startupHtml}

            <div class="job-card-metrics">
              <div class="job-card-metric">
                <span class="job-card-metric-label">Visited</span>
                <span class="job-card-metric-value">${visited.toLocaleString()}</span>
              </div>
              <div class="job-card-metric">
                <span class="job-card-metric-label">Downloaded</span>
                <span class="job-card-metric-value">${downloaded.toLocaleString()}</span>
              </div>
              <div class="job-card-metric">
                <span class="job-card-metric-label">Errors</span>
                <span class="job-card-metric-value ${errors > 0 ? 'job-card-metric-value--error' : ''}">${errors.toLocaleString()}</span>
              </div>
              <div class="job-card-metric">
                <span class="job-card-metric-label">Queue</span>
                <span class="job-card-metric-value">${queueSize.toLocaleString()}</span>
              </div>
            </div>

            <div class="job-card-footer">
              <div class="job-card-time">
                <span class="job-card-time-label">Started:</span>
                <span class="job-card-time-value">${startedAt}</span>
              </div>
              <div class="job-card-activity ${activityClass}">
                <span class="job-card-activity-indicator">●</span>
                <span class="job-card-activity-text">${activityText}</span>
              </div>
            </div>
          </div>
        `);
      });

      jobsList.innerHTML = cards.join('');
      jobsList.setAttribute('aria-busy', 'false');

      if (jobs.items.length === 1) {
        const job = jobs.items[0];
        if (job.startup || job.statusText) {
          updateStartupStatus(job.startup, job.statusText);
        }
        setStage(job.stage || job.status || 'running');
        if (job.paused != null) {
          setPausedBadge(!!job.paused);
        } else if (job.status === 'done') {
          hidePausedBadge();
        }
        if (job.stage && /intelligent/i.test(job.stage)) {
          const stageType = job.crawlType === 'discover-structure' ? 'discover-structure' : 'intelligent';
          setCrawlType(stageType);
        }
      } else {
        setStage('multi-run');
        setPausedBadge(null);
        updateStartupStatus(null, null);
      }

      scheduleResumeInventoryRefresh(1200);
    } catch (_) {
      // Intentional no-op; rendering resilience matters more than bubbling errors here.
    } finally {
      if (is_defined(jobsList)) {
        jobsList.setAttribute('aria-busy', 'false');
      }
    }
  }

  async function initialJobsPoll() {
    try {
      const response = await fetch('/api/crawls');
      if (!response.ok) {
        return;
      }
      const payload = await response.json();
      renderJobs(payload);
    } catch (_) {
      // Swallow network failures; SSE and resume polling will populate data later.
    }
  }

  return {
    renderJobs,
    initialJobsPoll
  };
}
