const { CrawlerTelemetry } = require('../CrawlerTelemetry');

describe('CrawlerTelemetry', () => {
  test('progress forwards force flag correctly', () => {
    const events = { emitProgress: jest.fn() };
    const telemetry = new CrawlerTelemetry({ events });

    telemetry.progress(true);
    expect(events.emitProgress).toHaveBeenCalledWith({ force: true });

    telemetry.progress();
    expect(events.emitProgress).toHaveBeenLastCalledWith({ force: false });
  });

  test('progress forwards additional options', () => {
    const events = { emitProgress: jest.fn() };
    const telemetry = new CrawlerTelemetry({ events });

    telemetry.progress({ force: true, stage: 'preparing', patch: { statusText: 'opening db' } });

    expect(events.emitProgress).toHaveBeenCalledWith({
      force: true,
      stage: 'preparing',
      patch: { statusText: 'opening db' }
    });
  });

  test('queueEvent forwards a copy of the payload', () => {
    const events = { emitQueueEvent: jest.fn() };
    const telemetry = new CrawlerTelemetry({ events });
    const original = { action: 'enqueued', url: 'https://example.com', queueSize: 3 };

    telemetry.queueEvent(original);

    expect(events.emitQueueEvent).toHaveBeenCalledTimes(1);
    const emitted = events.emitQueueEvent.mock.calls[0][0];
    expect(emitted).toEqual(original);
    expect(emitted).not.toBe(original);
    expect(original).toEqual({ action: 'enqueued', url: 'https://example.com', queueSize: 3 });
  });

  test('enhancedQueueEvent falls back to queueEvent when enhanced emitter missing', () => {
    const events = { emitQueueEvent: jest.fn() };
    const telemetry = new CrawlerTelemetry({ events });
    const payload = { action: 'retry', reason: 'error' };

    telemetry.enhancedQueueEvent(payload);

    expect(events.emitQueueEvent).toHaveBeenCalledWith({ action: 'retry', reason: 'error' });
  });

  test('enhancedQueueEvent prefers enhanced emitter when available', () => {
    const events = {
      emitQueueEvent: jest.fn(),
      emitEnhancedQueueEvent: jest.fn()
    };
    const telemetry = new CrawlerTelemetry({ events });
    const payload = { action: 'enqueued', priorityScore: 5 };

    telemetry.enhancedQueueEvent(payload);

    expect(events.emitEnhancedQueueEvent).toHaveBeenCalledWith({ action: 'enqueued', priorityScore: 5 });
    expect(events.emitQueueEvent).not.toHaveBeenCalled();
  });

  test('milestoneOnce falls back to milestone when once emitter missing', () => {
    const events = { emitMilestone: jest.fn() };
    const telemetry = new CrawlerTelemetry({ events });

    telemetry.milestoneOnce('key', { kind: 'test' });

    expect(events.emitMilestone).toHaveBeenCalledWith({ kind: 'test' });
  });

  test('milestoneOnce prefers dedicated emitter when available', () => {
    const events = {
      emitMilestone: jest.fn(),
      emitMilestoneOnce: jest.fn()
    };
    const telemetry = new CrawlerTelemetry({ events });

    telemetry.milestoneOnce('unique', { kind: 'test' });

    expect(events.emitMilestoneOnce).toHaveBeenCalledWith('unique', { kind: 'test' });
    expect(events.emitMilestone).not.toHaveBeenCalled();
  });

  test('problem summary returns null when unavailable', () => {
    const telemetry = new CrawlerTelemetry({ events: {} });
    expect(telemetry.getProblemSummary()).toBeNull();
  });

  test('problem summary delegates when available', () => {
    const summary = { counters: [{ kind: 'foo', count: 1 }], samples: { foo: {} } };
    const events = { getProblemSummary: jest.fn().mockReturnValue(summary) };
    const telemetry = new CrawlerTelemetry({ events });

    expect(telemetry.getProblemSummary()).toBe(summary);
    expect(events.getProblemSummary).toHaveBeenCalled();
  });
});
