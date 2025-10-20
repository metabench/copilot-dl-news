const { escapeHtml } = require('../utils/html');

function renderQueueDetailPage({ job, events, filters, pagination, neighbors, renderNav }) {
  const filterOptions = ['', 'enqueued', 'dequeued', 'retry', 'drop']
    .map((action) => `<option value="${escapeHtml(action)}" ${filters.action === action ? 'selected' : ''}>${action || 'any'}</option>`)
    .join('');

  const emptyStateCopy = (() => {
    const status = String(job?.status || '').toLowerCase();
    if (status === 'done') {
      const ended = job?.endedAt ? ` on ${job.endedAt}` : '';
      return {
        title: 'Queue completed with no events',
        body: `This queue finished${ended} without recording any events. Review crawler filters if this looks unexpected.`
      };
    }
    if (status === 'failed') {
      return {
        title: 'Queue ended without activity',
        body: 'The crawler exited before recording any queue events. Check crawl logs for error details.'
      };
    }
    return {
      title: 'Queue is idle',
      body: "The crawler hasn't recorded any events for this queue yet. Completed queues disappear once archival finishes; refresh if you're expecting activity."
    };
  })();

  const itemsHtml = events.length
    ? events.map((ev) => `
        <tr>
          <td class="u-fit text-mono">#${escapeHtml(ev.id)}</td>
          <td class="u-fit u-nowrap">${escapeHtml(ev.ts || '')}</td>
          <td class="u-fit">${escapeHtml(ev.action || '')}</td>
          <td>${ev.url ? `<a href="${escapeHtml(ev.url)}" target="_blank" rel="noopener">${escapeHtml(ev.url)}</a>` : ''}</td>
          <td class="u-fit">${ev.depth != null ? escapeHtml(ev.depth) : ''}</td>
          <td class="u-fit">${escapeHtml(ev.host || '')}</td>
          <td>${escapeHtml(ev.reason || '')}</td>
          <td class="u-fit text-right">${ev.queueSize != null ? escapeHtml(ev.queueSize) : ''}</td>
        </tr>
      `).join('')
    : `
        <tr class="queue-detail__empty-row">
          <td colspan="8">
            <div class="queue-detail__empty">
              <strong>${escapeHtml(emptyStateCopy.title)}</strong>
              <p>${escapeHtml(emptyStateCopy.body)}</p>
            </div>
          </td>
        </tr>
      `;

  const latestLink = pagination.latestHref ? `<a class="queue-detail__pager-link" href="${pagination.latestHref}">Latest</a>` : '';
  const newerLink = pagination.newerHref ? `<a class="queue-detail__pager-link" href="${pagination.newerHref}">← Newer</a>` : '';
  const olderLink = pagination.olderHref ? `<a class="queue-detail__pager-link" href="${pagination.olderHref}">Older →</a>` : '';
  const neighborsNav = `
        <nav class="queue-detail__neighbors" aria-label="Adjacent queues">
          ${neighbors.newerId ? `<a class="queue-detail__neighbor-link" href="/queues/${escapeHtml(neighbors.newerId)}/ssr">← Newer</a>` : ''}
          ${neighbors.olderId ? `<a class="queue-detail__neighbor-link" href="/queues/${escapeHtml(neighbors.olderId)}/ssr">Next →</a>` : ''}
        </nav>`;

  const navHtml = (typeof renderNav === 'function') ? renderNav('queues', { variant: 'bar' }) : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Queue ${escapeHtml(job.id)}</title>
<link rel="stylesheet" href="/ui.css" />
<link rel="stylesheet" href="/ui-dark.css" />
</head><body class="ui-page queue-detail-page">
  ${navHtml}
  <div class="ui-container queue-detail">
    <header class="queue-detail__header">
      <h1>Queue <span class="text-mono">${escapeHtml(job.id)}</span></h1>
      ${neighborsNav}
    </header>

    <section class="queue-detail__meta">
      <dl class="queue-detail__stats">
        <div>
          <dt>Status</dt>
          <dd class="text-mono">${escapeHtml(job.status || '')}</dd>
        </div>
        <div>
          <dt>PID</dt>
          <dd class="text-mono">${escapeHtml(job.pid || '')}</dd>
        </div>
        <div class="queue-detail__stats--wide">
          <dt>URL</dt>
          <dd class="text-mono">${escapeHtml(job.url || '')}</dd>
        </div>
        <div>
          <dt>Started</dt>
          <dd class="text-mono">${escapeHtml(job.startedAt || '')}</dd>
        </div>
        <div>
          <dt>Ended</dt>
          <dd class="text-mono">${escapeHtml(job.endedAt || '')}</dd>
        </div>
      </dl>
    </section>

    <form method="GET" class="ui-filters" action="">
      <label class="ui-filters__label">Action
        <select name="action">${filterOptions}</select>
      </label>
      <label class="ui-filters__label">Limit
        <input type="number" name="limit" value="${escapeHtml(filters.limit)}" min="1" max="500"/>
      </label>
      ${filters.before ? `<input type="hidden" name="before" value="${escapeHtml(filters.before)}"/>` : ''}
      ${filters.after ? `<input type="hidden" name="after" value="${escapeHtml(filters.after)}"/>` : ''}
      <button type="submit" class="ui-button">Apply</button>
      <a class="ui-button ui-button--secondary" href="/queues/ssr">All queues</a>
    </form>

    <div class="queue-detail__summary">
      <div class="ui-meta">${events.length} shown${pagination.summary || ''}</div>
      <div class="queue-detail__pager">
        ${latestLink}
        ${newerLink}
        ${olderLink}
      </div>
    </div>

    <div class="table-responsive">
      <table class="queue-detail__table">
  <thead><tr><th class="fit">#</th><th class="fit">Time</th><th class="fit">Action</th><th>URL</th><th class="fit">Depth</th><th class="fit">Host</th><th>Reason</th><th class="fit text-right">Queue</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>
    </div>
  </div>
</body></html>`;
}

module.exports = {
  renderQueueDetailPage
};