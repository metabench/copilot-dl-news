'use strict';

const fs = require('fs');
const path = require('path');
const { extractLessons, groupLessons } = require('../lessons');

const LEDGER = path.resolve(__dirname, '..', '..', '..', 'docs', 'agi', 'IMPROVEMENT_LEDGER.md');

const FIXTURE = [
  '| row |',
  '<!-- cycle:{"id":1,"date":"2026-08-01","second_order":["alpha","beta"],"reused":["measure-dont-infer"]} -->',
  '| row |',
  '<!-- cycle:{"id":2,"date":"2026-08-02","second_order":["gamma"],"reused":["measure-dont-infer","park-with-diagnosis"]} -->',
  '| row |',
  '<!-- cycle:{"id":3,"date":"2026-08-03"} -->',
  '| row |',
  '<!-- cycle:{not json} -->'
].join('\n');

describe('extractLessons', () => {
  test('reads second_order by default, newest cycle first', () => {
    const out = extractLessons(FIXTURE);
    expect(out.map((e) => e.lesson)).toEqual(['gamma', 'alpha', 'beta']);
    expect(out[0].id).toBe(2);
  });

  test('reads the reused field when asked — the two mean different things', () => {
    // second_order = the lesson a cycle LEARNED. reused = one it APPLIED again.
    const out = extractLessons(FIXTURE, 'reused');
    expect(out.map((e) => e.lesson).sort()).toEqual(['measure-dont-infer', 'measure-dont-infer', 'park-with-diagnosis']);
  });

  test('a stanza with no lessons, and unparseable JSON, are both skipped safely', () => {
    expect(extractLessons(FIXTURE).some((e) => e.id === 3)).toBe(false);
    expect(() => extractLessons(FIXTURE)).not.toThrow();
  });

  test('empty and null input never throw', () => {
    expect(extractLessons('')).toEqual([]);
    expect(extractLessons(null)).toEqual([]);
  });
});

describe('groupLessons', () => {
  test('counts recurrences and sorts most-repeated first', () => {
    const g = groupLessons(extractLessons(FIXTURE, 'reused'));
    expect(g[0]).toMatchObject({ lesson: 'measure-dont-infer', count: 2 });
    expect(g[0].cycles.sort()).toEqual([1, 2]);
  });
});

describe('the real ledger — acceptance test against a known answer', () => {
  // The first version of this tool grouped second_order and reported 639
  // lessons, 639 distinct, ZERO repeats — a suspiciously perfect result, and
  // wrong: repetition was never in that field. These pin the correction.
  const text = fs.readFileSync(LEDGER, 'utf8');

  test('measure-dont-infer is the most re-applied lesson, many times over', () => {
    const top = groupLessons(extractLessons(text, 'reused'))[0];
    expect(top.lesson).toBe('measure-dont-infer');
    expect(top.count).toBeGreaterThan(20);
  });

  test('second_order is near-unique per cycle — which is why it cannot show repetition', () => {
    const learned = groupLessons(extractLessons(text, 'second_order'));
    const repeated = learned.filter((g) => g.count > 1);
    expect(repeated.length / learned.length).toBeLessThan(0.05);
  });

  test('both fields yield a non-trivial corpus', () => {
    expect(extractLessons(text, 'second_order').length).toBeGreaterThan(100);
    expect(extractLessons(text, 'reused').length).toBeGreaterThan(100);
  });
});
