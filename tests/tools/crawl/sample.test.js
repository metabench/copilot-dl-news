'use strict';

const path = require('path');
const {
  RUNGS,
  parseSampleArgs,
  resolveSamplePlan,
  buildRunArgs,
  isInsideSamplesDir,
} = require('../../../tools/crawl/sample');

describe('sample.js parseSampleArgs', () => {
  test('parses a bare URL with default rung/profile', () => {
    const a = parseSampleArgs(['https://www.bbc.com/news']);
    expect(a.urls).toEqual(['https://www.bbc.com/news']);
    expect(a.rung).toBe('small');
    expect(a.profile).toBe('gentle');
    expect(a.keepDb).toBe(false);
  });

  test('splits csv targets and reads flags', () => {
    const a = parseSampleArgs(['bbc.com,reuters.com', '--rung', 'medium', '--json', '--keep-db']);
    expect(a.urls).toEqual(['bbc.com', 'reuters.com']);
    expect(a.rung).toBe('medium');
    expect(a.json).toBe(true);
    expect(a.keepDb).toBe(true);
  });

  test('--fresh overrides an earlier --keep-db', () => {
    expect(parseSampleArgs(['x.com', '--keep-db', '--fresh']).keepDb).toBe(false);
  });

  test('--override collects repeatable k=v pairs and flows into run args', () => {
    const a = parseSampleArgs(['x.com', '--override', 'preferCache=false', '--override', 'maxAgeMs=0']);
    expect(a.overrides).toEqual(['preferCache=false', 'maxAgeMs=0']);
    const runArgs = buildRunArgs(resolveSamplePlan(a));
    const i = runArgs.indexOf('--override');
    expect(i).toBeGreaterThan(-1);
    expect(runArgs[i + 1]).toBe('preferCache=false');
    expect(runArgs.filter((t) => t === '--override')).toHaveLength(2);
    expect(() => parseSampleArgs(['x.com', '--override', 'nonsense'])).toThrow(/key=value/);
  });

  test('runWindowSinceIso windows keep-db runs only', () => {
    const { runWindowSinceIso } = require('../../../tools/crawl/sample');
    const t = Date.parse('2026-07-02T12:00:00.000Z');
    expect(runWindowSinceIso(true, t)).toBe('2026-07-02T12:00:00.000Z');
    expect(runWindowSinceIso(false, t)).toBeUndefined();
    expect(runWindowSinceIso(true, NaN)).toBeUndefined();
  });

  test('throws on an unknown flag', () => {
    expect(() => parseSampleArgs(['x.com', '--bogus'])).toThrow(/Unknown option/);
  });
});

describe('sample.js resolveSamplePlan', () => {
  test('applies rung caps and default sample DB path', () => {
    const plan = resolveSamplePlan(parseSampleArgs(['bbc.com']));
    expect(plan.rung).toBe('small');
    expect(plan.maxPages).toBe(RUNGS.small.maxPages);
    expect(plan.maxDepth).toBe(RUNGS.small.maxDepth);
    expect(plan.dbPath.replace(/\\/g, '/')).toMatch(/data\/samples\/small-sample\.db$/);
    expect(plan.urls[0]).toBe('https://bbc.com/');
    expect(plan.requestedHosts).toEqual(['bbc.com']);
  });

  test('medium rung uses larger caps', () => {
    const plan = resolveSamplePlan(parseSampleArgs(['bbc.com', '--rung', 'medium']));
    expect(plan.maxPages).toBe(RUNGS.medium.maxPages);
    expect(plan.dbPath.replace(/\\/g, '/')).toMatch(/data\/samples\/medium-sample\.db$/);
  });

  test('explicit overrides win over rung caps', () => {
    const plan = resolveSamplePlan(parseSampleArgs(['bbc.com', '--max-pages', '5', '--max-depth', '0']));
    expect(plan.maxPages).toBe(5);
    expect(plan.maxDepth).toBe(0);
  });

  test('unknown rung falls back to small', () => {
    const plan = resolveSamplePlan(parseSampleArgs(['bbc.com', '--rung', 'enormous']));
    expect(plan.rung).toBe('small');
  });
});

describe('sample.js buildRunArgs', () => {
  test('wires an isolated writer DB, watch, and auto-stop', () => {
    const plan = resolveSamplePlan(parseSampleArgs(['bbc.com']));
    const args = buildRunArgs(plan);
    expect(args).toContain('--local');
    expect(args).toContain('--watch');
    expect(args).toContain('--auto-stop');
    // Follow the crawl to completion, not just the first fetch.
    expect(args).toContain('--watch-min-fetches');
    expect(args).toContain('--watch-wait-terminal-after-db-proof');
    expect(args[args.indexOf('--watch-terminal-timeout') + 1]).toBe(String(plan.watchTimeoutSec));
    // --crawl-db and --db both point at the sample DB (writer + watch reader).
    const dbIdx = args.indexOf('--crawl-db');
    expect(args[dbIdx + 1]).toBe(plan.dbPath);
    expect(args[args.indexOf('--db') + 1]).toBe(plan.dbPath);
    expect(args[args.indexOf('--max-pages') + 1]).toBe(String(plan.maxPages));
    // Seed URL is passed positionally.
    expect(args[0]).toBe('https://bbc.com/');
  });

  test('forwards per-domain interval only when set', () => {
    const withInterval = buildRunArgs(resolveSamplePlan(parseSampleArgs(['bbc.com', '--per-domain-interval-ms', '3000'])));
    expect(withInterval).toContain('--per-domain-interval-ms');
    expect(withInterval[withInterval.indexOf('--per-domain-interval-ms') + 1]).toBe('3000');
    const without = buildRunArgs(resolveSamplePlan(parseSampleArgs(['bbc.com'])));
    expect(without).not.toContain('--per-domain-interval-ms');
  });
});

describe('sample.js isInsideSamplesDir', () => {
  test('true only for paths under data/samples/', () => {
    expect(isInsideSamplesDir(path.join('data', 'samples', 'small-sample.db'))).toBe(true);
    expect(isInsideSamplesDir(path.join('data', 'news.db'))).toBe(false);
  });
});
