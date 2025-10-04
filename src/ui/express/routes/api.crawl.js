const express = require('express');
const { EventEmitter } = require('events');
const { performance } = require('perf_hooks');
const { recordCrawlJobStart, markCrawlJobStatus } = require('../data/crawlJobs');
const {
  insertQueueEvent,
  insertCrawlProblem,
  insertPlannerStageEvent,
  insertCrawlMilestone
} = require('../data/crawlEvents');

function createCrawlStartRouter(options = {}) {
  const {
    jobRegistry,
    allowMultiJobs = false,
    urlsDbPath,
    runner,
    buildArgs,
    broadcast,
    broadcastJobs,
    broadcastProgress,
    getDbRW,
    queueDebug = false,
    metrics,
    QUIET = false,
    traceStart = false,
    crawlerManager = null
  } = options;

  if (!jobRegistry) {
    throw new Error('createCrawlStartRouter requires jobRegistry');
  }
  if (typeof urlsDbPath !== 'string' || !urlsDbPath) {
    throw new Error('createCrawlStartRouter requires urlsDbPath');
  }
  if (!runner || typeof runner.start !== 'function') {
    throw new Error('createCrawlStartRouter requires runner.start');
  }
  if (typeof buildArgs !== 'function') {
    throw new Error('createCrawlStartRouter requires buildArgs(requestBody)');
  }
  if (typeof broadcast !== 'function') {
    throw new Error('createCrawlStartRouter requires broadcast(event, data, jobId)');
  }
  if (typeof broadcastJobs !== 'function') {
    throw new Error('createCrawlStartRouter requires broadcastJobs(force)');
  }
  if (typeof broadcastProgress !== 'function') {
    throw new Error('createCrawlStartRouter requires broadcastProgress(payload, jobId, metrics)');
  }
  if (typeof getDbRW !== 'function') {
    throw new Error('createCrawlStartRouter requires getDbRW()');
  }
  if (!metrics || typeof metrics !== 'object') {
    throw new Error('createCrawlStartRouter requires metrics object');
  }

  const jobs = jobRegistry.getJobs();
  const crawlState = jobRegistry.getCrawlState();

  const router = express.Router();

  router.post('/api/crawl', (req, res) => {
    const t0 = Date.now();
    const perfStart = performance.now();
    try {
      console.log(`[api] POST /api/crawl received (runningJobs=${jobs.size})`);
    } catch (_) {}
    const status = jobRegistry.checkStartAllowed();
    if (!status.ok) {
      try {
        console.log('[api] POST /api/crawl -> 409 already-running');
      } catch (_) {}
      return res.status(409).json({ error: 'Crawler already running' });
    }
    const t1 = Date.now();
  const args = buildArgs(req.body || {});
  const jobId = jobRegistry.reserveJobId();
    const t2 = Date.now();
    if (!args.some((a) => /^--db=/.test(a))) {
      args.push(`--db=${urlsDbPath}`);
    }
    if (!args.some((a) => /^--job-id=/.test(a))) {
      args.push(`--job-id=${jobId}`);
    }
    const child = runner.start(args);
    const t3 = Date.now();
    const job = {
      id: jobId,
      child,
      args: [...args],
      url: Array.isArray(args) && args.length > 1 ? args[1] : null,
      startedAt: new Date().toISOString(),
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
        startup: null,
        slowMode: false,
        slowModeReason: null
      },
      watchdogTimers: []
    };
    if (!child.stdout) child.stdout = new EventEmitter();
    if (!child.stderr) child.stderr = new EventEmitter();
    jobRegistry.registerJob(job);
    broadcastJobs(true);

    if (crawlerManager && typeof crawlerManager.noteJobStart === 'function') {
      try {
        crawlerManager.noteJobStart({
          jobId,
          url: job.url,
          mode: 'fresh',
          argsSource: 'api.crawl',
          startedAt: job.startedAt
        });
      } catch (_) {}
    }

    const persistStart = () => {
      try {
        const db = getDbRW();
        if (db) {
          if (queueDebug) {
            try {
              console.log('[db] inserting crawl_jobs row for', jobId);
            } catch (_) {}
          }
          const info = recordCrawlJobStart(
            db,
            {
              id: jobId,
              url: job.url || null,
              args,
              pid: child?.pid || null,
              startedAt: job.startedAt,
              status: 'running'
            }
          );
          if (queueDebug) {
            try {
              console.log('[db] crawl_jobs insert changes=', info?.changes, 'rows');
            } catch (_) {}
          }
        }
      } catch (err) {
        if (queueDebug) {
          try {
            console.warn('[db] failed to insert crawl_jobs row:', err?.message || err);
          } catch (_) {}
        }
      }
    };

    let exitEmitted = false;
    const onExit = (code, signal, extraInfo = null) => {
      if (exitEmitted) return;
      exitEmitted = true;
      try {
        if (job.killTimer) {
          clearTimeout(job.killTimer);
          job.killTimer = null;
        }
          jobRegistry.clearJobWatchdogs(job);
      } catch (_) {}
      const endedAt = new Date().toISOString();
      const extras = extraInfo && typeof extraInfo === 'object' ? extraInfo : null;
      const stageForExit = extras && extras.error ? 'failed' : 'done';
        jobRegistry.updateJobStage(job, stageForExit);
      job.lastExit = extras ? { code, signal, endedAt, ...extras } : { code, signal, endedAt };
      try {
        if (!QUIET) console.log(`[child] exit code=${code} signal=${signal}`);
      } catch (_) {}
      try {
        job.child = null;
      } catch (_) {}
      try {
        const db = getDbRW();
        if (db) {
          if (queueDebug) {
            try {
              console.log('[db] marking crawl_jobs row done for', jobId);
            } catch (_) {}
          }
          const info = markCrawlJobStatus(db, {
            id: jobId,
            endedAt: job.lastExit.endedAt,
            status: 'done'
          });
          if (queueDebug) {
            try {
              console.log('[db] crawl_jobs update changes=', info?.changes, 'rows');
            } catch (_) {}
          }
        }
      } catch (err) {
        if (queueDebug) {
          try {
            console.warn('[db] failed to update crawl_jobs row:', err?.message || err);
          } catch (_) {}
        }
      }
      try {
        broadcast('done', { ...job.lastExit, jobId }, jobId);
      } catch (_) {
        broadcast('done', job.lastExit, jobId);
      }
      if (crawlerManager && typeof crawlerManager.noteJobExit === 'function') {
        try {
          crawlerManager.noteJobExit(jobId, { endedAt: job.lastExit?.endedAt, exitInfo: job.lastExit });
        } catch (_) {}
      }
      setTimeout(() => {
        try {
          jobRegistry.removeJob(jobId);
        } catch (_) {}
        if (crawlerManager && typeof crawlerManager.clearJob === 'function') {
          try { crawlerManager.clearJob(jobId); } catch (_) {}
        }
        try {
          broadcastJobs(true);
        } catch (_) {}
      }, 350);
  jobRegistry.markJobExit(job, job.lastExit);
    };

    if (typeof child.on === 'function') {
      child.on('exit', onExit);
      child.on('close', (code, signal) => onExit(code, signal));
      child.on('error', (err) => {
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
        broadcast('log', { stream: 'server', line: `[server] crawler failed to start: ${msg}\n` }, jobId);
        onExit(null, null, { error: msg });
      });
    }

    const initialDurationMs = Math.max(0, performance.now() - perfStart);
    try {
      res.status(202).json({ pid: child.pid || null, args, jobId, stage: job.stage, durationMs: Number(initialDurationMs.toFixed(3)) });
    } catch (_) {}
    const t4 = Date.now();
    if (traceStart) {
      try {
        console.log(`[trace] start handler timings job=${jobId} buildArgs=${t2 - t1}ms spawn=${t3 - t2}ms respond=${t4 - t3}ms totalSoFar=${t4 - t0}ms`);
      } catch (_) {}
    }
    try {
      setImmediate(persistStart);
    } catch (_) {
      try {
        setTimeout(persistStart, 0);
      } catch (_) {}
    }

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
        broadcast('log', { stream: 'server', line: `[server] starting crawler pid=${child?.pid || 'n/a'}\n` }, jobId);
        broadcastProgress({
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
        }, jobId, job.metrics);
        try {
          console.log(`[api] crawler started pid=${child?.pid || 'n/a'} jobId=${jobId} args=${JSON.stringify(args)}`);
        } catch (_) {}
      } catch (_) {}
      const td1 = Date.now();
      try {
        broadcastJobs(true);
      } catch (_) {}
      const td2 = Date.now();
      try {
        const TEST_FAST = process.env.TEST_FAST === '1' || process.env.TEST_FAST === 'true';
        const firstDelay = TEST_FAST ? 600 : 3000;
        const secondDelay = TEST_FAST ? 1500 : 10000;
        if (!TEST_FAST || firstDelay > 0) {
          const tWatch1 = setTimeout(() => {
            try {
              if (!job._outputSeen && job.child) {
                const hint = '[server] waiting for crawler output… (this can be caused by large SQLite DB init or slow network)';
                if (!QUIET) console.log(hint);
                broadcast('log', { stream: 'server', line: `${hint}\n` }, jobId);
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
                if (!QUIET) console.log(hint);
                broadcast('log', { stream: 'server', line: `${hint}\n` }, jobId);
              }
            } catch (_) {}
          }, secondDelay);
          tWatch2.unref?.();
          job.watchdogTimers?.push(tWatch2);
        }
      } catch (_) {}
      const td3 = Date.now();
      if (traceStart) {
        try {
          console.log(
            `[trace] start defer timings job=${jobId} seed=${td1 - td0}ms jobsBroadcast=${td2 - td1}ms watchdogSetup=${td3 - td2}ms`
          );
        } catch (_) {}
      }
    });

    let firstOutputAt = 0;
    child.stdout.on('data', (chunk) => {
      if (!firstOutputAt) {
        firstOutputAt = Date.now();
        if (traceStart) {
          try {
            console.log(`[trace] first child stdout job=${jobId} after ${firstOutputAt - t0}ms`);
          } catch (_) {}
        }
      }
      job._outputSeen = true;
  jobRegistry.clearJobWatchdogs(job);
      job.stdoutBuf += chunk.toString();
      let idx;
      while ((idx = job.stdoutBuf.indexOf('\n')) !== -1) {
        const line = job.stdoutBuf.slice(0, idx);
        job.stdoutBuf = job.stdoutBuf.slice(idx + 1);
        if (!line) continue;
        try {
          if (/^(Loading robots\.txt|robots\.txt loaded|Fetching:|Sitemap enqueue complete|Crawling completed|Final stats)/.test(line)) {
            if (!QUIET) console.log(`[child:stdout] ${line}`);
          }
        } catch (_) {}
        if (line.startsWith('ERROR ')) {
          try {
            const obj = JSON.parse(line.slice('ERROR '.length));
            broadcast('error', obj, jobId);
            continue;
          } catch (_) {}
        }
        if (line.startsWith('CACHE ')) {
          try {
            const obj = JSON.parse(line.slice('CACHE '.length));
            broadcast('cache', obj, jobId);
            continue;
          } catch (_) {}
        }
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
              try { crawlerManager.noteJobHeartbeat(jobId); } catch (_) {}
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
              if (!QUIET) console.log(`[child:progress] v=${obj.visited || 0} d=${obj.downloaded || 0} q=${obj.queueSize || 0}`);
            } catch (_) {}
            broadcastProgress(obj, jobId, job.metrics);
            broadcastJobs(false);
            continue;
          } catch (_) {}
        }
        if (line.startsWith('QUEUE ')) {
          try {
            const obj = JSON.parse(line.slice('QUEUE '.length));
            broadcast('queue', obj, jobId);
            try {
              const db = getDbRW();
              if (db) {
                const ts = new Date().toISOString();
                if (queueDebug) {
                  try {
                    console.log('[db] queue event', jobId, obj.action, obj.url || '');
                  } catch (_) {}
                }
                const info = insertQueueEvent(
                  db,
                  jobId,
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
                if (queueDebug) {
                  try {
                    console.log('[db] queue_events insert changes=', info?.changes, 'rows');
                  } catch (_) {}
                }
              }
            } catch (err) {
              if (queueDebug) {
                try {
                  console.warn('[db] failed to insert queue event:', err?.message || err);
                } catch (_) {}
              }
            }
            continue;
          } catch (_) {}
        }
        if (line.startsWith('PROBLEM ')) {
          try {
            const obj = JSON.parse(line.slice('PROBLEM '.length));
            broadcast('problem', obj, jobId);
            try {
              const db = getDbRW();
              if (db) {
                const ts = new Date().toISOString();
                insertCrawlProblem(
                  db,
                  jobId,
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
            continue;
          } catch (_) {}
        }
        if (line.startsWith('PLANNER_STAGE ')) {
          try {
            const obj = JSON.parse(line.slice('PLANNER_STAGE '.length));
            broadcast('planner-stage', obj, jobId);
            try {
              const db = getDbRW();
              if (db) {
                const ts = obj.ts || new Date().toISOString();
                insertPlannerStageEvent(
                  db,
                  jobId,
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
            continue;
          } catch (_) {}
        }
        if (line.startsWith('MILESTONE ')) {
          try {
            const obj = JSON.parse(line.slice('MILESTONE '.length));
            broadcast('milestone', obj, jobId);
            if (crawlerManager && typeof crawlerManager.recordMilestone === 'function') {
              try { crawlerManager.recordMilestone(jobId, obj); } catch (_) {}
            }
            try {
              const db = getDbRW();
              if (db) {
                const ts = new Date().toISOString();
                insertCrawlMilestone(
                  db,
                  jobId,
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
            continue;
          } catch (_) {}
        }
        const m = line.match(/Final stats: (\d+) pages visited, (\d+) pages downloaded, (\d+) articles found, (\d+) articles saved/);
        if (m) {
          broadcastProgress(
            {
              stage: job.stage,
              visited: parseInt(m[1], 10),
              downloaded: parseInt(m[2], 10),
              found: parseInt(m[3], 10),
              saved: parseInt(m[4], 10)
            },
            jobId,
            job.metrics
          );
          continue;
        }
        broadcast('log', { stream: 'stdout', line: `${line}\n` }, jobId);
      }
    });

    child.stderr.on('data', (chunk) => {
      job.stderrBuf += chunk.toString();
      let idx;
      while ((idx = job.stderrBuf.indexOf('\n')) !== -1) {
        const line = job.stderrBuf.slice(0, idx);
        job.stderrBuf = job.stderrBuf.slice(idx + 1);
        if (!line) continue;
        broadcast('log', { stream: 'stderr', line: `${line}\n` }, jobId);
      }
    });
  });

  return router;
}

module.exports = {
  createCrawlStartRouter
};
