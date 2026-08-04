'use strict';

/**
 * Coordinator-owned gate pin (re-homed cycle 179): the crawler concurrency
 * DEFAULT stays 3 (owner-approved 2026-07-26). This block previously lived
 * inside DomainThrottleManager.test.js and could not travel with the
 * politeness extraction because it file-reads the coordinator's NewsCrawler.js.
 * The ritual-compliance probe checks the ≤3 gate; this test pins the default.
 */

const fs = require('fs');
const path = require('path');

describe('NewsCrawler concurrency default (owner-approved 2026-07-26)', () => {
  it('defaults to 3, not 1', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'NewsCrawler.js'), 'utf8');
    const m = /concurrency:\s*\{\s*type:\s*'number',\s*default:\s*(\d+)/.exec(src);
    expect(m).toBeTruthy();
    expect(Number(m[1])).toBe(3);
  });
});
