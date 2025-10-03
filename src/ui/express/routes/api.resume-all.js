const express = require('express');
const { extractDomain, extractUniqueDomains } = require('../../../utils/domainUtils');
const { listIncompleteCrawlJobs } = require('../data/queues');
const { markCrawlJobStatus } = require('../data/crawlJobs');

/**
 * Creates router for resuming multiple incomplete crawls
 * @param {Object} options - Router options
 * @param {Object} options.jobRegistry - Job registry for tracking active jobs
 * @param {Function} options.getDbRW - Database getter
 * @param {Function} options.runner - Runner with start() method
 * @param {Function} options.buildArgs - Function to build crawl arguments
 * @param {Function} options.broadcast - SSE broadcast function
 * @param {Function} options.broadcastJobs - Broadcast jobs update
 * @param {Function} options.broadcastProgress - Broadcast progress update
 * @param {string} options.urlsDbPath - Path to URLs database
 * @param {boolean} options.queueDebug - Enable queue debugging
 * @param {Object} options.metrics - Metrics object
 * @param {boolean} options.QUIET - Quiet mode
 * @returns {express.Router} Router instance
 */
function createResumeAllRouter(options = {}) {
  const {
    jobRegistry,
    getDbRW,
    runner,
    buildArgs,
    broadcast,
    broadcastJobs,
    broadcastProgress,
    urlsDbPath,
    queueDebug = false,
    metrics,
    QUIET = false
  } = options;

  if (!jobRegistry) throw new Error('createResumeAllRouter requires jobRegistry');
  if (typeof getDbRW !== 'function') throw new Error('createResumeAllRouter requires getDbRW');
  if (!runner || typeof runner.start !== 'function') throw new Error('createResumeAllRouter requires runner.start');
  if (typeof buildArgs !== 'function') throw new Error('createResumeAllRouter requires buildArgs');
  if (typeof broadcast !== 'function') throw new Error('createResumeAllRouter requires broadcast');
  if (typeof broadcastJobs !== 'function') throw new Error('createResumeAllRouter requires broadcastJobs');
  if (typeof broadcastProgress !== 'function') throw new Error('createResumeAllRouter requires broadcastProgress');
  if (!urlsDbPath) throw new Error('createResumeAllRouter requires urlsDbPath');
  if (!metrics) throw new Error('createResumeAllRouter requires metrics');

  const router = express.Router();

  router.post('/api/resume-all', async (req, res) => {
    const MAX_CONCURRENT = 8;
    const maxConcurrent = Math.min(MAX_CONCURRENT, parseInt(req.body?.maxConcurrent, 10) || MAX_CONCURRENT);

    try {
      if (!QUIET) console.log(`[api] POST /api/resume-all maxConcurrent=${maxConcurrent}`);
      
      const db = getDbRW();
      if (!db) {
        return res.status(503).json({ error: 'Database unavailable' });
      }

      // Find incomplete crawls (status='running' but no active job, or status=null and no ended_at)
      const incompleteQueues = listIncompleteCrawlJobs(db, { limit: 50 });

      if (!incompleteQueues.length) {
        return res.json({ 
          resumed: 0, 
          message: 'No incomplete queues found',
          queues: []
        });
      }

      // Check currently running jobs
      const currentJobs = jobRegistry.jobCount();
      const availableSlots = Math.max(0, maxConcurrent - currentJobs);

      if (availableSlots === 0) {
        return res.json({
          resumed: 0,
          message: `Already at max concurrency (${currentJobs}/${maxConcurrent})`,
          queues: []
        });
      }

      // Extract domains from incomplete queues and track which are already running
      const runningJobIds = new Set();
      const runningDomains = new Set();
      
      for (const [, job] of jobRegistry.getJobs()) {
        runningJobIds.add(job.id);
        if (job.url) {
          const domain = extractDomain(job.url);
          if (domain) runningDomains.add(domain);
        }
      }

      // Filter queues: exclude already running jobs and domains
      const resumableDomains = new Set();
      const toResume = [];

      for (const queue of incompleteQueues) {
        if (runningJobIds.has(queue.id)) continue;
        if (toResume.length >= availableSlots) break;

        const domain = extractDomain(queue.url);

        // Skip if domain is already running or already selected for resume
        if (domain && (runningDomains.has(domain) || resumableDomains.has(domain))) {
          continue;
        }

        toResume.push(queue);
        if (domain) resumableDomains.add(domain);
      }

      if (!toResume.length) {
        return res.json({
          resumed: 0,
          message: 'All incomplete queues are either running or conflict with running domains',
          queues: []
        });
      }

      // Resume each queue
      const resumed = [];
      const errors = [];

      for (const queue of toResume) {
        try {
          // Parse original arguments if available
          let args = [];
          if (queue.args) {
            try {
              args = JSON.parse(queue.args);
            } catch (_) {
              args = [];
            }
          }

          // If no args, build from URL
          if (!args.length && queue.url) {
            args = buildArgs({ url: queue.url });
          }

          if (!args.length) {
            errors.push({ id: queue.id, error: 'No URL or args available' });
            continue;
          }

          // Ensure db and job-id are set
          if (!args.some((a) => /^--db=/.test(a))) {
            args.push(`--db=${urlsDbPath}`);
          }
          if (!args.some((a) => /^--job-id=/.test(a))) {
            args.push(`--job-id=${queue.id}`);
          }

          // Start the crawler
          const child = runner.start(args);
          
          const job = {
            id: queue.id,
            child,
            args: [...args],
            url: queue.url,
            startedAt: queue.started_at || new Date().toISOString(),
            lastExit: null,
            paused: false,
            stdoutBuf: '',
            stderrBuf: '',
            stage: 'preparing',
            stageChangedAt: Date.now(),
            stdin: child && child.stdin && typeof child.stdin.write === 'function' ? child.stdin : null,
            metrics: {
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
              statusText: null,
              startup: null
            },
            watchdogTimers: []
          };

          if (!child.stdout) child.stdout = require('events').EventEmitter();
          if (!child.stderr) child.stderr = require('events').EventEmitter();

          jobRegistry.registerJob(job);
          resumed.push({ id: queue.id, url: queue.url, pid: child.pid });

          // Setup event handlers (simplified version)
          let exitEmitted = false;
          const onExit = (code, signal) => {
            if (exitEmitted) return;
            exitEmitted = true;
            try {
              jobRegistry.clearJobWatchdogs(job);
            } catch (_) {}
            const endedAt = new Date().toISOString();
            const stageForExit = code !== 0 ? 'failed' : 'done';
            jobRegistry.updateJobStage(job, stageForExit);
            job.lastExit = { code, signal, endedAt };
            try {
              markCrawlJobStatus(db, { id: queue.id, endedAt, status: 'done' });
            } catch (_) {}
            broadcast('done', { ...job.lastExit, jobId: queue.id }, queue.id);
            setTimeout(() => {
              try {
                jobRegistry.removeJob(queue.id);
                broadcastJobs(true);
              } catch (_) {}
            }, 350);
          };

          if (typeof child.on === 'function') {
            child.on('exit', onExit);
            child.on('close', (code, signal) => onExit(code, signal));
            child.on('error', (err) => {
              const msg = err?.message || String(err);
              if (!QUIET) console.log(`[child] error: ${msg}`);
              broadcast('log', { stream: 'server', line: `[server] resumed crawler failed: ${msg}\n` }, queue.id);
              onExit(null, null);
            });
          }

          // Setup stdout/stderr handlers
          child.stdout.on('data', (chunk) => {
            job._outputSeen = true;
            jobRegistry.clearJobWatchdogs(job);
            job.stdoutBuf += chunk.toString();
            let idx;
            while ((idx = job.stdoutBuf.indexOf('\n')) !== -1) {
              const line = job.stdoutBuf.slice(0, idx);
              job.stdoutBuf = job.stdoutBuf.slice(idx + 1);
              if (!line) continue;

              if (line.startsWith('PROGRESS ')) {
                try {
                  const obj = JSON.parse(line.slice('PROGRESS '.length));
                  const startupSummary = obj && obj.startup && typeof obj.startup === 'object' ? obj.startup.summary : null;
                  const startupActive = startupSummary && typeof startupSummary === 'object' && startupSummary.done === false;
                  if (startupActive) {
                    if (job.stage !== 'preparing') jobRegistry.updateJobStage(job, 'preparing');
                  } else if (job.stage !== 'running') {
                    jobRegistry.updateJobStage(job, 'running');
                  }
                  if (!Object.prototype.hasOwnProperty.call(obj, 'stage')) obj.stage = job.stage;
                  broadcastProgress(obj, queue.id, job.metrics);
                  broadcastJobs(false);
                  continue;
                } catch (_) {}
              }

              broadcast('log', { stream: 'stdout', line: `${line}\n` }, queue.id);
            }
          });

          child.stderr.on('data', (chunk) => {
            job.stderrBuf += chunk.toString();
            let idx;
            while ((idx = job.stderrBuf.indexOf('\n')) !== -1) {
              const line = job.stderrBuf.slice(0, idx);
              job.stderrBuf = job.stderrBuf.slice(idx + 1);
              if (!line) continue;
              broadcast('log', { stream: 'stderr', line: `${line}\n` }, queue.id);
            }
          });

          if (!QUIET) {
            console.log(`[api] resumed crawler jobId=${queue.id} pid=${child.pid} url=${queue.url}`);
          }

        } catch (err) {
          errors.push({ id: queue.id, error: err?.message || String(err) });
          if (!QUIET) {
            console.error(`[api] failed to resume jobId=${queue.id}:`, err?.message || err);
          }
        }
      }

      broadcastJobs(true);

      return res.json({
        resumed: resumed.length,
        message: `Resumed ${resumed.length} crawl(s)`,
        queues: resumed,
        errors: errors.length ? errors : undefined
      });

    } catch (err) {
      console.error('[api] POST /api/resume-all error:', err?.message || err);
      return res.status(500).json({ error: err?.message || 'Internal server error' });
    }
  });

  return router;
}

module.exports = {
  createResumeAllRouter
};
