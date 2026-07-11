'use strict';

/**
 * Unit tests for tools/crawl/run.js — the easy multi-site crawl dispatcher.
 *
 * These tests exercise pure dispatch logic (parseArgs / buildPlan / renderPlan,
 * URL normalisation, user-list loading). They do NOT spawn child processes, do
 * NOT touch the network, and do NOT touch the unified UI. Everything is in-process
 * and deterministic.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const run = require('../../../tools/crawl/run.js');
const profiles = require('../../../src/core/crawler/config/defaultCrawlProfiles.js');
const {
  makeGraphFeedbackArtifact,
} = require('./helpers/graph-feedback-fixtures');

describe('tools/crawl/run.js — input shape detection', () => {
  test('positiveIntFromEnv accepts only positive integer overrides', () => {
    const original = process.env.TEST_POSITIVE_INT_FROM_ENV;
    try {
      process.env.TEST_POSITIVE_INT_FROM_ENV = '90000';
      expect(run.positiveIntFromEnv('TEST_POSITIVE_INT_FROM_ENV', 30000)).toBe(90000);
      process.env.TEST_POSITIVE_INT_FROM_ENV = '0';
      expect(run.positiveIntFromEnv('TEST_POSITIVE_INT_FROM_ENV', 30000)).toBe(30000);
      process.env.TEST_POSITIVE_INT_FROM_ENV = 'not-a-number';
      expect(run.positiveIntFromEnv('TEST_POSITIVE_INT_FROM_ENV', 30000)).toBe(30000);
    } finally {
      if (original === undefined) {
        delete process.env.TEST_POSITIVE_INT_FROM_ENV;
      } else {
        process.env.TEST_POSITIVE_INT_FROM_ENV = original;
      }
    }
  });

  test('isUrlLike matches http/https URLs', () => {
    expect(run.isUrlLike('https://bbc.com/')).toBe(true);
    expect(run.isUrlLike('http://example.com')).toBe(true);
    expect(run.isUrlLike('//cdn.example.com/x.js')).toBe(true);
    expect(run.isUrlLike('bbc.com')).toBe(false);
    expect(run.isUrlLike('')).toBe(false);
    expect(run.isUrlLike(null)).toBe(false);
  });

  test('isHostnameLike matches bare hostnames with TLDs', () => {
    expect(run.isHostnameLike('bbc.com')).toBe(true);
    expect(run.isHostnameLike('news.bbc.co.uk')).toBe(true);
    expect(run.isHostnameLike('example.com/news')).toBe(true);
    expect(run.isHostnameLike('not-a-host')).toBe(false);
    expect(run.isHostnameLike('--profile')).toBe(false);
    expect(run.isHostnameLike('news-10x1000')).toBe(false);
  });

  test('isCsvOfTargets requires every part to look like a target', () => {
    expect(run.isCsvOfTargets('bbc.com,reuters.com,npr.org')).toBe(true);
    expect(run.isCsvOfTargets('https://a.com/,b.com')).toBe(true);
    expect(run.isCsvOfTargets('bbc.com,not-a-host')).toBe(false);
    expect(run.isCsvOfTargets('single-no-comma')).toBe(false);
  });

  test('isUserListRef matches @name', () => {
    expect(run.isUserListRef('@uk-papers')).toBe(true);
    expect(run.isUserListRef('@')).toBe(false);
    expect(run.isUserListRef('uk-papers')).toBe(false);
  });
});

describe('tools/crawl/run.js — URL normalisation', () => {
  test('preserves full URLs', () => {
    expect(run.normalizeUrl('https://bbc.com/news')).toBe('https://bbc.com/news');
  });

  test('promotes hostnames to https with trailing /', () => {
    expect(run.normalizeUrl('bbc.com')).toBe('https://bbc.com/');
    expect(run.normalizeUrl('  bbc.com  ')).toBe('https://bbc.com/');
  });

  test('preserves an existing path', () => {
    expect(run.normalizeUrl('bbc.com/news')).toBe('https://bbc.com/news');
  });

  test('returns null for blank input', () => {
    expect(run.normalizeUrl('')).toBeNull();
    expect(run.normalizeUrl(null)).toBeNull();
  });
});

describe('tools/crawl/run.js — user lists', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-lists-'));
  });
  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_e) { /* ignore */ }
  });

  test('loadUserList reads newline-delimited .txt with comments stripped', () => {
    fs.writeFileSync(path.join(tmpDir, 'sample.txt'),
      '# header\nbbc.com\n\n  reuters.com  \n# trailing\nhttps://npr.org/\n');
    const out = run.loadUserList('@sample', tmpDir);
    expect(out.urls).toEqual(['bbc.com', 'reuters.com', 'https://npr.org/']);
    expect(out.sourcePath).toBe(path.join(tmpDir, 'sample.txt'));
  });

  test('loadUserList reads JSON-array file', () => {
    fs.writeFileSync(path.join(tmpDir, 'sample.json'),
      '["https://bbc.com/", "https://reuters.com/"]');
    const out = run.loadUserList('@sample', tmpDir);
    expect(out.urls).toEqual(['https://bbc.com/', 'https://reuters.com/']);
  });

  test('loadUserList throws on missing file with helpful message', () => {
    expect(() => run.loadUserList('@missing', tmpDir)).toThrow(/not found/i);
  });

  test('listUserLists returns name + url count', () => {
    fs.writeFileSync(path.join(tmpDir, 'a.txt'), 'bbc.com\nreuters.com\n');
    fs.writeFileSync(path.join(tmpDir, 'b.txt'), '# only-comment\n');
    const lists = run.listUserLists(tmpDir);
    expect(lists.map(l => l.name).sort()).toEqual(['a', 'b']);
    const a = lists.find(l => l.name === 'a');
    expect(a.urlCount).toBe(2);
    const b = lists.find(l => l.name === 'b');
    expect(b.urlCount).toBe(0);
  });
});

describe('tools/crawl/run.js — parseArgs', () => {
  test('defaults to safe profile and no positionals', () => {
    const { runFlags, positional } = run.parseArgs([]);
    expect(runFlags.profile).toBe('safe');
    expect(runFlags.explain).toBe(false);
    expect(positional).toEqual([]);
  });

  test('extracts known flags and leaves positional URL alone', () => {
    const { runFlags, positional } = run.parseArgs([
      '--profile', 'fast', '--max-pages', '500',
      '--max-depth', '3', '--concurrency', '4',
      '--operation', 'siteExplorer', '--explain',
      '--graph-feedback-artifact=tmp/graph-feedback-plan.json',
      '--use-graph-feedback-seeds',
      'bbc.com'
    ]);
    expect(runFlags.profile).toBe('fast');
    expect(runFlags.maxPages).toBe(500);
    expect(runFlags.maxDepth).toBe(3);
    expect(runFlags.concurrency).toBe(4);
    expect(runFlags.operation).toBe('siteExplorer');
    expect(runFlags.explain).toBe(true);
    expect(runFlags.graphFeedbackArtifactPath).toBe('tmp/graph-feedback-plan.json');
    expect(runFlags.useGraphFeedbackSeeds).toBe(true);
    expect(positional).toEqual(['bbc.com']);
  });

  test('requires a graph feedback artifact path when the flag is present', () => {
    expect(() => run.parseArgs(['--explain', '--graph-feedback-artifact']))
      .toThrow('--graph-feedback-artifact requires a path');
  });

  test('--override is repeatable and coerces JSON-shaped values to real types', () => {
    const { runFlags } = run.parseArgs([
      '--override', 'requestTimeoutMs=20000',
      '--override', 'slowMode=true',
      '--override', 'preferCache=false',
      '--override', 'profileName=gentle',
      'bbc.com'
    ]);
    expect(runFlags.overrides).toEqual({
      requestTimeoutMs: 20000,
      slowMode: true,
      preferCache: false,
      profileName: 'gentle'
    });
    expect(runFlags.rawOverrides).toEqual([
      'requestTimeoutMs=20000', 'slowMode=true', 'preferCache=false', 'profileName=gentle'
    ]);
  });

  test('--override without = throws', () => {
    expect(() => run.parseArgs(['--override', 'novalue', 'bbc.com'])).toThrow(/key=value/);
  });
});

describe('tools/crawl/run.js — buildPlan', () => {
  test('no positional → help mode', () => {
    const plan = run.buildPlan({ runFlags: { profile: 'safe', crawlListsDir: '/tmp', overrides: {}, rawOverrides: [] }, positional: [] });
    expect(plan.mode).toBe('help');
  });

  test('"help" → help mode', () => {
    const plan = run.buildPlan({ runFlags: { profile: 'safe', crawlListsDir: '/tmp', overrides: {}, rawOverrides: [] }, positional: ['help'] });
    expect(plan.mode).toBe('help');
  });

  test('"list" → list mode', () => {
    const plan = run.buildPlan({ runFlags: { profile: 'safe', crawlListsDir: '/tmp', overrides: {}, rawOverrides: [] }, positional: ['list'] });
    expect(plan.mode).toBe('list');
  });

  test('single hostname → batch mode with normalised URL and safe profile defaults', () => {
    const plan = run.buildPlan({
      runFlags: { profile: 'safe', crawlListsDir: '/tmp', overrides: {}, rawOverrides: [] },
      positional: ['bbc.com']
    });
    expect(plan.mode).toBe('batch');
    expect(plan.urls).toEqual(['https://bbc.com/']);
    expect(plan.profile.name).toBe('safe');
    expect(plan.overrides.maxPages).toBe(profiles.getDefaultCrawlProfile('safe').overrides.maxPages);
    expect(plan.batchArgs).toEqual(expect.arrayContaining(['https://bbc.com/', '--operation', 'basicArticleCrawl']));
  });

  test('CSV of hostnames → batch mode with all URLs deduped', () => {
    const plan = run.buildPlan({
      runFlags: { profile: 'safe', crawlListsDir: '/tmp', overrides: {}, rawOverrides: [] },
      positional: ['bbc.com,reuters.com,bbc.com']
    });
    expect(plan.mode).toBe('batch');
    expect(plan.urls.sort()).toEqual(['https://bbc.com/', 'https://reuters.com/']);
  });

  test('multiple positional hostnames → batch mode', () => {
    const plan = run.buildPlan({
      runFlags: { profile: 'safe', crawlListsDir: '/tmp', overrides: {}, rawOverrides: [] },
      positional: ['bbc.com', 'reuters.com']
    });
    expect(plan.mode).toBe('batch');
    expect(plan.urls.sort()).toEqual(['https://bbc.com/', 'https://reuters.com/']);
  });

  test('unknown name (not URL/hostname) → delegate mode', () => {
    const plan = run.buildPlan({
      runFlags: { profile: 'safe', crawlListsDir: '/tmp', overrides: {}, rawOverrides: [] },
      positional: ['news-10x1000']
    });
    expect(plan.mode).toBe('delegate');
    expect(plan.delegateArgv[0]).toBe('news-10x1000');
  });

  test('--profile fast applies fast profile defaults', () => {
    const plan = run.buildPlan({
      runFlags: { profile: 'fast', crawlListsDir: '/tmp', overrides: {}, rawOverrides: [] },
      positional: ['bbc.com']
    });
    const fast = profiles.getDefaultCrawlProfile('fast');
    expect(plan.profile.name).toBe('fast');
    expect(plan.overrides.concurrency).toBe(fast.overrides.concurrency);
    expect(plan.overrides.maxPages).toBe(fast.overrides.maxPages);
  });

  test('user --max-pages overrides profile default', () => {
    const plan = run.buildPlan({
      runFlags: { profile: 'safe', crawlListsDir: '/tmp', overrides: {}, rawOverrides: [], maxPages: 50 },
      positional: ['bbc.com']
    });
    expect(plan.overrides.maxPages).toBe(50);
    expect(plan.overrides.maxDownloads).toBe(50);
    expect(plan.batchArgs).toEqual(expect.arrayContaining(['--max-pages', '50']));
  });

  test('@list ref expands to all URLs in the list (with normalisation)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-lists-'));
    try {
      fs.writeFileSync(path.join(tmpDir, 'mix.txt'), 'bbc.com\n# comment\nhttps://reuters.com/\n');
      const plan = run.buildPlan({
        runFlags: { profile: 'safe', crawlListsDir: tmpDir, overrides: {}, rawOverrides: [] },
        positional: ['@mix']
      });
      expect(plan.mode).toBe('batch');
      expect(plan.urls.sort()).toEqual(['https://bbc.com/', 'https://reuters.com/']);
      expect(plan.sourceLists).toEqual([path.join(tmpDir, 'mix.txt')]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('CSV mixing hostnames and @list ref expands all parts', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-lists-'));
    try {
      fs.writeFileSync(path.join(tmpDir, 'extra.txt'), 'npr.org\n');
      const plan = run.buildPlan({
        runFlags: { profile: 'safe', crawlListsDir: tmpDir, overrides: {}, rawOverrides: [] },
        positional: ['bbc.com,@extra,reuters.com']
      });
      expect(plan.mode).toBe('batch');
      expect(plan.urls.sort()).toEqual([
        'https://bbc.com/', 'https://npr.org/', 'https://reuters.com/'
      ]);
      expect(plan.sourceLists).toEqual([path.join(tmpDir, 'extra.txt')]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('tools/crawl/run.js — writer DB isolation (--crawl-db)', () => {
  test('without --crawl-db, no dbPath override is emitted (writer uses default data/news.db)', () => {
    const plan = run.buildPlan({
      runFlags: { profile: 'safe', crawlListsDir: '/tmp', overrides: {}, rawOverrides: [] },
      positional: ['bbc.com']
    });
    expect(plan.mode).toBe('batch');
    expect(plan.overrides.dbPath).toBeUndefined();
    expect(plan.batchArgs).not.toEqual(expect.arrayContaining(['--override', expect.stringMatching(/^dbPath=/)]));
  });

  test('--crawl-db forwards an absolute dbPath override into the crawl-batch args', () => {
    const sampleDb = path.resolve('/tmp/sample-isolation.db');
    const plan = run.buildPlan({
      runFlags: { profile: 'safe', crawlListsDir: '/tmp', overrides: {}, rawOverrides: [], crawlDbPath: sampleDb },
      positional: ['bbc.com']
    });
    expect(plan.mode).toBe('batch');
    expect(plan.overrides.dbPath).toBe(sampleDb);
    // The override reaches the engine via the --override body (k=v form).
    const overrideIdx = plan.batchArgs.indexOf('--override');
    expect(overrideIdx).toBeGreaterThanOrEqual(0);
    expect(plan.batchArgs).toEqual(expect.arrayContaining(['--override', `dbPath=${sampleDb}`]));
  });
});

describe('tools/crawl/run.js — renderPlan / --explain', () => {
  test('renderPlan flattens plan to JSON-safe object', () => {
    const plan = run.buildPlan({
      runFlags: { profile: 'safe', crawlListsDir: '/tmp', overrides: {}, rawOverrides: [] },
      positional: ['bbc.com,reuters.com']
    });
    const rendered = run.renderPlan(plan);
    expect(rendered.mode).toBe('batch');
    expect(rendered.profile.name).toBe('safe');
    expect(rendered.urls.length).toBe(2);
    expect(rendered.delegated.script).toMatch(/crawl-batch\.js$/);
    expect(JSON.stringify(rendered)).toEqual(expect.any(String));
  });

  test('runCli with --explain prints JSON when --json is set and exits 0', () => {
    const writes = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk) => { writes.push(String(chunk)); return true; };
    let exitCode;
    try {
      exitCode = run.runCli(['--explain', '--json', 'bbc.com']);
    } finally {
      process.stdout.write = origWrite;
    }
    expect(exitCode).toBe(0);
    const joined = writes.join('');
    expect(joined.length).toBeGreaterThan(0);
    const parsed = JSON.parse(joined.trim());
    expect(parsed.mode).toBe('batch');
    expect(parsed.urls).toEqual(['https://bbc.com/']);
  });

  test('renderPlan attaches read-only graph feedback artifact explanation for planned hosts', () => {
    const artifactPath = path.join(os.tmpdir(), `graph-feedback-${Date.now()}-${Math.random()}.json`);
    fs.writeFileSync(artifactPath, JSON.stringify(makeGraphFeedbackArtifact('bbc.com')));
    try {
      const plan = run.buildPlan({
        runFlags: { profile: 'safe', crawlListsDir: '/tmp', overrides: {}, rawOverrides: [] },
        positional: ['bbc.com']
      });
      const rendered = run.renderPlan(plan, {
        graphFeedbackArtifactPath: artifactPath,
        generatedAt: '2026-05-26T12:00:00.000Z',
      });

      expect(rendered.graphFeedback.mode).toBe('artifact-dry-run');
      expect(rendered.graphFeedback.plannedHosts).toEqual(['bbc.com']);
      expect(rendered.graphFeedback.validation.requestedHosts).toEqual(['bbc.com']);
      expect(rendered.graphFeedback.actionPolicy).toEqual({
        enqueueUrls: false,
        seedRemoteCrawlers: false,
        alterCollectBehavior: false,
      });
      expect(rendered.graphFeedback.domains[0].candidates[0]).toEqual(expect.objectContaining({
        url: 'https://bbc.com/news',
        consideration: 'would-consider-as-seed-candidate',
        wouldEnqueue: false,
        wouldSeedRemote: false,
        wouldChangeCollect: false,
      }));
    } finally {
      try { fs.unlinkSync(artifactPath); } catch (_e) { /* ignore */ }
    }
  });

  test('graph feedback artifact must cover every planned host', () => {
    const artifactPath = path.join(os.tmpdir(), `graph-feedback-${Date.now()}-${Math.random()}.json`);
    fs.writeFileSync(artifactPath, JSON.stringify(makeGraphFeedbackArtifact('bbc.com')));
    try {
      const plan = run.buildPlan({
        runFlags: { profile: 'safe', crawlListsDir: '/tmp', overrides: {}, rawOverrides: [] },
        positional: ['reuters.com']
      });

      expect(() => run.renderPlan(plan, { graphFeedbackArtifactPath: artifactPath }))
        .toThrow('requested host(s) not present in artifact: reuters.com');
    } finally {
      try { fs.unlinkSync(artifactPath); } catch (_e) { /* ignore */ }
    }
  });

  test('runCli rejects graph feedback artifact outside --explain before launch', () => {
    const origWrite = process.stderr.write.bind(process.stderr);
    const writes = [];
    process.stderr.write = (chunk) => { writes.push(String(chunk)); return true; };
    let exitCode;
    try {
      exitCode = run.runCli(['--graph-feedback-artifact', 'tmp/graph-feedback-plan.json', 'bbc.com']);
    } finally {
      process.stderr.write = origWrite;
    }

    expect(exitCode).toBe(3);
    expect(writes.join('')).toMatch(/explain-only/);
  });

  test('runCli rejects live graph feedback seed flag on run.js surface', () => {
    const origWrite = process.stderr.write.bind(process.stderr);
    const writes = [];
    process.stderr.write = (chunk) => { writes.push(String(chunk)); return true; };
    let exitCode;
    try {
      exitCode = run.runCli([
        '--remote',
        '--graph-feedback-artifact',
        'tmp/graph-feedback-plan.json',
        '--use-graph-feedback-seeds',
        'bbc.com',
      ]);
    } finally {
      process.stderr.write = origWrite;
    }

    expect(exitCode).toBe(3);
    expect(writes.join('')).toMatch(/only supported by tools\/crawl\/index\.js remote start-like commands/);
  });

  test('runCli non-JSON explain prints compact graph feedback summary', () => {
    const artifactPath = path.join(os.tmpdir(), `graph-feedback-${Date.now()}-${Math.random()}.json`);
    fs.writeFileSync(artifactPath, JSON.stringify(makeGraphFeedbackArtifact('bbc.com')));
    const origWrite = process.stdout.write.bind(process.stdout);
    const writes = [];
    process.stdout.write = (chunk) => { writes.push(String(chunk)); return true; };
    let exitCode;
    try {
      exitCode = run.runCli([
        '--explain',
        '--graph-feedback-artifact', artifactPath,
        'bbc.com',
      ]);
    } finally {
      process.stdout.write = origWrite;
      try { fs.unlinkSync(artifactPath); } catch (_e) { /* ignore */ }
    }

    const output = writes.join('');
    expect(exitCode).toBe(0);
    expect(output).toContain('Graph feedback summary (read-only):');
    expect(output).toContain('Planned hosts: bbc.com');
    expect(output).toContain('Candidates: 1 across 1 host(s)');
    expect(output).toContain('https://bbc.com/news - missing content');
    expect(output).toContain('Actions: no URLs enqueued; no remote crawlers seeded; collect behavior unchanged.');
  });

  test('runCli JSON explain keeps machine output as JSON without human summary text', () => {
    const artifactPath = path.join(os.tmpdir(), `graph-feedback-${Date.now()}-${Math.random()}.json`);
    fs.writeFileSync(artifactPath, JSON.stringify(makeGraphFeedbackArtifact('bbc.com')));
    const origWrite = process.stdout.write.bind(process.stdout);
    const writes = [];
    process.stdout.write = (chunk) => { writes.push(String(chunk)); return true; };
    let exitCode;
    try {
      exitCode = run.runCli([
        '--explain',
        '--json',
        '--graph-feedback-artifact', artifactPath,
        'bbc.com',
      ]);
    } finally {
      process.stdout.write = origWrite;
      try { fs.unlinkSync(artifactPath); } catch (_e) { /* ignore */ }
    }

    const output = writes.join('');
    expect(exitCode).toBe(0);
    expect(output).not.toContain('Graph feedback summary');
    const parsed = JSON.parse(output);
    expect(parsed.graphFeedback.candidateCount).toBe(1);
    expect(parsed.graphFeedback.domains[0].candidates[0].url).toBe('https://bbc.com/news');
  });

  test('runCli remote JSON explain attaches graph feedback to planned remote hosts', () => {
    const artifactPath = path.join(os.tmpdir(), `graph-feedback-${Date.now()}-${Math.random()}.json`);
    fs.writeFileSync(artifactPath, JSON.stringify(makeGraphFeedbackArtifact('bbc.com')));
    const origWrite = process.stdout.write.bind(process.stdout);
    const writes = [];
    process.stdout.write = (chunk) => { writes.push(String(chunk)); return true; };
    let exitCode;
    try {
      exitCode = run.runCli([
        '--remote',
        '--explain',
        '--json',
        '--graph-feedback-artifact', artifactPath,
        'bbc.com',
      ]);
    } finally {
      process.stdout.write = origWrite;
      try { fs.unlinkSync(artifactPath); } catch (_e) { /* ignore */ }
    }

    const parsed = JSON.parse(writes.join(''));
    expect(exitCode).toBe(0);
    expect(parsed.mode).toBe('batch-remote');
    expect(parsed.hosts).toEqual(['bbc.com']);
    expect(parsed.delegated.script).toMatch(/crawl-remote\.js$/);
    expect(parsed.graphFeedback.plannedHosts).toEqual(['bbc.com']);
    expect(parsed.graphFeedback.domains[0].candidates[0]).toEqual(expect.objectContaining({
      url: 'https://bbc.com/news',
      wouldEnqueue: false,
      wouldSeedRemote: false,
      wouldChangeCollect: false,
    }));
  });

  test('runCli explain rejects graph feedback on delegated plans without resolvable hosts', () => {
    const artifactPath = path.join(os.tmpdir(), `graph-feedback-${Date.now()}-${Math.random()}.json`);
    fs.writeFileSync(artifactPath, JSON.stringify(makeGraphFeedbackArtifact('bbc.com')));
    const origWrite = process.stderr.write.bind(process.stderr);
    const writes = [];
    process.stderr.write = (chunk) => { writes.push(String(chunk)); return true; };
    let exitCode;
    try {
      exitCode = run.runCli([
        '--explain',
        '--graph-feedback-artifact', artifactPath,
        'remote-status',
      ]);
    } finally {
      process.stderr.write = origWrite;
      try { fs.unlinkSync(artifactPath); } catch (_e) { /* ignore */ }
    }

    expect(exitCode).toBe(3);
    expect(writes.join('')).toContain('requires a batch or remote batch plan with resolvable hosts');
  });
});

describe('defaultCrawlProfiles — single source of truth', () => {
  test('lists the three named profiles', () => {
    expect(profiles.listProfileNames().sort()).toEqual(['fast', 'gentle', 'safe']);
  });

  test('getDefaultCrawlProfile defaults to safe', () => {
    expect(profiles.getDefaultCrawlProfile().name).toBe('safe');
    expect(profiles.getDefaultCrawlProfile('not-a-real-profile').name).toBe('safe');
  });

  test('profiles are frozen', () => {
    const p = profiles.getDefaultCrawlProfile('fast');
    expect(Object.isFrozen(p)).toBe(true);
    expect(Object.isFrozen(p.overrides)).toBe(true);
  });

  test('buildOverrides merges user values on top of profile', () => {
    const merged = profiles.buildOverrides('safe', { maxPages: 50, customKey: 'x' });
    expect(merged.maxPages).toBe(50);
    expect(merged.customKey).toBe('x');
    // Untouched key stays at profile baseline
    expect(merged.maxDepth).toBe(profiles.getDefaultCrawlProfile('safe').overrides.maxDepth);
  });
});

describe('tools/crawl/run.js — local vs remote dispatch', () => {
  test('default target is local (mode batch)', () => {
    const parsed = run.parseArgs(['bbc.com']);
    expect(parsed.runFlags.target).toBe('local');
    const plan = run.buildPlan(parsed);
    expect(plan.mode).toBe('batch');
    expect(plan.batchArgs).toBeDefined();
    expect(plan.remoteArgs).toBeUndefined();
  });

  test('--remote produces mode batch-remote with crawl-remote.js launch args', () => {
    const parsed = run.parseArgs(['--remote', 'bbc.com,reuters.com']);
    expect(parsed.runFlags.target).toBe('remote');
    const plan = run.buildPlan(parsed);
    expect(plan.mode).toBe('batch-remote');
    expect(plan.remoteArgs[0]).toBe('launch');
    expect(plan.remoteArgs).toContain('--domains');
    const i = plan.remoteArgs.indexOf('--domains');
    expect(plan.remoteArgs[i + 1]).toBe('bbc.com,reuters.com');
    expect(plan.hosts).toEqual(['bbc.com', 'reuters.com']);
  });

  test('--remote-host is forwarded as --host to crawl-remote.js', () => {
    const parsed = run.parseArgs(['--remote', '--remote-host', '10.0.0.5', 'bbc.com']);
    const plan = run.buildPlan(parsed);
    expect(plan.remoteArgs).toContain('--host');
    const i = plan.remoteArgs.indexOf('--host');
    expect(plan.remoteArgs[i + 1]).toBe('10.0.0.5');
  });

  test('remote deploy preflight flags parse and pass through delegate mode', () => {
    const parsed = run.parseArgs([
      '--remote-deploy', 'never',
      '--remote-deploy-ssh-host', 'ubuntu@example.com',
      '--remote-deploy-force',
      'remote-guardian-bbc-10-agent'
    ]);
    expect(parsed.runFlags.remoteDeploy).toBe('never');
    expect(parsed.runFlags.remoteDeploySshHost).toBe('ubuntu@example.com');
    expect(parsed.runFlags.remoteDeployForce).toBe(true);
    const plan = run.buildPlan(parsed);
    expect(plan.mode).toBe('delegate');
    expect(plan.delegateArgv).toEqual(expect.arrayContaining([
      '--remote-deploy', 'never',
      '--remote-deploy-ssh-host', 'ubuntu@example.com',
      '--remote-deploy-force',
    ]));
  });

  test('statusUrlFromRemoteHost normalizes remote host values', () => {
    expect(run.statusUrlFromRemoteHost('10.0.0.5:3200')).toBe('http://10.0.0.5:3200/api/status');
    expect(run.statusUrlFromRemoteHost('http://example.com:3200')).toBe('http://example.com:3200/api/status');
  });

  test('--local explicitly forces local even after a previous --remote in argv', () => {
    const parsed = run.parseArgs(['--remote', '--local', 'bbc.com']);
    expect(parsed.runFlags.target).toBe('local');
    const plan = run.buildPlan(parsed);
    expect(plan.mode).toBe('batch');
  });

  test('uniqueHostnamesFromUrls dedupes and lowercases', () => {
    const out = run.uniqueHostnamesFromUrls([
      'https://BBC.com/news', 'https://bbc.com/x', 'https://reuters.com/'
    ]);
    expect(out).toEqual(['bbc.com', 'reuters.com']);
  });

  test('renderPlan emits remote delegated script for --remote', () => {
    const parsed = run.parseArgs(['--remote', 'bbc.com']);
    const plan = run.buildPlan(parsed);
    const rendered = run.renderPlan(plan);
    expect(rendered.mode).toBe('batch-remote');
    expect(rendered.delegated.script).toMatch(/crawl-remote\.js$/);
    expect(rendered.hosts).toEqual(['bbc.com']);
  });
});

describe('tools/crawl/run.js — meter flag parsing', () => {
  test('meter is enabled by default with default interval', () => {
    const parsed = run.parseArgs(['bbc.com']);
    expect(parsed.runFlags.meter).toBe(true);
    expect(parsed.runFlags.meterIntervalMs).toBe(run.DEFAULT_METER_INTERVAL_MS);
  });

  test('--no-meter disables the meter', () => {
    const parsed = run.parseArgs(['--no-meter', 'bbc.com']);
    expect(parsed.runFlags.meter).toBe(false);
  });

  test('--meter-interval overrides sample interval', () => {
    const parsed = run.parseArgs(['--meter-interval', '500', 'bbc.com']);
    expect(parsed.runFlags.meterIntervalMs).toBe(500);
  });

  test('--db overrides the local meter DB path', () => {
    const parsed = run.parseArgs(['--db', './alt.db', 'bbc.com']);
    expect(path.basename(parsed.runFlags.dbPath)).toBe('alt.db');
  });
});

describe('tools/crawl/run.js — watch flag parsing', () => {
  test('watch is OFF by default with sane defaults for interval/timeout', () => {
    const parsed = run.parseArgs(['bbc.com']);
    expect(parsed.runFlags.watch).toBe(false);
    expect(parsed.runFlags.watchIntervalMs).toBe(5000);
    expect(parsed.runFlags.watchTimeoutSec).toBe(1800);
    expect(parsed.runFlags.watchMinFetches).toBe(0);
    expect(parsed.runFlags.watchWaitTerminalAfterDbProof).toBe(false);
    expect(parsed.runFlags.watchTerminalTimeoutSec).toBe(30);
  });

  test('--watch enables stay-open follow mode', () => {
    const parsed = run.parseArgs(['--watch', 'bbc.com']);
    expect(parsed.runFlags.watch).toBe(true);
  });

  test('--no-watch overrides a prior --watch', () => {
    const parsed = run.parseArgs(['--watch', '--no-watch', 'bbc.com']);
    expect(parsed.runFlags.watch).toBe(false);
  });

  test('--watch-interval, --watch-timeout, --watch-min-fetches, and --watch-min-hosts parse as numbers', () => {
    const parsed = run.parseArgs([
      '--watch',
      '--watch-interval', '2500',
      '--watch-timeout', '90',
      '--watch-min-fetches', '1',
      '--watch-min-hosts', '3',
      'bbc.com',
    ]);
    expect(parsed.runFlags.watchIntervalMs).toBe(2500);
    expect(parsed.runFlags.watchTimeoutSec).toBe(90);
    expect(parsed.runFlags.watchMinFetches).toBe(1);
    expect(parsed.runFlags.watchMinHosts).toBe(3);
  });

  test('optional terminal wait after DB proof parses as a bounded local watch policy', () => {
    const parsed = run.parseArgs([
      '--watch',
      '--watch-wait-terminal-after-db-proof',
      '--watch-terminal-timeout', '15',
      'http://127.0.0.1:41972/news/a.html',
    ]);

    expect(parsed.runFlags.watchWaitTerminalAfterDbProof).toBe(true);
    expect(parsed.runFlags.watchTerminalTimeoutSec).toBe(15);
  });

  test('terminal-wait job poll timeout defaults to 5000ms and parses an override', () => {
    const defaults = run.parseArgs([
      '--watch',
      '--watch-wait-terminal-after-db-proof',
      'http://127.0.0.1:41972/news/a.html',
    ]);
    expect(defaults.runFlags.watchTerminalJobPollTimeoutMs).toBe(5000);

    const parsed = run.parseArgs([
      '--watch',
      '--watch-wait-terminal-after-db-proof',
      '--watch-terminal-job-poll-timeout', '3000',
      'http://127.0.0.1:41972/news/a.html',
    ]);
    expect(parsed.runFlags.watchTerminalJobPollTimeoutMs).toBe(3000);
  });

  test('classifyTerminalWaitOutcome distinguishes terminal, timed-out, and endpoint-unavailable', () => {
    expect(run.classifyTerminalWaitOutcome({
      hasJobEvidence: true, allJobsTerminal: true, endpointResponded: true,
    })).toEqual({ outcome: 'terminal', reason: 'accepted-local-jobs-terminal-after-db-proof' });

    // Endpoint responded with non-terminal job evidence at timeout.
    expect(run.classifyTerminalWaitOutcome({
      hasJobEvidence: true, allJobsTerminal: false, endpointResponded: true,
    })).toEqual({ outcome: 'timed-out', reason: 'accepted-local-jobs-still-non-terminal-after-db-proof' });

    // Endpoint responded earlier in the wait but the final poll lacked evidence:
    // still classified as timed-out, NOT unavailable, because it was observed.
    expect(run.classifyTerminalWaitOutcome({
      hasJobEvidence: false, allJobsTerminal: false, endpointResponded: true,
    })).toEqual({ outcome: 'timed-out', reason: 'accepted-local-jobs-still-non-terminal-after-db-proof' });

    // Endpoint never responded during the wait → distinctly unavailable.
    expect(run.classifyTerminalWaitOutcome({
      hasJobEvidence: false, allJobsTerminal: false, endpointResponded: false,
    })).toEqual({ outcome: 'endpoint-unavailable', reason: 'job-endpoint-unavailable-after-db-proof' });
  });

  test('clampTerminalWaitJobPollTimeout caps the per-poll budget to the remaining terminal-wait window', () => {
    // Plenty of budget left → full per-poll budget allowed.
    expect(run.clampTerminalWaitJobPollTimeout({
      elapsedMs: 0, totalTimeoutMs: 15000, maxPollTimeoutMs: 5000,
    })).toBe(5000);

    // Budget partly spent but still above one poll → full per-poll budget.
    expect(run.clampTerminalWaitJobPollTimeout({
      elapsedMs: 9000, totalTimeoutMs: 15000, maxPollTimeoutMs: 5000,
    })).toBe(5000);

    // Final poll: remaining budget is smaller than the per-poll budget, so the
    // poll shrinks to the remaining window instead of overshooting it.
    expect(run.clampTerminalWaitJobPollTimeout({
      elapsedMs: 13000, totalTimeoutMs: 15000, maxPollTimeoutMs: 5000,
    })).toBe(2000);

    // Budget exhausted → 0 signals the caller to finalize without polling.
    expect(run.clampTerminalWaitJobPollTimeout({
      elapsedMs: 15000, totalTimeoutMs: 15000, maxPollTimeoutMs: 5000,
    })).toBe(0);
    expect(run.clampTerminalWaitJobPollTimeout({
      elapsedMs: 16000, totalTimeoutMs: 15000, maxPollTimeoutMs: 5000,
    })).toBe(0);

    // Missing/invalid elapsed is treated as zero elapsed (full budget).
    expect(run.clampTerminalWaitJobPollTimeout({
      totalTimeoutMs: 15000, maxPollTimeoutMs: 5000,
    })).toBe(5000);
  });

  test('batch launch retry controls parse separately from engine concurrency', () => {
    const parsed = run.parseArgs([
      '--concurrency', '4',
      '--batch-concurrency', '2',
      '--batch-retries', '0',
      '--batch-retry-delay-ms', '250',
      '--batch-request-timeout-ms', '60000',
      'https://127.0.0.1:41922/news/a.html,https://127.0.0.2:41922/news/b.html',
    ]);
    const plan = run.buildPlan(parsed);

    expect(parsed.runFlags.concurrency).toBe(4);
    expect(parsed.runFlags.batchConcurrency).toBe(2);
    expect(parsed.runFlags.batchRetries).toBe(0);
    expect(parsed.runFlags.batchRetryDelayMs).toBe(250);
    expect(parsed.runFlags.batchRequestTimeoutMs).toBe(60000);
    expect(plan.overrides.concurrency).toBe(4);
    expect(plan.batchArgs).toEqual(expect.arrayContaining([
      '--concurrency', '2',
      '--retries', '0',
      '--retry-delay-ms', '250',
      '--request-timeout-ms', '60000',
    ]));
  });

  test('delegated launch timeout flags have defaults and parse as numbers', () => {
    const defaults = run.parseArgs(['bbc.com']);
    expect(defaults.runFlags.launchTimeoutSec).toBe(run.DEFAULT_LAUNCH_TIMEOUT_SEC);
    expect(defaults.runFlags.noOutputTimeoutSec).toBe(run.DEFAULT_NO_OUTPUT_TIMEOUT_SEC);

    const parsed = run.parseArgs(['--launch-timeout', '30', '--no-output-timeout', '10', 'bbc.com']);
    expect(parsed.runFlags.launchTimeoutSec).toBe(30);
    expect(parsed.runFlags.noOutputTimeoutSec).toBe(10);
  });

  test('delegated child process fails early after no output timeout', async () => {
    const script = path.join(__dirname, 'fixtures', 'silent-child.js');
    const exitCode = await run.runChildProcess({
      script,
      args: [],
      label: 'silent-test',
      runFlags: { launchTimeoutSec: 0, noOutputTimeoutSec: 1, json: true }
    });
    expect(exitCode).toBe(125);
  }, 10000);

  test('watch timeout is a machine-failing follow-mode result', () => {
    expect(run.watchStoppedReasonExitCode('timeout')).toBe(2);
    expect(run.watchStoppedReasonExitCode('poll-errors')).toBe(2);
    expect(run.watchStoppedReasonExitCode('missing-targets')).toBe(2);
    expect(run.watchStoppedReasonExitCode('local-job-failed')).toBe(2);
    expect(run.watchStoppedReasonExitCode('local-job-terminal-without-min-fetches')).toBe(2);
    expect(run.watchStoppedReasonExitCode('local-job-terminal-without-host-coverage')).toBe(2);
    expect(run.watchStoppedReasonExitCode('local-host-coverage-not-met')).toBe(2);
    expect(run.watchStoppedReasonExitCode('min-fetches-met')).toBe(0);
    expect(run.watchStoppedReasonExitCode('min-fetches-and-hosts-met')).toBe(0);
    expect(run.watchStoppedReasonExitCode('min-fetches-met-terminal-wait-timeout')).toBe(0);
    expect(run.watchStoppedReasonExitCode('min-fetches-and-hosts-met-terminal-wait-timeout')).toBe(0);
    expect(run.watchStoppedReasonExitCode('min-fetches-and-terminal-met')).toBe(0);
    expect(run.watchStoppedReasonExitCode('min-fetches-and-hosts-and-terminal-met')).toBe(0);
    expect(run.watchStoppedReasonExitCode('stable')).toBe(0);
    expect(run.watchStoppedReasonExitCode('terminal')).toBe(0);
  });

  test('local watch host coverage counts only requested hosts with DB downloads', () => {
    const coverage = run.localStatusHostCoverage({
      domains: [
        { domain: '127.0.0.1', fetched: 1 },
        { domain: '127.0.0.2', fetched: 0 },
        { domain: 'example.com', fetched: 3 },
      ],
    }, ['127.0.0.1', '127.0.0.2', '127.0.0.3']);

    expect(coverage).toEqual({
      requested: ['127.0.0.1', '127.0.0.2', '127.0.0.3'],
      covered: ['127.0.0.1'],
      missing: ['127.0.0.2', '127.0.0.3'],
    });
  });

  test('summarizes local watch job evidence without dumping full payloads', () => {
    const summary = run.summarizeWatchJobEvidence({
      counts: { total: 2, running: 1, completed: 1, failed: 0, terminal: 1, statuses: { running: 1, completed: 1 } },
      jobs: [
        { id: 'job-1', operationName: 'basicArticleCrawl', status: 'running', startUrl: 'https://www.bbc.com/news', startedAt: '2026-05-28T10:00:00Z' },
        { id: 'job-2', operationName: 'basicArticleCrawl', status: 'completed', startUrl: 'https://www.bbc.com/news/2', finishedAt: '2026-05-28T10:01:00Z' },
      ],
    });
    expect(summary.counts.total).toBe(2);
    expect(summary.available).toBe(true);
    expect(summary.error).toBeNull();
    expect(summary.items).toHaveLength(2);
    expect(JSON.stringify(summary)).not.toContain('https://www.bbc.com/news');
  });

  test('summarizes unavailable local watch job evidence without hiding the poll error', () => {
    const summary = run.summarizeWatchJobEvidence({
      ok: false,
      error: 'timeout after 1500ms',
      counts: { total: 0, running: 0, completed: 0, failed: 0, terminal: 0, statuses: {} },
      jobs: [],
    });

    expect(summary).toMatchObject({
      available: false,
      error: 'timeout after 1500ms',
      counts: { total: 0 },
      items: [],
    });
  });

  test('summarizes accepted launch jobs for watch fallback evidence', () => {
    const summary = run.summarizeLaunchJobEvidence({
      accepted: [
        { startUrl: 'https://www.bbc.com/news', jobId: 'job-bbc', attempts: 1 },
      ],
      failed: [
        { startUrl: 'https://www.reuters.com/world/', error: 'timeout', attempts: 4 },
      ],
    });

    expect(summary).toMatchObject({
      source: 'launch-report',
      available: true,
      counts: { total: 2, accepted: 1, failed: 1 },
      items: [
        {
          id: 'job-bbc',
          status: 'accepted',
          startUrl: 'https://www.bbc.com/news',
          attempts: 1,
        },
      ],
    });
  });

  test('parses partial local launch summaries into accepted and failed targets', () => {
    const raw = JSON.stringify({
      status: 'partial',
      counts: { total: 2, ok: 1, failed: 1 },
      results: [
        {
          startUrl: 'https://www.bbc.com/news',
          ok: true,
          jobId: 'job-bbc',
          attempts: 1,
          body: { job: { id: 'job-bbc', startUrl: 'https://www.bbc.com/news' } },
        },
        {
          startUrl: 'https://www.reuters.com/world/',
          ok: false,
          error: 'request timeout after 15000ms',
          attempts: 4,
          retryable: true,
        },
      ],
    }, null, 2);

    const parsed = run.parseLocalLaunchSummary(`\n${raw}\n`);
    const summary = run.summarizeLocalLaunchSummary(parsed);

    expect(summary.status).toBe('partial');
    expect(summary.accepted).toEqual([{
      startUrl: 'https://www.bbc.com/news',
      jobId: 'job-bbc',
      attempts: 1,
    }]);
    expect(summary.failed).toEqual([{
      startUrl: 'https://www.reuters.com/world/',
      error: 'request timeout after 15000ms',
      attempts: 4,
      retryable: true,
    }]);
  });

  test('partial local launch watch follows accepted jobs with min-fetch proof and preserves nonzero launch exit', () => {
    const plan = {
      mode: 'batch',
      urls: ['https://www.bbc.com/news', 'https://www.reuters.com/world/'],
      batchArgs: [],
    };
    const launchStdout = JSON.stringify({
      status: 'partial',
      results: [
        { startUrl: 'https://www.bbc.com/news', ok: true, jobId: 'job-bbc' },
        { startUrl: 'https://www.reuters.com/world/', ok: false, error: 'timeout' },
      ],
    });

    const decision = run.localLaunchWatchDecision({
      plan,
      runFlags: { watch: true, watchMinFetches: 1 },
      launchExitCode: 2,
      launchStdout,
    });

    expect(decision).toMatchObject({
      shouldWatch: true,
      reason: 'partial-launch-accepted-jobs',
    });
    expect(decision.plan.urls).toEqual(['https://www.bbc.com/news']);
    expect(run.watchStoppedReasonExitCode('min-fetches-met')).toBe(0);
  });

  test('partial local launch watch lowers min-host gate to accepted jobs', () => {
    const decision = {
      reason: 'partial-launch-accepted-jobs',
      launchSummary: {
        accepted: [
          { startUrl: 'http://127.0.0.1/a', jobId: 'job-a' },
          { startUrl: 'http://127.0.0.2/b', jobId: 'job-b' },
        ],
        failed: [{ startUrl: 'http://127.0.0.3/c', error: 'ECONNRESET' }],
      },
    };

    const flags = run.localWatchRunFlagsForDecision({ watchMinHosts: 3, watchMinFetches: 2 }, decision);

    expect(flags.watchMinHosts).toBe(2);
    expect(flags.watchMinHostsAdjustedFrom).toBe(3);
  });

  test('successful local launch watch keeps accepted job evidence for later diagnostics', () => {
    const plan = {
      mode: 'batch',
      urls: ['https://www.reuters.com/world/'],
      batchArgs: [],
    };
    const launchStdout = JSON.stringify({
      status: 'ok',
      counts: { total: 1, ok: 1, failed: 0 },
      results: [
        { startUrl: 'https://www.reuters.com/world/', ok: true, jobId: 'job-reuters' },
      ],
    });

    const decision = run.localLaunchWatchDecision({
      plan,
      runFlags: { watch: true, watchMinFetches: 1 },
      launchExitCode: 0,
      launchStdout,
    });

    expect(decision).toMatchObject({
      shouldWatch: true,
      reason: 'launch-ok',
      launchSummary: {
        accepted: [
          {
            startUrl: 'https://www.reuters.com/world/',
            jobId: 'job-reuters',
          },
        ],
      },
    });
  });

  test('partial local launch watch refuses ambiguous partial launches', () => {
    const plan = { mode: 'batch', urls: ['https://www.bbc.com/news'] };
    expect(run.localLaunchWatchDecision({
      plan,
      runFlags: { watch: true, watchMinFetches: 0 },
      launchExitCode: 2,
      launchStdout: '{"status":"partial","results":[{"ok":true,"startUrl":"https://www.bbc.com/news"}]}',
    })).toMatchObject({
      shouldWatch: false,
      reason: 'partial-launch-needs-watch-min-fetches',
    });

    expect(run.localLaunchWatchDecision({
      plan,
      runFlags: { watch: true, watchMinFetches: 1 },
      launchExitCode: 2,
      launchStdout: 'not-json',
    })).toMatchObject({
      shouldWatch: false,
      reason: 'partial-launch-summary-unparseable',
    });
  });
});

describe('tools/crawl/lib/throughput-meter — pure helpers', () => {
  const meter = require('../../../tools/crawl/lib/throughput-meter');
  test('fmtBytes covers B/KB/MB and zero', () => {
    expect(meter.fmtBytes(0)).toBe('0 B');
    expect(meter.fmtBytes(512)).toMatch(/^512(\.\d)? B$/);
    expect(meter.fmtBytes(2048)).toMatch(/KB$/);
    expect(meter.fmtBytes(5 * 1024 * 1024)).toMatch(/MB$/);
  });

  test('fmtRate produces /s suffix for both unit modes', () => {
    expect(meter.fmtRate(3.456)).toMatch(/\/s$/);
    expect(meter.fmtRate(2048, 'bytes')).toMatch(/KB\/s$/);
  });

  test('fmtSecs prints one decimal', () => {
    expect(meter.fmtSecs(12345)).toBe('12.3s');
  });
});
