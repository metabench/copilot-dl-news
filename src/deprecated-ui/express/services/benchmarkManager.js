const { EventEmitter } = require('events');
const path = require('path');
const { spawn } = require('child_process');

/**
 * Manages benchmark runs, tracking progress and storing results.
 * Each run has a unique ID and progresses through sections.
 */
class BenchmarkManager extends EventEmitter {
  constructor({ repoRoot, logger = console } = {}) {
    super();
    this.repoRoot = repoRoot || path.join(__dirname, '..', '..', '..');
    this.logger = logger;
    this.runs = new Map(); // runId -> { id, status, startedAt, endedAt, progress, results }
    this.history = []; // Array of completed run summaries
    this.historyLimit = 50;
  }

  /**
   * Generate a unique run ID
   */
  generateRunId() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `bench-${timestamp}`;
  }

  /**
   * Start a new benchmark run
   */
  async startBenchmark({ iterations = 5, runId = null } = {}) {
    const id = runId || this.generateRunId();
    
    if (this.runs.has(id)) {
      throw new Error(`Benchmark run ${id} already exists`);
    }

    const run = {
      id,
      status: 'running',
      startedAt: new Date().toISOString(),
      endedAt: null,
      iterations,
      progress: {
        totalSections: 3,
        completedSections: 0,
        currentSection: null,
        sections: []
      },
      results: null,
      error: null
    };

    this.runs.set(id, run);
    this.emit('run-started', { runId: id, run });

    // Run benchmarks in background
    this._executeBenchmark(run).catch((err) => {
      this.logger.error(`Benchmark ${id} failed:`, err);
      run.status = 'failed';
      run.error = err.message || String(err);
      run.endedAt = new Date().toISOString();
      this.emit('run-failed', { runId: id, run, error: err });
      this._archiveRun(run);
    });

    return { runId: id, run };
  }

  /**
   * Get a specific run (from active runs or history)
   */
  getRun(runId) {
    // First check active runs
    const activeRun = this.runs.get(runId);
    if (activeRun) {
      return activeRun;
    }
    
    // Then check history
    const historicalRun = this.history.find(run => run.id === runId);
    if (historicalRun) {
      return historicalRun;
    }
    
    return null;
  }

  /**
   * List all active and recent runs
   */
  listRuns({ limit = 50 } = {}) {
    const active = Array.from(this.runs.values());
    const all = [...active, ...this.history];
    
    // Sort by startedAt descending
    all.sort((a, b) => {
      const aTime = new Date(a.startedAt).getTime();
      const bTime = new Date(b.startedAt).getTime();
      return bTime - aTime;
    });

    const items = all.slice(0, limit);
    return { items, total: all.length };
  }

  /**
   * Execute the benchmark script and track progress
   */
  async _executeBenchmark(run) {
    const scriptPath = path.join(this.repoRoot, 'tools', 'benchmarks', 'run.js');
    const outputPath = path.join(this.repoRoot, 'data', 'cache', `bench-${run.id}.json`);
    
    const args = [
      scriptPath,
      '--iterations', String(run.iterations),
      '--output', outputPath
    ];

    return new Promise((resolve, reject) => {
      const proc = spawn('node', args, {
        cwd: this.repoRoot,
        stdio: 'pipe',
        env: { ...process.env }
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
        this._parseProgress(run, chunk.toString());
      });

      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      proc.on('error', (err) => {
        reject(err);
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          run.status = 'failed';
          run.error = stderr || `Process exited with code ${code}`;
          run.endedAt = new Date().toISOString();
          this.emit('run-failed', { runId: run.id, run, error: run.error });
          this._archiveRun(run);
          reject(new Error(run.error));
          return;
        }

        // Try to load results
        try {
          const fs = require('fs');
          const resultsJson = fs.readFileSync(outputPath, 'utf8');
          run.results = JSON.parse(resultsJson);
        } catch (err) {
          this.logger.warn(`Could not load results for ${run.id}:`, err.message);
        }

        run.status = 'completed';
        run.endedAt = new Date().toISOString();
        run.progress.completedSections = run.progress.totalSections;
        run.progress.currentSection = null;

        this.emit('run-completed', { runId: run.id, run });
        this._archiveRun(run);
        resolve(run);
      });
    });
  }

  /**
   * Parse stdout to update progress (simple heuristic-based parsing)
   */
  _parseProgress(run, output) {
    // The benchmark script doesn't emit structured progress,
    // but we can infer from section completion
    const lines = output.split('\n');
    
    for (const line of lines) {
      // Look for patterns that indicate section completion
      if (line.includes('direct-db') || line.includes('Direct database')) {
        if (!run.progress.sections.includes('direct-db')) {
          run.progress.sections.push('direct-db');
          run.progress.currentSection = 'direct-db';
          run.progress.completedSections = Math.min(1, run.progress.totalSections);
          this.emit('run-progress', { runId: run.id, run });
        }
      }
      if (line.includes('db-modules') || line.includes('module queries')) {
        if (!run.progress.sections.includes('db-modules')) {
          run.progress.sections.push('db-modules');
          run.progress.currentSection = 'db-modules';
          run.progress.completedSections = Math.min(2, run.progress.totalSections);
          this.emit('run-progress', { runId: run.id, run });
        }
      }
      if (line.includes('ssr-routes') || line.includes('SSR')) {
        if (!run.progress.sections.includes('ssr-routes')) {
          run.progress.sections.push('ssr-routes');
          run.progress.currentSection = 'ssr-routes';
          run.progress.completedSections = Math.min(3, run.progress.totalSections);
          this.emit('run-progress', { runId: run.id, run });
        }
      }
      if (line.includes('Benchmark results written')) {
        run.progress.currentSection = null;
        this.emit('run-progress', { runId: run.id, run });
      }
    }
  }

  /**
   * Move completed/failed run to history and remove from active runs
   */
  _archiveRun(run) {
    this.runs.delete(run.id);
    
    // Store the complete run in history (including results)
    const archived = {
      id: run.id,
      status: run.status,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      iterations: run.iterations,
      progress: { ...run.progress },
      error: run.error,
      results: run.results // Keep full results for historical runs
    };
    
    this.history.unshift(archived);
    
    // Trim history
    if (this.history.length > this.historyLimit) {
      this.history = this.history.slice(0, this.historyLimit);
    }
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.removeAllListeners();
    this.runs.clear();
    this.history = [];
  }
}

module.exports = { BenchmarkManager };
