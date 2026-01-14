const { escapeHtml, ensureRenderNav } = require('../../../shared/utils/html');

function renderMetric(label, value) {
  return `<div class="bootstrap-metric"><span class="bootstrap-metric__label">${escapeHtml(label)}</span><span class="bootstrap-metric__value">${escapeHtml(String(value))}</span></div>`;
}

function renderBootstrapDbPage({ status = {}, renderNav, datasetPath }) {
  const navRenderer = ensureRenderNav(renderNav);
  const navHtml = navRenderer('bootstrap-db', { variant: 'bar' });
  const countries = status.countries != null ? status.countries : '0';
  const topicKeywords = status.topicKeywords != null ? status.topicKeywords : '0';
  const skipTerms = status.skipTerms != null ? status.skipTerms : '0';
  const safeToBootstrap = status.safeToBootstrap !== false;
  const statusInitialText = safeToBootstrap
    ? 'Ready — safe to run bootstrap against current database contents.'
    : 'Blocked — existing data was not created by bootstrap-db. Force run required.';
  const runButtonLabel = safeToBootstrap ? 'Run bootstrap' : 'Force bootstrap';
  const sourceSummary = status.source ? renderSource(status.source) : '<p class="ui-meta">No bootstrap source metadata stored yet.</p>';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Bootstrap DB</title>
  <link rel="stylesheet" href="/ui.css" />
  <link rel="stylesheet" href="/ui-dark.css" />
  <style>
    .bootstrap-db-page__layout { padding: 1.5rem 2rem; max-width: 960px; margin: 0 auto; }
    .bootstrap-db-page__metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin: 1rem 0 2rem; }
    .bootstrap-metric { background: var(--ui-panel-bg, #16181d); border: 1px solid var(--ui-border-color, #2b2f3b); border-radius: 8px; padding: 1rem; display: flex; flex-direction: column; }
    .bootstrap-metric__label { font-size: 0.85rem; opacity: 0.75; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.35rem; }
    .bootstrap-metric__value { font-size: 1.5rem; font-weight: 600; }
    .bootstrap-db-page__panel { background: var(--ui-panel-bg, #16181d); border: 1px solid var(--ui-border-color, #2b2f3b); border-radius: 8px; padding: 1rem 1.25rem; margin-top: 1.5rem; }
    .bootstrap-db-page__actions { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
    .bootstrap-db-page__status { margin-top: 1.5rem; }
    pre.bootstrap-db-page__log { background: rgba(20, 22, 28, 0.85); border: 1px solid rgba(65, 71, 88, 0.6); padding: 1rem; border-radius: 6px; overflow: auto; max-height: 320px; }
    .bootstrap-db-page__dataset { font-family: var(--ui-font-mono, monospace); font-size: 0.9rem; }
  </style>
</head>
<body class="ui-page bootstrap-db-page">
  ${navHtml}
  <main class="bootstrap-db-page__layout">
    <header>
      <h1>Bootstrap database</h1>
      <p class="ui-meta">Seed the gazetteer and crawler keyword tables using the bundled JSON dataset.</p>
    </header>

    <section class="bootstrap-db-page__panel bootstrap-db-page__dataset">
      <strong>Dataset path:</strong> ${escapeHtml(datasetPath || '—')}
    </section>

    <section class="bootstrap-db-page__metrics">
      ${renderMetric('Countries', countries)}
      ${renderMetric('Topic keywords', topicKeywords)}
      ${renderMetric('Skip terms', skipTerms)}
    </section>

    <section class="bootstrap-db-page__panel">
      <h2>Bootstrap actions</h2>
      <div class="bootstrap-db-page__actions">
        <button type="button" class="ui-button" id="bootstrap-run" data-safe="${safeToBootstrap ? 'true' : 'false'}">${escapeHtml(runButtonLabel)}</button>
        <span id="bootstrap-status-label" class="ui-meta">${escapeHtml(statusInitialText)}</span>
      </div>
      <div class="bootstrap-db-page__status">
        <h3>Latest result</h3>
        <pre class="bootstrap-db-page__log" id="bootstrap-log">(no runs yet)</pre>
      </div>
    </section>

    <section class="bootstrap-db-page__panel">
      <h2>Source metadata</h2>
      ${sourceSummary}
    </section>
  </main>
  <script>
  const statusLabel = document.getElementById('bootstrap-status-label');
  const logPanel = document.getElementById('bootstrap-log');
  const runButton = document.getElementById('bootstrap-run');
  const metricValues = Array.from(document.querySelectorAll('.bootstrap-metric__value'));
  let safeToBootstrap = runButton.getAttribute('data-safe') !== 'false';

    async function refreshStatus() {
      try {
        const response = await fetch('/api/bootstrap-db/status');
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const payload = await response.json();
        if (payload && payload.status) {
          const { countries, topicKeywords, skipTerms, safeToBootstrap: safeFlag } = payload.status;
          metricValues[0].textContent = String(countries ?? 0);
          metricValues[1].textContent = String(topicKeywords ?? 0);
          metricValues[2].textContent = String(skipTerms ?? 0);
          safeToBootstrap = safeFlag !== false;
          if (safeToBootstrap) {
            statusLabel.textContent = 'Ready — safe to run bootstrap against current database contents.';
            runButton.textContent = 'Run bootstrap';
            runButton.disabled = false;
          } else {
            statusLabel.textContent = 'Blocked — existing data was not created by bootstrap-db. Force run required.';
            runButton.textContent = 'Force bootstrap';
          }
        }
      } catch (err) {
        statusLabel.textContent = 'Status refresh failed: ' + err.message;
      }
    }

    async function runBootstrap() {
      if (!safeToBootstrap) {
        const confirmed = window.confirm('The database already contains non-bootstrap data. Do you want to force the bootstrap process? This may overwrite certain records.');
        if (!confirmed) {
          statusLabel.textContent = 'Bootstrap cancelled — database left unchanged.';
          return;
        }
      }
      runButton.disabled = true;
      statusLabel.textContent = safeToBootstrap ? 'Running bootstrap...' : 'Forcing bootstrap...';
      try {
        const response = await fetch('/api/bootstrap-db/run', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ force: !safeToBootstrap })
        });
        if (!response.ok) {
          const text = await response.text();
          let message = text || ('HTTP ' + response.status);
          try {
            const parsed = JSON.parse(text);
            if (parsed && parsed.error) {
              message = parsed.error;
            }
          } catch (_) {}
          throw new Error(message);
        }
        const payload = await response.json();
        logPanel.textContent = JSON.stringify(payload, null, 2);
        statusLabel.textContent = 'Bootstrap completed successfully';
      } catch (err) {
        statusLabel.textContent = 'Bootstrap failed: ' + err.message;
        logPanel.textContent = 'Error: ' + err.message;
      } finally {
        runButton.disabled = false;
        refreshStatus();
      }
    }

    runButton.addEventListener('click', runBootstrap);
    refreshStatus();
  </script>
</body>
</html>`;
}

function renderSource(row) {
  const fields = [
    ['Name', row.name],
    ['Version', row.version || '—'],
    ['URL', row.url || '—'],
    ['License', row.license || '—']
  ];
  const list = fields.map(([label, value]) => `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(String(value))}</li>`).join('');
  return `<ul class="ui-list">${list}</ul>`;
}

module.exports = {
  renderBootstrapDbPage
};
