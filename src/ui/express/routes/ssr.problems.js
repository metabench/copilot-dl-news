const express = require('express');
const { fetchProblems } = require('../data/problems');

// Rudimentary severity mapping for problem kinds (kept out of DB schema for now to stay normalized)
function deriveProblemSeverity(kind) {
  switch (kind) {
    case 'missing-hub':
      return 'warn';
    case 'unknown-pattern':
      return 'info';
    default:
      return 'info';
  }
}

function createProblemsSsrRouter(options = {}) {
  const { getDbRW, renderNav } = options;
  const router = express.Router();

  router.get('/problems/ssr', (req, res) => {
    const db = getDbRW();
    const render = (items, opts) => {
      const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        '\'': '&#39;'
      } [c]));
      const rows = items.map(r => {
        const severity = deriveProblemSeverity(r.kind);
        const sevClass = severity === 'warn' ? 'warn' : 'info';
        return `
        <tr>
          <td class="nowrap">${esc(r.ts)}</td>
          <td class="mono">${esc(r.jobId || '')}</td>
          <td><span class="pill ${sevClass}"><code>${esc(r.kind)}</code></span></td>
          <td>${esc(r.scope || '')}</td>
          <td>${esc(r.target || '')}</td>
          <td>${esc(r.message || '')}</td>
        </tr>`;
      }).join('');
      const q = (k, v) => {
        const u = new URL('http://x');
        if (opts.job) u.searchParams.set('job', opts.job);
        if (opts.kind) u.searchParams.set('kind', opts.kind);
        if (opts.scope) u.searchParams.set('scope', opts.scope);
        if (opts.limit) u.searchParams.set('limit', String(opts.limit));
        if (k && v != null) u.searchParams.set(k, String(v));
        const s = u.search.toString();
        return s ? ('?' + s.slice(1)) : '';
      };
      const pager = `
        <div class="row">
          <div class="meta">${items.length} shown</div>
          <div class="right nav-small">
            ${opts.prevAfter?`<a href="/problems/ssr${q('after', opts.prevAfter)}">← Newer</a>`:''}
            ${opts.nextBefore?`<a class="space" href="/problems/ssr${q('before', opts.nextBefore)}">Older →</a>`:''}
          </div>
        </div>`;
      const html = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Problems</title>
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
  form.filters{margin:6px 2px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
  input,select{padding:6px 8px}
  button{padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:#fff;cursor:pointer}
  button:hover{text-decoration:underline}
  .row{display:flex;justify-content:space-between;align-items:center;margin:6px 2px}
  .right a{margin-left:8px}
  .space{margin-left:8px}
  .pill{display:inline-block;border:1px solid var(--border);border-radius:999px;padding:0 6px;background:#fff}
  .pill.warn{background:#fff8e1;border-color:#facc15;color:#92400e}
  .pill.info{background:#eef2ff;border-color:#c7d2fe;color:#3730a3}
  .mono{font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace}
  .nowrap{white-space:nowrap}
</style>
</head><body>
  <div class="container">
    <header>
      <h1>Problems</h1>
  ${renderNav('problems')}
    </header>
    <form class="filters" method="GET" action="/problems/ssr">
      <label>Job <input type="text" name="job" value="${esc(opts.job||'')}"/></label>
      <label>Kind <input type="text" name="kind" value="${esc(opts.kind||'')}"/></label>
      <label>Scope <input type="text" name="scope" value="${esc(opts.scope||'')}"/></label>
      <label>Limit <input type="number" min="1" max="500" name="limit" value="${esc(opts.limit||100)}"/></label>
      <button type="submit">Apply</button>
    </form>
    ${pager}
    <table>
      <thead><tr><th>Time</th><th>Job</th><th>Kind</th><th>Scope</th><th>Target</th><th>Message</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="meta">No problems</td></tr>'}</tbody>
    </table>
    ${pager}
  </div>
</body></html>`;
      res.type('html').send(html);
    }
    try {
      if (!db) {
        return res.status(503).send('<!doctype html><title>Problems</title><body><p>Database unavailable.</p></body></html>');
      }
      const {
        items,
        cursors,
        appliedFilters
      } = fetchProblems(db, {
        job: req.query.job,
        kind: req.query.kind,
        scope: req.query.scope,
        limit: req.query.limit,
        before: req.query.before,
        after: req.query.after
      });
      const opts = {
        ...appliedFilters,
        ...cursors
      };
      if (!opts.limit) opts.limit = 100;
      render(items, opts);
    } catch (e) {
      try {
        console.log(`[ssr] GET /problems/ssr -> error ${e?.message || e}`);
      } catch (_) {}
      if (res.headersSent) return;
      render([], {});
    }
  });

  return router;
}

module.exports = { createProblemsSsrRouter };
