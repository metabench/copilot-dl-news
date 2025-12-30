'use strict';

/**
 * Test Studio Server
 * UI for visualizing and managing test results
 * @module ui/server/testStudio
 */

const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const TestResultService = require('./TestResultService');
const FlakyDetector = require('./FlakyDetector');
const TrendAnalyzer = require('./TrendAnalyzer');

const DEFAULT_PORT = 3103;

/**
 * Create the Test Studio server
 * @param {Object} options - Server options
 * @returns {Object} Express app and services
 */
function createServer(options = {}) {
  const app = express();
  
  // Services
  const resultService = options.resultService || new TestResultService(options);
  const flakyDetector = options.flakyDetector || new FlakyDetector(resultService);
  const trendAnalyzer = options.trendAnalyzer || new TrendAnalyzer(resultService);
  
  // Middleware
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));
  
  // API Routes
  
  /**
   * GET /api/test-studio/runs
   * List all test runs
   */
  app.get('/api/test-studio/runs', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;
      const runs = await resultService.listRuns({ limit, offset });
      res.json({ success: true, runs, total: await resultService.getRunCount() });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/test-studio/runs/:id
   * Get a single test run with full results
   */
  app.get('/api/test-studio/runs/:id', async (req, res) => {
    try {
      const run = await resultService.getRun(req.params.id);
      if (!run) {
        return res.status(404).json({ success: false, error: 'Run not found' });
      }
      res.json({ success: true, run });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/test-studio/runs/:id/results
   * Get paginated test results with filters
   */
  app.get('/api/test-studio/runs/:id/results', async (req, res) => {
    try {
      const filters = {
        status: req.query.status,
        file: req.query.file,
        search: req.query.search,
        minDuration: parseInt(req.query.minDuration) || undefined,
        maxDuration: parseInt(req.query.maxDuration) || undefined,
        limit: parseInt(req.query.limit) || 100,
        offset: parseInt(req.query.offset) || 0
      };
      
      const results = await resultService.getResults(req.params.id, filters);
      const total = await resultService.getResultCount(req.params.id, filters);
      
      res.json({ success: true, results, total, filters });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/test-studio/trends
   * Get pass rate trend data
   */
  app.get('/api/test-studio/trends', async (req, res) => {
    try {
      const days = parseInt(req.query.days) || 30;
      const groupBy = req.query.groupBy || 'day';
      const trends = await trendAnalyzer.getTrends({ days, groupBy });
      res.json({ success: true, trends });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/test-studio/flaky
   * Get list of flaky tests
   */
  app.get('/api/test-studio/flaky', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 20;
      const flakyTests = await flakyDetector.getFlakyTests({ limit });
      res.json({ success: true, flakyTests });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/test-studio/failures
   * Get grouped failure analysis
   */
  app.get('/api/test-studio/failures', async (req, res) => {
    try {
      const runId = req.query.runId;
      const failures = await resultService.getGroupedFailures(runId);
      res.json({ success: true, failures });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/test-studio/rerun
   * Trigger test rerun
   */
  app.post('/api/test-studio/rerun', async (req, res) => {
    try {
      const { tests, runId } = req.body;
      
      if (!tests || !Array.isArray(tests) || tests.length === 0) {
        return res.status(400).json({ success: false, error: 'No tests specified' });
      }

      // Build command
      const testPaths = [...new Set(tests.map(t => t.file))];
      const command = buildRerunCommand(testPaths, tests);
      
      // Execute in background
      const result = await executeRerun(command);
      
      res.json({ success: true, command, result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/test-studio/import
   * Import test results from JSON file
   */
  app.post('/api/test-studio/import', async (req, res) => {
    try {
      const { data, source } = req.body;
      const run = await resultService.importResults(data, source);
      res.json({ success: true, run });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * DELETE /api/test-studio/runs/:id
   * Delete a test run
   */
  app.delete('/api/test-studio/runs/:id', async (req, res) => {
    try {
      await resultService.deleteRun(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/test-studio/stats
   * Get overall statistics
   */
  app.get('/api/test-studio/stats', async (req, res) => {
    try {
      const stats = await resultService.getStats();
      res.json({ success: true, stats });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /
   * Serve the main dashboard
   */
  app.get('/', (req, res) => {
    res.send(getDashboardHTML());
  });

  return { app, resultService, flakyDetector, trendAnalyzer };
}

/**
 * Build rerun command for failed tests
 * @param {string[]} files - Test file paths
 * @param {Array} tests - Test objects with names
 * @returns {string} Command string
 */
function buildRerunCommand(files, tests) {
  const fileArgs = files.map(f => `"${f}"`).join(' ');
  
  // If specific tests, add -t filter
  if (tests.length === 1 && tests[0].name) {
    const testName = tests[0].name.replace(/"/g, '\\"');
    return `npm run test:by-path -- ${fileArgs} -- -t "${testName}"`;
  }
  
  return `npm run test:by-path -- ${fileArgs}`;
}

/**
 * Execute test rerun
 * @param {string} command - Command to execute
 * @returns {Promise<Object>} Execution result
 */
async function executeRerun(command) {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32';
    const shell = isWindows ? 'cmd.exe' : '/bin/sh';
    const shellFlag = isWindows ? '/c' : '-c';
    
    const child = spawn(shell, [shellFlag, command], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', data => stdout += data.toString());
    child.stderr.on('data', data => stderr += data.toString());
    
    child.on('close', code => {
      resolve({
        exitCode: code,
        stdout: stdout.slice(-5000), // Last 5KB
        stderr: stderr.slice(-2000)
      });
    });
    
    child.on('error', error => {
      reject(error);
    });
    
    // Timeout after 5 minutes
    setTimeout(() => {
      child.kill();
      resolve({ exitCode: -1, stdout, stderr, timeout: true });
    }, 300000);
  });
}

/**
 * Generate dashboard HTML
 * @returns {string} HTML
 */
function getDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Studio</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a2e; 
      color: #eee; 
      line-height: 1.5;
    }
    .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
    header { 
      display: flex; 
      justify-content: space-between; 
      align-items: center;
      padding: 20px 0;
      border-bottom: 1px solid #333;
      margin-bottom: 20px;
    }
    h1 { font-size: 24px; display: flex; align-items: center; gap: 10px; }
    h1 span { font-size: 28px; }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-bottom: 30px;
    }
    .stat-card {
      background: #16213e;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
    }
    .stat-value { font-size: 32px; font-weight: bold; }
    .stat-label { color: #888; font-size: 14px; margin-top: 5px; }
    .stat-card.passed .stat-value { color: #4ade80; }
    .stat-card.failed .stat-value { color: #f87171; }
    .stat-card.skipped .stat-value { color: #fbbf24; }
    
    .section { margin-bottom: 30px; }
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
    }
    .section h2 { font-size: 18px; color: #ccc; }
    
    .filters {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .filter-btn {
      padding: 6px 12px;
      background: #2a2a4a;
      border: 1px solid #444;
      border-radius: 4px;
      color: #ccc;
      cursor: pointer;
      font-size: 13px;
    }
    .filter-btn.active { background: #3b82f6; border-color: #3b82f6; color: white; }
    
    .test-list {
      background: #16213e;
      border-radius: 8px;
      overflow: hidden;
    }
    .test-row {
      display: grid;
      grid-template-columns: 40px 1fr 100px 80px;
      padding: 12px 15px;
      border-bottom: 1px solid #2a2a4a;
      align-items: center;
      font-size: 14px;
    }
    .test-row:hover { background: #1e2d4a; }
    .test-row:last-child { border-bottom: none; }
    
    .status-icon { font-size: 18px; }
    .status-passed { color: #4ade80; }
    .status-failed { color: #f87171; }
    .status-skipped { color: #fbbf24; }
    
    .test-name { 
      overflow: hidden; 
      text-overflow: ellipsis; 
      white-space: nowrap; 
    }
    .test-file { color: #888; font-size: 12px; }
    .test-duration { color: #888; text-align: right; }
    
    .btn {
      padding: 8px 16px;
      border-radius: 4px;
      border: none;
      cursor: pointer;
      font-size: 14px;
      transition: background 0.2s;
    }
    .btn-primary { background: #3b82f6; color: white; }
    .btn-primary:hover { background: #2563eb; }
    .btn-danger { background: #ef4444; color: white; }
    .btn-danger:hover { background: #dc2626; }
    
    .loading { text-align: center; padding: 40px; color: #888; }
    .error { color: #f87171; padding: 20px; text-align: center; }
    
    .chart-container {
      background: #16213e;
      border-radius: 8px;
      padding: 20px;
      height: 250px;
    }
    
    .flaky-badge {
      display: inline-block;
      padding: 2px 8px;
      background: #fbbf24;
      color: #1a1a2e;
      border-radius: 10px;
      font-size: 11px;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1><span>🧪</span> Test Studio</h1>
      <div>
        <button class="btn btn-primary" onclick="loadRuns()">Refresh</button>
      </div>
    </header>
    
    <div class="stats-grid" id="stats">
      <div class="stat-card"><div class="stat-value">-</div><div class="stat-label">Total Tests</div></div>
      <div class="stat-card passed"><div class="stat-value">-</div><div class="stat-label">Passed</div></div>
      <div class="stat-card failed"><div class="stat-value">-</div><div class="stat-label">Failed</div></div>
      <div class="stat-card skipped"><div class="stat-value">-</div><div class="stat-label">Skipped</div></div>
    </div>
    
    <div class="section">
      <div class="section-header">
        <h2>Test Results</h2>
        <div class="filters">
          <button class="filter-btn active" data-filter="all">All</button>
          <button class="filter-btn" data-filter="passed">Passed</button>
          <button class="filter-btn" data-filter="failed">Failed</button>
          <button class="filter-btn" data-filter="skipped">Skipped</button>
        </div>
      </div>
      <div class="test-list" id="test-list">
        <div class="loading">Loading tests...</div>
      </div>
    </div>
    
    <div class="section">
      <div class="section-header">
        <h2>Pass Rate Trend</h2>
      </div>
      <div class="chart-container" id="trend-chart">
        <div class="loading">Loading trends...</div>
      </div>
    </div>
  </div>
  
  <script>
    let currentFilter = 'all';
    let testData = [];
    
    async function loadRuns() {
      try {
        const res = await fetch('/api/test-studio/runs?limit=1');
        const data = await res.json();
        
        if (data.runs && data.runs.length > 0) {
          loadResults(data.runs[0].run_id || data.runs[0].runId);
        } else {
          document.getElementById('test-list').innerHTML = 
            '<div class="loading">No test runs found. Run tests with the custom reporter.</div>';
        }
      } catch (err) {
        document.getElementById('test-list').innerHTML = 
          '<div class="error">Error loading runs: ' + err.message + '</div>';
      }
    }
    
    async function loadResults(runId) {
      try {
        const res = await fetch('/api/test-studio/runs/' + runId + '/results');
        const data = await res.json();
        
        testData = data.results || [];
        renderTests();
        updateStats();
      } catch (err) {
        document.getElementById('test-list').innerHTML = 
          '<div class="error">Error loading results: ' + err.message + '</div>';
      }
    }
    
    function renderTests() {
      const filtered = currentFilter === 'all' 
        ? testData 
        : testData.filter(t => t.status === currentFilter);
      
      if (filtered.length === 0) {
        document.getElementById('test-list').innerHTML = 
          '<div class="loading">No tests match filter</div>';
        return;
      }
      
      const html = filtered.map(test => {
        const icon = test.status === 'passed' ? '✓' : test.status === 'failed' ? '✗' : '○';
        return '<div class="test-row">' +
          '<span class="status-icon status-' + test.status + '">' + icon + '</span>' +
          '<div><div class="test-name">' + (test.test_name || test.testName) + '</div>' +
          '<div class="test-file">' + test.file + '</div></div>' +
          '<div class="test-duration">' + (test.duration_ms || test.durationMs || 0) + 'ms</div>' +
          '<div></div>' +
        '</div>';
      }).join('');
      
      document.getElementById('test-list').innerHTML = html;
    }
    
    function updateStats() {
      const passed = testData.filter(t => t.status === 'passed').length;
      const failed = testData.filter(t => t.status === 'failed').length;
      const skipped = testData.filter(t => t.status === 'skipped').length;
      
      document.getElementById('stats').innerHTML = 
        '<div class="stat-card"><div class="stat-value">' + testData.length + '</div><div class="stat-label">Total Tests</div></div>' +
        '<div class="stat-card passed"><div class="stat-value">' + passed + '</div><div class="stat-label">Passed</div></div>' +
        '<div class="stat-card failed"><div class="stat-value">' + failed + '</div><div class="stat-label">Failed</div></div>' +
        '<div class="stat-card skipped"><div class="stat-value">' + skipped + '</div><div class="stat-label">Skipped</div></div>';
    }
    
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        currentFilter = this.dataset.filter;
        renderTests();
      });
    });
    
    loadRuns();
  </script>
</body>
</html>`;
}

/**
 * Start the server
 * @param {Object} options - Options
 * @returns {Promise<Object>} Server instance
 */
async function startServer(options = {}) {
  const port = options.port || DEFAULT_PORT;
  const { app, resultService } = createServer(options);
  
  // Initialize database tables
  await resultService.initTables();
  
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      console.log(`🧪 Test Studio running at http://localhost:${port}`);
      resolve({ server, app, port });
    });
  });
}

module.exports = {
  createServer,
  startServer,
  buildRerunCommand,
  getDashboardHTML,
  DEFAULT_PORT
};
