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

function truncate(text, max = 160) {
	if (!text) return '';
	const value = String(text);
	if (value.length <= max) return value;
	return `${value.slice(0, max - 1)}…`;
}

function collectDiagnosticLines(run = {}) {
	const diag = run.diagnostics || run.summary?.diagnostics || run.lastProgress?.diagnostics || null;
	if (!diag) {
		return run.status === 'failed' && run.error ? [truncate(run.error)] : [];
	}
	const lines = [];
	if (run.status === 'failed') {
		if (diag.failure?.stage) {
			let failureLine = `Failed at ${diag.failure.stage}`;
			if (diag.failure?.message) {
				failureLine += ` — ${truncate(diag.failure.message)}`;
			}
			lines.push(failureLine);
		} else if (run.error) {
			lines.push(truncate(run.error));
		}
	} else if ((run.status === 'running' || run.status === 'starting') && diag.currentStage) {
		lines.push(`Currently in ${diag.currentStage}`);
	}
	if (diag.lastCompletedStage) {
		lines.push(`Last completed: ${diag.lastCompletedStage}`);
	}
	if (diag.failure?.stack && run.status === 'failed' && lines.length < 3) {
		lines.push(truncate(diag.failure.stack, 200));
	}
	return lines;
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
		const isActive = run.status === 'running' || run.status === 'starting';
		const diagLines = collectDiagnosticLines(run);
		const stageCell = diagLines.length
			? `<div class="analysis-stage-main">${stage}</div>${diagLines.map((line) => `<div class="analysis-stage-meta">${escapeHtml(line)}</div>`).join('')}`
			: stage;
		
		return `
			<tr data-run-id="${escapeHtml(run.id)}">
				<td class="text-mono"><a href="/analysis/${escapeHtml(run.id)}/ssr">${escapeHtml(run.id)}</a></td>
				<td>${status}</td>
				<td>${stageCell}</td>
				<td class="u-nowrap">${escapeHtml(run.startedAt || '—')}</td>
				<td class="u-nowrap">${escapeHtml(run.endedAt || '—')}</td>
				<td>${escapeHtml(duration)}</td>
				<td>${escapeHtml(config || '—')}</td>
				<td class="analysis-progress-cell">${isActive ? '' : '—'}</td>
			</tr>
		`;
	}).join('') : '<tr><td colspan="8" class="ui-meta">No analysis runs yet.</td></tr>';

	// Serialize items as JSON for client-side use
	const itemsJson = JSON.stringify(items);
	
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Analysis runs</title>
	<link rel="stylesheet" href="/ui.css" />
	<link rel="stylesheet" href="/ui-dark.css" />
	<link rel="stylesheet" href="/styles/analysis-progress-bar.css" />
	<style>
		.analysis-list-page__header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 1.5rem;
		}
		.analysis-list-page__header h1 {
			margin: 0;
		}
		.ui-button--primary {
			background: #1976d2;
			color: white;
			border: none;
			padding: 0.75rem 1.5rem;
			border-radius: 4px;
			font-weight: 600;
			cursor: pointer;
			transition: background 0.2s ease;
		}
		.ui-button--primary:hover:not(:disabled) {
			background: #1565c0;
		}
		.ui-button--primary:disabled {
			opacity: 0.6;
			cursor: not-allowed;
		}
		.analysis-progress-cell {
			padding: 0 !important;
		}
		.analysis-progress-bar-inline {
			margin: 0;
			border: none;
			border-radius: 0;
			background: transparent;
		}
		.analysis-progress-bar-inline .analysis-progress-bar__header {
			display: none;
		}
		.analysis-progress-bar-inline .analysis-progress-bar__body {
			padding: 0.5rem;
		}
		.analysis-stage-main {
			font-weight: 600;
		}
		.analysis-stage-meta {
			font-size: 0.85rem;
			color: var(--color-text-muted, #6b7280);
			margin-top: 0.2rem;
			line-height: 1.3;
		}
	</style>
</head><body class="ui-page analysis-list-page">
	${navHtml}
	<div class="ui-container analysis-list-page__layout">
		<header class="analysis-list-page__header">
			<h1>Analysis runs</h1>
			<button id="start-analysis-btn" class="ui-button ui-button--primary">Start New Analysis</button>
		</header>
		
		<form class="ui-filters" method="GET" action="/analysis/ssr">
			<label class="ui-filters__label">Limit <input type="number" min="1" max="200" name="limit" value="${escapeHtml(String(safeLimit))}"/></label>
			<button type="submit" class="ui-button">Apply</button>
			<span class="ui-meta">Total ${escapeHtml(String(total))}</span>
		</form>
		<div class="table-responsive">
		<table class="analysis-list-page__table">
			<thead><tr><th>ID</th><th>Status</th><th>Stage</th><th>Started</th><th>Ended</th><th>Duration</th><th>Config</th><th>Progress</th></tr></thead>
			<tbody>${rowsHtml}</tbody>
		</table>
		</div>
	</div>
	<script>
		// Pass items data to client
		window.__ANALYSIS_ITEMS__ = ${itemsJson};
	</script>
	<script type="module">
		import { createAnalysisProgressBar } from '/assets/components/AnalysisProgressBar.js';
		
		// Initialize inline progress bars for running analyses
		const items = window.__ANALYSIS_ITEMS__ || [];
		const progressBars = new Map();
		
		function createProgressBarForRun(item) {
			const row = document.querySelector('tr[data-run-id="' + item.id + '"]');
			if (row) {
				const progressCell = row.querySelector('.analysis-progress-cell');
				if (progressCell) {
					const progressBar = createAnalysisProgressBar(progressCell, {
						runId: item.id,
						startedAt: item.startedAt ? new Date(item.startedAt).getTime() : Date.now(),
						compact: true
					});
					progressBars.set(item.id, progressBar);
				}
			}
		}
		
		// Create progress bars for existing running analyses
		items.forEach(item => {
			if (item.status === 'running' || item.status === 'starting') {
				createProgressBarForRun(item);
			}
		});
		
		// Connect to SSE for real-time progress updates
		const eventSource = new EventSource('/events');
		
		eventSource.addEventListener('analysis-progress', (event) => {
			try {
				const data = JSON.parse(event.data);
				const progressBar = progressBars.get(data.runId);
				if (progressBar && progressBar.updateProgress) {
					progressBar.updateProgress(data);
				}
			} catch (err) {
				console.error('Failed to parse analysis-progress event:', err);
			}
		});
		
		// Listen for new analysis runs starting
		eventSource.addEventListener('analysis-started', (event) => {
			try {
				const data = JSON.parse(event.data);
				// Reload the page to show the new analysis
				window.location.reload();
			} catch (err) {
				console.error('Failed to parse analysis-started event:', err);
			}
		});
		
		// Cleanup on page unload
		window.addEventListener('beforeunload', () => {
			eventSource.close();
		});
		
		// Start analysis button handler
		const startBtn = document.getElementById('start-analysis-btn');
		if (startBtn) {
			startBtn.addEventListener('click', async () => {
				startBtn.disabled = true;
				startBtn.textContent = 'Starting...';
				
				try {
					const response = await fetch('/api/analysis/start', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							analysisVersion: 1,
							skipPages: false,
							skipDomains: false,
							dryRun: false,
							verbose: false
						})
					});
					
					if (!response.ok) {
						const error = await response.json();
						throw new Error(error.error || 'Failed to start analysis');
					}
					
					const result = await response.json();
					console.log('Analysis started:', result);
					
					// Reload page to show new analysis
					window.location.reload();
					
				} catch (err) {
					console.error('Failed to start analysis:', err);
					alert('Failed to start analysis: ' + err.message);
					startBtn.disabled = false;
					startBtn.textContent = 'Start New Analysis';
				}
			});
		}
	</script>
</body></html>`;
}

module.exports = {
	renderAnalysisListPage
};
