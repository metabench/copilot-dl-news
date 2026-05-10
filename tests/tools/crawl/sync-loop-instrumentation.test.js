'use strict';

const { createInstrumentation } = require('../../../tools/crawl/lib/sync-loop-instrumentation');

describe('sync-loop-instrumentation', () => {
  test('onRoundSuccess records metrics and returns perfLine at cadence', () => {
    const instr = createInstrumentation({
      perfPrintEvery: 3,
      initialLimit: 5,
      budgetOptions: { enabled: false },
    });

    // Rounds 1 and 2 should not emit perfLine
    const r1 = instr.onRoundSuccess({ fetchMs: 100, ingestMs: 20, roundMs: 130, rows: 5, bytes: 2 });
    expect(r1.perfLine).toBeNull();
    const r2 = instr.onRoundSuccess({ fetchMs: 200, ingestMs: 40, roundMs: 250, rows: 10, bytes: 3 });
    expect(r2.perfLine).toBeNull();

    // Round 3 should emit perfLine
    const r3 = instr.onRoundSuccess({ fetchMs: 150, ingestMs: 30, roundMs: 190, rows: 7, bytes: 1 });
    expect(r3.perfLine).toBeTruthy();
    expect(r3.perfLine).toMatch(/perf p50\/p95/);
    expect(r3.perfLine).toMatch(/fetch=/);
    expect(r3.perfLine).toMatch(/rows\/s=/);
  });

  test('onRoundError increments round counter', () => {
    const instr = createInstrumentation({
      perfPrintEvery: 2,
      budgetOptions: { enabled: false },
    });

    instr.onRoundError(); // round 1
    const r2 = instr.onRoundSuccess({ fetchMs: 50, roundMs: 60, rows: 1 }); // round 2
    expect(r2.perfLine).toBeTruthy(); // should print at round 2
  });

  test('evaluateBudget returns null when budget disabled', () => {
    const instr = createInstrumentation({
      budgetOptions: { enabled: false },
    });

    const result = instr.evaluateBudget({ remoteContentBytes: 999999999, currentLimit: 5 });
    expect(result.budgetDecision).toBeNull();
    expect(result.backpressure).toBeNull();
    expect(result.transitioned).toBe(false);
  });

  test('evaluateBudget detects pressure and backpressure transition', () => {
    const instr = createInstrumentation({
      budgetOptions: { enabled: true, budgetMb: 100, reserveMb: 50 },
      initialLimit: 10,
      argOverrides: { 'min-limit': '1', 'max-limit': '25', 'max-concurrent': '10' },
    });

    // Under budget — should be normal
    const normal = instr.evaluateBudget({ remoteContentBytes: 50 * 1024 * 1024, currentLimit: 10 });
    expect(normal.budgetDecision.action).toBe('normal');

    // Over budget — should shrink
    const over = instr.evaluateBudget({ remoteContentBytes: 110 * 1024 * 1024, currentLimit: 10 });
    expect(over.budgetDecision.action).toBe('shrink');
    expect(over.transitioned).toBe(true);
    expect(over.backpressure).toBeTruthy();

    // Still shrink — no transition
    const stillOver = instr.evaluateBudget({ remoteContentBytes: 120 * 1024 * 1024, currentLimit: 5 });
    expect(stillOver.budgetDecision.action).toBe('shrink');
    expect(stillOver.transitioned).toBe(false);
    expect(stillOver.backpressure).toBeNull();

    // Way over budget+reserve — should pause
    const ceiling = instr.evaluateBudget({ remoteContentBytes: 160 * 1024 * 1024, currentLimit: 5 });
    expect(ceiling.budgetDecision.action).toBe('pause-crawl');
    expect(ceiling.transitioned).toBe(true);
  });

  test('printSummary returns perf summary', () => {
    const instr = createInstrumentation({
      budgetOptions: { enabled: false },
    });
    instr.onRoundSuccess({ fetchMs: 100, ingestMs: 20, roundMs: 130, rows: 5, bytes: 2 });
    const s = instr.printSummary();
    expect(s.samples).toBe(1);
    expect(s.fetchMs.p50).toBe(100);
  });

  test('getBackpressureState tracks last action', () => {
    const instr = createInstrumentation({
      budgetOptions: { enabled: true, budgetMb: 10, reserveMb: 5 },
      initialLimit: 5,
      argOverrides: { 'max-concurrent': '10' },
    });

    expect(instr.getBackpressureState().lastAction).toBe('normal');

    // Trigger shrink
    instr.evaluateBudget({ remoteContentBytes: 11 * 1024 * 1024, currentLimit: 5 });
    expect(instr.getBackpressureState().lastAction).toBe('shrink');
  });
});
