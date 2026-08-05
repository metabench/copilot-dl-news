'use strict';

// Pins the serve-stale snapshot cache added for the cycle-205 slow-dashboard
// chip (/quality and /place-hubs froze the unified server's event loop with
// synchronous multi-second page builds). Spawns a real child fixture so the
// spawn → tmp-file → ingest path is exercised, not mocked.

const path = require('path');
const { createHtmlSnapshotCache, renderComputingPage } = require('../../src/ui/server/utils/htmlSnapshotCache');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'ui', 'snapshot-child-fixture.js');

const quietLog = { warn: () => { } };

function makeCache(overrides = {}) {
  return createHtmlSnapshotCache({
    label: 'test-snapshot',
    childModulePath: FIXTURE,
    childArgs: (context) => {
      const args = ['--tag', (context && context.tag) || 'default'];
      if (context && context.fail) args.push('--fail');
      return args;
    },
    log: quietLog,
    ...overrides
  });
}

describe('htmlSnapshotCache', () => {
  jest.setTimeout(30_000);

  test('miss serves nothing; background child fills the snapshot', async () => {
    const cache = makeCache();
    try {
      expect(cache.get('k')).toBeNull();
      expect(cache.maybeRefresh('k', { tag: 'one' })).toBe('refreshing');
      await cache.whenIdle();
      const hit = cache.get('k');
      expect(hit).not.toBeNull();
      expect(hit.html).toContain('data-fixture-tag="one"');
    } finally {
      cache.dispose();
    }
  });

  test('fresh snapshot is served without a re-spawn; stale re-kicks', async () => {
    const cache = makeCache({ ttlMs: 120 });
    try {
      cache.maybeRefresh('k', { tag: 'first' });
      await cache.whenIdle();
      expect(cache.maybeRefresh('k', { tag: 'second' })).toBe('fresh');
      await cache.whenIdle();
      expect(cache.get('k').html).toContain('data-fixture-tag="first"');
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(cache.maybeRefresh('k', { tag: 'third' })).toBe('refreshing');
      await cache.whenIdle();
      expect(cache.get('k').html).toContain('data-fixture-tag="third"');
    } finally {
      cache.dispose();
    }
  });

  test('single-flight: a second key reports busy while a child runs', async () => {
    const cache = makeCache();
    try {
      expect(cache.maybeRefresh('k1', { tag: 'a' })).toBe('refreshing');
      expect(cache.maybeRefresh('k2', { tag: 'b' })).toBe('busy');
      await cache.whenIdle();
      expect(cache.get('k1')).not.toBeNull();
      expect(cache.get('k2')).toBeNull();
      expect(cache.maybeRefresh('k2', { tag: 'b' })).toBe('refreshing');
      await cache.whenIdle();
      expect(cache.get('k2').html).toContain('data-fixture-tag="b"');
    } finally {
      cache.dispose();
    }
  });

  test('child failure keeps the previous snapshot and does not throw', async () => {
    const cache = makeCache({ ttlMs: 1 });
    try {
      cache.maybeRefresh('k', { tag: 'good' });
      await cache.whenIdle();
      cache.maybeRefresh('k', { tag: 'bad', fail: true });
      await cache.whenIdle();
      expect(cache.get('k').html).toContain('data-fixture-tag="good"');
    } finally {
      cache.dispose();
    }
  });

  test('evicts the oldest entry beyond maxEntries', async () => {
    const cache = makeCache({ maxEntries: 1 });
    try {
      cache.maybeRefresh('k1', { tag: 'a' });
      await cache.whenIdle();
      cache.maybeRefresh('k2', { tag: 'b' });
      await cache.whenIdle();
      expect(cache.get('k1')).toBeNull();
      expect(cache.get('k2')).not.toBeNull();
    } finally {
      cache.dispose();
    }
  });

  test('renderComputingPage returns an escaped auto-refreshing placeholder', () => {
    const html = renderComputingPage({ title: 'T & T', message: 'M <x>' });
    expect(html).toContain('data-snapshot-state="computing"');
    expect(html).toContain('http-equiv="refresh"');
    expect(html).toContain('T &amp; T');
    expect(html).toContain('M &lt;x&gt;');
  });
});
