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

describe('tools/crawl/run.js — input shape detection', () => {
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
      '--operation', 'siteExplorer', '--explain', 'bbc.com'
    ]);
    expect(runFlags.profile).toBe('fast');
    expect(runFlags.maxPages).toBe(500);
    expect(runFlags.maxDepth).toBe(3);
    expect(runFlags.concurrency).toBe(4);
    expect(runFlags.operation).toBe('siteExplorer');
    expect(runFlags.explain).toBe(true);
    expect(positional).toEqual(['bbc.com']);
  });

  test('--override is repeatable and parsed into overrides map', () => {
    const { runFlags } = run.parseArgs([
      '--override', 'requestTimeoutMs=20000',
      '--override', 'slowMode=true',
      'bbc.com'
    ]);
    expect(runFlags.overrides).toEqual({
      requestTimeoutMs: '20000',
      slowMode: 'true'
    });
    expect(runFlags.rawOverrides).toEqual([
      'requestTimeoutMs=20000', 'slowMode=true'
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
  });

  test('--watch enables stay-open follow mode', () => {
    const parsed = run.parseArgs(['--watch', 'bbc.com']);
    expect(parsed.runFlags.watch).toBe(true);
  });

  test('--no-watch overrides a prior --watch', () => {
    const parsed = run.parseArgs(['--watch', '--no-watch', 'bbc.com']);
    expect(parsed.runFlags.watch).toBe(false);
  });

  test('--watch-interval and --watch-timeout parse as numbers', () => {
    const parsed = run.parseArgs(['--watch', '--watch-interval', '2500', '--watch-timeout', '90', 'bbc.com']);
    expect(parsed.runFlags.watchIntervalMs).toBe(2500);
    expect(parsed.runFlags.watchTimeoutSec).toBe(90);
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
