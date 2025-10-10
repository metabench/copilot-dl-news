/**
 * CrawlOrchestrationService
 * 
 * Orchestrates the complete lifecycle of starting a crawl job.
 * Extracted from api.crawl.js to separate business logic from HTTP handling.
 * 
 * Responsibilities:
 * - Validate crawl can be started
 * - Build and enhance crawl arguments
 * - Start child process
 * - Create job descriptor with initial state
 * - Register job in registry
 * - Record job start in database
 * - Setup event handlers for process output
 * - Coordinate with broadcaster for SSE updates
 * 
 * This service is stateless - all state lives in JobRegistry and Database.
 */

const { CrawlAlreadyRunningError, InvalidCrawlOptionsError } = require('../errors/ServiceErrors');

class CrawlOrchestrationService {
  /**
   * @param {Object} dependencies - Injected dependencies
   * @param {Object} dependencies.jobRegistry - Job registry for state management
   * @param {Object} dependencies.runner - Process runner with start() method
   * @param {Function} dependencies.buildArgs - Function to build CLI arguments from options
   * @param {string} dependencies.urlsDbPath - Path to URLs database
   * @param {Function} dependencies.getDbRW - Database getter function
   * @param {Function} dependencies.recordJobStart - Function to record job start in DB
   * @param {Object} dependencies.eventHandler - JobEventHandlerService for process events
   * @param {Function} dependencies.broadcastJobs - Function to broadcast job list updates
   * @param {boolean} [dependencies.QUIET=false] - Quiet mode flag
   */
  constructor({
    jobRegistry,
    runner,
    buildArgs,
    urlsDbPath,
    getDbRW,
    recordJobStart,
    eventHandler,
    broadcastJobs,
    QUIET = false
  }) {
    if (!jobRegistry) {
      throw new Error('CrawlOrchestrationService requires jobRegistry');
    }
    if (!runner || typeof runner.start !== 'function') {
      throw new Error('CrawlOrchestrationService requires runner with start() method');
    }
    if (typeof buildArgs !== 'function') {
      throw new Error('CrawlOrchestrationService requires buildArgs function');
    }
    if (typeof urlsDbPath !== 'string' || !urlsDbPath) {
      throw new Error('CrawlOrchestrationService requires urlsDbPath string');
    }
    if (typeof getDbRW !== 'function') {
      throw new Error('CrawlOrchestrationService requires getDbRW function');
    }
    if (typeof recordJobStart !== 'function') {
      throw new Error('CrawlOrchestrationService requires recordJobStart function');
    }
    if (!eventHandler) {
      throw new Error('CrawlOrchestrationService requires eventHandler service');
    }
    if (typeof broadcastJobs !== 'function') {
      throw new Error('CrawlOrchestrationService requires broadcastJobs function');
    }

    this.jobRegistry = jobRegistry;
    this.runner = runner;
    this.buildArgs = buildArgs;
    this.urlsDbPath = urlsDbPath;
    this.getDbRW = getDbRW;
    this.recordJobStart = recordJobStart;
    this.eventHandler = eventHandler;
    this.broadcastJobs = broadcastJobs;
    this.QUIET = QUIET;
  }

  /**
   * Start a new crawl job
   * 
   * @param {Object} options - Crawl configuration options
   * @param {string} [options.url] - URL to crawl
   * @param {number} [options.depth] - Crawl depth
   * @param {number} [options.maxPages] - Maximum pages to crawl
   * @param {boolean} [options.intelligent] - Enable intelligent mode
   * @param {string} [options.mode] - Crawl mode (standard, intelligent, gazetteer)
   * @param {Object} [dependencies] - Optional runtime dependencies (for testing)
   * @param {Object} [dependencies.crawlerManager] - Optional crawler manager
   * @param {number} [dependencies.t0] - Optional start timestamp for tracing
   * @returns {Object} Result object with jobId, process, startedAt, args, url
   * @throws {CrawlAlreadyRunningError} If crawler already running (unless multi-job allowed)
   * @throws {InvalidCrawlOptionsError} If options are invalid
   */
  /**
   * Start a new crawl job. This method performs initial validation synchronously
   * and then schedules the actual process start for the next tick, allowing
   * the API to return immediately.
   * 
   * @param {Object} options - Crawl configuration options
   * @param {string} [options.url] - URL to crawl
   * @param {number} [options.depth] - Crawl depth
   * @param {number} [options.maxPages] - Maximum pages to crawl
   * @param {boolean} [options.intelligent] - Enable intelligent mode
   * @param {string} [options.mode] - Crawl mode (standard, intelligent, gazetteer)
   * @param {Object} [dependencies] - Optional runtime dependencies (for testing)
   * @param {Object} [dependencies.crawlerManager] - Optional crawler manager
   * @param {number} [dependencies.t0] - Optional start timestamp for tracing
   * @returns {Object} Result object with jobId, args, url, and initial stage
   * @throws {CrawlAlreadyRunningError} If crawler already running (unless multi-job allowed)
   * @throws {InvalidCrawlOptionsError} If options are invalid
   */
  startCrawl(options = {}, dependencies = {}) {
    const t0 = dependencies.t0 || Date.now();
    
    if (!this.QUIET) {
      console.log(`[CrawlOrchestrationService] Received crawl request with options:`, options);
    }

    // Step 1: Validate can start (Synchronous)
    const status = this.jobRegistry.checkStartAllowed();
    if (!status.ok) {
      throw new CrawlAlreadyRunningError(status.reason || 'Crawler already running');
    }

    // Step 2: Build arguments from options (Synchronous)
    const args = this.buildArgs(options);
    if (!Array.isArray(args) || args.length === 0) {
      throw new InvalidCrawlOptionsError('Failed to build valid arguments from options');
    }

    // Step 3: Reserve job ID (Synchronous)
    const jobId = this.jobRegistry.reserveJobId();

    // Step 4: Enhance arguments with database and job ID (Synchronous)
    const enhancedArgs = this._enhanceArguments(args, jobId);
    
    // Step 5: Create a preliminary job descriptor (Synchronous)
    const job = this._createJobDescriptor({
      jobId,
      child: null, // Process not started yet
      args: enhancedArgs,
      url: this._extractUrl(enhancedArgs)
    });

    // Step 6: Register the preliminary job (Synchronous)
    this.jobRegistry.registerJob(job);
    this.broadcastJobs(true);

    // Step 7: Defer the actual process start to the next event loop tick
    setTimeout(() => {
      try {
        if (!this.QUIET) {
          console.log(`[CrawlOrchestrationService] Asynchronously starting process for jobId=${jobId}`);
        }
        
        // Start child process
        const child = this.runner.start(enhancedArgs);
        if (!child) {
          throw new Error('Failed to start crawler process');
        }

        // Update job with the actual process handle
        job.child = child;
        job.stdin = child.stdin && typeof child.stdin.write === 'function' ? child.stdin : null;
        
        // Record in database
        this._recordJobStartInDb(job);

        // Setup event handlers
        this.eventHandler.attachEventHandlers(child, job, t0);

        // Setup initial broadcast and watchdog timers
        this.eventHandler.setupInitialBroadcast(child, job, enhancedArgs, t0);

        if (!this.QUIET) {
          console.log(`[CrawlOrchestrationService] Crawl started: jobId=${jobId}, pid=${child.pid}, url=${job.url}`);
        }
      } catch (err) {
        console.error(`[CrawlOrchestrationService] Async start failed for jobId=${jobId}:`, err);
        // Mark job as failed
        job.stage = 'failed';
        job.lastExit = { code: -1, signal: null, error: err.message };
        this.jobRegistry.updateJob(job);
        this.broadcastJobs(true);
      }
    }, 0);

    // Return immediately with the initial job info
    return {
      jobId: job.id,
      process: null, // Process is not available yet
      startedAt: job.startedAt,
      args: job.args,
      url: job.url,
      stage: job.stage
    };
  }

  /**
   * Enhance arguments with required flags
   * @private
   */
  _enhanceArguments(args, jobId) {
    const enhanced = [...args];

    // Add database path if not present
    if (!enhanced.some(a => /^--db=/.test(a))) {
      enhanced.push(`--db=${this.urlsDbPath}`);
    }

    // Add job ID if not present
    if (!enhanced.some(a => /^--job-id=/.test(a))) {
      enhanced.push(`--job-id=${jobId}`);
    }

    return enhanced;
  }

  /**
   * Extract URL from arguments
   * @private
   */
  _extractUrl(args) {
    // URL is typically the second argument (after script path)
    if (Array.isArray(args) && args.length > 1) {
      const candidate = args[1];
      // Simple check if it looks like a URL
      if (typeof candidate === 'string' && (candidate.startsWith('http://') || candidate.startsWith('https://'))) {
        return candidate;
      }
    }
    return null;
  }

  /**
   * Create initial job descriptor
   * @private
   */
  _createJobDescriptor({ jobId, child, args, url }) {
    return {
      id: jobId,
      child,
      args: [...args],
      url,
      startedAt: new Date().toISOString(),
      lastExit: null,
      paused: false,
      stdoutBuf: '',
      stderrBuf: '',
      stage: 'preparing',
      stageChangedAt: Date.now(),
      stdin: child && child.stdin && typeof child.stdin.write === 'function' ? child.stdin : null,
      metrics: this._createInitialMetrics(),
      watchdogTimers: []
    };
  }

  /**
   * Create initial metrics object
   * @private
   */
  _createInitialMetrics() {
    return {
      visited: 0,
      downloaded: 0,
      found: 0,
      saved: 0,
      errors: 0,
      queueSize: 0,
      running: 1,
      _lastSampleTime: Date.now(),
      _lastVisited: 0,
      _lastDownloaded: 0,
      requestsPerSec: 0,
      downloadsPerSec: 0,
      errorRatePerMin: 0,
      bytesPerSec: 0,
      stage: 'preparing',
      statusText: 'Preparing crawler…',
      startup: {
        summary: {
          label: 'Preparing crawler',
          progress: 0,
          done: false
        },
        stages: []
      },
      _lastProgressWall: Date.now()
    };
  }

  /**
   * Record job start in database
   * @private
   */
  _recordJobStartInDb(job) {
    try {
      const db = this.getDbRW();
      if (db) {
        this.recordJobStart(db, {
          id: job.id,
          url: job.url,
          args: JSON.stringify(job.args),
          startedAt: job.startedAt
        });
      }
    } catch (err) {
      // Log but don't fail the crawl if DB recording fails
      if (!this.QUIET) {
        console.error(`[CrawlOrchestrationService] Failed to record job start in DB:`, err.message);
      }
    }
  }
}

module.exports = { CrawlOrchestrationService };
