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

function pickDiagnostics(run = {}, payload = {}) {
	return run?.diagnostics
		|| run?.summary?.diagnostics
		|| run?.lastProgress?.diagnostics
		|| payload?.diagnostics
		|| payload?.run?.diagnostics
		|| payload?.lastProgress?.diagnostics
		|| null;
}

function renderDiagnosticsContent(diagnostics, run = {}) {
	if (!diagnostics) {
		return '<p class="ui-meta">No diagnostics recorded for this run.</p>';
	}
	const parts = [];
	if (diagnostics.currentStage && (run.status === 'running' || run.status === 'starting')) {
		parts.push(`<div class="analysis-diagnostics__line"><strong>Current stage:</strong> ${escapeHtml(diagnostics.currentStage)}</div>`);
	}
	if (diagnostics.lastCompletedStage) {
		parts.push(`<div class="analysis-diagnostics__line"><strong>Last completed stage:</strong> ${escapeHtml(diagnostics.lastCompletedStage)}</div>`);
	}
	if (diagnostics.failure) {
		parts.push(`<div class="analysis-diagnostics__line analysis-diagnostics__line--failure"><strong>Failure stage:</strong> ${escapeHtml(diagnostics.failure.stage || 'unknown')}</div>`);
		if (diagnostics.failure.message) {
			parts.push(`<div class="analysis-diagnostics__line analysis-diagnostics__line--failure"><strong>Reason:</strong> ${escapeHtml(diagnostics.failure.message)}</div>`);
		}
		if (diagnostics.failure.stack) {
			parts.push(`
				<details class="analysis-diagnostics__stack">
					<summary>Stack trace</summary>
					<pre>${escapeHtml(diagnostics.failure.stack)}</pre>
				</details>
			`);
		}
	} else if (run.status === 'failed' && run.error) {
		parts.push(`<div class="analysis-diagnostics__line analysis-diagnostics__line--failure"><strong>Failure reason:</strong> ${escapeHtml(run.error)}</div>`);
	}
	const timeline = Array.isArray(diagnostics.timeline) ? diagnostics.timeline.slice().reverse() : [];
	const limitedTimeline = timeline.slice(0, 12);
	const timelineHtml = limitedTimeline.length
		? `<ol class="analysis-diagnostics__timeline">${limitedTimeline.map((entry) => {
			const details = entry.details && Object.keys(entry.details).length
				? `<pre>${escapeHtml(JSON.stringify(entry.details, null, 2))}</pre>`
				: '';
			return `<li><div class="analysis-diagnostics__timeline-header"><span class="analysis-diagnostics__timeline-stage">${escapeHtml(entry.stage || 'unknown')}</span><span class="analysis-diagnostics__timeline-status">${escapeHtml(entry.status || '—')}</span><span class="analysis-diagnostics__timeline-ts">${escapeHtml(entry.ts || '')}</span></div>${details}</li>`;
		}).join('')}</ol>`
		: '<p class="ui-meta">No timeline entries recorded.</p>';
	parts.push(`<div class="analysis-diagnostics__timeline-wrapper"><h3>Timeline</h3>${timelineHtml}</div>`);
	return parts.join('');
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
	const diagnostics = pickDiagnostics(run, payload);
	const diagnosticsHtml = renderDiagnosticsContent(diagnostics, run);

	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Analysis ${escapeHtml(run?.id || '')}</title>
<link rel="stylesheet" href="/ui.css" />
<link rel="stylesheet" href="/ui-dark.css" />
<link rel="stylesheet" href="/assets/analysis-progress-bar.css" />
<style>
	.analysis-diagnostics {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.analysis-diagnostics__line {
		font-size: 0.95rem;
		line-height: 1.4;
	}
	.analysis-diagnostics__line strong {
		font-weight: 600;
	}
	.analysis-diagnostics__line--failure {
		color: #b3261e;
	}
	.analysis-diagnostics__stack summary {
		cursor: pointer;
		font-weight: 600;
	}
	.analysis-diagnostics__stack pre {
		background: rgba(0, 0, 0, 0.04);
		padding: 0.75rem;
		border-radius: 4px;
		margin: 0.5rem 0 0;
		font-size: 0.85rem;
	}
	.analysis-diagnostics__timeline-wrapper h3 {
		margin: 0 0 0.5rem;
		font-size: 1rem;
	}
	.analysis-diagnostics__timeline {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.analysis-diagnostics__timeline-header {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: baseline;
		font-size: 0.9rem;
	}
	.analysis-diagnostics__timeline-stage {
		font-weight: 600;
	}
	.analysis-diagnostics__timeline-status {
		text-transform: uppercase;
		font-size: 0.75rem;
		letter-spacing: 0.04em;
		color: var(--color-text-muted, #6b7280);
	}
	.analysis-diagnostics__timeline-ts {
		margin-left: auto;
		font-size: 0.8rem;
		color: var(--color-text-muted, #6b7280);
	}
	.analysis-diagnostics__timeline pre {
		background: rgba(0, 0, 0, 0.04);
		padding: 0.5rem;
		border-radius: 4px;
		font-size: 0.8rem;
		overflow-x: auto;
		margin: 0.5rem 0 0;
	}
	.analysis-detail__progress-meta {
		margin-top: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.analysis-background-task {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.5rem;
		font-size: 0.9rem;
		color: var(--color-text, #1f2937);
	}
	.analysis-background-task__label {
		font-weight: 600;
	}
	.analysis-background-task__value {
		font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
	}
	.analysis-background-task__value a {
		color: inherit;
		text-decoration: none;
	}
	.analysis-background-task__value a:hover,
	.analysis-background-task__value a:focus {
		text-decoration: underline;
	}
	.analysis-detail__telemetry {
		border: 1px solid rgba(15, 23, 42, 0.08);
		border-radius: 6px;
		padding: 0.75rem;
		background: rgba(15, 23, 42, 0.02);
	}
	.analysis-detail__telemetry-heading {
		margin: 0 0 0.5rem;
		font-size: 0.95rem;
		font-weight: 600;
	}
	.analysis-detail__telemetry-body {
		font-size: 0.85rem;
		line-height: 1.4;
	}
	.analysis-detail__telemetry-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		max-height: 18rem;
		overflow-y: auto;
	}
	.analysis-detail__telemetry-item {
		display: grid;
		grid-template-columns: auto auto 1fr;
		gap: 0.4rem 0.6rem;
		align-items: baseline;
		padding: 0.35rem 0.4rem;
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.6);
	}
	.analysis-detail__telemetry-ts {
		font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
		font-size: 0.8rem;
		color: var(--color-text-muted, #6b7280);
	}
	.analysis-detail__telemetry-severity {
		text-transform: uppercase;
		font-size: 0.7rem;
		letter-spacing: 0.04em;
		font-weight: 600;
		color: #2563eb;
	}
	.analysis-detail__telemetry-severity--warning {
		color: #d97706;
	}
	.analysis-detail__telemetry-severity--error,
	.analysis-detail__telemetry-severity--fatal {
		color: #b3261e;
	}
	.analysis-detail__telemetry-severity--debug {
		color: #0f766e;
	}
	.analysis-detail__telemetry-event {
		font-weight: 600;
		font-size: 0.85rem;
	}
	.analysis-detail__telemetry-message {
		grid-column: 1 / 4;
		font-size: 0.85rem;
		word-break: break-word;
	}
	.analysis-detail__telemetry--disabled {
		opacity: 0.6;
	}
</style>
</head><body class="ui-page analysis-detail-page">
	${navHtml}
	<div class="ui-container analysis-detail__layout">
		<header class="analysis-detail__header">
			<h1>Analysis run <span class="text-mono">${escapeHtml(run?.id || '')}</span></h1>
		</header>
		
		<!-- Live Progress Bar (shown when running) -->
		<div id="analysis-progress-container"></div>
		<div class="analysis-detail__progress-meta">
			<div class="analysis-background-task" id="background-task-container">
				<span class="analysis-background-task__label">Background task:</span>
				<span class="analysis-background-task__value" id="background-task-info">Detecting background task…</span>
			</div>
			<div class="analysis-detail__telemetry analysis-detail__telemetry--disabled" id="background-task-telemetry">
				<h3 class="analysis-detail__telemetry-heading">Task telemetry</h3>
				<div class="analysis-detail__telemetry-body ui-meta">Telemetry is available when this run is managed by a background task.</div>
			</div>
		</div>
		
		<section class="analysis-detail__section">
			<h2>Overview</h2>
			<table class="analysis-detail__overview">
				<tbody>
					<tr><th>Status</th><td id="status-cell">${escapeHtml(run?.status || 'unknown')}</td></tr>
					<tr><th>Stage</th><td id="stage-cell">${escapeHtml(run?.stage || '—')}</td></tr>
					<tr><th>Started</th><td>${escapeHtml(run?.startedAt || '—')}</td></tr>
					<tr><th>Ended</th><td id="ended-cell">${escapeHtml(run?.endedAt || '—')}</td></tr>
				  <tr><th>Analysis version</th><td>${run?.analysisVersion != null ? escapeHtml(String(run.analysisVersion)) : '—'}</td></tr>
				  <tr><th>Page limit</th><td>${run?.pageLimit != null ? escapeHtml(String(run.pageLimit)) : '—'}</td></tr>
				  <tr><th>Domain limit</th><td>${run?.domainLimit != null ? escapeHtml(String(run.domainLimit)) : '—'}</td></tr>
					<tr><th>Flags</th><td>${formatFlags(run || {})}</td></tr>
					<tr><th>Latest progress</th><td id="latest-progress-cell">${latestProgressLabel}</td></tr>
					<tr><th>Error</th><td id="error-cell">${errorLabel}</td></tr>
				</tbody>
			</table>
		</section>
		<section class="analysis-detail__section">
			<h2>Highlights</h2>
			<div id="highlights-container">${highlightsHtml}</div>
		</section>
		<section class="analysis-detail__section">
			<h2>Latest progress payload</h2>
			<div id="latest-progress-container">${lastProgressHtml}</div>
		</section>
		<section class="analysis-detail__section">
			<h2>Failure diagnostics</h2>
			<div class="analysis-diagnostics">${diagnosticsHtml}</div>
		</section>
		<section class="analysis-detail__section">
			<h2>Summary</h2>
			<pre class="analysis-detail__summary" id="summary-container">${summaryPretty}</pre>
		</section>
		<section class="analysis-detail__section">
			<h2>Events</h2>
			<div class="table-responsive">
			<table class="analysis-detail__events">
				<thead><tr><th>Timestamp</th><th>Stage</th><th>Message</th><th>Details</th></tr></thead>
				<tbody id="events-tbody">${eventsHtml}</tbody>
			</table>
			</div>
		</section>
	</div>
	<script>window.__ANALYSIS_RUN__ = ${safeScript(payload)};</script>
	<script type="module">
		import { createAnalysisProgressBar } from '/assets/components/AnalysisProgressBar.js';
		
		const runData = window.__ANALYSIS_RUN__ || {};
		const run = runData.run || {};
		const runId = run.id || '';
		const startedAt = run.startedAt ? new Date(run.startedAt).getTime() : Date.now();
		const initialStatus = run.status || 'unknown';
		const runState = {
			status: initialStatus,
			stage: run.stage || null,
			error: run.error || null,
			diagnostics: pickDiagnosticsCandidate([
				run,
				run.summary,
				run.lastProgress,
				runData,
				runData.run,
				runData.lastProgress
			]),
			lastProgress: run.lastProgress || runData.lastProgress || null,
			startedAt
		};

		const statusCell = document.getElementById('status-cell');
		const stageCell = document.getElementById('stage-cell');
		const endedCell = document.getElementById('ended-cell');
		const progressCell = document.getElementById('latest-progress-cell');
		const errorCell = document.getElementById('error-cell');
		const progressContainer = document.getElementById('latest-progress-container');
		const highlightsContainer = document.getElementById('highlights-container');
		const diagnosticsContainer = document.querySelector('.analysis-diagnostics');
		const summaryContainer = document.getElementById('summary-container');
		const backgroundTaskInfo = document.getElementById('background-task-info');
		const backgroundTaskTelemetry = document.getElementById('background-task-telemetry');
		const backgroundTaskTelemetryBody = backgroundTaskTelemetry ? backgroundTaskTelemetry.querySelector('.analysis-detail__telemetry-body') : null;
		const DEFAULT_HIGHLIGHTS_HTML = '<p class="ui-meta">No highlights captured yet.</p>';
		const DEFAULT_PROGRESS_HTML = '<p class="ui-meta">No progress payload recorded.</p>';
		const SUB_PROGRESS_KEYS = ['subProgress', 'subprogress', 'subTask', 'subtask', 'sub_task', 'secondaryProgress', 'secondary', 'childProgress', 'nestedProgress'];
		const ACTIVE_PROGRESS_STATUSES = new Set(['running', 'starting', 'resuming']);
		const TELEMETRY_BUFFER_LIMIT = 150;
		const TELEMETRY_RENDER_LIMIT = 50;
		const TELEMETRY_DISABLED_TEXT = 'Telemetry is available when this run is managed by a background task.';
		const telemetryStore = new Map();
		let backgroundTaskId = runData.backgroundTaskId || null;
		let backgroundTaskKey = backgroundTaskId != null ? String(backgroundTaskId) : null;
		let backgroundTaskRetryScheduled = false;
	
		let progressBar = null;
		detectBackgroundTask();

		function ensureProgressBar(...sources) {
			if (progressBar) return progressBar;
			const container = document.getElementById('analysis-progress-container');
			if (!container) return null;
			progressBar = createAnalysisProgressBar(container, {
				runId,
				startedAt: runState.startedAt || startedAt,
				onCancel: async (id) => {
					// TODO: Implement cancel endpoint
					console.log('Cancel requested for', id);
				}
			});
			const progressSource = sources.find((src) => src && typeof src === 'object' && src.progress);
			if (progressSource && progressSource.progress) {
				progressBar.updateProgress(progressSource.progress);
			}
			const statusSource = sources.find((src) => src && typeof src === 'object' && src.status);
			if (statusSource && statusSource.status) {
				progressBar.updateStatus(statusSource.status);
			}
			const subtaskInitial = pickSubtaskProgress(...sources);
			if (subtaskInitial.found) {
				progressBar.updateSubProgress(subtaskInitial.value);
			}
			return progressBar;
		}

		if (ACTIVE_PROGRESS_STATUSES.has((initialStatus || '').toLowerCase())) {
			ensureProgressBar(run, run.lastProgress, runData.lastProgress);
		}
		
		// Connect to SSE for live updates
		const eventSource = new EventSource('/events');

		eventSource.addEventListener('telemetry', (e) => {
			try {
				const data = JSON.parse(e.data);
				handleTelemetryEntry(data);
			} catch (err) {
				console.error('Failed to process telemetry event:', err);
			}
		});

		eventSource.addEventListener('analysis-progress', (e) => {
			try {
				const data = JSON.parse(e.data);
				if (data.runId !== runId) return;

				if (data.startedAt && !runState.startedAt) {
					const parsedStarted = Date.parse(data.startedAt);
					if (Number.isFinite(parsedStarted)) {
						runState.startedAt = parsedStarted;
					}
				}

				const statusForBar = (data.status || data.lastProgress?.status || '').toLowerCase();
				if (!progressBar && ACTIVE_PROGRESS_STATUSES.has(statusForBar)) {
					ensureProgressBar(data, data.lastProgress);
				}
				
				// Update progress bar
				if (progressBar && data.progress) {
					progressBar.updateProgress(data.progress);
				}
				if (progressBar && data.status) {
					progressBar.updateStatus(data.status);
				}
				if (progressBar) {
					const subtaskUpdate = pickSubtaskProgress(data, data.lastProgress, data.details?.runSummary);
					if (subtaskUpdate.found) {
						progressBar.updateSubProgress(subtaskUpdate.value);
					}
				}
				
				let shouldRefreshDiagnostics = false;

				// Update overview table cells and run state
				if (data.status) {
					runState.status = data.status;
					if (statusCell) statusCell.textContent = data.status;
					shouldRefreshDiagnostics = true;
				}
				const stageFromData = data.stage || data.lastProgress?.stage;
				if (stageFromData) {
					runState.stage = stageFromData;
					if (stageCell) stageCell.textContent = stageFromData;
				}
				if (data.endedAt && endedCell) {
					endedCell.textContent = data.endedAt;
				}

				const latestSummaryLabel = buildLatestSummaryLabel(data, runState);
				if (progressCell) {
					progressCell.textContent = latestSummaryLabel || '—';
				}

				const progressPayload = data.lastProgress || data;
				runState.lastProgress = progressPayload || runState.lastProgress;
				renderJsonPre(progressContainer, progressPayload, DEFAULT_PROGRESS_HTML);

				const highlightsUpdate = pickHighlightsUpdate(data);
				if (highlightsUpdate) {
					if (highlightsContainer) {
						highlightsContainer.innerHTML = highlightsUpdate.length
							? '<ul class="analysis-detail__highlights">' + highlightsUpdate.map((item) => '<li>' + escapeHtml(String(item)) + '</li>').join('') + '</ul>'
							: DEFAULT_HIGHLIGHTS_HTML;
					}
				}

				const errorText = pickErrorMessage(data);
				if (typeof errorText === 'string' && errorText.length) {
					runState.error = errorText;
					if (errorCell) errorCell.textContent = errorText;
					shouldRefreshDiagnostics = true;
				}

				const diagnosticsUpdate = pickDiagnosticsCandidate([
					data,
					data.lastProgress,
					data.run,
					data.details?.runSummary
				]);
				if (diagnosticsUpdate) {
					runState.diagnostics = diagnosticsUpdate;
					shouldRefreshDiagnostics = true;
				}

				if (data.details?.runSummary) {
					renderSummary(summaryContainer, data.details.runSummary);
				}

				if (shouldRefreshDiagnostics) {
					renderDiagnostics(diagnosticsContainer, runState);
				}
		
			} catch (err) {
				console.error('Failed to process analysis-progress event:', err);
			}
		});
		
		// Cleanup on page unload
		window.addEventListener('beforeunload', () => {
			eventSource.close();
			if (progressBar) progressBar.destroy();
		});
		
		function detectBackgroundTask() {
			if (!backgroundTaskInfo) return;
			if (!runId) {
				setBackgroundTaskDetails(null);
				return;
			}
			fetch('/api/background-tasks?taskType=analysis-run&limit=200', {
				headers: { 'Accept': 'application/json' }
			}).then((response) => {
				if (!response.ok) {
					throw new Error('HTTP ' + response.status);
				}
				return response.json();
			}).then((payload) => {
				const tasks = Array.isArray(payload?.tasks) ? payload.tasks : [];
				const match = tasks.find((task) => {
					if (!task || typeof task !== 'object') return false;
					const candidate = task.config?.runId ?? task.config?.run_id;
					if (candidate == null) return false;
					return String(candidate) === String(runId);
				});
				setBackgroundTaskDetails(match || null);
			}).catch((error) => {
				console.error('Failed to load background task details:', error);
				setBackgroundTaskDetails(undefined, { failed: true });
			});
		}

		function setBackgroundTaskDetails(task, options = {}) {
			if (!backgroundTaskInfo) return;
			if (!task) {
				backgroundTaskInfo.textContent = options.failed
					? 'Unable to load background task details.'
					: 'No background task found for this run.';
				setTelemetryDisabled(true, TELEMETRY_DISABLED_TEXT);
				if (!options.failed) {
					backgroundTaskId = null;
					backgroundTaskKey = null;
					if (!backgroundTaskRetryScheduled) {
						const statusCandidate = (runState.status || initialStatus || '').toLowerCase();
						if (ACTIVE_PROGRESS_STATUSES.has(statusCandidate)) {
							backgroundTaskRetryScheduled = true;
							setTimeout(() => {
								detectBackgroundTask();
							}, 4000);
						}
					}
				}
				return;
			}
			backgroundTaskId = task.id;
			backgroundTaskKey = backgroundTaskId != null ? String(backgroundTaskId) : null;
			backgroundTaskInfo.textContent = '';
			if (typeof backgroundTaskId === 'number' || typeof backgroundTaskId === 'string') {
				const link = document.createElement('a');
				link.href = '/api/background-tasks/' + backgroundTaskId;
				link.textContent = 'Task #' + backgroundTaskId;
				link.target = '_blank';
				link.rel = 'noreferrer noopener';
				backgroundTaskInfo.appendChild(link);
			} else {
				backgroundTaskInfo.textContent = 'Task #' + String(task.id || 'unknown');
			}
			if (task.status) {
				const statusSpan = document.createElement('span');
				statusSpan.textContent = ' (' + task.status + ')';
				backgroundTaskInfo.appendChild(statusSpan);
			}
			backgroundTaskRetryScheduled = true;
			setTelemetryDisabled(false);
			renderTelemetryForTask(backgroundTaskKey);
		}

		function setTelemetryDisabled(disabled, message) {
			if (!backgroundTaskTelemetry) return;
			backgroundTaskTelemetry.classList.toggle('analysis-detail__telemetry--disabled', !!disabled);
			if (!backgroundTaskTelemetryBody) return;
			if (disabled) {
				backgroundTaskTelemetryBody.textContent = typeof message === 'string' ? message : TELEMETRY_DISABLED_TEXT;
				backgroundTaskTelemetryBody.classList.add('ui-meta');
			} else {
				if (message != null) {
					backgroundTaskTelemetryBody.textContent = message;
				} else {
					const existing = backgroundTaskTelemetryBody.innerHTML || '';
					if (!existing.trim()) {
						backgroundTaskTelemetryBody.textContent = '';
					}
				}
				backgroundTaskTelemetryBody.classList.remove('ui-meta');
			}
		}

		function handleTelemetryEntry(entry) {
			if (!entry || typeof entry !== 'object' || entry.taskId == null) return;
			const key = String(entry.taskId);
			const existing = telemetryStore.get(key) || [];
			existing.push(entry);
			if (existing.length > TELEMETRY_BUFFER_LIMIT) {
				existing.splice(0, existing.length - TELEMETRY_BUFFER_LIMIT);
			}
			telemetryStore.set(key, existing);
			if (backgroundTaskKey && key === backgroundTaskKey) {
				renderTelemetryForTask(backgroundTaskKey);
			}
		}

		function renderTelemetryForTask(taskKey) {
			if (!backgroundTaskTelemetryBody) return;
			if (!taskKey) {
				setTelemetryDisabled(true, TELEMETRY_DISABLED_TEXT);
				return;
			}
			const entries = telemetryStore.get(String(taskKey)) || [];
			if (!entries.length) {
				backgroundTaskTelemetryBody.textContent = 'No telemetry events yet for this task.';
				backgroundTaskTelemetryBody.classList.add('ui-meta');
				return;
			}
			const limited = entries.slice(-TELEMETRY_RENDER_LIMIT);
			const list = '<ul class="analysis-detail__telemetry-list">' + limited.map(buildTelemetryListItem).join('') + '</ul>';
			backgroundTaskTelemetryBody.innerHTML = list;
			backgroundTaskTelemetryBody.classList.remove('ui-meta');
		}

		function buildTelemetryListItem(entry) {
			const severity = normalizeSeverity(entry?.severity);
			const severityClass = severity !== 'info'
				? ' analysis-detail__telemetry-severity--' + severity
				: '';
			const label = escapeHtml(severity.toUpperCase());
			const eventLabel = escapeHtml(truncate(entry?.event || 'telemetry', 40));
			const message = escapeHtml(buildTelemetryMessage(entry));
			const ts = escapeHtml(formatTelemetryTimestamp(entry?.ts));
			return '<li class="analysis-detail__telemetry-item">'
				+ '<span class="analysis-detail__telemetry-ts">' + ts + '</span>'
				+ '<span class="analysis-detail__telemetry-severity' + severityClass + '">' + label + '</span>'
				+ '<span class="analysis-detail__telemetry-event">' + eventLabel + '</span>'
				+ '<div class="analysis-detail__telemetry-message">' + message + '</div>'
				+ '</li>';
		}

		function buildTelemetryMessage(entry) {
			if (!entry || typeof entry !== 'object') return '—';
			const parts = [];
			if (entry.status) parts.push(entry.status);
			const stage = entry.data && typeof entry.data === 'object' ? entry.data.stage : null;
			if (stage) parts.push(stage);
			if (entry.message) {
				parts.push(entry.message);
			} else if (entry.details) {
				if (typeof entry.details === 'string') {
					parts.push(entry.details);
				} else {
					try {
						parts.push(JSON.stringify(entry.details));
					} catch (_) {
						parts.push(String(entry.details));
					}
				}
			}
			const message = parts.length ? parts.filter(Boolean).join(' · ') : '—';
			return truncate(message, 220);
		}

		function formatTelemetryTimestamp(ts) {
			if (!ts) return '--:--:--';
			const date = new Date(ts);
			if (Number.isNaN(date.getTime())) return '--:--:--';
			return date.toLocaleTimeString([], { hour12: false });
		}

		function normalizeSeverity(severity) {
			if (!severity) return 'info';
			const value = String(severity).toLowerCase();
			if (value === 'fatal') return 'fatal';
			if (value === 'error') return 'error';
			if (value === 'warning' || value === 'warn') return 'warning';
			if (value === 'debug' || value === 'trace') return 'debug';
			return value === 'info' ? 'info' : 'info';
		}

		function truncate(value, maxLength = 200) {
			if (value === null || value === undefined) return '';
			const str = String(value);
			if (str.length <= maxLength) return str;
			if (maxLength <= 3) return str.slice(0, maxLength);
			return str.slice(0, maxLength - 3) + '...';
		}

		function renderDiagnostics(container, state) {
			if (!container) return;
			const html = renderDiagnosticsHtml(state.diagnostics, state.status, state.error);
			container.innerHTML = html;
		}

		function pickSubtaskProgress(...sources) {
			for (const source of sources) {
				if (!source || typeof source !== 'object') continue;
				const direct = findSubtaskProgressCandidate(source);
				if (direct.found) {
					return direct;
				}
				if (source.progress && typeof source.progress === 'object') {
					const nested = findSubtaskProgressCandidate(source.progress);
					if (nested.found) {
						return nested;
					}
				}
			}
			return { found: false, value: null };
		}

		function findSubtaskProgressCandidate(source) {
			if (!source || typeof source !== 'object') {
				return { found: false, value: null };
			}
			for (const key of SUB_PROGRESS_KEYS) {
				if (Object.prototype.hasOwnProperty.call(source, key)) {
					return { found: true, value: source[key] };
				}
			}
			return { found: false, value: null };
		}

		function renderJsonPre(container, value, fallbackHtml) {
			if (!container) return;
			if (!value || (typeof value === 'object' && Object.keys(value).length === 0)) {
				container.innerHTML = fallbackHtml;
				return;
			}
			let json;
			try {
				json = JSON.stringify(value, null, 2);
			} catch (err) {
				json = String(value);
			}
			container.innerHTML = '<pre class="analysis-detail__event-details">' + escapeHtml(json) + '</pre>';
		}

		function renderSummary(container, value) {
			if (!container || !value) return;
			let json;
			try {
				json = JSON.stringify(value, null, 2);
			} catch (err) {
				json = String(value);
			}
			container.textContent = json;
		}

		function pickDiagnosticsCandidate(candidates = []) {
			if (!Array.isArray(candidates)) return null;
			for (const candidate of candidates) {
				const diag = extractDiagnostics(candidate);
				if (diag) return diag;
			}
			return null;
		}

		function extractDiagnostics(source) {
			if (!source || typeof source !== 'object') return null;
			if ('currentStage' in source || 'lastCompletedStage' in source || 'failure' in source || 'timeline' in source) {
				return source;
			}
			if (source.diagnostics) {
				const diag = extractDiagnostics(source.diagnostics);
				if (diag) return diag;
			}
			if (source.summary) {
				const diag = extractDiagnostics(source.summary);
				if (diag) return diag;
			}
			if (source.lastProgress) {
				const diag = extractDiagnostics(source.lastProgress);
				if (diag) return diag;
			}
			return null;
		}

		function pickHighlightsUpdate(data) {
			if (!data || typeof data !== 'object') return null;
			const sources = [];
			let hasUpdate = false;
			if (Object.prototype.hasOwnProperty.call(data, 'analysisHighlights')) {
				hasUpdate = true;
				if (Array.isArray(data.analysisHighlights)) sources.push(data.analysisHighlights);
			}
			if (data.lastProgress && Object.prototype.hasOwnProperty.call(data.lastProgress, 'analysisHighlights')) {
				hasUpdate = true;
				if (Array.isArray(data.lastProgress.analysisHighlights)) sources.push(data.lastProgress.analysisHighlights);
			}
			if (data.details?.runSummary && Object.prototype.hasOwnProperty.call(data.details.runSummary, 'analysisHighlights')) {
				hasUpdate = true;
				if (Array.isArray(data.details.runSummary.analysisHighlights)) sources.push(data.details.runSummary.analysisHighlights);
			}
			if (!hasUpdate) return null;
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

		function buildLatestSummaryLabel(data, state) {
			if (!data || typeof data !== 'object') {
				const existing = state.lastProgress && state.lastProgress.summary;
				return existing ? String(existing) : null;
			}
			const stage = data.stage || data.lastProgress?.stage || state.stage;
			const status = data.status || data.lastProgress?.status || state.status;
			const summary = data.summary || data.lastProgress?.summary || state.lastProgress?.summary;
			const parts = [];
			if (stage) parts.push(stage);
			if (status) parts.push(status);
			if (summary) parts.push(summary);
			return parts.length ? parts.filter(Boolean).join(' · ') : null;
		}

		function pickErrorMessage(data) {
			if (!data || typeof data !== 'object') return null;
			if (typeof data.error === 'string' && data.error) return data.error;
			if (typeof data?.details?.error === 'string' && data.details.error) return data.details.error;
			if (typeof data?.details?.runSummary?.error === 'string' && data.details.runSummary.error) {
				return data.details.runSummary.error;
			}
			if (typeof data?.lastProgress?.error === 'string' && data.lastProgress.error) return data.lastProgress.error;
			return null;
		}

		function renderDiagnosticsHtml(diagnostics, status, errorText) {
			if (!diagnostics) {
				if (status === 'failed' && errorText) {
					return '<div class="analysis-diagnostics__line analysis-diagnostics__line--failure"><strong>Failure reason:</strong> ' + escapeHtml(errorText) + '</div>';
				}
				return '<p class="ui-meta">No diagnostics recorded for this run.</p>';
			}
			const parts = [];
			if (diagnostics.currentStage && (status === 'running' || status === 'starting')) {
				parts.push('<div class="analysis-diagnostics__line"><strong>Current stage:</strong> ' + escapeHtml(diagnostics.currentStage) + '</div>');
			}
			if (diagnostics.lastCompletedStage) {
				parts.push('<div class="analysis-diagnostics__line"><strong>Last completed stage:</strong> ' + escapeHtml(diagnostics.lastCompletedStage) + '</div>');
			}
			if (diagnostics.failure) {
				parts.push('<div class="analysis-diagnostics__line analysis-diagnostics__line--failure"><strong>Failure stage:</strong> ' + escapeHtml(diagnostics.failure.stage || 'unknown') + '</div>');
				if (diagnostics.failure.message) {
					parts.push('<div class="analysis-diagnostics__line analysis-diagnostics__line--failure"><strong>Reason:</strong> ' + escapeHtml(diagnostics.failure.message) + '</div>');
				}
				if (diagnostics.failure.stack) {
					parts.push('<details class="analysis-diagnostics__stack"><summary>Stack trace</summary><pre>' + escapeHtml(diagnostics.failure.stack) + '</pre></details>');
				}
			} else if (status === 'failed' && errorText) {
				parts.push('<div class="analysis-diagnostics__line analysis-diagnostics__line--failure"><strong>Failure reason:</strong> ' + escapeHtml(errorText) + '</div>');
			}
			const timeline = Array.isArray(diagnostics.timeline) ? diagnostics.timeline.slice().reverse() : [];
			const limited = timeline.slice(0, 12);
			if (limited.length) {
				parts.push('<div class="analysis-diagnostics__timeline-wrapper"><h3>Timeline</h3><ol class="analysis-diagnostics__timeline">' + limited.map(renderTimelineEntry).join('') + '</ol></div>');
			} else {
				parts.push('<div class="analysis-diagnostics__timeline-wrapper"><h3>Timeline</h3><p class="ui-meta">No timeline entries recorded.</p></div>');
			}
			return parts.join('');
		}

		function renderTimelineEntry(entry) {
			const stage = escapeHtml(entry?.stage || 'unknown');
			const status = escapeHtml(entry?.status || '—');
			const ts = escapeHtml(entry?.ts || '');
			let detailsHtml = '';
			if (entry && entry.details && typeof entry.details === 'object' && Object.keys(entry.details).length) {
				let json;
				try {
					json = JSON.stringify(entry.details, null, 2);
				} catch (err) {
					json = String(entry.details);
				}
				detailsHtml = '<pre>' + escapeHtml(json) + '</pre>';
			}
			return '<li><div class="analysis-diagnostics__timeline-header"><span class="analysis-diagnostics__timeline-stage">' + stage + '</span><span class="analysis-diagnostics__timeline-status">' + status + '</span><span class="analysis-diagnostics__timeline-ts">' + ts + '</span></div>' + detailsHtml + '</li>';
		}

		function escapeHtml(text) {
			const div = document.createElement('div');
			div.textContent = text;
			return div.innerHTML;
		}
	</script>
</body></html>`;
}

module.exports = {
	renderAnalysisDetailPage
};
