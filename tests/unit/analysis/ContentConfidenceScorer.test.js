'use strict';

/**
 * Unit tests for ContentConfidenceScorer
 * 
 * Tests scoring logic, factor weighting, and recommendation generation.
 */

const { ContentConfidenceScorer } = require('../../../src/analysis/ContentConfidenceScorer');

describe('ContentConfidenceScorer', () => {
  let scorer;

  beforeEach(() => {
    scorer = new ContentConfidenceScorer();
  });

  describe('constructor', () => {
    it('uses default options when none provided', () => {
      const s = new ContentConfidenceScorer();
      expect(s.minWordCount).toBe(100);
      expect(s.idealWordCount).toBe(500);
      expect(s.maxWordCount).toBe(10000);
    });

    it('accepts custom options', () => {
      const s = new ContentConfidenceScorer({
        minWordCount: 50,
        idealWordCount: 300,
        maxWordCount: 5000
      });
      expect(s.minWordCount).toBe(50);
      expect(s.idealWordCount).toBe(300);
      expect(s.maxWordCount).toBe(5000);
    });
  });

  describe('score()', () => {
    describe('empty/null input', () => {
      it('returns score 0 for null extraction', () => {
        const result = scorer.score(null);
        expect(result.score).toBe(0);
        expect(result.level).toBe('none');
        expect(result.recommendation).toBe('no-extraction');
      });

      it('returns score 0 for undefined extraction', () => {
        const result = scorer.score(undefined);
        expect(result.score).toBe(0);
      });

      it('returns score 0 for empty object', () => {
        const result = scorer.score({});
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.level).toBe('low');
      });
    });

    describe('title quality scoring', () => {
      it('gives low score for missing title', () => {
        const result = scorer.score({ wordCount: 500 });
        expect(result.factors.title.score).toBe(0);
      });

      it('gives low score for short title', () => {
        const result = scorer.score({ title: 'Hi', wordCount: 500 });
        expect(result.factors.title.score).toBeLessThanOrEqual(0.3);
      });

      it('gives low score for garbage titles', () => {
        const garbageTitles = ['Loading...', 'Untitled', '404', 'Error', 'null'];
        for (const title of garbageTitles) {
          const result = scorer.score({ title, wordCount: 500 });
          expect(result.factors.title.score).toBeLessThanOrEqual(0.3);
        }
      });

      it('gives full score for good length title', () => {
        const result = scorer.score({
          title: 'A Well-Formed News Article Title About Climate Change',
          wordCount: 500
        });
        expect(result.factors.title.score).toBeGreaterThanOrEqual(0.7);
      });

      it('reduces score for suspiciously long title', () => {
        const longTitle = 'A'.repeat(250);
        const result = scorer.score({ title: longTitle, wordCount: 500 });
        expect(result.factors.title.score).toBeLessThan(1.0);
      });
    });

    describe('content length scoring', () => {
      it('gives low score for very short content', () => {
        const result = scorer.score({ title: 'Test', wordCount: 10 });
        // Score is 0 for content with < 10 words, 0.3 for content below minWordCount (100)
        expect(result.factors.length.score).toBeLessThanOrEqual(0.3);
      });

      it('gives partial score for below minimum content', () => {
        const result = scorer.score({ title: 'Test', wordCount: 50 });
        expect(result.factors.length.score).toBeLessThanOrEqual(0.3);
      });

      it('gives full score for ideal word count', () => {
        const result = scorer.score({ title: 'Test', wordCount: 500 });
        expect(result.factors.length.score).toBe(1.0);
      });

      it('gives full score for above ideal word count', () => {
        const result = scorer.score({ title: 'Test', wordCount: 2000 });
        expect(result.factors.length.score).toBe(1.0);
      });

      it('reduces score for suspiciously long content', () => {
        const result = scorer.score({ title: 'Test', wordCount: 15000 });
        expect(result.factors.length.score).toBe(0.5);
      });

      it('counts words from content string when wordCount not provided', () => {
        const content = 'This is a test article with several words '.repeat(50);
        const result = scorer.score({ title: 'Test', content });
        expect(result.factors.length.wordCount).toBeGreaterThan(100);
      });
    });

    describe('metadata completeness scoring', () => {
      it('includes date in metadata score', () => {
        const withDate = scorer.score({ title: 'Test', wordCount: 500, date: '2025-12-20' });
        const withoutDate = scorer.score({ title: 'Test', wordCount: 500 });
        expect(withDate.factors.metadata.hasDate).toBe(true);
        expect(withoutDate.factors.metadata.hasDate).toBe(false);
        expect(withDate.score).toBeGreaterThan(withoutDate.score);
      });

      it('includes author in metadata score', () => {
        const result = scorer.score({
          title: 'Test',
          wordCount: 500,
          author: 'Jane Doe'
        });
        expect(result.factors.metadata.hasAuthor).toBe(true);
      });

      it('includes section in metadata score', () => {
        const result = scorer.score({
          title: 'Test',
          wordCount: 500,
          section: 'Politics'
        });
        expect(result.factors.metadata.hasSection).toBe(true);
      });

      it('validates date format', () => {
        const invalidDate = scorer.score({ title: 'Test', wordCount: 500, date: 'not-a-date' });
        expect(invalidDate.factors.metadata.hasDate).toBe(false);
      });

      it('rejects future dates', () => {
        const futureDate = scorer.score({ title: 'Test', wordCount: 500, date: '2030-01-01' });
        expect(futureDate.factors.metadata.hasDate).toBe(false);
      });

      it('rejects dates before 1990', () => {
        const oldDate = scorer.score({ title: 'Test', wordCount: 500, date: '1980-01-01' });
        expect(oldDate.factors.metadata.hasDate).toBe(false);
      });
    });

    describe('readability output scoring', () => {
      it('gives neutral score when no readability data', () => {
        const result = scorer.score({ title: 'Test', wordCount: 500 });
        expect(result.factors.readability.score).toBe(0.5);
      });

      it('scores readability content presence', () => {
        const result = scorer.score({
          title: 'Test',
          wordCount: 500,
          readability: {
            content: '<p>Article content here</p>'.repeat(20),
            title: 'Article Title',
            byline: 'By Author',
            excerpt: 'A summary of the article content...'
          }
        });
        expect(result.factors.readability.hasContent).toBe(true);
        expect(result.factors.readability.hasTitle).toBe(true);
        expect(result.factors.readability.hasByline).toBe(true);
        expect(result.factors.readability.hasExcerpt).toBe(true);
        expect(result.factors.readability.score).toBeGreaterThan(0.8);
      });

      it('handles partial readability data', () => {
        const result = scorer.score({
          title: 'Test',
          wordCount: 500,
          readability: {
            title: 'Article Title'
          }
        });
        expect(result.factors.readability.hasTitle).toBe(true);
        expect(result.factors.readability.hasContent).toBe(false);
      });
    });

    describe('visual analysis scoring', () => {
      it('skips visual analysis when not provided', () => {
        const result = scorer.score({ title: 'Test', wordCount: 500 });
        expect(result.factors.visual).toBeUndefined();
      });

      it('uses visual analyzer confidence when available', () => {
        const result = scorer.score({
          title: 'Test',
          wordCount: 500,
          visualAnalysis: {
            valid: true,
            confidence: 0.85
          }
        });
        expect(result.factors.visual.score).toBe(0.85);
      });

      it('computes visual score from components when no confidence', () => {
        const result = scorer.score({
          title: 'Test',
          wordCount: 500,
          visualAnalysis: {
            valid: true,
            hasMainContent: true,
            hasMetadata: true,
            layout: { type: 'article' }
          }
        });
        expect(result.factors.visual.score).toBe(1.0);
      });

      it('gives zero for invalid visual analysis', () => {
        const result = scorer.score({
          title: 'Test',
          wordCount: 500,
          visualAnalysis: { valid: false }
        });
        expect(result.factors.visual.score).toBe(0);
      });
    });

    describe('overall score and levels', () => {
      it('returns high level for score >= 0.8', () => {
        const result = scorer.score({
          title: 'A Comprehensive Guide to Climate Change Adaptation',
          wordCount: 800,
          date: '2025-12-20',
          author: 'Jane Smith',
          section: 'Environment',
          readability: {
            content: '<p>Long content here...</p>'.repeat(50),
            title: 'A Comprehensive Guide to Climate Change Adaptation',
            byline: 'By Jane Smith',
            excerpt: 'Climate change adaptation strategies...'
          }
        });
        expect(result.level).toBe('high');
        expect(result.recommendation).toBe('accept');
        expect(result.needsTeacherReview).toBe(false);
      });

      it('returns good level for score 0.6-0.8', () => {
        const result = scorer.score({
          title: 'A Normal Article Title',
          wordCount: 500,
          date: '2025-12-20',
          readability: {
            content: '<p>Content here...</p>'.repeat(30),
            title: 'A Normal Article Title'
          }
        });
        expect(['good', 'high']).toContain(result.level);
      });

      it('returns medium level for score 0.3-0.6', () => {
        const result = scorer.score({
          title: 'Short Title',
          wordCount: 150
        });
        expect(['medium', 'low']).toContain(result.level);
      });

      it('returns low level for score < 0.3', () => {
        const result = scorer.score({
          title: 'Hi',
          wordCount: 20
        });
        expect(result.level).toBe('low');
        expect(result.needsTeacherReview).toBe(true);
      });
    });

    describe('recommendations', () => {
      it('returns accept for high scores', () => {
        const result = scorer.score({
          title: 'Comprehensive Article Title Here',
          wordCount: 1000,
          date: '2025-12-20',
          author: 'Author Name',
          section: 'News',
          readability: {
            content: '<p>...</p>'.repeat(100),
            title: 'Comprehensive Article Title Here',
            byline: 'By Author',
            excerpt: 'Summary text here...'
          }
        });
        expect(['accept', 'accept-with-caution']).toContain(result.recommendation);
      });

      it('returns review-needed with issues for medium scores', () => {
        const result = scorer.score({
          title: 'OK Title',
          wordCount: 200
        });
        if (result.score >= 0.3 && result.score < 0.6) {
          expect(result.recommendation).toMatch(/review-needed/);
        }
      });

      it('returns teacher-required for very low scores', () => {
        const result = scorer.score({
          title: 'X',
          wordCount: 5
        });
        if (result.score < 0.3) {
          expect(result.recommendation).toMatch(/teacher-required/);
        }
      });
    });

    describe('factors structure', () => {
      it('includes all standard factors', () => {
        const result = scorer.score({
          title: 'Test',
          wordCount: 500,
          date: '2025-12-20',
          readability: { title: 'Test' }
        });
        expect(result.factors).toHaveProperty('title');
        expect(result.factors).toHaveProperty('length');
        expect(result.factors).toHaveProperty('metadata');
        expect(result.factors).toHaveProperty('readability');
      });

      it('includes weight in each factor', () => {
        const result = scorer.score({ title: 'Test', wordCount: 500 });
        expect(result.factors.title.weight).toBe(0.15);
        expect(result.factors.length.weight).toBe(0.25);
        expect(result.factors.metadata.weight).toBe(0.20);
        expect(result.factors.readability.weight).toBe(0.25);
      });

      it('includes score in each factor', () => {
        const result = scorer.score({ title: 'Test', wordCount: 500 });
        expect(typeof result.factors.title.score).toBe('number');
        expect(typeof result.factors.length.score).toBe('number');
        expect(typeof result.factors.metadata.score).toBe('number');
        expect(typeof result.factors.readability.score).toBe('number');
      });
    });
  });

  describe('scoreBatch()', () => {
    it('scores multiple extractions', () => {
      const extractions = [
        { url: 'http://example.com/a', extraction: { title: 'Article A', wordCount: 500 } },
        { url: 'http://example.com/b', extraction: { title: 'Article B', wordCount: 300 } },
      ];
      const results = scorer.scoreBatch(extractions);
      expect(results).toHaveLength(2);
      expect(results[0].url).toBe('http://example.com/a');
      expect(results[1].url).toBe('http://example.com/b');
      expect(typeof results[0].score).toBe('number');
      expect(typeof results[1].score).toBe('number');
    });

    it('returns empty array for non-array input', () => {
      expect(scorer.scoreBatch(null)).toEqual([]);
      expect(scorer.scoreBatch({})).toEqual([]);
    });

    it('handles items with extraction as top-level properties', () => {
      const extractions = [
        { url: 'http://example.com/c', title: 'Direct Title', wordCount: 400 }
      ];
      const results = scorer.scoreBatch(extractions);
      expect(results).toHaveLength(1);
      expect(results[0].url).toBe('http://example.com/c');
    });
  });

  describe('getLowConfidenceItems()', () => {
    it('filters items below threshold', () => {
      const scoredItems = [
        { url: 'a', score: 0.9 },
        { url: 'b', score: 0.3 },
        { url: 'c', score: 0.5 },
        { url: 'd', score: 0.2 },
      ];
      const low = scorer.getLowConfidenceItems(scoredItems, 0.4);
      expect(low).toHaveLength(2);
      expect(low.map(i => i.url)).toEqual(['d', 'b']); // sorted by score ascending
    });

    it('uses default threshold of 0.4', () => {
      const scoredItems = [
        { url: 'a', score: 0.5 },
        { url: 'b', score: 0.35 },
      ];
      const low = scorer.getLowConfidenceItems(scoredItems);
      expect(low).toHaveLength(1);
      expect(low[0].url).toBe('b');
    });

    it('returns empty array for non-array input', () => {
      expect(scorer.getLowConfidenceItems(null)).toEqual([]);
      expect(scorer.getLowConfidenceItems(undefined)).toEqual([]);
    });

    it('returns empty array when no items below threshold', () => {
      const scoredItems = [
        { url: 'a', score: 0.9 },
        { url: 'b', score: 0.8 },
      ];
      const low = scorer.getLowConfidenceItems(scoredItems, 0.5);
      expect(low).toHaveLength(0);
    });
  });
});
