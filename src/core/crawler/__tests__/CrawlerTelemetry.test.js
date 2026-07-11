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

  describe('CRAWLER_LOG_QUEUE_DROPS stderr mirroring (cycle 10)', () => {
    let stderrSpy;
    let originalEnv;

    beforeEach(() => {
      originalEnv = process.env.CRAWLER_LOG_QUEUE_DROPS;
      stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
      stderrSpy.mockRestore();
      if (originalEnv === undefined) {
        delete process.env.CRAWLER_LOG_QUEUE_DROPS;
      } else {
        process.env.CRAWLER_LOG_QUEUE_DROPS = originalEnv;
      }
    });

    const written = () => stderrSpy.mock.calls.map((c) => String(c[0])).join('');

    test('knob off: drop events are not mirrored to stderr', () => {
      delete process.env.CRAWLER_LOG_QUEUE_DROPS;
      const events = { emitQueueEvent: jest.fn() };
      const telemetry = new CrawlerTelemetry({ events });

      telemetry.queueEvent({ action: 'drop', url: 'https://example.com/a', reason: 'overflow' });

      expect(written()).toBe('');
      expect(events.emitQueueEvent).toHaveBeenCalledTimes(1);
    });

    test('knob on: drop events are mirrored with reason/url/queueSize', () => {
      process.env.CRAWLER_LOG_QUEUE_DROPS = '1';
      const events = { emitQueueEvent: jest.fn() };
      const telemetry = new CrawlerTelemetry({ events });

      telemetry.queueEvent({
        action: 'drop',
        url: 'https://example.com/seed',
        reason: 'robots-disallow',
        depth: 0,
        host: 'example.com',
        queueSize: 12
      });

      const line = written();
      expect(line).toContain('[queue] action=drop');
      expect(line).toContain('reason=robots-disallow');
      expect(line).toContain('url=https://example.com/seed');
      expect(line).toContain('queueSize=12');
    });

    test('knob on: fetch-skip, seed-enqueue and dequeued mirror via enhanced channel', () => {
      process.env.CRAWLER_LOG_QUEUE_DROPS = '1';
      const events = { emitQueueEvent: jest.fn(), emitEnhancedQueueEvent: jest.fn() };
      const telemetry = new CrawlerTelemetry({ events });

      telemetry.enhancedQueueEvent({ action: 'fetch-skip', url: 'https://example.com/seed', reason: 'already-visited' });
      telemetry.enhancedQueueEvent({ action: 'seed-enqueue', url: 'https://example.com/seed', reason: 'accepted' });
      telemetry.enhancedQueueEvent({ action: 'dequeued', url: 'https://example.com/seed', depth: 0 });

      const line = written();
      expect(line).toContain('action=fetch-skip');
      expect(line).toContain('reason=already-visited');
      expect(line).toContain('action=seed-enqueue');
      expect(line).toContain('action=dequeued');
      expect(events.emitEnhancedQueueEvent).toHaveBeenCalledTimes(3);
    });

    test('knob on: enqueued events are never mirrored', () => {
      process.env.CRAWLER_LOG_QUEUE_DROPS = '1';
      const events = { emitQueueEvent: jest.fn(), emitEnhancedQueueEvent: jest.fn() };
      const telemetry = new CrawlerTelemetry({ events });

      telemetry.enhancedQueueEvent({ action: 'enqueued', url: 'https://example.com/x', queueSize: 3 });

      expect(written()).toBe('');
    });

    test('falsy knob values (0/false/off) disable mirroring', () => {
      const events = { emitQueueEvent: jest.fn() };
      const telemetry = new CrawlerTelemetry({ events });
      for (const value of ['0', 'false', 'off', '']) {
        process.env.CRAWLER_LOG_QUEUE_DROPS = value;
        telemetry.queueEvent({ action: 'drop', url: 'https://example.com/y', reason: 'dup' });
      }
      expect(written()).toBe('');
    });

    test('fallback path mirrors exactly once', () => {
      process.env.CRAWLER_LOG_QUEUE_DROPS = '1';
      const events = { emitQueueEvent: jest.fn() };
      const telemetry = new CrawlerTelemetry({ events });

      telemetry.enhancedQueueEvent({ action: 'drop', url: 'https://example.com/z', reason: 'dup' });

      const occurrences = written().split('[queue]').length - 1;
      expect(occurrences).toBe(1);
    });
  });
});
