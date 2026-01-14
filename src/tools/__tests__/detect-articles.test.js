'use strict';

const ArticleSignalsService = require('../../core/crawler/ArticleSignalsService');
const { evaluateArticleCandidate } = require('../detect-articles');

describe('evaluateArticleCandidate', () => {
  let service;

  beforeEach(() => {
    service = new ArticleSignalsService();
  });

  test('classifies high word count news URL as article', () => {
    const result = evaluateArticleCandidate({
      url: 'https://example.com/world/2025/oct/15/sample-news-story',
      title: 'Sample News Story',
      articleWordCount: 620,
      fetchWordCount: null,
      articleAnalysis: JSON.stringify({
        content: {
          linkDensity: 0.12,
          h2: 3,
          h3: 1,
          a: 30,
          p: 8,
          wordCount: 620,
          schema: {
            score: 6.8,
            strength: 'strong',
            hasStructuredData: true,
            hasArticleType: true,
            articleTypes: ['newsarticle'],
            sources: ['json-ld']
          }
        }
      }),
      fetchAnalysis: null,
      latestClassification: 'article',
      navLinksCount: 20,
      articleLinksCount: 8
    }, { signalsService: service });

    expect(result.isArticle).toBe(true);
    expect(result.reasons.join(' ')).toEqual(expect.stringContaining('word-count: high'));
    expect(result.reasons.join(' ')).toEqual(expect.stringContaining('combined-signal: article'));
    expect(result.reasons.join(' ')).toEqual(expect.stringContaining('schema: strong article signals'));
    expect(result.rejections.length).toBeLessThanOrEqual(1);
  });

  test('rejects low word count navigation-like page', () => {
    const result = evaluateArticleCandidate({
      url: 'https://example.com/section/index',
      title: 'Example Section',
      articleWordCount: 40,
      fetchWordCount: 50,
      articleAnalysis: null,
      fetchAnalysis: JSON.stringify({
        content: {
          linkDensity: 0.45,
          h2: 0,
          h3: 0,
          a: 120,
          p: 1,
          wordCount: 50
        }
      }),
      latestClassification: 'nav',
      navLinksCount: 120,
      articleLinksCount: 4
    }, { signalsService: service });

    expect(result.isArticle).toBe(false);
    expect(result.rejections.join(' ')).toEqual(expect.stringContaining('word-count: low'));
    expect(result.rejections.join(' ')).toEqual(expect.stringContaining('combined-signal: nav'));
    expect(result.reasons.length).toBeLessThanOrEqual(1);
  });
});
