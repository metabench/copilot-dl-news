'use strict';

const { StepGate } = require('../StepGate');

describe('StepGate', () => {
  test('does nothing when disabled', async () => {
    const gate = new StepGate();
    expect(gate.enabled).toBe(false);

    const p = gate.beginAwait({ fromStageId: 'a', nextStageId: 'b' });
    expect(p).toBe(null);
    expect(gate.next()).toBe(false);
  });

  test('awaits until next() is called', async () => {
    const gate = new StepGate();
    gate.enable(true);

    const p = gate.beginAwait({ fromStageId: 'validating', nextStageId: 'counting', detail: { x: 1 } });
    expect(p).toBeInstanceOf(Promise);

    const state = gate.getState();
    expect(state.enabled).toBe(true);
    expect(state.awaiting).toBe(true);
    expect(state.fromStageId).toBe('validating');
    expect(state.nextStageId).toBe('counting');
    expect(state.detail).toEqual({ x: 1 });

    expect(gate.next()).toBe(true);
    await expect(p).resolves.toBe(true);

    const state2 = gate.getState();
    expect(state2.awaiting).toBe(false);
  });

  test('cancel() rejects the await promise', async () => {
    const gate = new StepGate();
    gate.enable(true);

    const p = gate.beginAwait({ fromStageId: 'a', nextStageId: 'b' });
    expect(gate.cancel('nope')).toBe(true);

    await expect(p).rejects.toMatchObject({ code: 'STEP_CANCELLED' });
    expect(gate.getState().awaiting).toBe(false);
  });
});
