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
          <td class="fit mono">#${escapeHtml(ev.id)}</td>
          <td class="fit nowrap">${escapeHtml(ev.ts || '')}</td>
          <td class="fit">${escapeHtml(ev.action || '')}</td>
          <td>${ev.url ? `<a href="${escapeHtml(ev.url)}" target="_blank" rel="noopener">${escapeHtml(ev.url)}</a>` : ''}</td>
          <td class="fit">${ev.depth != null ? escapeHtml(ev.depth) : ''}</td>
          <td class="fit">${escapeHtml(ev.host || '')}</td>
          <td>${escapeHtml(ev.reason || '')}</td>
          <td class="fit tr">${ev.queueSize != null ? escapeHtml(ev.queueSize) : ''}</td>
        </tr>
      `).join('')
    : `
        <tr class="empty-state">
          <td colspan="8">
            <div class="empty-copy">
              <strong>${escapeHtml(emptyStateCopy.title)}</strong>
              <p>${escapeHtml(emptyStateCopy.body)}</p>
            </div>
          </td>
        </tr>
      `;

  const latestLink = pagination.latestHref ? `<a href="${pagination.latestHref}">Latest</a>` : '';
  const newerLink = pagination.newerHref ? `<a class="space" href="${pagination.newerHref}">← Newer</a>` : '';
  const olderLink = pagination.olderHref ? `<a class="space" href="${pagination.olderHref}">Older →</a>` : '';
  const neighborsNav = `
        <div class="right nav-small">
          ${neighbors.newerId ? `<a href="/queues/${escapeHtml(neighbors.newerId)}/ssr">← Newer</a>` : ''}
          ${neighbors.olderId ? `<a class="space" href="/queues/${escapeHtml(neighbors.olderId)}/ssr">Next →</a>` : ''}
        </div>`;

  const navHtml = (typeof renderNav === 'function') ? renderNav('queues', { variant: 'bar' }) : '';

  return `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Queue ${escapeHtml(job.id)}</title>
<style>
  :root{--fg:#0f172a;--muted:#64748b;--border:#e5e7eb;--bg:#ffffff}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:var(--bg);color:var(--fg)}
  .container{max-width:1100px;margin:18px auto;padding:0 16px}
  header{display:flex;align-items:baseline;justify-content:space-between;margin:6px 0 18px}
  header h1{margin:0;font-size:20px}
  .meta{color:var(--muted);font-size:12px}
  .kv{margin:2px 0}
  .kv .k{color:var(--muted);margin-right:4px}
  .kv .v.mono{font-weight:600}
  .mono{font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace}
  .row{display:flex;justify-content:space-between;align-items:center}
  .row .right a{margin-left:8px}
  .row .right a:first-child{margin-left:0}
  .controls{margin:6px 2px}
  table{border-collapse:collapse;width:100%;background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden}
  th,td{border-bottom:1px solid var(--border);padding:8px 10px;font-size:14px;vertical-align:top}
  th{color:var(--muted);text-align:left;background:#fcfcfd}
  tr:nth-child(even){background:#fafafa}
  tr:hover{background:#f6f8fa}
  .fit{width:1%;white-space:nowrap}
  .nowrap{white-space:nowrap}
  .tr{text-align:right}
  .empty-state td{padding:28px 24px;text-align:center;background:#f8fafc;color:var(--muted)}
  .empty-copy strong{display:block;margin-bottom:6px;font-size:16px;color:var(--fg)}
  .empty-copy p{margin:0 auto;max-width:460px;line-height:1.4}
  form.inline{display:flex;gap:8px;align-items:center}
  label.small{font-size:12px;color:var(--muted)}
  input,select{padding:6px 8px}
  button{padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:#fff;cursor:pointer}
  button:hover{text-decoration:underline}
  a.btn{border:1px solid var(--border);border-radius:8px;padding:6px 10px;text-decoration:none;color:var(--fg);background:#fff}
  a.btn:hover{text-decoration:underline}
  .nav-small{margin-left:8px}
  .nav-small a{color:var(--muted);text-decoration:none}
  .nav-small a:hover{color:var(--fg);text-decoration:underline}
</style>
</head><body>
  ${navHtml}
  <div class="container">
    <header>
      <h1>Queue <span class="mono">${escapeHtml(job.id)}</span></h1>
    </header>

    <section class="controls">
      <div class="row">
        <div>
          <div class="kv"><span class="k">Status:</span> <span class="v mono">${escapeHtml(job.status || '')}</span></div>
          <div class="kv"><span class="k">PID:</span> <span class="v mono">${escapeHtml(job.pid || '')}</span> <span class="k">URL:</span> <span class="v mono">${escapeHtml(job.url || '')}</span></div>
          <div class="kv"><span class="k">Started:</span> <span class="v mono">${escapeHtml(job.startedAt || '')}</span> <span class="k">Ended:</span> <span class="v mono">${escapeHtml(job.endedAt || '')}</span></div>
        </div>
        ${neighborsNav}
      </div>
      <form method="GET" class="inline" action="">
        <label class="small">Action
          <select name="action">${filterOptions}</select>
        </label>
        <label class="small">Limit
          <input type="number" name="limit" value="${escapeHtml(filters.limit)}" min="1" max="500"/>
        </label>
        ${filters.before ? `<input type="hidden" name="before" value="${escapeHtml(filters.before)}"/>` : ''}
        ${filters.after ? `<input type="hidden" name="after" value="${escapeHtml(filters.after)}"/>` : ''}
        <button type="submit">Apply</button>
        <a class="btn" href="/queues/ssr">All queues</a>
      </form>
    </section>

    <div class="row" style="margin:6px 2px">
  <div class="meta">${events.length} shown${pagination.summary || ''}</div>
      <div class="right nav-small">
        ${latestLink}
        ${newerLink}
        ${olderLink}
      </div>
    </div>
    <table>
      <thead><tr><th class="fit">#</th><th class="fit">Time</th><th class="fit">Action</th><th>URL</th><th class="fit">Depth</th><th class="fit">Host</th><th>Reason</th><th class="fit tr">Queue</th></tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>
  </div>
</body></html>`;
}

module.exports = {
  renderQueueDetailPage
};