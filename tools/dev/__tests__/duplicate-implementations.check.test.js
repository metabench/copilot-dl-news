'use strict';

const { extractExportedNames, clusterByName } = require('../checks/duplicate-implementations.check');

describe('duplicate-implementations extractExportedNames', () => {
  test('reads a CommonJS export block', () => {
    const names = extractExportedNames('module.exports = { alpha, beta, gamma: internal };');
    expect(names).toEqual(expect.arrayContaining(['alpha', 'beta', 'gamma']));
  });

  test('reads exports.foo assignments', () => {
    expect(extractExportedNames('exports.alpha = 1; module.exports.beta = 2;'))
      .toEqual(expect.arrayContaining(['alpha', 'beta']));
  });

  test('reads ESM export blocks, declarations and aliases', () => {
    expect(extractExportedNames('export { alpha, internal as beta };'))
      .toEqual(expect.arrayContaining(['alpha', 'beta']));
    expect(extractExportedNames('export function gamma() {}\nexport class Delta {}\nexport const epsilon = 1;'))
      .toEqual(expect.arrayContaining(['gamma', 'Delta', 'epsilon']));
  });

  test('drops generic names — sharing `main` says nothing about sharing a job', () => {
    const names = extractExportedNames('module.exports = { main, run, init, mergePlacesIntoSurvivor };');
    expect(names).toContain('mergePlacesIntoSurvivor');
    expect(names).not.toContain('main');
    expect(names).not.toContain('run');
    expect(names).not.toContain('init');
  });

  test('ignores exports inside comments', () => {
    expect(extractExportedNames('// module.exports = { ghost };')).not.toContain('ghost');
  });

  test('empty and null input never throw', () => {
    expect(extractExportedNames('')).toEqual([]);
    expect(extractExportedNames(null)).toEqual([]);
  });
});

describe('duplicate-implementations clusterByName', () => {
  const mod = (file, names, reachable = true) => ({ file, names, reachable });

  test('a name exported once is not a cluster', () => {
    expect(clusterByName([mod('a.js', ['solo'])])).toEqual([]);
  });

  test('a name exported by two modules clusters, counting live ones', () => {
    const out = clusterByName([
      mod('a.js', ['shared'], true),
      mod('b.js', ['shared'], false)
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: 'shared', count: 2, live: 1 });
  });

  test('clusters sort most-implementations-first, then fewest-live', () => {
    const out = clusterByName([
      mod('a.js', ['two', 'three']),
      mod('b.js', ['two', 'three']),
      mod('c.js', ['three'])
    ]);
    expect(out[0].name).toBe('three');
    expect(out[0].count).toBe(3);
  });

  // The acceptance test this approach FAILS, pinned so the failure is a fact
  // in the suite rather than a claim in a comment. A barrel re-exporting an
  // access module looks identical to two competing implementations.
  test('KNOWN LIMITATION: a barrel re-export is indistinguishable from a duplicate', () => {
    const out = clusterByName([
      mod('access/legacy-gazetteer-deduplication.ts', ['mergeDuplicatePlaces']),
      mod('db/index.ts', ['mergeDuplicatePlaces'])       // the barrel
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(2); // reported as two, but it is one implementation
  });

  test('KNOWN LIMITATION: same job under different names is invisible', () => {
    // The real dedup cluster: three implementations, three names, one export
    // each. Nothing clusters.
    const out = clusterByName([
      mod('gazetteer-cleanup.js', ['mergeDuplicates']),
      mod('populate-gazetteer.js', ['runCleanup']),
      mod('legacy-gazetteer-deduplication.ts', ['mergeDuplicatePlaces'])
    ]);
    expect(out).toEqual([]);
  });
});
