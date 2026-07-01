'use strict';

const { openNewsCrawlerDb } = require('../../db/openNewsCrawlerDb');
const { createPlaceHubUrlPatternsStore } = require('../../data/db/placeHubUrlPatternsStore');
const { PlaceHubPatternLearningService } = require('../PlaceHubPatternLearningService');

describe('PlaceHubPatternLearningService runtime predictions', () => {
  let db;

  beforeEach(() => {
    db = openNewsCrawlerDb(':memory:');
  });

  afterEach(() => {
    if (db && db.open) db.close();
  });

  test('matches stored full-URL place hub patterns before heuristic fallback', () => {
    const store = createPlaceHubUrlPatternsStore(db);
    store.savePattern({
      domain: 'www.theguardian.com',
      patternType: 'world-country',
      patternRegex: '^https?:\\/\\/(www\\.)?theguardian\\.com\\/world\\/([a-z][a-z0-9-]+)\\/?$',
      patternDescription: 'Guardian country hub',
      placeKind: 'country-hub',
      sampleCount: 3,
      exampleUrls: ['https://www.theguardian.com/world/france'],
      accuracy: 0.75
    });

    const service = new PlaceHubPatternLearningService({
      db,
      logger: { debug() {}, error() {}, info() {}, log() {}, warn() {} }
    });

    expect(service.predictPlaceHub('https://www.theguardian.com/world/france', 'www.theguardian.com'))
      .toMatchObject({
        isPlaceHub: true,
        confidence: 0.75,
        placeKind: 'country-hub',
        pattern: expect.objectContaining({ pattern_type: 'world-country' })
      });
  });

  test('does not classify date-like article paths as place hubs by fallback heuristic', () => {
    const service = new PlaceHubPatternLearningService({
      db,
      logger: { debug() {}, error() {}, info() {}, log() {}, warn() {} }
    });

    expect(service.predictPlaceHub(
      'https://www.theguardian.com/world/2026/jun/14/not-a-hub-story',
      'www.theguardian.com'
    )).toMatchObject({
      isPlaceHub: false,
      confidence: 0
    });
  });
});
