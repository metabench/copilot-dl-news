'use strict';

const { PlannerTelemetryBridge } = require('../PlannerTelemetryBridge');
const { PlannerOrchestrator } = require('../PlannerOrchestrator');

describe('PlannerOrchestrator', () => {
  const createTelemetryMock = () => ({
    plannerStage: jest.fn(),
    milestone: jest.fn(),
    milestoneOnce: jest.fn(),
    problem: jest.fn()
  });

  const createLoggerMock = () => ({
    log: jest.fn(),
    warn: jest.fn()
  });

  const newOrchestrator = ({ enabled = true } = {}) => {
    const telemetryMock = createTelemetryMock();
    const telemetryBridge = new PlannerTelemetryBridge({
      telemetry: telemetryMock,
      domain: 'example.com',
      logger: createLoggerMock()
    });
    const orchestrator = new PlannerOrchestrator({
      telemetryBridge,
      logger: createLoggerMock(),
      enabled
    });
    return { orchestrator, telemetryMock };
  };

  test('emits stage events when enabled', async () => {
    const { orchestrator, telemetryMock } = newOrchestrator();

    const result = await orchestrator.runStage(
      'bootstrap',
      { host: 'example.com' },
      async () => ({ value: 42 }),
      {
        mapResultForEvent: (res) => ({ value: res.value }),
        updateSummaryWithResult: (summary, res) => ({ ...summary, value: res.value })
      }
    );

    expect(result).toEqual({ value: 42 });
    expect(telemetryMock.plannerStage).toHaveBeenCalledTimes(2);
    const [startCall, completeCall] = telemetryMock.plannerStage.mock.calls;

    expect(startCall[0]).toMatchObject({
      stage: 'bootstrap',
      status: 'started',
      details: {
        context: { host: 'example.com' }
      }
    });

    expect(completeCall[0]).toMatchObject({
      stage: 'bootstrap',
      status: 'completed',
      details: {
        context: { host: 'example.com' },
        result: { value: 42 }
      }
    });

    const summary = orchestrator.buildSummary();
    expect(summary).toMatchObject({ value: 42 });
  });

  test('skips telemetry when disabled', async () => {
    const { orchestrator, telemetryMock } = newOrchestrator({ enabled: false });

    const result = await orchestrator.runStage('noop', null, async () => 'ok');

    expect(result).toBe('ok');
    expect(telemetryMock.plannerStage).not.toHaveBeenCalled();
  });

  test('emits failure event on error', async () => {
    const { orchestrator, telemetryMock } = newOrchestrator();
    const error = new Error('boom');

    await expect(
      orchestrator.runStage('explode', { attempt: 1 }, async () => {
        throw error;
      })
    ).rejects.toThrow('boom');

    expect(telemetryMock.plannerStage).toHaveBeenCalledTimes(2);
    const [, failureCall] = telemetryMock.plannerStage.mock.calls;
    expect(failureCall[0]).toMatchObject({
      stage: 'explode',
      status: 'failed',
      details: {
        context: { attempt: 1 },
        error: { message: 'boom' }
      }
    });
  });
});
