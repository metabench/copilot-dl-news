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

function formatDuration(ms) {
	if (!Number.isFinite(ms) || ms <= 0) return '—';
	if (ms < 1000) return `${ms | 0}ms`;
	const seconds = ms / 1000;
	if (seconds < 60) return `${seconds.toFixed(1)}s`;
	const minutes = Math.floor(seconds / 60);
	const remaining = Math.round(seconds % 60);
	return `${minutes}m ${remaining}s`;
}

function formatConfig(run) {
	return [
		run.pageLimit != null ? `pages: ${run.pageLimit}` : null,
		run.domainLimit != null ? `domains: ${run.domainLimit}` : null,
		run.skipPages ? 'skipPages' : null,
		run.skipDomains ? 'skipDomains' : null,
		run.dryRun ? 'dryRun' : null
	].filter(Boolean).join(', ');
}

function ensureRenderNav(fn) {
	if (typeof fn === 'function') return fn;
	return () => '';
}

function renderAnalysisListPage({ items = [], total = 0, limit = 50, renderNav }) {
	const navRenderer = ensureRenderNav(renderNav);
	const safeLimit = Number.isFinite(limit) ? limit : 50;

	const rowsHtml = items.length ? items.map((run) => {
		const duration = formatDuration(run.durationMs);
		const status = escapeHtml(run.status || 'unknown');
		const stage = escapeHtml(run.stage || '—');
		const config = formatConfig(run);
			return `
						<tr>
							<td class="mono"><a href="/analysis/${escapeHtml(run.id)}/ssr">${escapeHtml(run.id)}</a></td>
						<td>${status}</td>
						<td>${stage}</td>
						<td>${escapeHtml(run.startedAt || '—')}</td>
						<td>${escapeHtml(run.endedAt || '—')}</td>
						<td>${escapeHtml(duration)}</td>
						<td>${escapeHtml(config || '—')}</td>
					</tr>
				`;
	}).join('') : '<tr><td colspan="7" class="meta">No analysis runs yet.</td></tr>';

	return `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Analysis runs</title>
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
	.mono{font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace}
	form.filters{margin:6px 2px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
	input,select{padding:6px 8px}
	button{padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:#fff;cursor:pointer}
	button:hover{text-decoration:underline}
</style>
</head><body>
	<div class="container">
		<header>
			<h1>Analysis runs</h1>
			${navRenderer('analysis')}
		</header>
		<form class="filters" method="GET" action="/analysis/ssr">
			<label>Limit <input type="number" min="1" max="200" name="limit" value="${escapeHtml(String(safeLimit))}"/></label>
			<button type="submit">Apply</button>
			<span class="meta">Total ${escapeHtml(String(total))}</span>
		</form>
		<table>
			<thead><tr><th>ID</th><th>Status</th><th>Stage</th><th>Started</th><th>Ended</th><th>Duration</th><th>Config</th></tr></thead>
			<tbody>${rowsHtml}</tbody>
		</table>
	</div>
</body></html>`;
}

module.exports = {
	renderAnalysisListPage
};
