'use strict';

const {
  parseStanzas, baselineCostsFromProse, computeMetrics, deriveVerdict, median, slope, direction,
} = require('../cycle-metrics');

describe('cycle-metrics pure core', () => {
  test('parseStanzas extracts valid stanzas and skips malformed ones', () => {
    const text = [
      'row one',
      '<!-- cycle:{"id":47,"model":"opus-4.8","cost_turns":1.6,"ncdb_debt":258,"second_order":["a"]} -->',
      'row two',
      '<!-- cycle:{"id":48, BROKEN } -->',
      '<!-- cycle:{"id":49,"model":"opus-4.8","cost_turns":1.0,"ncdb_debt":258} -->',
    ].join('\n');
    const { cycles, errors } = parseStanzas(text);
    expect(cycles.map((c) => c.id)).toEqual([47, 49]);
    expect(errors).toHaveLength(1);
  });

  test('baselineCostsFromProse pulls "~N turns" costs from prose rows', () => {
    const text = '| … | ~1.4 turns (Opus 4.8) | … |\n| … | ~0.9 turn | … |\n| … | no cost here | … |';
    const costs = baselineCostsFromProse(text);
    expect(costs.map((c) => c.cost_turns)).toEqual([1.4, 0.9]);
    expect(costs.every((c) => c.estimated)).toBe(true);
  });

  test('median and slope behave', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(slope([5, 4, 3, 2, 1])).toBeLessThan(0); // falling
    expect(slope([1, 2, 3, 4, 5])).toBeGreaterThan(0); // rising
    expect(direction(slope([5, 4, 3, 2, 1]))).toBe('falling');
    expect(direction(slope([3, 3, 3, 3]))).toBe('flat');
  });

  test('computeMetrics: a falling cost series with second-order tools reads COMPOUNDING', () => {
    const cycles = [
      { id: 1, cost_turns: 3.0, ncdb_debt: 269, second_order: ['t1'], scaffold_added: ['s1'], verified_improvements: 1, tracks: ['A'] },
      { id: 2, cost_turns: 2.5, ncdb_debt: 265, second_order: [], scaffold_added: [], verified_improvements: 1, tracks: ['B'] },
      { id: 3, cost_turns: 2.0, ncdb_debt: 261, second_order: ['t2'], scaffold_added: ['s2'], verified_improvements: 2, tracks: ['B'] },
      { id: 4, cost_turns: 1.5, ncdb_debt: 258, second_order: [], scaffold_added: [], verified_improvements: 1, tracks: ['B'] },
    ];
    const m = computeMetrics(cycles, [], { window: 2 });
    expect(m.costTrend.dir).toBe('falling');
    expect(m.costTrend.source).toBe('stanza');
    expect(m.secondOrder.cumulative).toBe(2);
    expect(m.ncdbDebt.delta).toBe(-11);
    expect(m.scaffold.net).toBe(2);
    expect(m.verdict.label).toBe('COMPOUNDING');
  });

  test('deriveVerdict: rising cost + growing scaffold reads BLOATING; flat cost + no recursion reads PLATEAU', () => {
    const bloating = deriveVerdict({
      costTrend: { dir: 'rising' }, secondOrder: { rate: 0.5 }, ncdbDebt: { delta: 0 }, scaffold: { net: 5 }, haveStanzas: true,
    });
    expect(bloating.label).toBe('BLOATING');

    const plateau = deriveVerdict({
      costTrend: { dir: 'flat' }, secondOrder: { rate: 0.0 }, ncdbDebt: { delta: 0 }, scaffold: { net: 0 }, haveStanzas: true,
    });
    expect(plateau.label).toBe('PLATEAU');
  });

  test('computeMetrics falls back to prose baseline when there are no stanzas', () => {
    const baseline = [{ cost_turns: 2.0 }, { cost_turns: 1.5 }, { cost_turns: 1.0 }];
    const m = computeMetrics([], baseline, { window: 2 });
    expect(m.costTrend.source).toBe('prose-baseline');
    expect(m.cyclesParsed).toBe(0);
    expect(m.verdict.label).toBe('INSUFFICIENT-DATA');
  });
});
