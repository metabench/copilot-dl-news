function escapeHtml(value) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return String(value ?? '').replace(/[&<>"']/g, (match) => map[match] || match);
}

function countByStatus(rows) {
  const counts = new Map();
  for (const row of rows) {
    const status = String(row.status || 'unknown').toLowerCase();
    counts.set(status, (counts.get(status) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => {
      if (a[0] === 'done') return -1;
      if (b[0] === 'done') return 1;
      return b[1] - a[1] || a[0].localeCompare(b[0]);
    });
}

function summarize(rows) {
  if (!rows.length) {
    return {
      statuses: [],
      totalEvents: 0,
      uniquePids: 0,
      latestEnded: null
    };
  }

  const statuses = countByStatus(rows);
  const totalEvents = rows.reduce((sum, row) => sum + (Number(row.events) || 0), 0);
  const pidSet = new Set(rows.map((row) => row.pid).filter(Boolean));
  const latestEnded = rows
    .map((row) => row.endedAt)
    .filter(Boolean)
    .sort()
    .slice(-1)[0] || null;

  return {
    statuses,
    totalEvents,
    uniquePids: pidSet.size,
    latestEnded
  };
}

function renderQueuesListPage({ rows, renderNav }) {
  const itemsHtml = rows.length
    ? rows.map((row) => `
        <tr>
          <td><a href="/queues/${escapeHtml(row.id)}/ssr">${escapeHtml(row.id)}</a></td>
          <td>${escapeHtml(row.status || '')}</td>
          <td>${escapeHtml(row.startedAt || '')}</td>
          <td>${escapeHtml(row.endedAt || '')}</td>
          <td>${escapeHtml(row.pid || '')}</td>
          <td>${escapeHtml(row.url || '')}</td>
          <td class="tr">${escapeHtml(row.events ?? 0)}</td>
          <td>${escapeHtml(row.lastEventAt || '')}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="8" class="meta">No queues</td></tr>';

  const navHtml = renderNav('queues', { variant: 'bar' });
  const summary = summarize(rows);
  const statusItemsHtml = summary.statuses.length
    ? summary.statuses.map(([status, count]) => `
          <li><span class="status">${escapeHtml(status)}</span><span class="count">${escapeHtml(String(count))}</span></li>
        `).join('')
    : '<li class="muted">No activity yet.</li>';

  return `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Queues</title>
<style>
  :root{--fg:#0f172a;--muted:#64748b;--border:#e5e7eb;--bg:#ffffff}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:var(--bg);color:var(--fg)}
  .page-wrap{margin:18px auto;padding:0 16px;width:min(1600px,calc(100vw - 48px))}
  .page-grid{display:flex;flex-direction:column;gap:16px}
  header{display:flex;align-items:baseline;justify-content:space-between;margin:6px 0 16px}
  header h1{margin:0;font-size:21px}
  .summary-shell{border:1px solid var(--border);border-radius:12px;padding:14px;background:#f8fafc}
  .summary-shell h2{margin:0 0 6px;font-size:15px;color:var(--muted);letter-spacing:0.02em;text-transform:uppercase}
  .summary-cards{display:flex;flex-wrap:wrap;gap:12px;margin:0 0 12px;padding:0}
  .summary-card{flex:1 1 120px;min-width:120px;border-radius:10px;border:1px solid var(--border);background:#fff;padding:10px 12px}
  .summary-card strong{display:block;font-size:19px;line-height:1.1}
  .summary-card span{font-size:12px;color:var(--muted)}
  .status-list{margin:0;padding:0;list-style:none;display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px}
  .status-list li{display:flex;justify-content:space-between;align-items:center;border-radius:8px;border:1px solid var(--border);background:#fff;padding:6px 10px;font-size:13px}
  .status-list .status{text-transform:uppercase;letter-spacing:0.04em;color:var(--muted)}
  .status-list .count{font-weight:600;font-variant-numeric:tabular-nums}
  .summary-note{margin:10px 0 0;font-size:12px;color:var(--muted);line-height:1.4}
  .main-panel{border:1px solid var(--border);border-radius:16px;background:#fff;padding:18px 18px 22px;box-shadow:0 12px 30px rgba(15,23,42,0.06)}
  table{border-collapse:collapse;width:100%;background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden}
  th,td{border-bottom:1px solid var(--border);padding:8px 10px;font-size:14px}
  th{color:var(--muted);text-align:left;background:#fcfcfd}
  tr:nth-child(even){background:#fafafa}
  tr:hover{background:#f6f8fa}
  .meta{color:var(--muted);font-size:12px}
  .controls{margin:6px 2px}
  .right{float:right}
  .controls::after{content:"";display:block;clear:both}
  .btn{border:1px solid var(--border);border-radius:8px;padding:6px 10px;text-decoration:none;color:var(--fg);background:#fff}
  .btn:hover{text-decoration:underline}
  .muted{color:var(--muted)}
  .top{display:flex;justify-content:space-between;align-items:center}
  .top .right a{margin-left:8px}
  .top .right a:first-child{margin-left:0}
  .top .right{font-size:13px}
  .nowrap{white-space:nowrap}
  .fit{width:1%;white-space:nowrap}
  .tr{text-align:right}
  .hdr{margin:0}
  .tip{margin-top:12px}
  .tip code{background:#f5f5f5;border:1px solid #eee;padding:0 4px;border-radius:4px}
  .nav-small{margin-left:8px}
  .nav-small a{color:var(--muted);text-decoration:none}
  .nav-small a:hover{color:var(--fg);text-decoration:underline}
  @media (min-width: 1200px){
    .page-grid{display:grid;grid-template-columns:minmax(260px,320px) 1fr;gap:24px;align-items:start}
    header{margin-bottom:8px}
    .summary-shell{position:sticky;top:24px}
  }
  @media (max-width: 699px){
    .main-panel{padding:14px}
    table{font-size:13px}
    th,td{padding:7px 8px}
  }
</style>
</head><body>
  ${navHtml}
  <div class="page-wrap">
    <div class="page-grid">
      <section class="summary-shell" aria-label="Queues overview">
        <h2>Snapshot</h2>
        <div class="summary-cards">
          <div class="summary-card">
            <strong>${escapeHtml(String(rows.length))}</strong>
            <span>Shown queues</span>
          </div>
          <div class="summary-card">
            <strong>${escapeHtml(String(summary.totalEvents))}</strong>
            <span>Total events</span>
          </div>
          <div class="summary-card">
            <strong>${escapeHtml(String(summary.uniquePids))}</strong>
            <span>Active PIDs</span>
          </div>
        </div>
        <ul class="status-list">
          ${statusItemsHtml}
        </ul>
        ${summary.latestEnded ? `<p class="summary-note">Latest queue finished at <strong>${escapeHtml(summary.latestEnded)}</strong>.</p>` : ''}
        <p class="summary-note muted">On mobile, open an individual queue to review activity details; widescreen view keeps this snapshot visible.</p>
      </section>
      <main class="main-panel">
        <header>
          <h1 class="hdr">Queues</h1>
          <div class="right"><a class="btn" href="/queues/latest">Latest queue →</a></div>
        </header>
        <div class="top">
          <div class="muted">${rows.length} shown</div>
        </div>
        <table>
          <thead><tr><th class="fit">Job</th><th class="fit">Status</th><th class="fit nowrap">Started</th><th class="fit nowrap">Ended</th><th class="fit">PID</th><th>URL</th><th class="fit tr">Events</th><th class="fit nowrap">Last event</th></tr></thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        <div class="tip muted small">Default navigation opens the most recent queue; use Next → inside a queue to move to the next one.</div>
      </main>
    </div>
  </div>
</body></html>`;
}

module.exports = {
  renderQueuesListPage
};