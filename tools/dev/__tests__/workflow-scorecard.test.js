'use strict';

const { parseJsonl, metricsFor, computeScorecard, ratio } = require('../workflow-scorecard');

describe('workflow-scorecard pure core', () => {
  test('parseJsonl reads records, skips blanks + comments, collects bad lines', () => {
    const text = [
      '# a comment',
      '{"cycle":1,"validation_outcome":"CONFIRMED"}',
      '',
      '// another comment',
      '{bad json}',
      '{"cycle":2,"validation_outcome":"REFUTED"}',
    ].join('\n');
    const { records, errors } = parseJsonl(text);
    expect(records.map((r) => r.cycle)).toEqual([1, 2]);
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(5);
  });

  test('verdict-accuracy weights PARTIAL at 0.5 and ignores NA', () => {
    const recs = [
      { validation_outcome: 'CONFIRMED' },
      { validation_outcome: 'CONFIRMED' },
      { validation_outcome: 'REFUTED' },
      { validation_outcome: 'PARTIAL' },
      { validation_outcome: 'NA' }, // not counted in the verdict denominator
    ];
    const m = metricsFor(recs);
    // (2 + 0.5) / 4 = 0.625
    expect(m.verdict_accuracy).toBe(0.625);
  });

  test('FIX 16: refuted_kind breaks REFUTED into wrong-verdict vs correct-refutation, additively', () => {
    const recs = [
      { validation_outcome: 'CONFIRMED' },
      { validation_outcome: 'REFUTED', refuted_kind: 'wrong-verdict' },
      { validation_outcome: 'REFUTED', refuted_kind: 'correct-refutation' },
      { validation_outcome: 'REFUTED' }, // legacy record, no kind -> unlabeled
    ];
    const m = metricsFor(recs);
    expect(m.refuted_breakdown).toEqual({ wrong_verdict: 1, correct_refutation: 1, unlabeled: 1 });
    // verdict_accuracy UNCHANGED (REFUTED stays a miss): 1 confirmed / 4 verdict runs = 0.25
    expect(m.verdict_accuracy).toBe(0.25);
    // adjusted credits the 1 correct-refutation: (1 + 1) / 4 = 0.5
    expect(m.verdict_accuracy_adjusted).toBe(0.5);
  });

  test('FIX 16: legacy records (no refuted_kind) leave adjusted == verdict_accuracy', () => {
    const m = metricsFor([{ validation_outcome: 'CONFIRMED' }, { validation_outcome: 'REFUTED' }]);
    expect(m.refuted_breakdown).toEqual({ wrong_verdict: 0, correct_refutation: 0, unlabeled: 1 });
    expect(m.verdict_accuracy_adjusted).toBe(m.verdict_accuracy);
  });

  test('catch-rate / false-alarm-rate / cost-to-catch / escape-rate compute from issues + escapes', () => {
    const recs = [
      { cost_turns: 1.0, validation_outcome: 'CONFIRMED', issues_flagged: [{ claim: 'x', validated: 'real' }], escaped: [] },
      { cost_turns: 2.0, validation_outcome: 'CONFIRMED', issues_flagged: [{ claim: 'y', validated: 'real' }, { claim: 'z', validated: 'false-alarm' }], escaped: [{ defect: 'leak' }] },
      { cost_turns: 3.0, validation_outcome: 'REFUTED', issues_flagged: [{ claim: 'w', validated: 'false-alarm' }], escaped: [] },
    ];
    const m = metricsFor(recs);
    expect(m.catch_rate).toBe(ratio(2, 3)); // 2 of 3 runs had a real catch
    expect(m.false_alarm_rate).toBe(ratio(2, 4)); // 2 false-alarms of 4 flagged
    expect(m.cost_to_catch).toBe(3); // total cost 6 / 2 real catches
    expect(m.escape_rate).toBe(ratio(1, 3));
  });

  test('cost-to-catch is Infinity when a costly workflow caught nothing real', () => {
    const m = metricsFor([{ cost_turns: 4, validation_outcome: 'REFUTED', issues_flagged: [{ claim: 'q', validated: 'false-alarm' }] }]);
    expect(m.cost_to_catch).toBe(Infinity);
  });

  test('computeScorecard groups, and the ratchet only fires for groups with >= min-runs', () => {
    const recs = [
      // shape A: 5 runs, all refuted-with-nothing-real → verdict-accuracy 0, cost-to-catch ∞
      ...Array.from({ length: 5 }, (_, i) => ({ shape: 'A', task_type: 't', cost_turns: 1, validation_outcome: 'REFUTED', issues_flagged: [{ claim: 'fa' + i, validated: 'false-alarm' }] })),
      // shape B: 1 run, also bad — but below min-runs, so must NOT trip the ratchet
      { shape: 'B', task_type: 't', cost_turns: 1, validation_outcome: 'REFUTED', issues_flagged: [] },
    ];
    const sc = computeScorecard(recs, { groupBy: 'shape', minRuns: 5, floors: { minVerdictAccuracy: 0.5 } });
    const groupA = sc.groups.find((g) => g.key === 'A');
    expect(groupA.runs).toBe(5);
    expect(groupA.verdict_accuracy).toBe(0);
    expect(sc.violations.some((v) => v.group === 'A')).toBe(true);
    expect(sc.violations.some((v) => v.group === 'B')).toBe(false); // n=1 < min-runs
    expect(sc.pruneCandidates.some((g) => g.key === 'A')).toBe(true);
  });

  test('since filter drops older records', () => {
    const recs = [
      { date: '2026-06-01', shape: 'A', validation_outcome: 'CONFIRMED' },
      { date: '2026-07-15', shape: 'A', validation_outcome: 'CONFIRMED' },
    ];
    const sc = computeScorecard(recs, { since: '2026-07-01' });
    expect(sc.overall.runs).toBe(1);
  });
});
