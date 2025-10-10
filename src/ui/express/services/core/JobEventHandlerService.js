/**
 * JobEventHandlerService
 * 
 * Handles all process events for crawl jobs.
 * Extracted from api.crawl.js to separate event handling from HTTP logic.
 * 
 * Responsibilities:
 * - Setup stdout/stderr/exit event listeners
 * - Parse structured output (PROGRESS, QUEUE, PROBLEM, MILESTONE, etc.)
 * - Update job state based on events
 * - Record events in database
 * - Broadcast events via SSE
 * - Manage watchdog timers
 * - Handle process lifecycle (exit, error)
 * 
 * This service is stateless - all state lives in JobRegistry and Database.
 */

const { EventEmitter } = require('events');

class JobEventHandlerService {
  /**
   * @param {Object} dependencies - Injected dependencies
   * @param {Object} dependencies.jobRegistry - Job registry for state management
   * @param {Function} dependencies.broadcast - Function to broadcast events
   * @param {Function} dependencies.broadcastJobs - Function to broadcast job list updates
   * @param {Function} dependencies.broadcastProgress - Function to broadcast progress updates
   * @param {Function} [dependencies.broadcastTelemetry] - Function to broadcast telemetry events
   * @param {Function} dependencies.getDbRW - Database getter function
   * @param {Object} dependencies.dbOperations - Database operation functions
   * @param {Function} dependencies.dbOperations.markCrawlJobStatus - Mark job status in DB
   * @param {Function} dependencies.dbOperations.insertQueueEvent - Insert queue event in DB
   * @param {Function} dependencies.dbOperations.insertCrawlProblem - Insert problem in DB
   * @param {Function} dependencies.dbOperations.insertPlannerStageEvent - Insert planner event in DB
   * @param {Function} dependencies.dbOperations.insertCrawlMilestone - Insert milestone in DB
   * @param {boolean} [dependencies.QUIET=false] - Quiet mode flag
   * @param {boolean} [dependencies.queueDebug=false] - Queue debug mode flag
   * @param {boolean} [dependencies.traceStart=false] - Trace start timing flag
   * @param {Object} [dependencies.crawlerManager=null] - Optional crawler manager
   */
  constructor({
    jobRegistry,
    broadcast,
    broadcastJobs,
    broadcastProgress,
    broadcastTelemetry = null,
    getDbRW,
    dbOperations,
    QUIET = false,
    queueDebug = false,
    traceStart = false,
    crawlerManager = null
  }) {
    if (!jobRegistry) {
      throw new Error('JobEventHandlerService requires jobRegistry');
    }
    if (typeof broadcast !== 'function') {
      throw new Error('JobEventHandlerService requires broadcast function');
    }
    if (typeof broadcastJobs !== 'function') {
      throw new Error('JobEventHandlerService requires broadcastJobs function');
    }
    if (typeof broadcastProgress !== 'function') {
      throw new Error('JobEventHandlerService requires broadcastProgress function');
    }
    if (typeof getDbRW !== 'function') {
      throw new Error('JobEventHandlerService requires getDbRW function');
    }
    if (!dbOperations || typeof dbOperations !== 'object') {
      throw new Error('JobEventHandlerService requires dbOperations object');
    }

    this.jobRegistry = jobRegistry;
    this.broadcast = broadcast;
    this.broadcastJobs = broadcastJobs;
    this.broadcastProgress = broadcastProgress;
    this.broadcastTelemetry = broadcastTelemetry;
    this.getDbRW = getDbRW;
    this.dbOperations = dbOperations;
    this.QUIET = QUIET;
    this.queueDebug = queueDebug;
    this.traceStart = traceStart;
    this.crawlerManager = crawlerManager;
  }

  /**
   * Attach all event handlers to a child process
   * 
   * @param {Object} child - Child process instance
   * @param {Object} job - Job descriptor
   * @param {number} t0 - Start timestamp for tracing
   * @returns {void}
   */
  attachEventHandlers(child, job, t0 = Date.now()) {
    // Ensure child has event emitters
    if (!child.stdout) child.stdout = new EventEmitter();
    if (!child.stderr) child.stderr = new EventEmitter();

    // Create exit handler
    const onExit = this._createExitHandler(job);

    // Attach process event handlers
    if (typeof child.on === 'function') {
      child.on('exit', onExit);
      child.on('close', (code, signal) => onExit(code, signal));
      child.on('error', (err) => this._handleProcessError(err, job, onExit));
    }

    // Attach stdout handler
    this._attachStdoutHandler(child, job, t0);

    // Attach stderr handler
    this._attachStderrHandler(child, job);
  }

  /**
   * Setup initial broadcast and watchdog timers
   * 
   * @param {Object} child - Child process instance
   * @param {Object} job - Job descriptor
   * @param {Array} args - Command line arguments
   * @param {number} t0 - Start timestamp for tracing
   * @returns {void}
   */
  setupInitialBroadcast(child, job, args, t0 = Date.now()) {
    const defer = (fn) => {
      try {
        setImmediate(fn);
      } catch (_) {
        setTimeout(fn, 0);
      }
    };

    defer(() => {
      const td0 = Date.now();
      try {
        this.broadcast('log', { stream: 'server', line: `[server] starting crawler pid=${child?.pid || 'n/a'}\n` }, job.id);
        this.broadcastProgress({
          stage: job.stage,
          visited: 0,
          downloaded: 0,
          found: 0,
          saved: 0,
          errors: 0,
          queueSize: 0,
          paused: false,
          domainRateLimited: false,
          domainIntervalMs: null
        }, job.id, job.metrics);
        try {
          console.log(`[api] crawler started pid=${child?.pid || 'n/a'} jobId=${job.id} args=${JSON.stringify(args)}`);
        } catch (_) {}
      } catch (_) {}

      const td1 = Date.now();
      try {
        this.broadcastJobs(true);
      } catch (_) {}

      const td2 = Date.now();

      // Setup watchdog timers
      try {
        const TEST_FAST = process.env.TEST_FAST === '1' || process.env.TEST_FAST === 'true';
        const firstDelay = TEST_FAST ? 600 : 3000;
        const secondDelay = TEST_FAST ? 1500 : 10000;

        if (!TEST_FAST || firstDelay > 0) {
          const tWatch1 = setTimeout(() => {
            try {
              if (!job._outputSeen && job.child) {
                const hint = '[server] waiting for crawler output… (this can be caused by large SQLite DB init or slow network)';
                if (!this.QUIET) console.log(hint);
                this.broadcast('log', { stream: 'server', line: `${hint}\n` }, job.id);
              }
            } catch (_) {}
          }, firstDelay);
          tWatch1.unref?.();
          job.watchdogTimers?.push(tWatch1);
        }

        if (!TEST_FAST || secondDelay > 0) {
          const tWatch2 = setTimeout(() => {
            try {
              if (!job._outputSeen && job.child) {
                const hint = '[server] still waiting… check firewall/proxy and DB availability; try depth=0, maxPages=1';
                if (!this.QUIET) console.log(hint);
                this.broadcast('log', { stream: 'server', line: `${hint}\n` }, job.id);
              }
            } catch (_) {}
          }, secondDelay);
          tWatch2.unref?.();
          job.watchdogTimers?.push(tWatch2);
        }
      } catch (_) {}

      const td3 = Date.now();
      if (this.traceStart) {
        try {
          console.log(
            `[trace] start defer timings job=${job.id} seed=${td1 - td0}ms jobsBroadcast=${td2 - td1}ms watchdogSetup=${td3 - td2}ms`
          );
        } catch (_) {}
      }
    });
  }

  /**
   * Create exit handler for process
   * 
   * @param {Object} job - Job descriptor
   * @returns {Function} Exit handler function
   * @private
   */
  _createExitHandler(job) {
    let exitEmitted = false;

    return (code, signal, extraInfo = null) => {
      if (exitEmitted) return;
      exitEmitted = true;

      try {
        if (job.killTimer) {
          clearTimeout(job.killTimer);
          job.killTimer = null;
        }
        this.jobRegistry.clearJobWatchdogs(job);
      } catch (_) {}

      const endedAt = new Date().toISOString();
      const extras = extraInfo && typeof extraInfo === 'object' ? extraInfo : null;
      const stageForExit = extras && extras.error ? 'failed' : 'done';

      this.jobRegistry.updateJobStage(job, stageForExit);
      job.lastExit = extras ? { code, signal, endedAt, ...extras } : { code, signal, endedAt };

      try {
        if (!this.QUIET) console.log(`[child] exit code=${code} signal=${signal}`);
      } catch (_) {}

      try {
        job.child = null;
      } catch (_) {}

      // Record in database
      try {
        const db = this.getDbRW();
        if (db) {
          if (this.queueDebug) {
            try {
              console.log('[db] marking crawl_jobs row done for', job.id);
            } catch (_) {}
          }
          const info = this.dbOperations.markCrawlJobStatus(db, {
            id: job.id,
            endedAt: job.lastExit.endedAt,
            status: 'done'
          });
          if (this.queueDebug) {
            try {
              console.log('[db] crawl_jobs update changes=', info?.changes, 'rows');
            } catch (_) {}
          }
        }
      } catch (err) {
        if (this.queueDebug) {
          try {
            console.warn('[db] failed to update crawl_jobs row:', err?.message || err);
          } catch (_) {}
        }
      }

      // Broadcast done event
      try {
        this.broadcast('done', { ...job.lastExit, jobId: job.id }, job.id);
      } catch (_) {
        this.broadcast('done', job.lastExit, job.id);
      }

      // Notify crawler manager
      if (this.crawlerManager && typeof this.crawlerManager.noteJobExit === 'function') {
        try {
          this.crawlerManager.noteJobExit(job.id, { endedAt: job.lastExit?.endedAt, exitInfo: job.lastExit });
        } catch (_) {}
      }

      // Schedule job cleanup
      setTimeout(() => {
        try {
          this.jobRegistry.removeJob(job.id);
        } catch (_) {}
        if (this.crawlerManager && typeof this.crawlerManager.clearJob === 'function') {
          try { this.crawlerManager.clearJob(job.id); } catch (_) {}
        }
        try {
          this.broadcastJobs(true);
        } catch (_) {}
      }, 350);

      this.jobRegistry.markJobExit(job, job.lastExit);
    };
  }

  /**
   * Handle process error
   * 
   * @param {Error} err - Error object
   * @param {Object} job - Job descriptor
   * @param {Function} onExit - Exit handler function
   * @returns {void}
   * @private
   */
  _handleProcessError(err, job, onExit) {
    try {
      if (job.killTimer) {
        clearTimeout(job.killTimer);
        job.killTimer = null;
      }
    } catch (_) {}

    const msg = err?.message || String(err);
    try {
      console.log(`[child] error: ${msg}`);
    } catch (_) {}
    this.broadcast('log', { stream: 'server', line: `[server] crawler failed to start: ${msg}\n` }, job.id);
    onExit(null, null, { error: msg });
  }

  /**
   * Attach stdout handler
   * 
   * @param {Object} child - Child process instance
   * @param {Object} job - Job descriptor
   * @param {number} t0 - Start timestamp for tracing
   * @returns {void}
   * @private
   */
  _attachStdoutHandler(child, job, t0) {
    let firstOutputAt = 0;

    child.stdout.on('data', (chunk) => {
      if (!firstOutputAt) {
        firstOutputAt = Date.now();
        if (this.traceStart) {
          try {
            console.log(`[trace] first child stdout job=${job.id} after ${firstOutputAt - t0}ms`);
          } catch (_) {}
        }
      }

      job._outputSeen = true;
      this.jobRegistry.clearJobWatchdogs(job);
      job.stdoutBuf += chunk.toString();

      let idx;
      while ((idx = job.stdoutBuf.indexOf('\n')) !== -1) {
        const line = job.stdoutBuf.slice(0, idx);
        job.stdoutBuf = job.stdoutBuf.slice(idx + 1);
        if (!line) continue;

        // Handle structured output
        if (this._handleStructuredOutput(line, job)) {
          continue;
        }

        // Log regular output
        this.broadcast('log', { stream: 'stdout', line: `${line}\n` }, job.id);
      }
    });
  }

  /**
   * Handle structured output lines (ERROR, PROGRESS, QUEUE, etc.)
   * 
   * @param {string} line - Output line
   * @param {Object} job - Job descriptor
   * @returns {boolean} True if line was handled, false otherwise
   * @private
   */
  _handleStructuredOutput(line, job) {
    try {
      if (/^(Loading robots\.txt|robots\.txt loaded|Fetching:|Sitemap enqueue complete|Crawling completed|Final stats)/.test(line)) {
        if (!this.QUIET) console.log(`[child:stdout] ${line}`);
      }
    } catch (_) {}

    // ERROR messages
    if (line.startsWith('ERROR ')) {
      try {
        const obj = JSON.parse(line.slice('ERROR '.length));
        this.broadcast('error', obj, job.id);
        return true;
      } catch (_) {}
    }

    // CACHE messages
    if (line.startsWith('CACHE ')) {
      try {
        const obj = JSON.parse(line.slice('CACHE '.length));
        this.broadcast('cache', obj, job.id);
        return true;
      } catch (_) {}
    }

    // PROGRESS messages
    if (line.startsWith('PROGRESS ')) {
      return this._handleProgressMessage(line, job);
    }

    // QUEUE messages
    if (line.startsWith('QUEUE ')) {
      return this._handleQueueMessage(line, job);
    }

    // PROBLEM messages
    if (line.startsWith('PROBLEM ')) {
      return this._handleProblemMessage(line, job);
    }

    // PLANNER_STAGE messages
    if (line.startsWith('PLANNER_STAGE ')) {
      return this._handlePlannerStageMessage(line, job);
    }

    // MILESTONE messages
    if (line.startsWith('MILESTONE ')) {
      return this._handleMilestoneMessage(line, job);
    }

    // TELEMETRY messages
    if (line.startsWith('TELEMETRY ')) {
      return this._handleTelemetryMessage(line, job);
    }

    // Final stats pattern
    const m = line.match(/Final stats: (\d+) pages visited, (\d+) pages downloaded, (\d+) articles found, (\d+) articles saved/);
    if (m) {
      this.broadcastProgress(
        {
          stage: job.stage,
          visited: parseInt(m[1], 10),
          downloaded: parseInt(m[2], 10),
          found: parseInt(m[3], 10),
          saved: parseInt(m[4], 10)
        },
        job.id,
        job.metrics
      );
      return true;
    }

    return false;
  }

  /**
   * Handle PROGRESS message
   * 
   * @param {string} line - Output line
   * @param {Object} job - Job descriptor
   * @returns {boolean} True if handled successfully
   * @private
   */
  _handleProgressMessage(line, job) {
    try {
      const obj = JSON.parse(line.slice('PROGRESS '.length));
      const startupSummary = obj && obj.startup && typeof obj.startup === 'object' ? obj.startup.summary : null;
      const startupActive = startupSummary && typeof startupSummary === 'object' && startupSummary.done === false;

      if (startupActive) {
        if (job.stage !== 'preparing') this.jobRegistry.updateJobStage(job, 'preparing');
      } else if (job.stage !== 'running') {
        this.jobRegistry.updateJobStage(job, 'running');
      }

      if (!startupActive) {
        if (!Object.prototype.hasOwnProperty.call(obj, 'statusText')) obj.statusText = null;
        if (!Object.prototype.hasOwnProperty.call(obj, 'startup')) obj.startup = null;
      }

      if (!Object.prototype.hasOwnProperty.call(obj, 'stage')) obj.stage = job.stage;

      if (this.crawlerManager && typeof this.crawlerManager.noteJobHeartbeat === 'function') {
        try { this.crawlerManager.noteJobHeartbeat(job.id); } catch (_) {}
      }

      if (job.metrics) {
        try {
          if (Object.prototype.hasOwnProperty.call(obj, 'statusText')) {
            job.metrics.statusText = obj.statusText;
          }
          if (Object.prototype.hasOwnProperty.call(obj, 'startup')) {
            job.metrics.startup = obj.startup;
          }
        } catch (_) {}
      }

      try {
        if (!this.QUIET) console.log(`[child:progress] v=${obj.visited || 0} d=${obj.downloaded || 0} q=${obj.queueSize || 0}`);
      } catch (_) {}

      this.broadcastProgress(obj, job.id, job.metrics);
      this.broadcastJobs(false);
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Handle QUEUE message
   * 
   * @param {string} line - Output line
   * @param {Object} job - Job descriptor
   * @returns {boolean} True if handled successfully
   * @private
   */
  _handleQueueMessage(line, job) {
    try {
      const obj = JSON.parse(line.slice('QUEUE '.length));
      this.broadcast('queue', obj, job.id);

      try {
        const db = this.getDbRW();
        if (db) {
          const ts = new Date().toISOString();
          if (this.queueDebug) {
            try {
              console.log('[db] queue event', job.id, obj.action, obj.url || '');
            } catch (_) {}
          }
          const info = this.dbOperations.insertQueueEvent(
            db,
            job.id,
            {
              ts,
              action: obj.action,
              url: obj.url || null,
              depth: obj.depth,
              host: obj.host,
              reason: obj.reason,
              queueSize: obj.queueSize,
              alias: obj.alias,
              queueOrigin: obj.queueOrigin,
              queueRole: obj.queueRole,
              queueDepthBucket: obj.queueDepthBucket
            }
          );
          if (this.queueDebug) {
            try {
              console.log('[db] queue_events insert changes=', info?.changes, 'rows');
            } catch (_) {}
          }
        }
      } catch (err) {
        if (this.queueDebug) {
          try {
            console.warn('[db] failed to insert queue event:', err?.message || err);
          } catch (_) {}
        }
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Handle PROBLEM message
   * 
   * @param {string} line - Output line
   * @param {Object} job - Job descriptor
   * @returns {boolean} True if handled successfully
   * @private
   */
  _handleProblemMessage(line, job) {
    try {
      const obj = JSON.parse(line.slice('PROBLEM '.length));
      this.broadcast('problem', obj, job.id);

      try {
        const db = this.getDbRW();
        if (db) {
          const ts = new Date().toISOString();
          this.dbOperations.insertCrawlProblem(
            db,
            job.id,
            {
              ts,
              kind: obj.kind,
              scope: obj.scope,
              target: obj.target,
              message: obj.message,
              details: obj.details
            }
          );
        }
      } catch (_) {}
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Handle PLANNER_STAGE message
   * 
   * @param {string} line - Output line
   * @param {Object} job - Job descriptor
   * @returns {boolean} True if handled successfully
   * @private
   */
  _handlePlannerStageMessage(line, job) {
    try {
      const obj = JSON.parse(line.slice('PLANNER_STAGE '.length));
      this.broadcast('planner-stage', obj, job.id);

      try {
        const db = this.getDbRW();
        if (db) {
          const ts = obj.ts || new Date().toISOString();
          this.dbOperations.insertPlannerStageEvent(
            db,
            job.id,
            {
              ts,
              stage: obj.stage,
              status: obj.status,
              sequence: obj.sequence,
              durationMs: obj.durationMs,
              details: obj.details
            }
          );
        }
      } catch (_) {}
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Handle MILESTONE message
   * 
   * @param {string} line - Output line
   * @param {Object} job - Job descriptor
   * @returns {boolean} True if handled successfully
   * @private
   */
  _handleMilestoneMessage(line, job) {
    try {
      const obj = JSON.parse(line.slice('MILESTONE '.length));
      this.broadcast('milestone', obj, job.id);

      if (this.crawlerManager && typeof this.crawlerManager.recordMilestone === 'function') {
        try { this.crawlerManager.recordMilestone(job.id, obj); } catch (_) {}
      }

      try {
        const db = this.getDbRW();
        if (db) {
          const ts = new Date().toISOString();
          this.dbOperations.insertCrawlMilestone(
            db,
            job.id,
            {
              ts,
              kind: obj.kind,
              scope: obj.scope,
              target: obj.target,
              message: obj.message,
              details: obj.details
            }
          );
        }
      } catch (_) {}
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Handle TELEMETRY message
   * 
   * @param {string} line - Output line
   * @param {Object} job - Job descriptor
   * @returns {boolean} True if handled successfully
   * @private
   */
  _handleTelemetryMessage(line, job) {
    try {
      const obj = JSON.parse(line.slice('TELEMETRY '.length));
      
      // Enrich with job context
      const telemetryEntry = {
        ...obj,
        source: obj.source || 'crawler',
        jobId: job.id,
        taskType: job.crawlType || 'crawl',
        ts: obj.ts || new Date().toISOString()
      };

      // Broadcast via telemetry channel if available
      if (this.broadcastTelemetry && typeof this.broadcastTelemetry === 'function') {
        this.broadcastTelemetry(telemetryEntry);
      }

      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Attach stderr handler
   * 
   * @param {Object} child - Child process instance
   * @param {Object} job - Job descriptor
   * @returns {void}
   * @private
   */
  _attachStderrHandler(child, job) {
    child.stderr.on('data', (chunk) => {
      job.stderrBuf += chunk.toString();
      let idx;
      while ((idx = job.stderrBuf.indexOf('\n')) !== -1) {
        const line = job.stderrBuf.slice(0, idx);
        job.stderrBuf = job.stderrBuf.slice(idx + 1);
        if (!line) continue;
        this.broadcast('log', { stream: 'stderr', line: `${line}\n` }, job.id);
      }
    });
  }
}

module.exports = { JobEventHandlerService };
