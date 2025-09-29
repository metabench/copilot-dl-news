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

  return `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Queues</title>
<style>
  :root{--fg:#0f172a;--muted:#64748b;--border:#e5e7eb;--bg:#ffffff}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:var(--bg);color:var(--fg)}
  .container{max-width:1100px;margin:18px auto;padding:0 16px}
  header{display:flex;align-items:baseline;justify-content:space-between;margin:6px 0 12px}
  header h1{margin:0;font-size:20px}
  header nav a{color:var(--muted);text-decoration:none;margin-left:10px}
  header nav a:hover{color:var(--fg);text-decoration:underline}
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
  .tip{margin-top:6px}
  .tip code{background:#f5f5f5;border:1px solid #eee;padding:0 4px;border-radius:4px}
  .nav-small{margin-left:8px}
  .nav-small a{color:var(--muted);text-decoration:none}
  .nav-small a:hover{color:var(--fg);text-decoration:underline}
</style>
</head><body>
  <div class="container">
    <header>
      <h1 class="hdr">Queues</h1>
${renderNav('queues')}
    </header>
    <div class="top">
      <div class="muted">${rows.length} shown</div>
      <div class="right"><a class="btn" href="/queues/latest">Latest queue →</a></div>
    </div>
    <table>
      <thead><tr><th class="fit">Job</th><th class="fit">Status</th><th class="fit nowrap">Started</th><th class="fit nowrap">Ended</th><th class="fit">PID</th><th>URL</th><th class="fit tr">Events</th><th class="fit nowrap">Last event</th></tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>
    <div class="tip muted small">Default navigation opens the most recent queue; use Next → inside a queue to move to the next one.</div>
  </div>
</body></html>`;
}

module.exports = {
  renderQueuesListPage
};