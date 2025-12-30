'use strict';

/**
 * Test Result Service
 * Manages test result storage and queries
 * @module ui/server/testStudio/TestResultService
 */

const crypto = require('crypto');

/**
 * TestResultService - Storage and retrieval of test results
 */
class TestResultService {
  /**
   * Create a TestResultService
   * @param {Object} options - Options
   * @param {Object} options.db - Database connection
   */
  constructor(options = {}) {
    this.db = options.db || null;
    this._memory = { runs: [], results: [] }; // In-memory fallback
  }

  /**
   * Initialize database tables
   */
  async initTables() {
    if (!this.db) return;

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS test_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT UNIQUE NOT NULL,
        timestamp TEXT NOT NULL,
        duration_ms INTEGER,
        total INTEGER,
        passed INTEGER,
        failed INTEGER,
        skipped INTEGER,
        git_branch TEXT,
        git_commit TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS test_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        file TEXT NOT NULL,
        test_name TEXT NOT NULL,
        full_name TEXT,
        status TEXT NOT NULL,
        duration_ms INTEGER,
        error_message TEXT,
        error_stack TEXT,
        FOREIGN KEY(run_id) REFERENCES test_runs(run_id)
      )
    `);

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS flaky_tests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file TEXT NOT NULL,
        test_name TEXT NOT NULL,
        flaky_score REAL,
        last_computed TEXT,
        UNIQUE(file, test_name)
      )
    `);

    // Indexes
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_test_results_run_id ON test_results(run_id)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_test_results_status ON test_results(status)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_test_results_file ON test_results(file)`);
  }

  /**
   * Generate unique run ID
   * @returns {string} Run ID
   */
  generateRunId() {
    return `run-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * Import test results from Jest JSON output
   * @param {Object} data - Jest JSON output
   * @param {string} source - Source identifier
   * @returns {Promise<Object>} Created run
   */
  async importResults(data, source = 'import') {
    const runId = data.runId || this.generateRunId();
    const timestamp = data.timestamp || new Date().toISOString();
    
    // Calculate summary
    let total = 0, passed = 0, failed = 0, skipped = 0, duration = 0;
    const results = [];

    const testResults = data.testResults || data.results || [];
    
    for (const fileResult of testResults) {
      const file = fileResult.name || fileResult.file;
      const tests = fileResult.assertionResults || fileResult.tests || [];
      
      for (const test of tests) {
        total++;
        const status = test.status || (test.passed ? 'passed' : 'failed');
        
        if (status === 'passed') passed++;
        else if (status === 'failed') failed++;
        else skipped++;
        
        duration += test.duration || 0;
        
        results.push({
          runId,
          file,
          testName: test.title || test.name,
          fullName: test.fullName || test.ancestorTitles?.join(' > ') + ' > ' + test.title,
          status,
          durationMs: test.duration || 0,
          errorMessage: test.failureMessages?.[0]?.split('\n')[0] || test.error || null,
          errorStack: test.failureMessages?.join('\n') || test.errorStack || null
        });
      }
    }

    // Create run record
    const run = {
      runId,
      timestamp,
      durationMs: data.duration || duration,
      total,
      passed,
      failed,
      skipped,
      gitBranch: data.gitBranch || null,
      gitCommit: data.gitCommit || null
    };

    if (this.db) {
      await this.db.run(`
        INSERT INTO test_runs (run_id, timestamp, duration_ms, total, passed, failed, skipped, git_branch, git_commit)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [run.runId, run.timestamp, run.durationMs, run.total, run.passed, run.failed, run.skipped, run.gitBranch, run.gitCommit]);

      for (const result of results) {
        await this.db.run(`
          INSERT INTO test_results (run_id, file, test_name, full_name, status, duration_ms, error_message, error_stack)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [result.runId, result.file, result.testName, result.fullName, result.status, result.durationMs, result.errorMessage, result.errorStack]);
      }
    } else {
      this._memory.runs.push(run);
      this._memory.results.push(...results);
    }

    return run;
  }

  /**
   * List test runs
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Runs
   */
  async listRuns(options = {}) {
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    if (this.db) {
      return this.db.all(`
        SELECT * FROM test_runs 
        ORDER BY timestamp DESC 
        LIMIT ? OFFSET ?
      `, [limit, offset]);
    }

    return this._memory.runs
      .slice()
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(offset, offset + limit);
  }

  /**
   * Get total run count
   * @returns {Promise<number>} Count
   */
  async getRunCount() {
    if (this.db) {
      const row = await this.db.get('SELECT COUNT(*) as count FROM test_runs');
      return row?.count || 0;
    }
    return this._memory.runs.length;
  }

  /**
   * Get a single run
   * @param {string} runId - Run ID
   * @returns {Promise<Object|null>} Run with summary
   */
  async getRun(runId) {
    if (this.db) {
      return this.db.get('SELECT * FROM test_runs WHERE run_id = ?', [runId]);
    }
    return this._memory.runs.find(r => r.runId === runId) || null;
  }

  /**
   * Get test results for a run
   * @param {string} runId - Run ID
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} Results
   */
  async getResults(runId, filters = {}) {
    const { status, file, search, minDuration, maxDuration, limit = 100, offset = 0 } = filters;

    if (this.db) {
      let sql = 'SELECT * FROM test_results WHERE run_id = ?';
      const params = [runId];

      if (status) {
        sql += ' AND status = ?';
        params.push(status);
      }
      if (file) {
        sql += ' AND file LIKE ?';
        params.push(`%${file}%`);
      }
      if (search) {
        sql += ' AND (test_name LIKE ? OR full_name LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }
      if (minDuration !== undefined) {
        sql += ' AND duration_ms >= ?';
        params.push(minDuration);
      }
      if (maxDuration !== undefined) {
        sql += ' AND duration_ms <= ?';
        params.push(maxDuration);
      }

      sql += ' ORDER BY file, test_name LIMIT ? OFFSET ?';
      params.push(limit, offset);

      return this.db.all(sql, params);
    }

    let results = this._memory.results.filter(r => r.runId === runId);
    
    if (status) results = results.filter(r => r.status === status);
    if (file) results = results.filter(r => r.file.includes(file));
    if (search) results = results.filter(r => 
      r.testName.includes(search) || r.fullName?.includes(search)
    );
    if (minDuration !== undefined) results = results.filter(r => r.durationMs >= minDuration);
    if (maxDuration !== undefined) results = results.filter(r => r.durationMs <= maxDuration);

    return results.slice(offset, offset + limit);
  }

  /**
   * Get result count for a run with filters
   * @param {string} runId - Run ID
   * @param {Object} filters - Filter options
   * @returns {Promise<number>} Count
   */
  async getResultCount(runId, filters = {}) {
    const { status, file, search } = filters;

    if (this.db) {
      let sql = 'SELECT COUNT(*) as count FROM test_results WHERE run_id = ?';
      const params = [runId];

      if (status) {
        sql += ' AND status = ?';
        params.push(status);
      }
      if (file) {
        sql += ' AND file LIKE ?';
        params.push(`%${file}%`);
      }
      if (search) {
        sql += ' AND (test_name LIKE ? OR full_name LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }

      const row = await this.db.get(sql, params);
      return row?.count || 0;
    }

    let results = this._memory.results.filter(r => r.runId === runId);
    if (status) results = results.filter(r => r.status === status);
    if (file) results = results.filter(r => r.file.includes(file));
    if (search) results = results.filter(r => 
      r.testName.includes(search) || r.fullName?.includes(search)
    );
    return results.length;
  }

  /**
   * Get grouped failure analysis
   * @param {string} runId - Optional run ID (defaults to latest)
   * @returns {Promise<Array>} Grouped failures
   */
  async getGroupedFailures(runId) {
    // Get target run
    if (!runId) {
      const runs = await this.listRuns({ limit: 1 });
      runId = runs[0]?.runId || runs[0]?.run_id;
    }
    
    if (!runId) return [];

    const failures = await this.getResults(runId, { status: 'failed', limit: 1000 });
    
    // Group by error fingerprint (first line of error)
    const groups = new Map();
    
    for (const failure of failures) {
      const fingerprint = this._getErrorFingerprint(failure.errorMessage || failure.error_message);
      
      if (!groups.has(fingerprint)) {
        groups.set(fingerprint, {
          fingerprint,
          message: failure.errorMessage || failure.error_message,
          count: 0,
          tests: []
        });
      }
      
      const group = groups.get(fingerprint);
      group.count++;
      group.tests.push({
        file: failure.file,
        testName: failure.testName || failure.test_name
      });
    }
    
    // Sort by count descending
    return Array.from(groups.values())
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Get error fingerprint for grouping
   * @private
   */
  _getErrorFingerprint(errorMessage) {
    if (!errorMessage) return 'unknown';
    
    // Get first line, normalize numbers and paths
    const firstLine = errorMessage.split('\n')[0];
    return firstLine
      .replace(/\d+/g, 'N')
      .replace(/[a-f0-9]{8,}/gi, 'HASH')
      .replace(/\/[\w\/.-]+/g, '/PATH')
      .substring(0, 100);
  }

  /**
   * Delete a test run
   * @param {string} runId - Run ID
   */
  async deleteRun(runId) {
    if (this.db) {
      await this.db.run('DELETE FROM test_results WHERE run_id = ?', [runId]);
      await this.db.run('DELETE FROM test_runs WHERE run_id = ?', [runId]);
    } else {
      this._memory.runs = this._memory.runs.filter(r => r.runId !== runId);
      this._memory.results = this._memory.results.filter(r => r.runId !== runId);
    }
  }

  /**
   * Get overall statistics
   * @returns {Promise<Object>} Stats
   */
  async getStats() {
    if (this.db) {
      const runCount = await this.getRunCount();
      const latestRun = await this.db.get('SELECT * FROM test_runs ORDER BY timestamp DESC LIMIT 1');
      const avgPassRate = await this.db.get(`
        SELECT AVG(CAST(passed AS FLOAT) / NULLIF(total, 0) * 100) as rate
        FROM test_runs
        WHERE timestamp > datetime('now', '-30 days')
      `);
      
      return {
        totalRuns: runCount,
        latestRun,
        avgPassRate: avgPassRate?.rate || 0
      };
    }

    const runs = this._memory.runs;
    const latestRun = runs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
    
    const passRates = runs
      .filter(r => r.total > 0)
      .map(r => (r.passed / r.total) * 100);
    const avgPassRate = passRates.length > 0 
      ? passRates.reduce((a, b) => a + b, 0) / passRates.length 
      : 0;

    return {
      totalRuns: runs.length,
      latestRun,
      avgPassRate
    };
  }

  /**
   * Get test history for flaky detection
   * @param {string} file - File path
   * @param {string} testName - Test name
   * @param {number} limit - Number of runs to check
   * @returns {Promise<Array>} Test history
   */
  async getTestHistory(file, testName, limit = 10) {
    if (this.db) {
      return this.db.all(`
        SELECT tr.status, tr.run_id, runs.timestamp
        FROM test_results tr
        JOIN test_runs runs ON tr.run_id = runs.run_id
        WHERE tr.file = ? AND tr.test_name = ?
        ORDER BY runs.timestamp DESC
        LIMIT ?
      `, [file, testName, limit]);
    }

    return this._memory.results
      .filter(r => r.file === file && r.testName === testName)
      .slice(0, limit);
  }
}

module.exports = TestResultService;
