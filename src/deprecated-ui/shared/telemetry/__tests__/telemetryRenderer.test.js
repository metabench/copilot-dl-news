import { formatTelemetryEntry, renderTelemetryEntry, renderTelemetryList } from '../telemetryRenderer.js';

describe('telemetryRenderer', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('normalizes ISO string timestamps without throwing', () => {
    const targetTime = '2025-10-08T12:00:00Z';
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(new Date('2025-10-08T12:00:01Z').getTime());

    const formatted = formatTelemetryEntry({
      type: 'completed',
      message: 'Crawl finished',
      timestamp: targetTime
    });

    expect(formatted.timestamp).toBe(new Date(targetTime).getTime());
    expect(formatted.formattedTimestamp).toBe('2025-10-08T12:00:00.000Z');
    expect(formatted.relativeTime).toBe('1s ago');
    expect(() => new Date(formatted.timestamp).toISOString()).not.toThrow();

    nowSpy.mockRestore();
  });

  it('falls back to Date.now when timestamp is missing', () => {
    const reference = 1750000000000;
    jest.spyOn(Date, 'now').mockReturnValue(reference);

    const formatted = formatTelemetryEntry({
      type: 'info',
      message: 'No timestamp provided'
    });

    expect(formatted.timestamp).toBe(reference);
    expect(formatted.formattedTimestamp).toBe(new Date(reference).toISOString());
    expect(formatted.type).toBe('info');
  });

  it('honors Date instances and context-provided stage', () => {
    const timestamp = new Date('2025-10-08T12:30:00Z');

    const formatted = formatTelemetryEntry({
      type: 'stage_transition',
      message: 'Moving to processing',
      context: { stage: 'processing' },
      timestamp
    });

    expect(formatted.stage).toBe('processing');
    expect(formatted.formattedTimestamp).toBe('2025-10-08T12:30:00.000Z');
    expect(formatted.icon).toBe('➡️');
    expect(formatted.severity).toBe('medium');
  });

  it('returns a safe fallback for invalid entries', () => {
    const reference = 1750000000500;
    jest.spyOn(Date, 'now').mockReturnValue(reference);

    const formatted = formatTelemetryEntry(null);

    expect(formatted.message).toBe('Invalid telemetry entry');
    expect(formatted.timestamp).toBe(reference);
    expect(formatted.formattedTimestamp).toBe(new Date(reference).toISOString());
    expect(formatted.icon).toBe('ℹ️');
  });

  it('escapes HTML when rendering telemetry entries', () => {
    const html = renderTelemetryEntry({
      type: 'warning',
      message: '<script>alert("xss")</script>',
      timestamp: '2025-10-08T12:00:00Z',
      stage: '<Main>'
    });

    expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(html).toContain('&lt;Main&gt;');
  });

  it('renders an empty list placeholder when no entries are present', () => {
    const html = renderTelemetryList([]);
    expect(html).toContain('No telemetry events yet');
  });
});
