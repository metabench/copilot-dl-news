const { escapeHtml } = require('../utils/html');

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
	const navHtml = (typeof renderNav === 'function') ? renderNav('analysis', { variant: 'bar' }) : '';
	const summarySource = run?.summary || run?.lastProgress || payload?.lastProgress || null;
	const summaryPretty = summarySource ? formatJson(summarySource, 'No summary yet.') : 'No summary yet.';
	const eventsHtml = events.length ? events.map((event) => {
		const detailsPretty = event?.details != null ? formatJson(event.details) : null;
		return `
				<tr>
					<td class="u-nowrap">${escapeHtml(event.ts || '')}</td>
					<td>${escapeHtml(event.stage || '')}</td>
					<td>${escapeHtml(event.message || '')}</td>
					<td>${detailsPretty ? `<pre class="analysis-detail__event-details">${detailsPretty}</pre>` : '<span class="ui-meta">—</span>'}</td>
				</tr>
		`;
	}).join('') : '<tr><td colspan="4" class="ui-meta">No events logged.</td></tr>';
	const highlights = collectHighlights(run, payload);
	const highlightsHtml = highlights.length
		? `<ul class="analysis-detail__highlights">${highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
		: '<p class="ui-meta">No highlights captured yet.</p>';
	const lastProgress = run?.lastProgress || payload?.lastProgress || null;
	const lastProgressHtml = lastProgress
		? `<pre class="analysis-detail__event-details">${formatJson(lastProgress)}</pre>`
		: '<p class="ui-meta">No progress payload recorded.</p>';
	const latestProgressLabel = lastProgress
		? escapeHtml([lastProgress.stage, lastProgress.status, lastProgress.summary].filter(Boolean).join(' · ') || 'See latest progress section below.')
		: '—';
	const errorLabel = run?.error ? escapeHtml(run.error) : '—';

	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Analysis ${escapeHtml(run?.id || '')}</title>
<link rel="stylesheet" href="/ui.css" />
<link rel="stylesheet" href="/ui-dark.css" />
</head><body class="ui-page analysis-detail-page">
	${navHtml}
	<div class="ui-container analysis-detail__layout">
		<header class="analysis-detail__header">
			<h1>Analysis run <span class="text-mono">${escapeHtml(run?.id || '')}</span></h1>
		</header>
		<section class="analysis-detail__section">
			<h2>Overview</h2>
			<table class="analysis-detail__overview">
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
		<section class="analysis-detail__section">
			<h2>Highlights</h2>
			${highlightsHtml}
		</section>
		<section class="analysis-detail__section">
			<h2>Latest progress payload</h2>
			${lastProgressHtml}
		</section>
		<section class="analysis-detail__section">
			<h2>Summary</h2>
			<pre class="analysis-detail__summary">${summaryPretty}</pre>
		</section>
		<section class="analysis-detail__section">
			<h2>Events</h2>
			<div class="table-responsive">
			<table class="analysis-detail__events">
				<thead><tr><th>Timestamp</th><th>Stage</th><th>Message</th><th>Details</th></tr></thead>
				<tbody>${eventsHtml}</tbody>
			</table>
			</div>
		</section>
	</div>
	<script>window.__ANALYSIS_RUN__ = ${safeScript(payload)};</script>
</body></html>`;
}

module.exports = {
	renderAnalysisDetailPage
};
