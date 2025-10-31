const { TopicHubGapAnalyzer } = require('../TopicHubGapAnalyzer');
const { createTempDb } = require('../../test-utils/db-helpers');

describe('TopicHubGapAnalyzer', () => {
  let db, analyzer;

  beforeEach(() => {
    db = createTempDb();

    // Create and seed topic_keywords table
    db.prepare(`
      CREATE TABLE IF NOT EXISTS topic_keywords (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        topic TEXT NOT NULL,
        lang TEXT NOT NULL,
        term TEXT NOT NULL,
        normalized TEXT NOT NULL,
        source TEXT,
        metadata JSON
      )
    `).run();

    db.prepare(`
      INSERT INTO topic_keywords (topic, lang, term, normalized)
      VALUES ('sport', 'en', 'sport', 'sport'), ('politics', 'en', 'politics', 'politics'), ('technology', 'en', 'technology', 'technology')
    `).run();

    analyzer = new TopicHubGapAnalyzer({ db });
  });  afterEach(() => {
    db.close();
  });

  test('getTopTopics returns topic entities', () => {
    const topics = analyzer.getTopTopics(10);

    expect(topics.length).toBeGreaterThan(0);
    expect(topics[0]).toHaveProperty('slug');
    expect(topics[0]).toHaveProperty('name');
    expect(topics[0]).toHaveProperty('category');
  });

  test('getTopTopics respects limit parameter', () => {
    const topics = analyzer.getTopTopics(2);
    expect(topics.length).toBe(2);
  });

  test('predictTopicHubUrls generates candidate URLs', () => {
    const topic = { slug: 'sport', name: 'Sport', category: 'news' };
    const predictions = analyzer.predictTopicHubUrls('theguardian.com', topic);

    expect(predictions.length).toBeGreaterThan(0);
    expect(predictions[0].url).toContain('theguardian.com');
    expect(predictions[0].url).toContain('sport');
    expect(predictions[0].confidence).toBe(0.7);
    expect(predictions[0].source).toBe('topic-analyzer');
    expect(predictions[0].topic.slug).toBe('sport');
  });

  test('predictTopicHubUrls returns empty array for invalid input', () => {
    expect(analyzer.predictTopicHubUrls(null, {})).toEqual([]);
    expect(analyzer.predictTopicHubUrls('domain.com', null)).toEqual([]);
    expect(analyzer.predictTopicHubUrls('', {})).toEqual([]);
  });

  test('getEntityLabel returns topic', () => {
    expect(analyzer.getEntityLabel()).toBe('topic');
  });

  test('getFallbackPatterns returns topic-specific patterns', () => {
    const patterns = analyzer.getFallbackPatterns();
    expect(Array.isArray(patterns)).toBe(true);
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.some(p => p.includes('{slug}'))).toBe(true);
  });

  test('buildEntityMetadata extracts topic fields', () => {
    const topic = { slug: 'politics', name: 'Politics', category: 'news', lang: 'en' };
    const metadata = analyzer.buildEntityMetadata(topic);

    expect(metadata).toEqual({
      slug: 'politics',
      name: 'Politics',
      category: 'news',
      lang: 'en'
    });
  });

  test('buildEntityMetadata returns null for invalid topic', () => {
    expect(analyzer.buildEntityMetadata(null)).toBeNull();
    expect(analyzer.buildEntityMetadata({})).toBeNull();
    expect(analyzer.buildEntityMetadata({ name: 'test' })).toBeNull();
  });

  test('caches topic data', () => {
    // First call should load from database
    const topics1 = analyzer.getTopTopics(5);

    // Modify database (should not affect cached result)
    db.prepare(`INSERT INTO topic_keywords (topic, lang, term, normalized) VALUES ('new-topic', 'en', 'new-topic', 'new-topic')`).run();

    // Second call within cache duration should return cached data
    const topics2 = analyzer.getTopTopics(5);

    expect(topics1).toEqual(topics2);
    expect(topics2.some(t => t.slug === 'new-topic')).toBe(false);
  });
});