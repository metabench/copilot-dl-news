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

      <td>${esc(r.message || '')}</td>

function buildFiltersQuery(baseFilters, overrides = {}) {    </tr>

  const params = new URLSearchParams();  `).join('');

  const merged = { ...baseFilters, ...overrides };

  for (const [key, value] of Object.entries(merged)) {  const q = (k, v) => {

    if (value !== undefined && value !== null && value !== '') {    const u = new URL('http://x');

      params.set(key, String(value));    if (opts.job) u.searchParams.set('job', opts.job);

    }    if (opts.kind) u.searchParams.set('kind', opts.kind);

  }    if (opts.scope) u.searchParams.set('scope', opts.scope);

  const qs = params.toString();    if (opts.limit) u.searchParams.set('limit', String(opts.limit));

  return qs ? `?${qs}` : '';    if (k && v != null) u.searchParams.set(k, String(v));

}    const s = u.search.toString();

    return s ? ('?' + s.slice(1)) : '';

function renderMilestonesPage({ items, filters, cursors, renderNav }) {  };

  const rows = items.map((item) => `

        <tr>  const pager = `

          <td class="nowrap">${escapeHtml(item.ts)}</td>    <div class="row">

          <td class="mono">${escapeHtml(item.jobId || '')}</td>      <div class="meta">${items.length} shown</div>

          <td><span class="pill good"><code>${escapeHtml(item.kind)}</code></span></td>      <div class="right nav-small">

          <td>${escapeHtml(item.scope || '')}</td>        ${opts.prevAfter?`<a href="/milestones/ssr${q('after', opts.prevAfter)}">← Newer</a>`:''}

          <td>${escapeHtml(item.target || '')}</td>        ${opts.nextBefore?`<a class="space" href="/milestones/ssr${q('before', opts.nextBefore)}">Older →</a>`:''}

          <td>${escapeHtml(item.message || '')}</td>      </div>

        </tr>    </div>`;

      `).join('');

  return `<!doctype html>

  const pager = `<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>

        <div class="row"><title>Milestones</title>

          <div class="meta">${items.length} shown</div><style>

          <div class="right nav-small">  :root{--fg:#0f172a;--muted:#64748b;--border:#e5e7eb;--bg:#ffffff;--good:#16a34a}

            ${cursors?.prevAfter ? `<a href="/milestones/ssr${buildFiltersQuery(filters, { after: cursors.prevAfter, before: undefined })}">← Newer</a>` : ''}  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:var(--bg);color:var(--fg)}

            ${cursors?.nextBefore ? `<a class="space" href="/milestones/ssr${buildFiltersQuery(filters, { before: cursors.nextBefore, after: undefined })}">Older →</a>` : ''}  .container{max-width:1100px;margin:18px auto;padding:0 16px}

          </div>  header{display:flex;align-items:baseline;justify-content:space-between;margin:6px 0 12px}

        </div>`;  header h1{margin:0;font-size:20px}

  header nav a{color:var(--muted);text-decoration:none;margin-left:10px}

  return `<!doctype html>  header nav a:hover{color:var(--fg);text-decoration:underline}

<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>  table{border-collapse:collapse;width:100%;background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden}

<title>Milestones</title>  th,td{border-bottom:1px solid var(--border);padding:8px 10px;font-size:14px}

<style>  th{color:var(--muted);text-align:left;background:#fcfcfd}

  :root{--fg:#0f172a;--muted:#64748b;--border:#e5e7eb;--bg:#ffffff;--good:#16a34a}  tr:nth-child(even){background:#fafafa}

  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:var(--bg);color:var(--fg)}  tr:hover{background:#f6f8fa}

  .container{max-width:1100px;margin:18px auto;padding:0 16px}  .meta{color:var(--muted);font-size:12px}

  header{display:flex;align-items:baseline;justify-content:space-between;margin:6px 0 12px}  form.filters{margin:6px 2px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}

  header h1{margin:0;font-size:20px}  input,select{padding:6px 8px}

  header nav a{color:var(--muted);text-decoration:none;margin-left:10px}  button{padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:#fff;cursor:pointer}

  header nav a:hover{color:var(--fg);text-decoration:underline}  button:hover{text-decoration:underline}

  table{border-collapse:collapse;width:100%;background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden}  .row{display:flex;justify-content:space-between;align-items:center;margin:6px 2px}

  th,td{border-bottom:1px solid var(--border);padding:8px 10px;font-size:14px}  .right a{margin-left:8px}

  th{color:var(--muted);text-align:left;background:#fcfcfd}  .space{margin-left:8px}

  tr:nth-child(even){background:#fafafa}  .pill{display:inline-block;border:1px solid var(--border);border-radius:999px;padding:0 6px;background:#fff}

  tr:hover{background:#f6f8fa}  .pill.good{border-color:#d1fae5;background:#ecfdf5;color:var(--good)}

  .meta{color:var(--muted);font-size:12px}  .mono{font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace}

  form.filters{margin:6px 2px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}  .nowrap{white-space:nowrap}

  input,select{padding:6px 8px}</style>

  button{padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:#fff;cursor:pointer}</head><body>

  button:hover{text-decoration:underline}  <div class="container">

  .row{display:flex;justify-content:space-between;align-items:center;margin:6px 2px}    <header>

  .right a{margin-left:8px}      <h1>Milestones</h1>

  .space{margin-left:8px}      ${navHtml}

  .pill{display:inline-block;border:1px solid var(--border);border-radius:999px;padding:0 6px;background:#fff}    </header>

  .pill.good{border-color:#d1fae5;background:#ecfdf5;color:var(--good)}    <form class="filters" method="GET" action="/milestones/ssr">

  .mono{font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace}      <label>Job <input type="text" name="job" value="${esc(opts.job||'')}"/></label>

  .nowrap{white-space:nowrap}      <label>Kind <input type="text" name="kind" value="${esc(opts.kind||'')}"/></label>

</style>      <label>Scope <input type="text" name="scope" value="${esc(opts.scope||'')}"/></label>

</head><body>      <label>Limit <input type="number" min="1" max="500" name="limit" value="${esc(opts.limit||100)}"/></label>

  <div class="container">      <button type="submit">Apply</button>

    <header>    </form>

      <h1>Milestones</h1>    ${pager}

  ${renderNav('milestones')}    <table>

    </header>      <thead><tr><th>Time</th><th>Job</th><th>Kind</th><th>Scope</th><th>Target</th><th>Message</th></tr></thead>

    <form class="filters" method="GET" action="/milestones/ssr">      <tbody>${rows || '<tr><td colspan="6" class="meta">No milestones</td></tr>'}</tbody>

      <label>Job <input type="text" name="job" value="${escapeHtml(filters.job || '')}"/></label>    </table>

      <label>Kind <input type="text" name="kind" value="${escapeHtml(filters.kind || '')}"/></label>    ${pager}

      <label>Scope <input type="text" name="scope" value="${escapeHtml(filters.scope || '')}"/></label>  </div>

      <label>Limit <input type="number" min="1" max="500" name="limit" value="${escapeHtml(filters.limit)}"/></label></body></html>`;

      <button type="submit">Apply</button>}

    </form>

    ${pager}module.exports = { renderMilestonesPage };

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
