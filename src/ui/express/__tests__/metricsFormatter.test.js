const { touchMetrics, createMetricsFormatter } = require('../services/metricsFormatter');

describe('metricsFormatter utilities', () => {
  test('touchMetrics increments version only when data changes', () => {
    const metrics = {};

    expect(touchMetrics(metrics)).toBe(0);
    expect(metrics._version || 0).toBe(0);

    const v1 = touchMetrics(metrics, { dirty: true });
    expect(v1).toBe(1);
    expect(metrics._version).toBe(1);

    const v2 = touchMetrics(metrics);
    expect(v2).toBe(1);
    expect(metrics._version).toBe(1);

    const v3 = touchMetrics(metrics, { stage: 'running' });
    expect(v3).toBe(2);
    expect(metrics.stage).toBe('running');

    const v4 = touchMetrics(metrics, { stage: 'running' });
    expect(v4).toBe(2);

    const v5 = touchMetrics(metrics, { paused: true });
    expect(v5).toBe(3);
    expect(metrics.paused).toBe(true);
  });

  test('createMetricsFormatter caches buffer snapshots per version', () => {
    const metrics = { running: 0 };
    const formatter = createMetricsFormatter({
      getMetrics: () => metrics
    });

    const snap1 = formatter.getSnapshot();
    expect(Buffer.isBuffer(snap1.buffer)).toBe(true);
    expect(snap1.buffer.toString()).toBe(snap1.text);

    const etag1 = snap1.etag;

    touchMetrics(metrics, { dirty: true });
    const snap2 = formatter.getSnapshot();
    expect(snap2.etag).not.toBe(etag1);
    expect(snap2.buffer.toString()).toBe(snap2.text);

    const etag2 = snap2.etag;

    const snap3 = formatter.getSnapshot();
    expect(snap3.etag).toBe(etag2);

    const versionBefore = Number(metrics._version);
    const vAfterNoChange = touchMetrics(metrics);
    expect(vAfterNoChange).toBe(versionBefore);
    expect(metrics._version).toBe(versionBefore);
    const snap4 = formatter.getSnapshot();
    expect(snap4.etag).toBe(etag2);
  });
});
