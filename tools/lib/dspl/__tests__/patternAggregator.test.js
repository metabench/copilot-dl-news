const { PatternAggregator } = require('../patternAggregator');

describe('PatternAggregator', () => {
  test('records counts, retains examples, and computes summary metrics', () => {
    const aggregator = new PatternAggregator({ maxExamples: 2 });

    aggregator.record('/world/{slug}', { url: 'https://example.com/world/italy' });
    aggregator.record('/world/{slug}', { url: 'https://example.com/world/germany' });
    aggregator.record('/world/{slug}');
    aggregator.record('/news/{slug}', { url: 'https://example.com/news/italy' });
    aggregator.record('/news/{slug}');

    const summary = aggregator.summary();

    expect(summary.totalExamples).toBe(5);
    expect(summary.patterns).toHaveLength(2);
    const worldPattern = summary.patterns[0];
    expect(worldPattern.pattern).toBe('/world/{slug}');
    expect(worldPattern.verified).toBe(true);
  expect(worldPattern.examples).toBe(2);
    expect(worldPattern.confidence).toBeCloseTo(0.6, 5);

    const newsPattern = summary.patterns[1];
    expect(newsPattern.pattern).toBe('/news/{slug}');
    expect(newsPattern.verified).toBe(false);
  expect(newsPattern.examples).toBe(1);
    expect(newsPattern.confidence).toBeCloseTo(0.4, 5);

    const debugEntries = aggregator.toDebugArray();
    const worldEntry = debugEntries.find((item) => item.pattern === '/world/{slug}');
    expect(worldEntry.examples.length).toBe(2);
  expect(worldEntry.examplesCount).toBe(2);
  });

  test('merges aggregators while respecting example limits', () => {
    const target = new PatternAggregator({ maxExamples: 1 });
    const source = new PatternAggregator();

    target.record('/world/{slug}', { url: 'https://example.com/world/brazil' });
    target.record('/world/{slug}', { url: 'https://example.com/world/argentina' });

    source.record('/world/{slug}', { url: 'https://example.com/world/peru' });
    source.record('/regional/{regionSlug}', { url: 'https://example.com/regional/bavaria' });

    target.mergeAggregator(source);

    const entries = target.toDebugArray();
    const worldEntry = entries.find((item) => item.pattern === '/world/{slug}');
    const regionalEntry = entries.find((item) => item.pattern === '/regional/{regionSlug}');

    expect(worldEntry.count).toBe(3);
    expect(worldEntry.examplesCount).toBe(3);
    expect(worldEntry.examples.length).toBe(1);
    expect(regionalEntry.count).toBe(1);
    expect(regionalEntry.examples.length).toBe(1);
  });
});
