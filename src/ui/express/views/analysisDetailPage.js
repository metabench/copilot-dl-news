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

function ensureRenderNav(fn) {
	if (typeof fn === 'function') return fn;
	return () => '';
}

function safeScript(value) {
	const json = JSON.stringify(value ?? {});
	return json
		.replace(/</g, '\\u003c')
		.replace(/>/g, '\\u003e')
			.replace(/\u2028/g, '\\u2028')
			.replace(/\u2029/g, '\\u2029');
}

function formatFlags(run) {
	return [
		run.skipPages ? 'skipPages' : null,
		run.skipDomains ? 'skipDomains' : null,
		run.dryRun ? 'dryRun' : null,
		run.verbose ? 'verbose' : null
	].filter(Boolean).map(escapeHtml).join(', ') || '—';
}

function formatJson(value, fallback = '—') {
	if (value === null || value === undefined) {
		return fallback;
	}
	try {
		return escapeHtml(JSON.stringify(value, null, 2));
	} catch (err) {
		return escapeHtml(String(value));
	}
}

function collectHighlights(run = {}, payload = {}) {
	const sources = [];
	if (Array.isArray(run?.summary?.analysisHighlights)) sources.push(run.summary.analysisHighlights);
	if (Array.isArray(payload?.analysisHighlights)) sources.push(payload.analysisHighlights);
	if (Array.isArray(payload?.lastProgress?.analysisHighlights)) sources.push(payload.lastProgress.analysisHighlights);
	const highlights = [];
	const seen = new Set();
	for (const list of sources) {
		for (const item of list) {
			if (!item) continue;
			const text = typeof item === 'string' ? item.trim() : JSON.stringify(item);
			if (!text) continue;
			const key = text.toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);
			highlights.push(text);
		}
	}
	return highlights;
}

function renderAnalysisDetailPage({ run, events = [], payload = {}, renderNav }) {
	const navRenderer = ensureRenderNav(renderNav);
	const navHtml = navRenderer('analysis', { variant: 'bar' });
	const summarySource = run?.summary || run?.lastProgress || payload?.lastProgress || null;
	const summaryPretty = summarySource ? formatJson(summarySource, 'No summary yet.') : 'No summary yet.';
	const eventsHtml = events.length ? events.map((event) => {
		const detailsPretty = event?.details != null ? formatJson(event.details) : null;
		return `
				<tr>
					<td class="nowrap">${escapeHtml(event.ts || '')}</td>
					<td>${escapeHtml(event.stage || '')}</td>
					<td>${escapeHtml(event.message || '')}</td>
					<td>${detailsPretty ? `<pre class="event-details">${detailsPretty}</pre>` : '<span class="meta">—</span>'}</td>
				</tr>
		`;
	}).join('') : '<tr><td colspan="4" class="meta">No events logged.</td></tr>';
	const highlights = collectHighlights(run, payload);
	const highlightsHtml = highlights.length
		? `<ul class="highlights">${highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
		: '<p class="meta">No highlights captured yet.</p>';
	const lastProgress = run?.lastProgress || payload?.lastProgress || null;
	const lastProgressHtml = lastProgress
		? `<pre class="event-details">${formatJson(lastProgress)}</pre>`
		: '<p class="meta">No progress payload recorded.</p>';
	const latestProgressLabel = lastProgress
		? escapeHtml([lastProgress.stage, lastProgress.status, lastProgress.summary].filter(Boolean).join(' · ') || 'See latest progress section below.')
		: '—';
	const errorLabel = run?.error ? escapeHtml(run.error) : '—';

	return `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Analysis ${escapeHtml(run?.id || '')}</title>
<style>
	:root{--fg:#0f172a;--muted:#64748b;--border:#e5e7eb;--bg:#ffffff}
	body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:var(--bg);color:var(--fg)}
	.container{max-width:1000px;margin:18px auto;padding:0 16px}
	header{display:flex;align-items:baseline;justify-content:space-between;margin:6px 0 18px}
	header h1{margin:0;font-size:20px}
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
	.highlights{list-style:disc;padding-left:20px;margin:0;font-size:14px;color:var(--fg)}
	.highlights li{margin-bottom:6px}
	.event-details{font-size:12px;margin:0;background:#f8fafc;border-radius:6px;border:1px solid var(--border);padding:10px;white-space:pre-wrap}

</style>
</head><body>
	${navHtml}
	<div class="container">
		<header>
			<h1>Analysis run <span class="mono">${escapeHtml(run?.id || '')}</span></h1>
		</header>
		<section>
			<h2>Overview</h2>
			<table>
				<tbody>
					<tr><th>Status</th><td>${escapeHtml(run?.status || 'unknown')}</td></tr>
					<tr><th>Stage</th><td>${escapeHtml(run?.stage || '—')}</td></tr>
					<tr><th>Started</th><td>${escapeHtml(run?.startedAt || '—')}</td></tr>
					<tr><th>Ended</th><td>${escapeHtml(run?.endedAt || '—')}</td></tr>
					  <tr><th>Analysis version</th><td>${run?.analysisVersion != null ? escapeHtml(String(run.analysisVersion)) : '—'}</td></tr>
					  <tr><th>Page limit</th><td>${run?.pageLimit != null ? escapeHtml(String(run.pageLimit)) : '—'}</td></tr>
					  <tr><th>Domain limit</th><td>${run?.domainLimit != null ? escapeHtml(String(run.domainLimit)) : '—'}</td></tr>
					<tr><th>Flags</th><td>${formatFlags(run || {})}</td></tr>
					<tr><th>Latest progress</th><td>${latestProgressLabel}</td></tr>
					<tr><th>Error</th><td>${errorLabel}</td></tr>
				</tbody>
			</table>
		</section>
		<section>
			<h2>Highlights</h2>
			${highlightsHtml}
		</section>
		<section>
			<h2>Latest progress payload</h2>
			${lastProgressHtml}
		</section>
		<section>
			<h2>Summary</h2>
			<pre>${summaryPretty}</pre>
		</section>
		<section>
			<h2>Events</h2>
			<table>
				<thead><tr><th>Timestamp</th><th>Stage</th><th>Message</th><th>Details</th></tr></thead>
				<tbody>${eventsHtml}</tbody>
			</table>
		</section>
	</div>
	<script>window.__ANALYSIS_RUN__ = ${safeScript(payload)};</script>
</body></html>`;
}

module.exports = {
	renderAnalysisDetailPage
};
