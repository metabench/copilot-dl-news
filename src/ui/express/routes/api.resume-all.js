const express = require('express');
const { extractDomain } = require('../../../utils/domainUtils');
const { listIncompleteCrawlJobs } = require('../data/queues');
const { markCrawlJobStatus } = require('../data/crawlJobs');

function normalizeQueueRow(row) {
  if (!row) return null;
  const startedRaw = row.started_at ?? row.startedAt ?? null;
  let startedAt = null;
  let startedAtIso = null;
  if (startedRaw != null) {
    const numeric = Number(startedRaw);
    if (Number.isFinite(numeric) && numeric > 0) {
      startedAt = numeric;
      try {
        startedAtIso = new Date(numeric).toISOString();
      } catch (_) {
        startedAtIso = null;
      }
    } else if (typeof startedRaw === 'string' && startedRaw.trim()) {
      startedAtIso = startedRaw.trim();
    }
  }
  return {
    id: row.id,
    url: row.url || null,
    args: row.args || null,
    status: row.status || null,
    startedAt,
    startedAtIso
  };
}

function computeResumeInputs(queue) {
  const info = {
    args: [],
    hasArgs: false,
    hasUrl: typeof queue?.url === 'string' && queue.url.trim().length > 0,
    argsError: null
  };
  if (queue && queue.args != null) {
    try {
      const parsed = JSON.parse(queue.args);
      if (Array.isArray(parsed)) {
        info.args = parsed.map((value) => (typeof value === 'string' ? value : String(value)));
      } else if (parsed != null) {
        info.argsError = 'not-array';
      }
    } catch (err) {
      info.argsError = 'parse-error';
    }
  }
  info.hasArgs = Array.isArray(info.args) && info.args.length > 0;
  return info;
}

function planResumeQueues({ queues, availableSlots, runningJobIds, runningDomains }) {
  const infoById = new Map();
  const selected = [];
  const processed = [];
  const domainGuard = new Set(runningDomains || []);

  for (const row of queues || []) {
    const queue = normalizeQueueRow(row);
    if (!queue || queue.id == null) {
      continue;
    }
    const resumeInputs = computeResumeInputs(queue);
    const domain = queue.url ? extractDomain(queue.url) : null;
    const entry = {
      queue,
      domain,
      resumeInputs,
      state: 'available',
      reasons: []
    };

    if (runningJobIds && runningJobIds.has(queue.id)) {
      entry.state = 'blocked';
      entry.reasons.push('already-running');
    } else if (!resumeInputs.hasUrl && !resumeInputs.hasArgs) {
      entry.state = 'blocked';
      entry.reasons.push('missing-source');
    } else if (domain && domainGuard.has(domain)) {
      entry.state = 'blocked';
      entry.reasons.push('domain-conflict');
    } else if (selected.length >= availableSlots) {
      entry.state = 'queued';
      entry.reasons.push('capacity-exceeded');
    } else {
      entry.state = 'selected';
      selected.push(entry);
      if (domain) domainGuard.add(domain);
    }

    infoById.set(queue.id, entry);
    processed.push(entry);
  }

  return {
    selected,
    info: infoById,
    processed
  };
}

function collectRunningContext(jobRegistry) {
  const runningJobIds = new Set();
  const runningDomains = new Set();
  if (jobRegistry && typeof jobRegistry.getJobs === 'function') {
    for (const [id, job] of jobRegistry.getJobs()) {
      runningJobIds.add(id);
      if (job && job.url) {
        const domain = extractDomain(job.url);
        if (domain) runningDomains.add(domain);
      }
    }
  }
  return { runningJobIds, runningDomains };
}

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
    QUIET = false,
    crawlerManager = null
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

  router.get('/api/resume-all', (req, res) => {
    const MAX_CONCURRENT = 8;
    const queryMax = parseInt(req.query?.maxConcurrent, 10);
    const maxConcurrent = Number.isFinite(queryMax) && queryMax > 0
      ? Math.min(MAX_CONCURRENT, queryMax)
      : MAX_CONCURRENT;

    try {
      if (!QUIET) console.log(`[api] GET /api/resume-all maxConcurrent=${maxConcurrent}`);
      const db = getDbRW();
      if (!db) {
        return res.status(503).json({ error: 'Database unavailable' });
      }

      const incompleteQueues = listIncompleteCrawlJobs(db, { limit: 50 });
      const currentJobs = jobRegistry.jobCount();
      const availableSlots = Math.max(0, maxConcurrent - currentJobs);
      const { runningJobIds, runningDomains } = crawlerManager
        ? crawlerManager.collectRunningContext()
        : collectRunningContext(jobRegistry);
      const plan = crawlerManager
        ? crawlerManager.planResumeQueues({
            queues: incompleteQueues,
            availableSlots,
            runningJobIds,
            runningDomains
          })
        : planResumeQueues({
            queues: incompleteQueues,
            availableSlots,
            runningJobIds,
            runningDomains
          });
      const now = Date.now();
      const summary = crawlerManager
        ? crawlerManager.buildQueueSummary(plan, { now })
        : (() => {
            const queues = plan.processed.map((entry) => {
              const { queue, domain, resumeInputs, state, reasons } = entry;
              const startedAtMs = Number.isFinite(queue.startedAt) ? queue.startedAt : null;
              const ageMs = startedAtMs != null ? Math.max(0, now - startedAtMs) : null;
              return {
                id: queue.id,
                url: queue.url,
                status: queue.status,
                startedAt: queue.startedAtIso || queue.startedAt || null,
                startedAtMs,
                ageMs,
                domain,
                state,
                reasons,
                hasArgs: resumeInputs.hasArgs,
                hasUrl: resumeInputs.hasUrl,
                argsError: resumeInputs.argsError || null
              };
            });
            const recommendedIds = plan.selected.map((entry) => entry.queue.id);
            const blockedDomains = Array.from(new Set(
              plan.processed
                .filter((entry) => entry.reasons.includes('domain-conflict') && entry.domain)
                .map((entry) => entry.domain)
            ));
            return { queues, recommendedIds, blockedDomains };
          })();

      return res.json({
        total: incompleteQueues.length,
        runningJobs: currentJobs,
        availableSlots,
        recommendedIds: summary.recommendedIds,
        queues: summary.queues,
        blockedDomains: summary.blockedDomains
      });
    } catch (err) {
      console.error('[api] GET /api/resume-all error:', err?.message || err);
      return res.status(500).json({ error: err?.message || 'Internal server error' });
    }
  });

  router.post('/api/resume-all', async (req, res) => {
    const MAX_CONCURRENT = 8;
    const bodyMax = parseInt(req.body?.maxConcurrent, 10);
    const maxConcurrent = Number.isFinite(bodyMax) && bodyMax > 0
      ? Math.min(MAX_CONCURRENT, bodyMax)
      : MAX_CONCURRENT;

    const requestedIds = (() => {
      const values = Array.isArray(req.body?.queueIds)
        ? req.body.queueIds
        : req.body?.queueId != null
          ? [req.body.queueId]
          : [];
      const ids = new Set();
      for (const value of values) {
        const n = Number(value);
        if (Number.isFinite(n) && n > 0) {
          ids.add(n);
        }
      }
      return ids.size ? ids : null;
    })();

    try {
      if (!QUIET) {
        const scope = requestedIds ? ` queueIds=${Array.from(requestedIds).join(',')}` : '';
        console.log(`[api] POST /api/resume-all maxConcurrent=${maxConcurrent}${scope}`);
      }

      const db = getDbRW();
      if (!db) {
        return res.status(503).json({ error: 'Database unavailable' });
      }

      const allIncomplete = listIncompleteCrawlJobs(db, { limit: 50 });
      if (!allIncomplete.length) {
        return res.json({
          resumed: 0,
          message: 'No incomplete queues found',
          queues: [],
          skipped: requestedIds ? Array.from(requestedIds).map((id) => ({ id, reasons: ['not-found'] })) : undefined
        });
      }

      const targetQueues = requestedIds
        ? allIncomplete.filter((row) => requestedIds.has(row.id))
        : allIncomplete;

      if (requestedIds && !targetQueues.length) {
        return res.json({
          resumed: 0,
          message: 'No matching incomplete queues found',
          queues: [],
          skipped: Array.from(requestedIds).map((id) => ({ id, reasons: ['not-found'] }))
        });
      }

      const currentJobs = jobRegistry.jobCount();
      const availableSlots = Math.max(0, maxConcurrent - currentJobs);

      if (availableSlots === 0) {
        return res.json({
          resumed: 0,
          message: `Already at max concurrency (${currentJobs}/${maxConcurrent})`,
          queues: []
        });
      }

      const { runningJobIds, runningDomains } = crawlerManager
        ? crawlerManager.collectRunningContext()
        : collectRunningContext(jobRegistry);
      const plan = crawlerManager
        ? crawlerManager.planResumeQueues({
            queues: targetQueues,
            availableSlots,
            runningJobIds,
            runningDomains
          })
        : planResumeQueues({
            queues: targetQueues,
            availableSlots,
            runningJobIds,
            runningDomains
          });

      const skipped = plan.processed
        .filter((entry) => entry.state !== 'selected')
        .map((entry) => ({
          id: entry.queue.id,
          url: entry.queue.url,
          reasons: entry.reasons,
          state: entry.state
        }));

      if (!plan.selected.length) {
        return res.json({
          resumed: 0,
          message: requestedIds ? 'Requested queues could not be resumed' : 'No resumable queues available',
          queues: [],
          skipped: skipped.length ? skipped : undefined
        });
      }

      const resumed = [];
      const errors = [];

      for (const entry of plan.selected) {
        const queue = entry.queue;
        const resumeInputs = entry.resumeInputs;
        const initialStage = 'resuming';
        const initialStatusText = 'Resuming previous crawl…';
        const initialStartup = {
          summary: {
            label: 'Resuming previous crawl',
            progress: 0.05,
            done: false
          },
          stages: []
        };
        try {
          let args = [];
          if (resumeInputs.hasArgs) {
            args = [...resumeInputs.args];
          } else if (resumeInputs.hasUrl) {
            args = buildArgs({ url: queue.url });
          }

          if (!Array.isArray(args) || args.length === 0) {
            errors.push({ id: queue.id, error: 'No URL or args available' });
            continue;
          }

          if (!args.some((a) => /^--db=/.test(a))) {
            args.push(`--db=${urlsDbPath}`);
          }
          if (!args.some((a) => /^--job-id=/.test(a))) {
            args.push(`--job-id=${queue.id}`);
          }
          if (!args.some((a) => /^--fast-start(?:=|$)/.test(a))) {
            args.push('--fast-start');
          }

          const child = runner.start(args);

          const derivedStartedAt = (() => {
            if (queue.startedAtIso) return queue.startedAtIso;
            if (Number.isFinite(queue.startedAt) && queue.startedAt > 0) {
              try { return new Date(queue.startedAt).toISOString(); } catch (_) {}
            }
            return new Date().toISOString();
          })();

          const job = {
            id: queue.id,
            child,
            args: [...args],
            url: queue.url,
            startedAt: derivedStartedAt,
            lastExit: null,
            paused: false,
            stdoutBuf: '',
            stderrBuf: '',
            stage: initialStage,
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
              stage: initialStage,
              statusText: initialStatusText,
              startup: initialStartup,
              _lastProgressWall: Date.now()
            },
            watchdogTimers: []
          };

          if (!child.stdout) child.stdout = require('events').EventEmitter();
          if (!child.stderr) child.stderr = require('events').EventEmitter();

          jobRegistry.registerJob(job);
          jobRegistry.updateJobStage(job, initialStage);
          job.metrics.statusText = initialStatusText;
          job.metrics.startup = initialStartup;
          job.metrics._lastProgressWall = Date.now();
          if (crawlerManager && typeof crawlerManager.noteJobResumed === 'function') {
            try {
              crawlerManager.noteJobResumed({
                jobId: queue.id,
                url: queue.url,
                queueId: queue.id,
                argsSource: resumeInputs.hasArgs ? 'saved-args' : 'url',
                domain: queue.url ? extractDomain(queue.url) : null,
                resumedAt: job.startedAt
              });
            } catch (_) {}
          }
          broadcastProgress({
            stage: initialStage,
            statusText: initialStatusText,
            startup: initialStartup
          }, queue.id, job.metrics);
          broadcastJobs(false);
          resumed.push({ id: queue.id, url: queue.url, pid: child.pid });

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
            if (crawlerManager && typeof crawlerManager.noteJobExit === 'function') {
              try {
                crawlerManager.noteJobExit(queue.id, { endedAt, exitInfo: job.lastExit });
              } catch (_) {}
            }
            broadcast('done', { ...job.lastExit, jobId: queue.id }, queue.id);
            setTimeout(() => {
              try {
                jobRegistry.removeJob(queue.id);
                broadcastJobs(true);
              } catch (_) {}
              if (crawlerManager && typeof crawlerManager.clearJob === 'function') {
                try { crawlerManager.clearJob(queue.id); } catch (_) {}
              }
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
                  if (!startupActive) {
                    if (!Object.prototype.hasOwnProperty.call(obj, 'statusText')) obj.statusText = null;
                    if (!Object.prototype.hasOwnProperty.call(obj, 'startup')) obj.startup = null;
                  }
                  if (!Object.prototype.hasOwnProperty.call(obj, 'stage')) obj.stage = job.stage;
                  if (crawlerManager && typeof crawlerManager.noteJobHeartbeat === 'function') {
                    try { crawlerManager.noteJobHeartbeat(queue.id); } catch (_) {}
                  }
                  broadcastProgress(obj, queue.id, job.metrics);
                  broadcastJobs(false);
                  continue;
                } catch (_) {}
              }

              if (line.startsWith('MILESTONE ')) {
                try {
                  const obj = JSON.parse(line.slice('MILESTONE '.length));
                  if (crawlerManager && typeof crawlerManager.recordMilestone === 'function') {
                    try { crawlerManager.recordMilestone(queue.id, obj); } catch (_) {}
                  }
                  broadcast('milestone', obj, queue.id);
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

      const responseErrors = [...errors];
      const erroredIds = new Set(responseErrors.map((entry) => entry.id));
      for (const skippedEntry of skipped) {
        if (!erroredIds.has(skippedEntry.id) && Array.isArray(skippedEntry.reasons) && skippedEntry.reasons.includes('missing-source')) {
          responseErrors.push({
            id: skippedEntry.id,
            error: 'No URL or args available',
            reasons: skippedEntry.reasons
          });
          erroredIds.add(skippedEntry.id);
        }
      }

      return res.json({
        resumed: resumed.length,
        message: `Resumed ${resumed.length} crawl(s)`,
        queues: resumed,
        skipped: skipped.length ? skipped : undefined,
        errors: responseErrors.length ? responseErrors : undefined
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
