'use strict';

const { parseNumstatLog } = require('../churn-scan');

// The delimiter is SOH (\x01), matching `git log --format=%x01%H%x01%an%x01%aI`.
const SOH = '\x01';
const commit = (hash, author, iso) => `${SOH}${hash}${SOH}${author}${SOH}${iso}`;

describe('churn-scan parseNumstatLog', () => {
  test('aggregates commits, lines, authors, and first/last dates per file', () => {
    const log = [
      commit('h1', 'Alice', '2026-07-01T10:00:00Z'),
      '10\t2\tsrc/a.js',
      '3\t0\tsrc/b.js',
      commit('h2', 'Bob', '2026-07-05T10:00:00Z'),
      '5\t5\tsrc/a.js',
      commit('h3', 'Alice', '2026-07-03T10:00:00Z'),
      '1\t1\tsrc/a.js'
    ].join('\n');

    const ranked = parseNumstatLog(log);
    const a = ranked.find((r) => r.file === 'src/a.js');
    expect(a.commits).toBe(3);
    expect(a.insertions).toBe(16);
    expect(a.deletions).toBe(8);
    expect(a.linesChanged).toBe(24);
    expect(a.authors).toBe(2); // Alice + Bob
    expect(a.firstAt).toBe('2026-07-01T10:00:00Z'); // earliest across commits, not log order
    expect(a.lastAt).toBe('2026-07-05T10:00:00Z');

    const b = ranked.find((r) => r.file === 'src/b.js');
    expect(b.commits).toBe(1);
    expect(b.authors).toBe(1);
  });

  test('ranks by score (more commits + more churn outranks a single big change)', () => {
    const log = [
      // busy.js: 3 small commits by 2 authors
      commit('c1', 'Alice', '2026-07-01T00:00:00Z'), '2\t1\tbusy.js',
      commit('c2', 'Bob', '2026-07-02T00:00:00Z'), '2\t1\tbusy.js',
      commit('c3', 'Alice', '2026-07-03T00:00:00Z'), '2\t1\tbusy.js',
      // reformat.js: one giant reformat commit
      commit('c4', 'Alice', '2026-07-01T00:00:00Z'), '900\t900\treformat.js'
    ].join('\n');

    const ranked = parseNumstatLog(log);
    expect(ranked[0].file).toBe('busy.js'); // commits dominate, log-damped lines stop the reformat winning
  });

  test('handles binary rows (- / -), CRLF, rename forms, and path/ext filters', () => {
    const log = [
      commit('r1', 'Al', '2026-07-01T00:00:00Z') + '\r',
      '-\t-\tassets/logo.png\r',            // binary: counts as a touch, 0 lines
      '4\t2\tsrc/{old => new}/mod.js\r',    // brace rename -> src/new/mod.js
      '1\t0\told/path.js => lib/path.js\r', // plain rename -> lib/path.js
      '9\t9\tdocs/readme.md\r'
    ].join('\n');

    const ranked = parseNumstatLog(log, { pathPrefix: 'src', exts: ['.js'] });
    // Only src/*.js survives both filters
    expect(ranked.map((r) => r.file)).toEqual(['src/new/mod.js']);
    expect(ranked[0].linesChanged).toBe(6);

    // Without filters, binary + rename + docs all present
    const all = parseNumstatLog(log);
    const png = all.find((r) => r.file === 'assets/logo.png');
    expect(png.commits).toBe(1);
    expect(png.linesChanged).toBe(0);
    expect(all.some((r) => r.file === 'lib/path.js')).toBe(true);
  });

  test('empty / whitespace input yields empty ranking, never throws', () => {
    expect(parseNumstatLog('')).toEqual([]);
    expect(parseNumstatLog(null)).toEqual([]);
    expect(parseNumstatLog('\n\n  \n')).toEqual([]);
  });

  test('numstat rows before any commit header are ignored (no null-cur crash)', () => {
    const log = ['5\t5\torphan.js', commit('h', 'A', '2026-07-01T00:00:00Z'), '1\t1\treal.js'].join('\n');
    const ranked = parseNumstatLog(log);
    expect(ranked.map((r) => r.file)).toEqual(['real.js']);
  });
});
