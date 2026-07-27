'use strict';

const { shouldRespawn } = require('../respawn-guard');

describe('bridge respawn crash-loop guard', () => {
  const NOW = 1_000_000;

  test('allows a respawn when there is no recent history', () => {
    const r = shouldRespawn([], NOW);
    expect(r.allow).toBe(true);
    expect(r.recent).toEqual([]);
  });

  test('allows while under the window cap (default 3 in 60s)', () => {
    const r = shouldRespawn([NOW - 5000, NOW - 10000], NOW);
    expect(r.allow).toBe(true); // 2 recent < 3
    expect(r.recent).toHaveLength(2);
  });

  test('REFUSES once the window cap is reached (crash loop)', () => {
    const r = shouldRespawn([NOW - 1000, NOW - 2000, NOW - 3000], NOW);
    expect(r.allow).toBe(false); // 3 recent, not < 3
  });

  test('old respawns outside the window do not count', () => {
    const r = shouldRespawn([NOW - 120000, NOW - 90000, NOW - 61000], NOW);
    expect(r.recent).toEqual([]); // all older than 60s
    expect(r.allow).toBe(true);
  });

  test('custom window/cap honored', () => {
    const stamps = [NOW - 1000, NOW - 2000];
    expect(shouldRespawn(stamps, NOW, { maxInWindow: 2 }).allow).toBe(false);
    expect(shouldRespawn(stamps, NOW, { maxInWindow: 5 }).allow).toBe(true);
    expect(shouldRespawn([NOW - 40000], NOW, { windowMs: 30000 }).recent).toEqual([]);
  });

  test('non-array / null timestamps are tolerated', () => {
    expect(shouldRespawn(null, NOW).allow).toBe(true);
    expect(shouldRespawn(undefined, NOW).recent).toEqual([]);
  });
});
