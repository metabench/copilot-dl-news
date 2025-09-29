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

function safeScriptPayload(value) {
  const json = JSON.stringify(value ?? {});
  return json
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function prettySummary(summary) {
  if (!summary) return 'No summary yet.';
  try {
    return escapeHtml(JSON.stringify(summary, null, 2));
  } catch (_) {
    return escapeHtml(String(summary));
  }
}

function renderEventsTable(events) {
  if (!Array.isArray(events) || events.length === 0) {
    return '<tr><td colspan="3" class="meta">No events logged.</td></tr>';
  }
  return events.map((event) => `
        <tr>
          <td class="nowrap">${escapeHtml(event.ts || '')}</td>
          <td>${escapeHtml(event.stage || '')}</td>
          <td>${escapeHtml(event.message || '')}</td>
        </tr>
      `).join('');
}

function renderAnalysisDetailPage({ run, events, detailPayload, renderNav }) {
  const summaryPretty = prettySummary(run.summary);
  const eventsHtml = renderEventsTable(events);
  return `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Analysis ${escapeHtml(run.id)}</title>
<style>
  :root{--fg:#0f172a;--muted:#64748b;--border:#e5e7eb;--bg:#ffffff}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:var(--bg);color:var(--fg)}
  .container{max-width:1000px;margin:18px auto;padding:0 16px}
  header{display:flex;align-items:baseline;justify-content:space-between;margin:6px 0 12px}
  header h1{margin:0;font-size:20px}
  header nav a{color:var(--muted);text-decoration:none;margin-left:10px}
  header nav a:hover{color:var(--fg);text-decoration:underline}
  section{margin-bottom:24px}
  table{border-collapse:collapse;width:100%;background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden}
  th,td{border-bottom:1px solid var(--border);padding:8px 10px;font-size:14px}
  th{color:var(--muted);text-align:left;background:#fcfcfd}
  tr:nth-child(even){background:#fafafa}
  tr:hover{background:#f6f8fa}
  pre{background:#f8fafc;border:1px solid var(--border);border-radius:8px;padding:12px;font-size:13px;overflow:auto}
  .meta{color:var(--muted);font-size:12px}
  .mono{font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace}
  .nowrap{white-space:nowrap}
</style>
</head><body>
  <div class="container">
    <header>
      <h1>Analysis run <span class="mono">${escapeHtml(run.id)}</span></h1>
      ${renderNav('analysis')}
    </header>
    <section>
      <h2>Overview</h2>
      <table>
        <tbody>
          <tr><th>Status</th><td>${escapeHtml(run.status || 'unknown')}</td></tr>
          <tr><th>Stage</th><td>${escapeHtml(run.stage || '—')}</td></tr>
          <tr><th>Started</th><td>${escapeHtml(run.startedAt || '—')}</td></tr>
          <tr><th>Ended</th><td>${escapeHtml(run.endedAt || '—')}</td></tr>
          <tr><th>Analysis version</th><td>${run.analysisVersion != null ? escapeHtml(run.analysisVersion) : '—'}</td></tr>
          <tr><th>Page limit</th><td>${run.pageLimit != null ? escapeHtml(run.pageLimit) : '—'}</td></tr>
          <tr><th>Domain limit</th><td>${run.domainLimit != null ? escapeHtml(run.domainLimit) : '—'}</td></tr>
          <tr><th>Flags</th><td>${[run.skipPages ? 'skipPages' : null, run.skipDomains ? 'skipDomains' : null, run.dryRun ? 'dryRun' : null, run.verbose ? 'verbose' : null].filter(Boolean).map(escapeHtml).join(', ') || '—'}</td></tr>
        </tbody>
      </table>
    </section>
    <section>
      <h2>Summary</h2>
      <pre>${summaryPretty}</pre>
    </section>
    <section>
      <h2>Events</h2>
      <table>
        <thead><tr><th>Timestamp</th><th>Stage</th><th>Message</th></tr></thead>
        <tbody>${eventsHtml}</tbody>
      </table>
    </section>
  </div>
  <script>window.__ANALYSIS_RUN__ = ${safeScriptPayload(detailPayload)};</script>
</body></html>`;
}

module.exports = {
  renderAnalysisDetailPage
};
