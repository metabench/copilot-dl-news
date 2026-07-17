'use strict';

const path = require('path');
const { resolveGazetteerDbPath } = require('../gazetteer-db-path');

/**
 * Regression: geographic data lives in data/news.db. The separate
 * data/gazetteer.db went stale (508 places vs news.db's 13,688) while a
 * dozen modules still defaulted to it — PlaceLookup silently served 27x
 * less data. Retired 2026-07-16; every gazetteer path must resolve
 * through this module.
 */

describe('resolveGazetteerDbPath', () => {
  const saved = process.env.GAZETTEER_DB_PATH;
  afterEach(() => {
    if (saved === undefined) delete process.env.GAZETTEER_DB_PATH;
    else process.env.GAZETTEER_DB_PATH = saved;
  });

  it('defaults to data/news.db under the project root (never gazetteer.db)', () => {
    delete process.env.GAZETTEER_DB_PATH;
    const resolved = resolveGazetteerDbPath();
    expect(resolved.endsWith(path.join('data', 'news.db'))).toBe(true);
    expect(resolved).not.toMatch(/gazetteer/);
  });

  it('explicit argument wins over everything', () => {
    process.env.GAZETTEER_DB_PATH = '/env/override.db';
    const resolved = resolveGazetteerDbPath('custom/my.db');
    expect(resolved).toBe(path.resolve('custom/my.db'));
  });

  it('env var beats the default', () => {
    process.env.GAZETTEER_DB_PATH = 'env-dir/env.db';
    expect(resolveGazetteerDbPath()).toBe(path.resolve('env-dir/env.db'));
  });
});
