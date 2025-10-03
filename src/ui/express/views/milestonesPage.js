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

function buildFiltersQuery(baseFilters, overrides = {}) {
  const params = new URLSearchParams();
  const merged = { ...baseFilters, ...overrides };
  for (const [key, value] of Object.entries(merged)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function ensureRenderNav(fn) {
  if (typeof fn === 'function') return fn;
  return () => '';
}

function renderMilestonesPage({ items, filters, cursors, renderNav }) {
  const rows = items.map((item) => `
        <tr>
          <td class="nowrap">${escapeHtml(item.ts)}</td>
          <td class="mono">${escapeHtml(item.jobId || '')}</td>
          <td><span class="pill good"><code>${escapeHtml(item.kind)}</code></span></td>
          <td>${escapeHtml(item.scope || '')}</td>
          <td>${escapeHtml(item.target || '')}</td>
          <td>${escapeHtml(item.message || '')}</td>
        </tr>
      `).join('');

  const pager = `
        <div class="row">
          <div class="meta">${items.length} shown</div>
          <div class="right nav-small">
            ${cursors?.prevAfter ? `<a href="/milestones/ssr${buildFiltersQuery(filters, { after: cursors.prevAfter, before: undefined })}">← Newer</a>` : ''}
            ${cursors?.nextBefore ? `<a class="space" href="/milestones/ssr${buildFiltersQuery(filters, { before: cursors.nextBefore, after: undefined })}">Older →</a>` : ''}
          </div>
        </div>`;

  const navRenderer = ensureRenderNav(renderNav);
  const navHtml = navRenderer('milestones', { variant: 'bar' });

  return `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Milestones</title>
<style>
  :root{--fg:#0f172a;--muted:#64748b;--border:#e5e7eb;--bg:#ffffff;--good:#16a34a}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:var(--bg);color:var(--fg)}
  .container{max-width:1100px;margin:18px auto;padding:0 16px}
  header{display:flex;align-items:baseline;justify-content:space-between;margin:6px 0 18px}
  header h1{margin:0;font-size:20px}
  table{border-collapse:collapse;width:100%;background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden}
  th,td{border-bottom:1px solid var(--border);padding:8px 10px;font-size:14px}
  th{color:var(--muted);text-align:left;background:#fcfcfd}
  tr:nth-child(even){background:#fafafa}
  tr:hover{background:#f6f8fa}
  .meta{color:var(--muted);font-size:12px}
  form.filters{margin:6px 2px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
  input,select{padding:6px 8px}
  button{padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:#fff;cursor:pointer}
  button:hover{text-decoration:underline}
  .row{display:flex;justify-content:space-between;align-items:center;margin:6px 2px}
  .right a{margin-left:8px}
  .space{margin-left:8px}
  .pill{display:inline-block;border:1px solid var(--border);border-radius:999px;padding:0 6px;background:#fff}
  .pill.good{border-color:#d1fae5;background:#ecfdf5;color:var(--good)}
  .mono{font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace}
  .nowrap{white-space:nowrap}
</style>
</head><body>
  ${navHtml}
  <div class="container">
    <header>
      <h1>Milestones</h1>
    </header>
    <form class="filters" method="GET" action="/milestones/ssr">
      <label>Job <input type="text" name="job" value="${escapeHtml(filters.job || '')}"/></label>
      <label>Kind <input type="text" name="kind" value="${escapeHtml(filters.kind || '')}"/></label>
      <label>Scope <input type="text" name="scope" value="${escapeHtml(filters.scope || '')}"/></label>
      <label>Limit <input type="number" min="1" max="500" name="limit" value="${escapeHtml(filters.limit)}"/></label>
      <button type="submit">Apply</button>
    </form>
    ${pager}
    <table>
      <thead><tr><th>Time</th><th>Job</th><th>Kind</th><th>Scope</th><th>Target</th><th>Message</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="meta">No milestones</td></tr>'}</tbody>
    </table>
    ${pager}
  </div>
</body></html>`;
}

module.exports = {
  renderMilestonesPage
};