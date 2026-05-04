'use strict';

function buildPlaceholderActivator() {
  return `
          window.UnifiedAppPanels.registerActivator('placeholder', function(root) {
            if (!root) return;
            root.dataset.placeholderActivated = 'true';
          });`;
}

function buildHomeActivator() {
  return `
          window.UnifiedAppPanels.registerActivator('home', function(root) {
            if (!root) return;
            root.dataset.homeActivated = 'true';
          });`;
}

function buildPanelDemoActivator() {
  return `
          window.UnifiedAppPanels.registerActivator('panel-demo', function(root) {
            if (!root) return;
            const output = root.querySelector('[data-panel-demo-output]');
            const ping = root.querySelector('[data-panel-demo-action="ping"]');
            const reset = root.querySelector('[data-panel-demo-action="reset"]');
            let clicks = 0;
            function write(text) { if (output) output.textContent = text; }
            if (ping) ping.addEventListener('click', function() {
              clicks += 1;
              write('Ping ' + clicks + ' at ' + new Date().toLocaleTimeString());
            });
            if (reset) reset.addEventListener('click', function() {
              clicks = 0;
              write('Reset');
            });
            write('Activated');
          });`;
}

function buildMultiModalCrawlActivator() {
  return `
          window.UnifiedAppPanels.registerActivator('multi-modal-crawl', function(root) {
            if (!root) return;
            const status = root.querySelector('[data-multimodal-status]');
            const start = root.querySelector('[data-multimodal-action="start"]');
            const pause = root.querySelector('[data-multimodal-action="pause"]');
            const stop = root.querySelector('[data-multimodal-action="stop"]');
            function setStatus(text) { if (status) status.textContent = 'Status: ' + text; }
            function collectConfig() {
              const config = {};
              root.querySelectorAll('[data-multimodal-input]').forEach(function(input) {
                const key = input.dataset.multimodalInput;
                config[key] = input.value;
              });
              return config;
            }
            async function post(path, body) {
              const response = await fetch('/multi-modal/api/multi-modal/' + path, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body || {})
              });
              const json = await response.json().catch(function() { return {}; });
              if (!response.ok) throw new Error(json.error || json.message || response.statusText);
              return json;
            }
            if (start) start.addEventListener('click', async function() {
              try {
                setStatus('Starting');
                await post('start', collectConfig());
                start.disabled = true;
                if (pause) pause.disabled = false;
                if (stop) stop.disabled = false;
                setStatus('Running');
              } catch (err) { setStatus(err.message || 'Start failed'); }
            });
            if (pause) pause.addEventListener('click', async function() {
              try { await post('pause'); setStatus('Paused'); } catch (err) { setStatus(err.message || 'Pause failed'); }
            });
            if (stop) stop.addEventListener('click', async function() {
              try {
                await post('stop');
                if (start) start.disabled = false;
                if (pause) pause.disabled = true;
                stop.disabled = true;
                setStatus('Stopped');
              } catch (err) { setStatus(err.message || 'Stop failed'); }
            });
          });`;
}

function buildDownloadsActivator() {
  return `
          window.UnifiedAppPanels.registerActivator('downloads', function(root) {
            if (!root) return;
            const status = root.querySelector('[data-downloads-status]');
            function setStatus(text) { if (status) status.textContent = text; }
            function setStat(name, value) {
              const el = root.querySelector('[data-downloads-stat="' + name + '"]');
              if (el) el.textContent = value == null ? '0' : String(value);
            }
            function escapeHtml(str) {
              return String(str == null ? '' : str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
            }
            function formatBytes(bytes) {
              const n = Number(bytes) || 0;
              if (n <= 0) return '0 B';
              const units = ['B', 'KB', 'MB', 'GB'];
              const index = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
              return (n / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1) + ' ' + units[index];
            }
            function renderRecent(items) {
              const target = root.querySelector('[data-downloads-recent]');
              if (!target) return;
              if (!Array.isArray(items) || items.length === 0) {
                target.innerHTML = '<div class="panel-log__empty">No downloads found.</div>';
                return;
              }

              target.innerHTML = '<div class="downloads-list">' + items.map(function(item) {
                const status = item.httpStatus || '-';
                const host = item.host || '';
                const fetched = item.fetchedAt ? new Date(item.fetchedAt).toLocaleString() : '-';
                return '<div class="downloads-list__row">'
                  + '<span class="downloads-list__status">' + escapeHtml(status) + '</span>'
                  + '<span class="downloads-list__main"><strong>' + escapeHtml(host) + '</strong><span>' + escapeHtml(item.url || '') + '</span></span>'
                  + '<span class="downloads-list__meta">' + escapeHtml(formatBytes(item.bytesDownloaded)) + '<br>' + escapeHtml(fetched) + '</span>'
                  + '</div>';
              }).join('') + '</div>';
            }
            async function refresh() {
              try {
                const statsResponse = await fetch('/api/downloads/stats', { cache: 'no-store' });
                const statsJson = await statsResponse.json();
                const stats = statsJson.stats || {};
                setStat('total', stats.totalDownloads ?? stats.total ?? stats.downloads ?? stats.total_responses ?? 0);
                setStat('verified', stats.verifiedDownloads ?? stats.verified ?? stats.http200 ?? stats.verified_downloads ?? 0);
                setStat('bytes', stats.totalSizeFormatted || formatBytes(stats.totalBytes ?? stats.total_bytes ?? stats.bytes ?? 0));

                const progressResponse = await fetch('/api/downloads/crawl-progress', { cache: 'no-store' });
                const progressJson = await progressResponse.json();
                const progress = progressJson.progress || {};
                const goal = progressJson.goal || 50;
                const downloaded = progress.downloaded || 0;
                setStat('progress-text', downloaded + ' / ' + goal);
                const bar = root.querySelector('[data-downloads-progress-bar]');
                if (bar) bar.style.width = Math.max(0, Math.min(100, progress.percentComplete || 0)) + '%';

                const recentResponse = await fetch('/api/downloads/recent?limit=8', { cache: 'no-store' });
                const recentJson = await recentResponse.json();
                renderRecent(recentJson.items || []);

                setStatus('Last updated: ' + new Date().toLocaleTimeString());
              } catch (err) {
                setStatus('Last update failed: ' + (err.message || err));
              }
            }
            const refreshButton = root.querySelector('[data-downloads-action="refresh"]');
            if (refreshButton) refreshButton.addEventListener('click', refresh);
            refresh();
          });`;
}

function buildCloudCrawlActivator() {
  return `
          window.UnifiedAppPanels.registerActivator('cloud-crawl', function(root) {
            if (!root) return;
            const panelRoot = root.matches && root.matches('[data-cloud-crawl-root]')
              ? root
              : (root.querySelector('[data-cloud-crawl-root]') || root);
            const apiBase = panelRoot.dataset.cloudCrawlApiBase || '/api/cloud-crawl';
            const domains = panelRoot.dataset.cloudCrawlDomains || '';
            const maxPages = panelRoot.dataset.cloudCrawlMaxPages || '';
            const recentLimit = panelRoot.dataset.cloudCrawlRecentLimit || '';
            const since = panelRoot.dataset.cloudCrawlSince || '';
            const status = root.querySelector('[data-cloud-crawl-status]');
            const refreshButton = root.querySelector('[data-cloud-crawl-action="refresh"]');
            function setStatus(text) { if (status) status.textContent = text; }
            function setStat(name, value) {
              const el = root.querySelector('[data-cloud-crawl-stat="' + name + '"]');
              if (el) el.textContent = value == null ? '-' : String(value);
            }
            function escapeHtml(str) {
              return String(str == null ? '' : str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
            }
            function formatBytes(bytes) {
              const n = Number(bytes) || 0;
              if (n <= 0) return '0 B';
              const units = ['B', 'KB', 'MB', 'GB'];
              const index = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
              return (n / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1) + ' ' + units[index];
            }
            function buildStatusUrl() {
              const params = new URLSearchParams();
              if (domains) params.set('domains', domains);
              if (maxPages) params.set('maxPages', maxPages);
              if (recentLimit) params.set('recentLimit', recentLimit);
              if (since) params.set('since', since);
              const query = params.toString();
              return apiBase + '/status' + (query ? '?' + query : '');
            }
            function renderTargets(targets) {
              if (!Array.isArray(targets)) return;
              targets.forEach(function(target) {
                const domain = target.domain || '';
                const count = root.querySelector('[data-cloud-crawl-domain-count="' + domain + '"]');
                const bar = root.querySelector('[data-cloud-crawl-domain-bar="' + domain + '"]');
                const chip = root.querySelector('[data-cloud-crawl-domain="' + domain + '"]');
                if (count) count.textContent = (target.okDownloads || 0) + ' / ' + (target.goal || 5);
                if (bar) bar.style.width = Math.max(0, Math.min(100, target.progressPct || 0)) + '%';
                if (chip) chip.classList.toggle('cloud-crawl-target--complete', Number(target.okDownloads || 0) >= Number(target.goal || 5));
              });
            }
            function renderRecent(items) {
              const target = root.querySelector('[data-cloud-crawl-recent]');
              if (!target) return;
              if (!Array.isArray(items) || items.length === 0) {
                target.innerHTML = '<div class="panel-log__empty">No recent target downloads found.</div>';
                return;
              }
              target.innerHTML = '<div class="cloud-crawl-downloads">' + items.map(function(item) {
                const fetched = item.fetchedAt ? new Date(item.fetchedAt).toLocaleString() : '-';
                return '<div class="cloud-crawl-download">'
                  + '<strong>' + escapeHtml(item.host || '-') + '</strong>'
                  + '<span title="' + escapeHtml(item.url || '') + '">' + escapeHtml(item.url || '') + '</span>'
                  + '<em>HTTP ' + escapeHtml(item.httpStatus || '-') + ' · ' + escapeHtml(formatBytes(item.bytesDownloaded)) + ' · ' + escapeHtml(fetched) + '</em>'
                  + '</div>';
              }).join('') + '</div>';
            }
            async function refresh() {
              setStatus('Loading cloud crawl status...');
              try {
                const response = await fetch(buildStatusUrl(), { cache: 'no-store' });
                const json = await response.json();
                if (!response.ok || json.status === 'error') throw new Error(json.message || json.error || response.statusText);
                const totals = json.totals || {};
                setStat('remote', json.remote && json.remote.label ? json.remote.label : 'configured');
                setStat('activeJobs', json.activeJobs || 0);
                setStat('downloaded', (totals.okDownloads || 0) + ' / ' + (totals.goalDownloads || 0));
                setStat('errors', json.errorsLast10m || 0);
                renderTargets(json.targets || []);
                renderRecent(json.recentDownloads || []);
                root.dataset.cloudCrawlReady = 'true';
                panelRoot.dataset.cloudCrawlReady = 'true';
                setStatus('Last updated: ' + new Date().toLocaleTimeString());
              } catch (err) {
                root.dataset.cloudCrawlReady = 'error';
                panelRoot.dataset.cloudCrawlReady = 'error';
                setStatus('Cloud crawl status failed: ' + (err.message || err));
              }
            }
            if (refreshButton && refreshButton.dataset.cloudCrawlBound !== 'true') {
              refreshButton.dataset.cloudCrawlBound = 'true';
              refreshButton.addEventListener('click', refresh);
            }
            refresh();
          });`;
}

function buildDownloadVerificationActivator() {
  return `
          window.UnifiedAppPanels.registerActivator('download-verification', function(root) {
            if (!root) return;
            const apiBase = root.dataset.downloadVerificationApiBase || '/api/downloads/verifications';
            const tableTarget = root.querySelector('[data-download-verification-table]');
            const status = root.querySelector('[data-download-verification-status]');
            const limitInput = root.querySelector('[data-download-verification-input="limit"]');
            const sinceInput = root.querySelector('[data-download-verification-input="since"]');
            function setStatus(text) { if (status) status.textContent = text; }
            function setStat(name, value) {
              const el = root.querySelector('[data-download-verification-stat="' + name + '"]');
              if (el) el.textContent = value == null ? '-' : String(value);
            }
            function escapeHtml(str) {
              return String(str == null ? '' : str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
            }
            function formatBytes(bytes) {
              const n = Number(bytes) || 0;
              if (n <= 0) return '0 B';
              const units = ['B', 'KB', 'MB', 'GB'];
              const index = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
              return (n / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1) + ' ' + units[index];
            }
            function formatRatio(value) {
              const ratio = Number(value);
              if (!Number.isFinite(ratio) || ratio <= 0) return '-';
              return Math.round(ratio * 1000) / 10 + '%';
            }
            function badge(text, ok) {
              return '<span class="download-verification-badge ' + (ok ? 'download-verification-badge--ok' : 'download-verification-badge--warn') + '">' + escapeHtml(text) + '</span>';
            }
            function renderRows(items) {
              if (!tableTarget) return;
              if (!Array.isArray(items) || !items.length) {
                tableTarget.innerHTML = '<div class="panel-log__empty">No recent download evidence found.</div>';
                return;
              }
              tableTarget.innerHTML = '<table class="download-verification-table">'
                + '<thead><tr>'
                + '<th>Proof</th><th>Download</th><th>Storage</th><th>Compression</th><th>Sizes</th><th>Fetched</th>'
                + '</tr></thead><tbody>'
                + items.map(function(item) {
                  const compression = item.compression || {};
                  const storage = item.storage || {};
                  const http = item.http || {};
                  const options = Array.isArray(compression.options) && compression.options.length
                    ? compression.options.join(' · ')
                    : 'options not recorded';
                  const level = compression.levelRecorded ? String(compression.level) : 'not recorded';
                  const algorithm = compression.algorithm || 'not recorded';
                  const typeName = compression.typeName || compression.source || 'not recorded';
                  const fetched = item.fetchedAt ? new Date(item.fetchedAt).toLocaleString() : '-';
                  const urlText = item.url || '';
                  return '<tr>'
                    + '<td class="download-verification-table__proof">'
                    + badge('HTTP', Boolean(item.downloaded))
                    + badge('DB', Boolean(item.savedToDb))
                    + '</td>'
                    + '<td><strong>' + escapeHtml(item.host || '-') + '</strong><span title="' + escapeHtml(urlText) + '">' + escapeHtml(urlText) + '</span><em>HTTP ' + escapeHtml(http.status || '-') + ' · ' + escapeHtml(formatBytes(http.bytesDownloaded)) + '</em></td>'
                    + '<td><strong>#' + escapeHtml(storage.contentStorageId || '-') + '</strong><span>' + escapeHtml(storage.storageType || 'not recorded') + '</span><em>sha ' + escapeHtml(storage.sha256Prefix || '-') + '</em></td>'
                    + '<td><strong>' + escapeHtml(algorithm) + '</strong><span>' + escapeHtml(typeName) + '</span><em>level ' + escapeHtml(level) + ' · ' + escapeHtml(options) + '</em></td>'
                    + '<td><strong>' + escapeHtml(formatBytes(storage.compressedSize)) + '</strong><span>from ' + escapeHtml(formatBytes(storage.uncompressedSize)) + '</span><em>ratio ' + escapeHtml(formatRatio(storage.compressionRatio)) + '</em></td>'
                    + '<td class="download-verification-table__time">' + escapeHtml(fetched) + '</td>'
                    + '</tr>';
                }).join('')
                + '</tbody></table>';
            }
            function updateStats(summary) {
              const total = summary && Number.isFinite(summary.total) ? summary.total : 0;
              const verified = summary && Number.isFinite(summary.verified) ? summary.verified : 0;
              const saved = summary && Number.isFinite(summary.savedToDb) ? summary.savedToDb : 0;
              const levelRecorded = summary && Number.isFinite(summary.levelRecorded) ? summary.levelRecorded : 0;
              const algorithms = summary && Array.isArray(summary.algorithms) ? summary.algorithms : [];
              setStat('verified', verified + ' / ' + total);
              setStat('saved', saved + ' / ' + total);
              setStat('levels', levelRecorded + ' / ' + total);
              setStat('algorithms', algorithms.length ? algorithms.map(function(row) { return row.algorithm + ':' + row.count; }).join(' ') : '-');
            }
            async function refresh() {
              const params = new URLSearchParams();
              params.set('limit', limitInput && limitInput.value ? limitInput.value : '25');
              if (sinceInput && sinceInput.value) params.set('since', sinceInput.value);
              setStatus('Loading verification evidence...');
              try {
                const response = await fetch(apiBase + '?' + params.toString(), { cache: 'no-store' });
                const json = await response.json();
                if (!response.ok || json.status === 'error') throw new Error(json.message || json.error || response.statusText);
                updateStats(json.summary || {});
                renderRows(json.items || []);
                setStatus('Last updated: ' + new Date().toLocaleTimeString());
              } catch (err) {
                setStatus('Verification load failed: ' + (err.message || err));
              }
            }
            const refreshButton = root.querySelector('[data-download-verification-action="refresh"]');
            if (refreshButton) refreshButton.addEventListener('click', refresh);
            if (limitInput) limitInput.addEventListener('change', refresh);
            if (sinceInput) sinceInput.addEventListener('change', refresh);
            refresh();
          });`;
}

function buildSearchExplorerActivator() {
  return `
          window.UnifiedAppPanels.registerActivator('search-explorer', function(root) {
            if (!root) return;
            const apiBase = root.querySelector('[data-search-explorer-root]')?.dataset.searchApiBase || '/api/search-explorer';
            const form = root.querySelector('[data-search-form]');
            const resultsEl = root.querySelector('[data-search-results]');
            const statusEl = root.querySelector('[data-search-status]');
            const freshnessEl = root.querySelector('[data-search-freshness-summary]');

            function escapeHtml(str) {
              return String(str == null ? '' : str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
            }
            function setStatus(text) { if (statusEl) statusEl.textContent = text; }
            function field(selector) { return root.querySelector(selector); }
            function value(selector) { const el = field(selector); return el ? el.value.trim() : ''; }
            function fillSelect(select, entries, valueKey, labelKey, emptyLabel) {
              if (!select) return;
              const current = select.value;
              select.innerHTML = '<option value="">' + escapeHtml(emptyLabel) + '</option>';
              entries.forEach(function(entry) {
                const option = document.createElement('option');
                option.value = entry[valueKey] || entry[labelKey] || '';
                option.textContent = entry[labelKey] || entry[valueKey] || option.value;
                select.appendChild(option);
              });
              if (current) select.value = current;
            }
            async function loadOptions() {
              try {
                const response = await fetch(apiBase + '/options', { cache: 'no-store' });
                if (!response.ok) return;
                const json = await response.json();
                fillSelect(field('[data-search-filter="domain"]'), json.domains || [], 'host', 'host', 'All enabled domains');
                fillSelect(field('[data-search-filter="section"]'), json.sections || [], 'section', 'section', 'All sections');
              } catch (_) { /* options are progressive enhancement */ }
            }
            function renderResults(json) {
              if (freshnessEl && json.freshness) freshnessEl.textContent = json.freshness.summary || json.freshness.freshnessLabel || 'Freshness available';
              const rows = Array.isArray(json.results) ? json.results : [];
              if (!resultsEl) return;
              if (!rows.length) {
                resultsEl.innerHTML = '<div class="panel-log__empty">No matching articles.</div>';
                return;
              }
              resultsEl.innerHTML = rows.map(function(row) {
                const title = row.title || row.url || 'Untitled result';
                const meta = [row.host, row.section, row.date].filter(Boolean).join(' · ');
                const url = row.url || '#';
                return '<article class="search-result-row">'
                  + '<a class="text-gold" href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(title) + '</a>'
                  + '<div class="text-muted">' + escapeHtml(meta) + '</div>'
                  + '</article>';
              }).join('');
            }
            async function runSearch() {
              const params = new URLSearchParams();
              const q = value('[data-search-input="q"]');
              const author = value('[data-search-input="author"]');
              if (!q && !author) { setStatus('Enter a query or author.'); return; }
              if (q) params.set('q', q);
              if (author) params.set('author', author);
              ['domain', 'section', 'datePreset'].forEach(function(name) {
                const selected = value('[data-search-filter="' + name + '"]');
                if (selected) params.set(name, selected);
              });
              const enabled = field('[data-search-filter="enabledOnly"]');
              if (enabled) params.set('enabledOnly', enabled.checked ? 'true' : 'false');
              setStatus('Searching...');
              try {
                const response = await fetch(apiBase + '/search?' + params.toString(), { cache: 'no-store' });
                const json = await response.json();
                if (!response.ok || json.status === 'error') throw new Error(json.message || json.error || response.statusText);
                renderResults(json);
                const total = json.pagination && Number.isFinite(json.pagination.total) ? json.pagination.total : (json.results || []).length;
                setStatus('Results: ' + total);
              } catch (err) {
                setStatus(err.message || 'Search failed');
              }
            }
            if (form) {
              form.addEventListener('submit', function(event) { event.preventDefault(); runSearch(); });
              form.addEventListener('reset', function() {
                setTimeout(function() {
                  if (resultsEl) resultsEl.innerHTML = '<div class="panel-log__empty">No results loaded.</div>';
                  if (freshnessEl) freshnessEl.textContent = 'No search yet';
                  setStatus('Ready');
                }, 0);
              });
            }
            loadOptions();
          });`;
}

function buildScreenshotReviewActivator() {
  return `
          window.UnifiedAppPanels.registerActivator('screenshot-review', function(root) {
            if (!root) return;
            const panelRoot = root.matches && root.matches('[data-screenshot-review-root]')
              ? root
              : (root.querySelector('[data-screenshot-review-root]') || root);
            const apiBase = panelRoot.dataset.screenshotReviewApiBase || '/api/screenshot-review';
            const runList = root.querySelector('[data-screenshot-review-runs]');
            const gallery = root.querySelector('[data-screenshot-review-gallery]');
            const comments = root.querySelector('[data-screenshot-review-comments]');
            const form = root.querySelector('[data-screenshot-review-comment-form]');
            const targetSelect = root.querySelector('[data-screenshot-review-comment-target]');
            const input = root.querySelector('[data-screenshot-review-comment-input]');
            const status = root.querySelector('[data-screenshot-review-status]');
            const refreshButton = root.querySelector('[data-screenshot-review-action="refresh"]');
            const sessionFilter = root.querySelector('[data-screenshot-review-filter="session"]');
            const appFilter = root.querySelector('[data-screenshot-review-filter="app"]');
            let runs = [];
            let selectedRun = null;

            function escapeHtml(str) {
              return String(str == null ? '' : str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
            }
            function setStatus(text) { if (status) status.textContent = text; }
            function setStat(name, value) {
              const el = root.querySelector('[data-screenshot-review-stat="' + name + '"]');
              if (el) el.textContent = value == null ? '-' : String(value);
            }
            function shortDate(value) {
              if (!value) return '-';
              try { return new Date(value).toLocaleString(); } catch (_) { return String(value); }
            }
            function updateOptions(select, options, allLabel) {
              if (!select) return;
              const current = select.value || 'all';
              const items = Array.isArray(options) ? options : [];
              select.innerHTML = '<option value="all">' + escapeHtml(allLabel) + '</option>';
              items.forEach(function(option) {
                const el = document.createElement('option');
                el.value = option.value || option.label || '';
                el.textContent = option.label || option.value || '';
                select.appendChild(el);
              });
              select.value = Array.from(select.options).some(function(option) { return option.value === current; }) ? current : 'all';
            }
            function buildRunsUrl() {
              const params = new URLSearchParams();
              if (sessionFilter && sessionFilter.value && sessionFilter.value !== 'all') params.set('session', sessionFilter.value);
              if (appFilter && appFilter.value && appFilter.value !== 'all') params.set('app', appFilter.value);
              const suffix = params.toString();
              return apiBase + '/runs' + (suffix ? '?' + suffix : '');
            }
            function renderRuns() {
              if (!runList) return;
              if (!runs.length) {
                runList.innerHTML = '<div class="panel-log__empty">No screenshot runs found.</div>';
                if (gallery) gallery.innerHTML = '<div class="panel-log__empty">Capture screenshots to populate this view.</div>';
                return;
              }
              runList.innerHTML = runs.map(function(run, index) {
                const active = selectedRun && selectedRun.runId === run.runId ? ' screenshot-review-run--active' : '';
                return '<button type="button" class="screenshot-review-run' + active + '" data-screenshot-review-run-id="' + escapeHtml(run.runId) + '">'
                  + '<strong>' + escapeHtml(run.title || run.relativeOutputDir || 'Screenshot run') + '</strong>'
                  + '<span>' + escapeHtml(shortDate(run.capturedAt)) + '</span>'
                  + '<em>' + escapeHtml(run.ok ? 'ok' : 'needs review') + ' · ' + escapeHtml(run.routeCount || 0) + ' images · ' + escapeHtml(run.commentCount || 0) + ' comments</em>'
                  + '<em>' + escapeHtml((run.sessionId || 'other') + ' · ' + ((run.appKeys || []).join(', ') || 'all apps')) + '</em>'
                  + '</button>';
              }).join('');
            }
            function renderGallery(run) {
              if (!gallery) return;
              if (!run) {
                gallery.innerHTML = '<div class="panel-log__empty">Select a run to view screenshots.</div>';
                return;
              }
              const routes = Array.isArray(run.routes) ? run.routes : [];
              const header = '<div class="screenshot-review-gallery__header"><div><h3>' + escapeHtml(run.title) + '</h3><span>' + escapeHtml(run.analysisPath || '') + '</span></div><strong>' + escapeHtml(run.ok ? 'OK' : 'Review') + '</strong></div>';
              if (!routes.length) {
                gallery.innerHTML = header + '<div class="panel-log__empty">Run has no screenshot routes.</div>';
                return;
              }
              gallery.innerHTML = header + '<div class="screenshot-review-image-grid">' + routes.map(function(route) {
                const overflow = route.metrics && route.metrics.horizontalOverflow ? 'overflow' : 'no overflow';
                const bytes = route.screenshotBytes ? Math.round(route.screenshotBytes / 1024) + ' KB' : 'not saved';
                const viewport = route.viewportKey ? ' · ' + route.viewportKey : '';
                const domLink = route.domSnapshotUrl
                  ? '<a href="' + escapeHtml(route.domSnapshotUrl) + '" target="_blank" rel="noreferrer">DOM</a>'
                  : '<span>DOM not saved</span>';
                const media = route.imageUrl
                  ? '<img src="' + escapeHtml(route.imageUrl) + '" alt="' + escapeHtml(route.key) + ' screenshot" loading="lazy" />'
                  : '<div class="screenshot-review-image-card__missing">not saved</div>';
                return '<figure class="screenshot-review-image-card">'
                  + media
                  + '<figcaption><strong>' + escapeHtml(route.key) + '</strong><span>' + escapeHtml(bytes + ' · ' + overflow + viewport) + '</span>' + domLink + '</figcaption>'
                  + '</figure>';
              }).join('') + '</div>';
            }
            function renderTargets(run) {
              if (!targetSelect) return;
              targetSelect.innerHTML = '<option value="run">Whole run</option>';
              (run && Array.isArray(run.routes) ? run.routes : []).forEach(function(route) {
                const option = document.createElement('option');
                option.value = route.key || 'screenshot';
                option.textContent = route.key || 'screenshot';
                targetSelect.appendChild(option);
              });
            }
            async function loadComments(run) {
              if (!comments || !run) return;
              try {
                const response = await fetch(apiBase + '/comments?run=' + encodeURIComponent(run.runId), { cache: 'no-store' });
                const json = await response.json();
                if (!response.ok || json.status === 'error') throw new Error(json.message || json.error || response.statusText);
                comments.textContent = json.content || 'No comments yet.';
              } catch (err) {
                comments.textContent = 'Comment load failed: ' + (err.message || err);
              }
            }
            async function selectRun(runId) {
              selectedRun = runs.find(function(run) { return run.runId === runId; }) || runs[0] || null;
              renderRuns();
              renderGallery(selectedRun);
              renderTargets(selectedRun);
              await loadComments(selectedRun);
            }
            async function refresh() {
              setStatus('Loading screenshot runs...');
              try {
                const response = await fetch(buildRunsUrl(), { cache: 'no-store' });
                const json = await response.json();
                if (!response.ok || json.status === 'error') throw new Error(json.message || json.error || response.statusText);
                if (json.filters) {
                  updateOptions(sessionFilter, json.filters.sessions, 'All sessions');
                  updateOptions(appFilter, json.filters.apps, 'All apps');
                }
                runs = Array.isArray(json.runs) ? json.runs : [];
                const routeCount = runs.reduce(function(sum, run) { return sum + (Number(run.routeCount) || 0); }, 0);
                const commentCount = runs.reduce(function(sum, run) { return sum + (Number(run.commentCount) || 0); }, 0);
                setStat('runs', runs.length);
                setStat('images', routeCount);
                setStat('comments', commentCount);
                setStat('latest', runs[0] && runs[0].capturedAt ? shortDate(runs[0].capturedAt).split(',')[0] : '-');
                await selectRun(selectedRun ? selectedRun.runId : (runs[0] && runs[0].runId));
                root.dataset.screenshotReviewReady = 'true';
                panelRoot.dataset.screenshotReviewReady = 'true';
                setStatus('Last updated: ' + new Date().toLocaleTimeString());
              } catch (err) {
                root.dataset.screenshotReviewReady = 'error';
                panelRoot.dataset.screenshotReviewReady = 'error';
                setStatus('Screenshot review failed: ' + (err.message || err));
              }
            }
            if (runList) {
              runList.addEventListener('click', function(event) {
                const button = event.target.closest('[data-screenshot-review-run-id]');
                if (button) selectRun(button.dataset.screenshotReviewRunId);
              });
            }
            if (refreshButton) refreshButton.addEventListener('click', refresh);
            if (sessionFilter) sessionFilter.addEventListener('change', function() { selectedRun = null; refresh(); });
            if (appFilter) appFilter.addEventListener('change', function() { selectedRun = null; refresh(); });
            if (form) {
              form.addEventListener('submit', async function(event) {
                event.preventDefault();
                if (!selectedRun || !input || !input.value.trim()) return;
                setStatus('Saving screenshot comment...');
                try {
                  const response = await fetch(apiBase + '/comments', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                      runId: selectedRun.runId,
                      target: targetSelect && targetSelect.value ? targetSelect.value : 'run',
                      comment: input.value.trim()
                    })
                  });
                  const json = await response.json();
                  if (!response.ok || json.status === 'error') throw new Error(json.message || json.error || response.statusText);
                  input.value = '';
                  if (comments) comments.textContent = json.content || 'Comment saved.';
                  selectedRun.commentCount = Number(json.commentCount) || selectedRun.commentCount || 1;
                  renderRuns();
                  setStatus('Comment saved: ' + (json.commentsPath || 'SCREENSHOT_COMMENTS.md'));
                } catch (err) {
                  setStatus('Comment save failed: ' + (err.message || err));
                }
              });
            }
            refresh();
          });`;
}

function buildSubAppDelegateActivator() {
  return `
        window.resetDomain = window.resetDomain || function(domain) { console.log('[UnifiedApp] resetDomain', domain); };
        window.showCreateForm = window.showCreateForm || function() { console.log('[UnifiedApp] showCreateForm'); };
        window.toggleWebhook = window.toggleWebhook || function(id) { console.log('[UnifiedApp] toggleWebhook', id); };
        window.deleteWebhook = window.deleteWebhook || function(id) { console.log('[UnifiedApp] deleteWebhook', id); };
        window.activatePlugin = window.activatePlugin || function(id) { console.log('[UnifiedApp] activatePlugin', id); };
        window.deactivatePlugin = window.deactivatePlugin || function(id) { console.log('[UnifiedApp] deactivatePlugin', id); };`;
}

module.exports = {
  buildCloudCrawlActivator,
  buildDownloadVerificationActivator,
  buildDownloadsActivator,
  buildHomeActivator,
  buildMultiModalCrawlActivator,
  buildPanelDemoActivator,
  buildPlaceholderActivator,
  buildScreenshotReviewActivator,
  buildSearchExplorerActivator,
  buildSubAppDelegateActivator,
};