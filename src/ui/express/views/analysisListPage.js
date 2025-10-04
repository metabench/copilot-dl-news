const { escapeHtml } = require('../utils/html');

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
	const navHtml = navRenderer('analysis', { variant: 'bar' });

	const rowsHtml = items.length ? items.map((run) => {
		const duration = formatDuration(run.durationMs);
		const status = escapeHtml(run.status || 'unknown');
		const stage = escapeHtml(run.stage || '—');
		const config = formatConfig(run);
			return `
						<tr>
						<td class="text-mono"><a href="/analysis/${escapeHtml(run.id)}/ssr">${escapeHtml(run.id)}</a></td>
					<td>${status}</td>
					<td>${stage}</td>
					<td class="u-nowrap">${escapeHtml(run.startedAt || '—')}</td>
					<td class="u-nowrap">${escapeHtml(run.endedAt || '—')}</td>
					<td>${escapeHtml(duration)}</td>
					<td>${escapeHtml(config || '—')}</td>
					</tr>
				`;
	}).join('') : '<tr><td colspan="7" class="ui-meta">No analysis runs yet.</td></tr>';

	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Analysis runs</title>
	<link rel="stylesheet" href="/ui.css" />
	<link rel="stylesheet" href="/ui-dark.css" />
</head><body class="ui-page analysis-list-page">
	${navHtml}
	<div class="ui-container analysis-list-page__layout">
		<header class="analysis-list-page__header">
			<h1>Analysis runs</h1>
		</header>
		<form class="ui-filters" method="GET" action="/analysis/ssr">
			<label class="ui-filters__label">Limit <input type="number" min="1" max="200" name="limit" value="${escapeHtml(String(safeLimit))}"/></label>
			<button type="submit" class="ui-button">Apply</button>
			<span class="ui-meta">Total ${escapeHtml(String(total))}</span>
		</form>
		<div class="table-responsive">
		<table class="analysis-list-page__table">
			<thead><tr><th>ID</th><th>Status</th><th>Stage</th><th>Started</th><th>Ended</th><th>Duration</th><th>Config</th></tr></thead>
			<tbody>${rowsHtml}</tbody>
		</table>
		</div>
	</div>
</body></html>`;
}

module.exports = {
	renderAnalysisListPage
};
