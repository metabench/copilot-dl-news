const path = require('path');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const fs = require('fs');
const os = require('os');
const { fp } = require('lang-tools');

/**
 * Polymorphic truthy flag detection.
 * Uses functional polymorphism (fp) from lang-tools for signature-based dispatch.
 * 
 * Signature handlers:
 * - '[b]': Boolean value returns as-is
 * - '[s]': String checked against truthy literals ('1', 'true', 'yes', 'on')
 */
const isTruthyFlag = fp((a, sig) => {
  // Boolean - return as-is
  if (sig === '[b]') {
    return a[0];
  }
  
  // String - check against truthy literals
  if (sig === '[s]') {
    const v = a[0].trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(v);
  }
  
  // Default: false
  return false;
});

function createFakeRunner(env) {
  return {
    start(args = []) {
      const ee = new EventEmitter();
      ee.stdout = new EventEmitter();
      ee.stderr = new EventEmitter();
      ee.stdin = { write: () => true };
      ee.pid = 424242;
      ee.kill = () => {
        try {
          ee.emit('exit', null, 'SIGTERM');
        } catch (_) {}
      };
      const plannerFlag = String(env.UI_FAKE_PLANNER || '').trim().toLowerCase();
      const envPlannerEnabled = ['1', 'true', 'yes', 'on'].includes(plannerFlag);
      const argsPlannerEnabled = Array.isArray(args) && args.some((arg) => typeof arg === 'string' && arg.includes('--crawl-type=intelligent'));
      const fakePlannerEnabled = envPlannerEnabled || argsPlannerEnabled;
      setTimeout(() => {
        try {
          ee.stderr.emit('data', Buffer.from(`[fake-runner] planner-enabled=${fakePlannerEnabled}\n`, 'utf8'));
        } catch (_) {}
        try {
          ee.stdout.emit('data', Buffer.from('Starting fake crawler\n', 'utf8'));
        } catch (_) {}
        try {
          if (String(env.UI_FAKE_LONGLOG || env.UI_FAKE_RUNNER_LONGLOG || '').toLowerCase() === '1') {
            const longLine = 'X'.repeat(12000) + '\n';
            ee.stdout.emit('data', Buffer.from(longLine, 'utf8'));
          }
        } catch (_) {}
        const frames = [
          {
            visited: 0,
            downloaded: 0,
            found: 0,
            saved: 0,
            errors: 0,
            queueSize: 1,
            robotsLoaded: true
          },
          {
            visited: 1,
            downloaded: 1,
            found: 0,
            saved: 0,
            errors: 0,
            queueSize: 0,
            robotsLoaded: true
          }
        ];
        for (const frame of frames) {
          try {
            ee.stdout.emit('data', Buffer.from('PROGRESS ' + JSON.stringify(frame) + '\n', 'utf8'));
          } catch (_) {}
        }
        try {
          if (String(env.UI_FAKE_QUEUE || '').toLowerCase() === '1') {
            const events = [
              { action: 'enqueued', url: 'https://ex.com/', depth: 0, host: 'ex.com', queueSize: 1 },
              { action: 'dequeued', url: 'https://ex.com/', depth: 0, host: 'ex.com', queueSize: 0 },
              { action: 'drop', url: 'https://ex.com/bad', reason: 'off-domain', queueSize: 0 }
            ];
            for (const ev of events) {
              ee.stdout.emit('data', Buffer.from('QUEUE ' + JSON.stringify(ev) + '\n', 'utf8'));
            }
          }
        } catch (_) {}
        try {
          if (String(env.UI_FAKE_PROBLEMS || '').toLowerCase() === '1') {
            const problems = [
              {
                kind: 'missing-hub',
                scope: 'guardian',
                target: '/world/france',
                message: 'Country hub not found in sitemap',
                details: { slug: 'france' }
              },
              {
                kind: 'unknown-pattern',
                scope: 'guardian',
                target: '/p/abc123',
                message: 'Unrecognized shortlink pattern'
              }
            ];
            for (const problem of problems) {
              ee.stdout.emit('data', Buffer.from('PROBLEM ' + JSON.stringify(problem) + '\n', 'utf8'));
            }
          }
        } catch (_) {}
        try {
          if (String(env.UI_FAKE_MILESTONES || '').toLowerCase() === '1') {
            const milestones = [
              {
                kind: 'patterns-learned',
                scope: 'guardian',
                message: 'Homepage sections inferred',
                details: { sections: ['world', 'sport'] }
              },
              {
                kind: 'hubs-seeded',
                scope: 'guardian',
                message: 'Seeded 10 hubs',
                details: { count: 10 }
              }
            ];
            for (const milestone of milestones) {
              ee.stdout.emit('data', Buffer.from('MILESTONE ' + JSON.stringify(milestone) + '\n', 'utf8'));
            }
          }
        } catch (_) {}
        if (fakePlannerEnabled) {
          const emitPlanner = () => {
            try {
              const nowIso = () => new Date().toISOString();
              const stageEvents = [
                {
                  stage: 'bootstrap',
                  status: 'started',
                  sequence: 1,
                  ts: nowIso(),
                  details: { context: { host: 'example.com' } }
                },
                {
                  stage: 'bootstrap',
                  status: 'completed',
                  sequence: 1,
                  ts: nowIso(),
                  durationMs: 8,
                  details: { context: { host: 'example.com' }, result: { allowed: true } }
                },
                {
                  stage: 'infer-patterns',
                  status: 'started',
                  sequence: 2,
                  ts: nowIso(),
                  details: { context: { startUrl: 'https://example.com' } }
                },
                {
                  stage: 'infer-patterns',
                  status: 'completed',
                  sequence: 2,
                  ts: nowIso(),
                  durationMs: 12,
                  details: {
                    context: { startUrl: 'https://example.com' },
                    result: { sectionCount: 3, sectionsPreview: ['world', 'sport', 'culture'] }
                  }
                },
                {
                  stage: 'seed-hubs',
                  status: 'started',
                  sequence: 3,
                  ts: nowIso(),
                  details: { context: { sectionsFromPatterns: 3 } }
                },
                {
                  stage: 'seed-hubs',
                  status: 'completed',
                  sequence: 3,
                  ts: nowIso(),
                  durationMs: 20,
                  details: {
                    context: { sectionsFromPatterns: 3 },
                    result: {
                      seededCount: 2,
                      sampleSeeded: ['https://example.com/world/', 'https://example.com/sport/']
                    }
                  }
                }
              ];
              for (const ev of stageEvents) {
                ee.stdout.emit('data', Buffer.from('PLANNER_STAGE ' + JSON.stringify(ev) + '\n', 'utf8'));
              }
              const completion = {
                kind: 'intelligent-completion',
                scope: 'example.com',
                message: 'Intelligent crawl completed',
                details: {
                  outcome: 'completed',
                  seededHubs: {
                    unique: 2,
                    requested: 3,
                    sectionsFromPatterns: 3,
                    countryCandidates: 1,
                    sample: ['https://example.com/world/', 'https://example.com/sport/']
                  },
                  coverage: {
                    expected: 3,
                    seeded: 2,
                    coveragePct: 2 / 3
                  },
                  problems: [
                    {
                      kind: 'missing-hub',
                      count: 1,
                      sample: { scope: 'example.com', target: '/world/mars' }
                    }
                  ],
                  stats: {
                    visited: 1,
                    downloaded: 1,
                    articlesFound: 0,
                    articlesSaved: 0,
                    errors: 0
                  }
                }
              };
              ee.stdout.emit('data', Buffer.from('MILESTONE ' + JSON.stringify(completion) + '\n', 'utf8'));
            } catch (err) {
              try {
                ee.stderr.emit('data', Buffer.from(`[fake-runner] planner error: ${err && err.message || err}\n`, 'utf8'));
              } catch (_) {}
            }
          };
          const delay = Number(env.UI_FAKE_PLANNER_DELAY_MS || 60);
          if (delay > 0) {
            const timer = setTimeout(emitPlanner, delay);
            timer.unref?.();
          } else {
            emitPlanner();
          }
        }
        try {
          ee.stdout.emit('data', Buffer.from('Final stats: 1 pages visited, 1 pages downloaded, 0 articles found, 0 articles saved\n', 'utf8'));
        } catch (_) {}
        setTimeout(() => {
          try {
            ee.emit('exit', 0, null);
          } catch (_) {}
        }, 200);
      }, 20);
      return ee;
    }
  };
}

function createFailingRunner() {
  return {
    start() {
      const ee = new EventEmitter();
      setTimeout(() => {
        try {
          ee.emit('error', new Error('simulated spawn failure'));
        } catch (_) {}
      }, 30);
      return ee;
    }
  };
}

function createProcessRunner({ env, spawnImpl, repoRoot }) {
  return {
    start(args) {
      const node = process.execPath;
      const cp = spawnImpl(node, args, {
        cwd: repoRoot,
        env
      });
      return cp;
    }
  };
}

function createAnalysisRunner({ env, spawnImpl, repoRoot }) {
  return {
    start(args = []) {
      const node = process.execPath;
      const script = path.join(repoRoot, 'src', 'tools', 'analysis-run.js');
      const cliArgs = Array.isArray(args) ? args : [];
      const cp = spawnImpl(node, [script, ...cliArgs], {
        cwd: repoRoot,
        env
      });
      return cp;
    }
  };
}

function createRunnerFactory(options = {}) {
  const {
    env = process.env,
    spawnImpl = spawn,
    repoRoot = path.join(__dirname, '..', '..', '..'),
    runner: runnerOverride = null,
    analysisRunner: analysisRunnerOverride = null
  } = options;

  if (!env.UI_FAKE_RUNNER && !env.UI_FAKE_RUNNER_LONGLOG && !env.UI_FAKE_PROBLEMS) {
    try {
      if (!fs.existsSync(repoRoot)) {
        fs.mkdirSync(repoRoot, { recursive: true });
      }
    } catch (_) {}
  }

  const resolveCrawlerRunner = () => {
    if (runnerOverride) return runnerOverride;
    if (isTruthyFlag(env.UI_FORCE_SPAWN_FAIL)) return createFailingRunner();
    if (isTruthyFlag(env.UI_FAKE_RUNNER)) {
      const tmpDir = path.join(os.tmpdir(), 'copilot-ui-tests');
      try {
        fs.mkdirSync(tmpDir, { recursive: true });
      } catch (_) {}
      return createFakeRunner(env);
    }
    return createProcessRunner({ env, spawnImpl, repoRoot });
  };

  const resolveAnalysisRunner = () => {
    if (analysisRunnerOverride) return analysisRunnerOverride;
    return createAnalysisRunner({ env, spawnImpl, repoRoot });
  };

  const crawlerRunner = resolveCrawlerRunner();
  const analysisRunner = resolveAnalysisRunner();

  return {
    startCrawler: (args) => crawlerRunner.start(args),
    startAnalysis: (args) => analysisRunner.start(args),
    getCrawlerRunner: () => crawlerRunner,
    getAnalysisRunner: () => analysisRunner
  };
}

module.exports = {
  createRunnerFactory,
  isTruthyFlag
};
