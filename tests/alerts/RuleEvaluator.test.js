'use strict';

/**
 * Tests for RuleEvaluator
 */

const { RuleEvaluator, CONDITION_TYPES, OPERATORS, LOGICAL } = require('../../src/alerts/RuleEvaluator');
const { sampleArticles, sampleRules, invalidConditions } = require('./fixtures');

describe('RuleEvaluator', () => {
  let evaluator;

  beforeEach(() => {
    evaluator = new RuleEvaluator();
  });

  describe('Constants', () => {
    test('CONDITION_TYPES are defined', () => {
      expect(CONDITION_TYPES.KEYWORD_MATCH).toBe('keyword_match');
      expect(CONDITION_TYPES.ENTITY_MENTION).toBe('entity_mention');
      expect(CONDITION_TYPES.CATEGORY_MATCH).toBe('category_match');
      expect(CONDITION_TYPES.SENTIMENT_THRESHOLD).toBe('sentiment_threshold');
      expect(CONDITION_TYPES.BREAKING_NEWS).toBe('breaking_news');
    });

    test('OPERATORS are defined', () => {
      expect(OPERATORS.LT).toBe('<');
      expect(OPERATORS.GT).toBe('>');
      expect(OPERATORS.EQ).toBe('==');
    });

    test('LOGICAL operators are defined', () => {
      expect(LOGICAL.AND).toBe('AND');
      expect(LOGICAL.OR).toBe('OR');
      expect(LOGICAL.NOT).toBe('NOT');
    });
  });

  describe('evaluate()', () => {
    describe('keyword_match', () => {
      test('matches keyword in title', () => {
        const result = evaluator.evaluate(
          sampleRules.keywordAlert,
          sampleArticles.techNews
        );
        expect(result.matches).toBe(true);
      });

      test('matches keyword in body', () => {
        const rule = {
          conditions: { type: 'keyword_match', keywords: ['camera'] }
        };
        const result = evaluator.evaluate(rule, sampleArticles.techNews);
        expect(result.matches).toBe(true);
      });

      test('case insensitive match', () => {
        const rule = {
          conditions: { type: 'keyword_match', keywords: ['APPLE'] }
        };
        const result = evaluator.evaluate(rule, sampleArticles.techNews);
        expect(result.matches).toBe(true);
      });

      test('returns false when no keywords match', () => {
        const rule = {
          conditions: { type: 'keyword_match', keywords: ['google', 'android'] }
        };
        const result = evaluator.evaluate(rule, sampleArticles.techNews);
        expect(result.matches).toBe(false);
      });
    });

    describe('entity_mention', () => {
      test('matches entity by type and name', () => {
        const result = evaluator.evaluate(
          sampleRules.entityAlert,
          sampleArticles.politicsNews,
          { entities: sampleArticles.politicsNews.entities }
        );
        expect(result.matches).toBe(true);
      });

      test('matches entity by type only', () => {
        const rule = {
          conditions: { type: 'entity_mention', entityType: 'ORGANIZATION' }
        };
        const result = evaluator.evaluate(
          rule,
          sampleArticles.techNews,
          { entities: sampleArticles.techNews.entities }
        );
        expect(result.matches).toBe(true);
      });

      test('returns false when entity not found', () => {
        const rule = {
          conditions: { type: 'entity_mention', entityType: 'PERSON' }
        };
        const result = evaluator.evaluate(
          rule,
          sampleArticles.techNews,
          { entities: sampleArticles.techNews.entities }
        );
        expect(result.matches).toBe(false);
      });
    });

    describe('category_match', () => {
      test('matches category', () => {
        const result = evaluator.evaluate(
          sampleRules.categoryAlert,
          sampleArticles.techNews,
          { category: 'technology' }
        );
        expect(result.matches).toBe(true);
      });

      test('uses article.category when context not provided', () => {
        const result = evaluator.evaluate(
          sampleRules.categoryAlert,
          sampleArticles.techNews
        );
        expect(result.matches).toBe(true);
      });

      test('returns false when category does not match', () => {
        const result = evaluator.evaluate(
          sampleRules.categoryAlert,
          sampleArticles.politicsNews
        );
        expect(result.matches).toBe(false);
      });
    });

    describe('sentiment_threshold', () => {
      test('matches negative sentiment below threshold', () => {
        const result = evaluator.evaluate(
          sampleRules.sentimentAlert,
          sampleArticles.negativeNews,
          { sentiment: sampleArticles.negativeNews.sentiment }
        );
        expect(result.matches).toBe(true);
      });

      test('returns false when sentiment above threshold', () => {
        const result = evaluator.evaluate(
          sampleRules.sentimentAlert,
          sampleArticles.techNews,
          { sentiment: sampleArticles.techNews.sentiment }
        );
        expect(result.matches).toBe(false);
      });

      test('handles all operators', () => {
        const article = { ...sampleArticles.techNews };
        const context = { sentiment: { score: 0.5 } };

        // Test >
        const gtRule = { conditions: { type: 'sentiment_threshold', operator: '>', threshold: 0.3 } };
        expect(evaluator.evaluate(gtRule, article, context).matches).toBe(true);

        // Test ==
        const eqRule = { conditions: { type: 'sentiment_threshold', operator: '==', threshold: 0.5 } };
        expect(evaluator.evaluate(eqRule, article, context).matches).toBe(true);

        // Test >=
        const gteRule = { conditions: { type: 'sentiment_threshold', operator: '>=', threshold: 0.5 } };
        expect(evaluator.evaluate(gteRule, article, context).matches).toBe(true);
      });
    });

    describe('source_match', () => {
      test('matches source domain', () => {
        const rule = {
          conditions: { type: 'source_match', sources: ['techcrunch.com'] }
        };
        const result = evaluator.evaluate(rule, sampleArticles.techNews);
        expect(result.matches).toBe(true);
      });

      test('matches partial source', () => {
        const rule = {
          conditions: { type: 'source_match', sources: ['nytimes'] }
        };
        const result = evaluator.evaluate(rule, sampleArticles.politicsNews);
        expect(result.matches).toBe(true);
      });
    });

    describe('breaking_news', () => {
      test('matches when isBreakingNews flag is true', () => {
        const rule = {
          conditions: { type: 'breaking_news' }
        };
        const result = evaluator.evaluate(
          rule,
          sampleArticles.breakingNews,
          { isBreakingNews: true }
        );
        expect(result.matches).toBe(true);
      });

      test('matches breaking keywords in title', () => {
        const rule = {
          conditions: { type: 'breaking_news' }
        };
        const result = evaluator.evaluate(rule, sampleArticles.breakingNews);
        expect(result.matches).toBe(true);
      });
    });

    describe('Complex conditions (AND/OR/NOT)', () => {
      test('AND logic requires all conditions', () => {
        const result = evaluator.evaluate(
          sampleRules.complexAlert,
          sampleArticles.techNews,
          { category: 'technology' }
        );
        expect(result.matches).toBe(true);
      });

      test('AND fails when one condition fails', () => {
        const result = evaluator.evaluate(
          sampleRules.complexAlert,
          sampleArticles.politicsNews,
          { category: 'politics' }
        );
        expect(result.matches).toBe(false);
      });

      test('OR logic requires at least one condition', () => {
        const rule = {
          conditions: {
            logic: 'OR',
            conditions: [
              { type: 'keyword_match', keywords: ['apple'] },
              { type: 'category_match', categories: ['politics'] }
            ]
          }
        };
        const result = evaluator.evaluate(rule, sampleArticles.techNews);
        expect(result.matches).toBe(true);
      });

      test('NOT logic inverts result', () => {
        const rule = {
          conditions: {
            logic: 'NOT',
            conditions: [
              { type: 'category_match', categories: ['politics'] }
            ]
          }
        };
        const result = evaluator.evaluate(
          rule, 
          sampleArticles.techNews,
          { category: 'technology' }
        );
        expect(result.matches).toBe(true);
      });

      test('Nested conditions work correctly', () => {
        const rule = {
          conditions: {
            logic: 'AND',
            conditions: [
              {
                logic: 'OR',
                conditions: [
                  { type: 'keyword_match', keywords: ['apple'] },
                  { type: 'keyword_match', keywords: ['google'] }
                ]
              },
              { type: 'category_match', categories: ['technology'] }
            ]
          }
        };
        const result = evaluator.evaluate(
          rule,
          sampleArticles.techNews,
          { category: 'technology' }
        );
        expect(result.matches).toBe(true);
      });
    });
  });

  describe('validateRule()', () => {
    test('validates correct rule', () => {
      const result = evaluator.validateRule(sampleRules.keywordAlert);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('rejects rule without conditions', () => {
      const result = evaluator.validateRule({ name: 'Test' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Rule must have conditions');
    });

    test('rejects unknown condition type', () => {
      const result = evaluator.validateRule({ 
        conditions: invalidConditions.unknownType 
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Unknown condition type'))).toBe(true);
    });

    test('rejects keyword_match without keywords', () => {
      const result = evaluator.validateRule({ 
        conditions: invalidConditions.missingKeywords 
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('keywords'))).toBe(true);
    });

    test('rejects invalid operator', () => {
      const result = evaluator.validateRule({ 
        conditions: invalidConditions.invalidOperator 
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('operator'))).toBe(true);
    });

    test('rejects empty logic conditions', () => {
      const result = evaluator.validateRule({ 
        conditions: invalidConditions.emptyLogic 
      });
      expect(result.valid).toBe(false);
    });
  });
});
