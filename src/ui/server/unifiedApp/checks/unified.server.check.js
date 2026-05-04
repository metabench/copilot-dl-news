'use strict';

/**
 * Unified App Server Check Script (start → probe → stop)
 *
 * Validates that the unified server can:
 * - start on a free port
 * - serve the shell at /
 * - serve mounted apps at /docs and /design
 * - serve a couple of known static assets under those mount paths
 * - shut down cleanly
 *
 * Run:
 *   node src/ui/server/unifiedApp/checks/unified.server.check.js
 */

const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const { waitForServer } = require('../../utils/serverStartupCheck');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((err) => {
        if (err) return reject(err);
        resolve(address.port);
      });
    });
    server.on('error', reject);
  });
}

function httpGetText(url, { timeoutMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs, headers: { Connection: 'close' }, agent: false }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body: data });
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });

    req.on('error', reject);
  });
}

function httpPostJson(url, payload, { timeoutMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload || {});
    const req = http.request(url, {
      method: 'POST',
      timeout: timeoutMs,
      headers: {
        Connection: 'close',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body)
      },
      agent: false
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body: data });
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function assertStatus(name, status, expected) {
  if (status !== expected) {
    throw new Error(`${name}: expected ${expected}, got ${status}`);
  }
}

function assertIncludes(name, body, substr) {
  if (!body.includes(substr)) {
    throw new Error(`${name}: missing substring ${JSON.stringify(substr)}`);
  }
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function run() {
  const result = {
    ok: false,
    step: 'init',
    error: null,
    timestamp: new Date().toISOString(),
    port: null,
    childExitCode: null,
    childExitSignal: null,
    outputPreview: ''
  };
  const artifactPath = path.join(__dirname, 'artifacts', 'unified.server.check.result.json');

  const projectRoot = path.join(__dirname, '..', '..', '..', '..', '..');
  const serverPath = path.join(projectRoot, 'src', 'ui', 'server', 'unifiedApp', 'server.js');

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  result.port = port;

  console.log('=== Unified Server Check ===');
  console.log(`Server: ${serverPath}`);
  console.log(`Port:   ${port}`);
  console.log('');

  const child = spawn(process.execPath, [serverPath, '--port', String(port)], {
    cwd: projectRoot,
    env: {
      ...process.env,
      UNIFIED_APP_CHECK_MODE: '1'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.on('exit', (code, signal) => {
    result.childExitCode = code;
    result.childExitSignal = signal;
  });

  let output = '';
  child.stdout?.on('data', (d) => {
    output += d.toString();
  });
  child.stderr?.on('data', (d) => {
    output += d.toString();
  });

  const killChild = async () => {
    if (!child || child.killed) return;

    try {
      child.kill('SIGTERM');
    } catch (_) {
      // ignore
    }

    await new Promise((r) => setTimeout(r, 300));

    try {
      child.kill('SIGKILL');
    } catch (_) {
      // ignore
    }
  };

  try {
    result.step = 'waitForServer';
    const ready = await waitForServer(port, '127.0.0.1', '/', 15000, 250);
    if (!ready.ok) {
      const childExitSuffix = result.childExitCode !== null
        ? ` (child exit=${result.childExitCode}${result.childExitSignal ? ` signal=${result.childExitSignal}` : ''})`
        : '';
      throw new Error(`Server did not respond: ${ready.error}${childExitSuffix}`);
    }

    result.step = 'GET /';
    const home = await httpGetText(`${baseUrl}/`);
    assertStatus('GET /', home.status, 200);
    assertIncludes('GET /', home.body, 'unified-shell');

    result.step = 'GET /docs';
    const docs = await httpGetText(`${baseUrl}/docs`);
    if (docs.status >= 500) {
      throw new Error(`GET /docs: server error status=${docs.status}`);
    }

    result.step = 'GET /design';
    const design = await httpGetText(`${baseUrl}/design`);
    if (design.status >= 500) {
      throw new Error(`GET /design: server error status=${design.status}`);
    }

    result.step = 'GET /docs/assets/docs-viewer.css';
    const docsCss = await httpGetText(`${baseUrl}/docs/assets/docs-viewer.css`);
    assertStatus('GET /docs/assets/docs-viewer.css', docsCss.status, 200);

    result.step = 'GET /design/assets/design-studio.css';
    const designCss = await httpGetText(`${baseUrl}/design/assets/design-studio.css`);
    assertStatus('GET /design/assets/design-studio.css', designCss.status, 200);

    result.step = 'GET /api/apps/panel-demo/content';
    const panelDemoPayload = await httpGetText(`${baseUrl}/api/apps/panel-demo/content`);
    assertStatus('GET /api/apps/panel-demo/content', panelDemoPayload.status, 200);
    const panelDemoJson = safeJsonParse(panelDemoPayload.body);
    if (!panelDemoJson) {
      throw new Error('GET /api/apps/panel-demo/content: expected JSON');
    }
    if (panelDemoJson.embed !== 'panel') {
      throw new Error(`GET /api/apps/panel-demo/content: expected embed=panel, got ${panelDemoJson.embed}`);
    }
    if (panelDemoJson.activationKey !== 'panel-demo') {
      throw new Error(`GET /api/apps/panel-demo/content: expected activationKey=panel-demo, got ${panelDemoJson.activationKey}`);
    }
    if (typeof panelDemoJson.content !== 'string' || !panelDemoJson.content.includes('data-unified-activate="panel-demo"')) {
      throw new Error('GET /api/apps/panel-demo/content: missing activation marker in content');
    }

    result.step = 'GET /api/apps/cloud-crawl/content';
    const cloudCrawlPayload = await httpGetText(`${baseUrl}/api/apps/cloud-crawl/content`);
    assertStatus('GET /api/apps/cloud-crawl/content', cloudCrawlPayload.status, 200);
    const cloudCrawlJson = safeJsonParse(cloudCrawlPayload.body);
    if (!cloudCrawlJson) {
      throw new Error('GET /api/apps/cloud-crawl/content: expected JSON');
    }
    if (cloudCrawlJson.embed !== 'panel') {
      throw new Error(`GET /api/apps/cloud-crawl/content: expected embed=panel, got ${cloudCrawlJson.embed}`);
    }
    if (cloudCrawlJson.activationKey !== 'cloud-crawl') {
      throw new Error(`GET /api/apps/cloud-crawl/content: expected activationKey=cloud-crawl, got ${cloudCrawlJson.activationKey}`);
    }
    if (typeof cloudCrawlJson.content !== 'string' || !cloudCrawlJson.content.includes('data-cloud-crawl-root="true"')) {
      throw new Error('GET /api/apps/cloud-crawl/content: missing cloud crawl root marker');
    }

    result.step = 'GET /api/apps/search-explorer/content';
    const searchExplorerPayload = await httpGetText(`${baseUrl}/api/apps/search-explorer/content`);
    assertStatus('GET /api/apps/search-explorer/content', searchExplorerPayload.status, 200);
    const searchExplorerJson = safeJsonParse(searchExplorerPayload.body);
    if (!searchExplorerJson) {
      throw new Error('GET /api/apps/search-explorer/content: expected JSON');
    }
    if (searchExplorerJson.embed !== 'panel') {
      throw new Error(`GET /api/apps/search-explorer/content: expected embed=panel, got ${searchExplorerJson.embed}`);
    }
    if (searchExplorerJson.activationKey !== 'search-explorer') {
      throw new Error(`GET /api/apps/search-explorer/content: expected activationKey=search-explorer, got ${searchExplorerJson.activationKey}`);
    }
    if (typeof searchExplorerJson.content !== 'string' || !searchExplorerJson.content.includes('data-search-input="q"')) {
      throw new Error('GET /api/apps/search-explorer/content: missing query input marker in content');
    }

    result.step = 'GET /api/apps/screenshot-review/content';
    const screenshotReviewPayload = await httpGetText(`${baseUrl}/api/apps/screenshot-review/content`);
    assertStatus('GET /api/apps/screenshot-review/content', screenshotReviewPayload.status, 200);
    const screenshotReviewJson = safeJsonParse(screenshotReviewPayload.body);
    if (!screenshotReviewJson) {
      throw new Error('GET /api/apps/screenshot-review/content: expected JSON');
    }
    if (screenshotReviewJson.embed !== 'panel') {
      throw new Error(`GET /api/apps/screenshot-review/content: expected embed=panel, got ${screenshotReviewJson.embed}`);
    }
    if (screenshotReviewJson.activationKey !== 'screenshot-review') {
      throw new Error(`GET /api/apps/screenshot-review/content: expected activationKey=screenshot-review, got ${screenshotReviewJson.activationKey}`);
    }
    if (typeof screenshotReviewJson.content !== 'string' || !screenshotReviewJson.content.includes('data-screenshot-review-root="true"')) {
      throw new Error('GET /api/apps/screenshot-review/content: missing screenshot review root marker');
    }
    if (!screenshotReviewJson.content.includes('data-screenshot-review-filter="session"') || !screenshotReviewJson.content.includes('data-screenshot-review-filter="app"')) {
      throw new Error('GET /api/apps/screenshot-review/content: missing screenshot review filter markers');
    }

    result.step = 'GET /api/crawl/summary';
    const crawlSummaryPayload = await httpGetText(`${baseUrl}/api/crawl/summary`);
    assertStatus('GET /api/crawl/summary', crawlSummaryPayload.status, 200);
    const crawlSummaryJson = safeJsonParse(crawlSummaryPayload.body);
    if (!crawlSummaryJson) {
      throw new Error('GET /api/crawl/summary: expected JSON');
    }
    if (crawlSummaryJson.status !== 'ok') {
      throw new Error(`GET /api/crawl/summary: expected status=ok, got ${crawlSummaryJson.status}`);
    }
    if (!Number.isFinite(crawlSummaryJson.activeJobs)) {
      throw new Error('GET /api/crawl/summary: expected numeric activeJobs');
    }
    if (!Number.isFinite(crawlSummaryJson.errorsLast10m)) {
      throw new Error('GET /api/crawl/summary: expected numeric errorsLast10m');
    }
    if (crawlSummaryJson.lastFailingJobId != null && typeof crawlSummaryJson.lastFailingJobId !== 'string') {
      throw new Error('GET /api/crawl/summary: expected lastFailingJobId to be string|null');
    }
    if (crawlSummaryJson.lastFailingUrl != null && typeof crawlSummaryJson.lastFailingUrl !== 'string') {
      throw new Error('GET /api/crawl/summary: expected lastFailingUrl to be string|null');
    }

    result.step = 'GET /api/cloud-crawl/status';
    const cloudStatusPayload = await httpGetText(`${baseUrl}/api/cloud-crawl/status`);
    assertStatus('GET /api/cloud-crawl/status', cloudStatusPayload.status, 200);
    const cloudStatusJson = safeJsonParse(cloudStatusPayload.body);
    if (!cloudStatusJson) {
      throw new Error('GET /api/cloud-crawl/status: expected JSON');
    }
    if (cloudStatusJson.status !== 'ok') {
      throw new Error(`GET /api/cloud-crawl/status: expected status=ok, got ${cloudStatusJson.status}`);
    }
    if (!cloudStatusJson.totals || !Number.isFinite(cloudStatusJson.totals.goalDownloads)) {
      throw new Error('GET /api/cloud-crawl/status: expected numeric totals.goalDownloads');
    }
    if (!Array.isArray(cloudStatusJson.targets) || cloudStatusJson.targets.length !== 5) {
      throw new Error('GET /api/cloud-crawl/status: expected five target rows');
    }

    result.step = 'GET /api/downloads/verifications';
    const downloadVerificationPayload = await httpGetText(`${baseUrl}/api/downloads/verifications?limit=3`);
    assertStatus('GET /api/downloads/verifications', downloadVerificationPayload.status, 200);
    const downloadVerificationJson = safeJsonParse(downloadVerificationPayload.body);
    if (!downloadVerificationJson) {
      throw new Error('GET /api/downloads/verifications: expected JSON');
    }
    if (downloadVerificationJson.status !== 'ok') {
      throw new Error(`GET /api/downloads/verifications: expected status=ok, got ${downloadVerificationJson.status}`);
    }
    if (!Array.isArray(downloadVerificationJson.items)) {
      throw new Error('GET /api/downloads/verifications: expected items array');
    }
    if (!downloadVerificationJson.summary || !Number.isFinite(downloadVerificationJson.summary.total)) {
      throw new Error('GET /api/downloads/verifications: expected numeric summary.total');
    }

    result.step = 'GET /api/search-explorer/search freshness contract';
    const searchApiPayload = await httpGetText(`${baseUrl}/api/search-explorer/search?q=check`);
    assertStatus('GET /api/search-explorer/search', searchApiPayload.status, 200);
    const searchApiJson = safeJsonParse(searchApiPayload.body);
    if (!searchApiJson) {
      throw new Error('GET /api/search-explorer/search: expected JSON');
    }
    if (searchApiJson.status !== 'ok') {
      throw new Error(`GET /api/search-explorer/search: expected status=ok, got ${searchApiJson.status}`);
    }
    const freshness = searchApiJson.freshness;
    if (!freshness || typeof freshness !== 'object') {
      throw new Error('GET /api/search-explorer/search: missing freshness object');
    }
    if (typeof freshness.freshnessLabel !== 'string' || !freshness.freshnessLabel) {
      throw new Error('GET /api/search-explorer/search: freshness.freshnessLabel must be non-empty string');
    }
    if (!Number.isFinite(freshness.confidenceScore)) {
      throw new Error('GET /api/search-explorer/search: freshness.confidenceScore must be numeric');
    }
    if (typeof freshness.summary !== 'string' || !freshness.summary) {
      throw new Error('GET /api/search-explorer/search: freshness.summary must be non-empty string');
    }
    if (!Array.isArray(searchApiJson.results)) {
      throw new Error('GET /api/search-explorer/search: results must be an array');
    }

    result.step = 'GET /api/screenshot-review/runs';
    const screenshotRunsPayload = await httpGetText(`${baseUrl}/api/screenshot-review/runs`);
    assertStatus('GET /api/screenshot-review/runs', screenshotRunsPayload.status, 200);
    const screenshotRunsJson = safeJsonParse(screenshotRunsPayload.body);
    if (!screenshotRunsJson || screenshotRunsJson.status !== 'ok') {
      throw new Error('GET /api/screenshot-review/runs: expected status=ok JSON');
    }
    if (!Array.isArray(screenshotRunsJson.runs) || screenshotRunsJson.runs.length < 1) {
      throw new Error('GET /api/screenshot-review/runs: expected at least one run');
    }
    if (!screenshotRunsJson.filters || !Array.isArray(screenshotRunsJson.filters.sessions) || !Array.isArray(screenshotRunsJson.filters.apps)) {
      throw new Error('GET /api/screenshot-review/runs: expected filter metadata');
    }
    const firstRun = screenshotRunsJson.runs[0];
    if (!firstRun.runId || !Array.isArray(firstRun.routes)) {
      throw new Error('GET /api/screenshot-review/runs: expected runId and routes');
    }
    if (!firstRun.sessionId || !Array.isArray(firstRun.appKeys)) {
      throw new Error('GET /api/screenshot-review/runs: expected sessionId and appKeys');
    }

    result.step = 'GET /api/screenshot-review/runs filtered';
    const filteredScreenshotRunsPayload = await httpGetText(`${baseUrl}/api/screenshot-review/runs?session=${encodeURIComponent(firstRun.sessionId)}&app=screenshot-review`);
    assertStatus('GET /api/screenshot-review/runs filtered', filteredScreenshotRunsPayload.status, 200);
    const filteredScreenshotRunsJson = safeJsonParse(filteredScreenshotRunsPayload.body);
    if (!filteredScreenshotRunsJson || filteredScreenshotRunsJson.status !== 'ok' || !Array.isArray(filteredScreenshotRunsJson.runs) || filteredScreenshotRunsJson.runs.length < 1) {
      throw new Error('GET /api/screenshot-review/runs filtered: expected matching runs');
    }

    result.step = 'GET /api/screenshot-review/dom';
    const domPayload = await httpGetText(`${baseUrl}/api/screenshot-review/dom/check-run/screenshot-review.html`);
    assertStatus('GET /api/screenshot-review/dom', domPayload.status, 200);
    assertIncludes('GET /api/screenshot-review/dom', domPayload.body, 'Screenshot review check DOM');

    result.step = 'GET /api/screenshot-review/comments';
    const screenshotCommentsPayload = await httpGetText(`${baseUrl}/api/screenshot-review/comments?run=${encodeURIComponent(firstRun.runId)}`);
    assertStatus('GET /api/screenshot-review/comments', screenshotCommentsPayload.status, 200);
    const screenshotCommentsJson = safeJsonParse(screenshotCommentsPayload.body);
    if (!screenshotCommentsJson || screenshotCommentsJson.status !== 'ok' || typeof screenshotCommentsJson.content !== 'string') {
      throw new Error('GET /api/screenshot-review/comments: expected status=ok content');
    }

    result.step = 'POST /api/screenshot-review/comments';
    const screenshotCommentPostPayload = await httpPostJson(`${baseUrl}/api/screenshot-review/comments`, {
      runId: firstRun.runId,
      target: 'screenshot-review',
      comment: 'Server check comment'
    });
    assertStatus('POST /api/screenshot-review/comments', screenshotCommentPostPayload.status, 200);
    const screenshotCommentPostJson = safeJsonParse(screenshotCommentPostPayload.body);
    if (!screenshotCommentPostJson || screenshotCommentPostJson.status !== 'ok' || !screenshotCommentPostJson.content.includes('Check-mode saved comment')) {
      throw new Error('POST /api/screenshot-review/comments: expected saved check-mode content');
    }

    result.ok = true;
    result.step = 'complete';
    console.log('✅ Unified server check passed');
    process.exitCode = 0;
  } catch (err) {
    result.error = err?.message || String(err);
    console.error('❌ Unified server check failed:', err?.message || err);
    if (output) {
      console.error('\n--- server output (first 1200 chars) ---');
      console.error(output.slice(0, 1200));
    }
    process.exitCode = 1;
  } finally {
    result.outputPreview = output.slice(0, 1200);
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.writeFileSync(artifactPath, JSON.stringify(result, null, 2), 'utf8');
    await killChild();
  }
}

run().catch((err) => {
  console.error('❌ Unified server check crashed:', err?.stack || err);
  process.exit(2);
});

