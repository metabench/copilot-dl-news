'use strict';

/**
 * ContentConfidenceScorer tests — pins the ADAPTER contract.
 *
 * c203: the subject became a thin adapter over news-db-pure-analysis's
 * confidenceScorer; factors are FLAT NUMBERS now (the {score, weight}
 * wrapper is gone) and ramp internals are pinned upstream in the pure
 * package's own suite. This suite pins what the adapter owns: option
 * flow, the date→publishDate mapping, the flat factor surface, levels,
 * batch, and low-confidence filtering. Every value below was measured
 * against the live adapter before pinning.
 */

const { ContentConfidenceScorer } = require('../../../src/intelligence/analysis/ContentConfidenceScorer');

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
      const s = new ContentConfidenceScorer({ minWordCount: 50, idealWordCount: 300, maxWordCount: 5000 });
      expect(s.minWordCount).toBe(50);
      expect(s.idealWordCount).toBe(300);
      expect(s.maxWordCount).toBe(5000);
    });
  });

  describe('score()', () => {
    describe('empty/null input', () => {
      it('returns zero score for null extraction', () => {
        const result = scorer.score(null);
        expect(result.score).toBe(0);
        expect(result.level).toBe('none');
        expect(result.recommendation).toBe('no-extraction');
      });

      it('returns zero score for undefined extraction', () => {
        const result = scorer.score(undefined);
        expect(result.score).toBe(0);
        expect(result.level).toBe('none');
      });
    });

    describe('title quality scoring', () => {
      it('scores zero for missing title', () => {
        expect(scorer.score({ wordCount: 500 }).factors.title).toBe(0);
      });

      it('scores short and garbage titles low', () => {
        for (const title of ['Loading...', 'Untitled', '404', 'Error', 'null', 'Hi']) {
          expect(scorer.score({ title, wordCount: 500 }).factors.title).toBeLessThanOrEqual(0.3);
        }
      });

      it('reduces score for a suspiciously long title', () => {
        expect(scorer.score({ title: 'A'.repeat(250), wordCount: 500 }).factors.title).toBe(0.5);
      });

      it('scores a well-formed headline fully', () => {
        const r = scorer.score({ title: 'A Well-Formed News Article Title About Climate Change', wordCount: 500 });
        expect(r.factors.title).toBe(1);
      });
    });

    describe('content length scoring', () => {
      it('gives low score for very short content', () => {
        expect(scorer.score({ title: 'Test', wordCount: 10 }).factors.length).toBe(0.3);
      });

      it('gives full score for ideal word count', () => {
        expect(scorer.score({ title: 'Test', wordCount: 500 }).factors.length).toBe(1);
      });

      it('gives full score for above ideal word count', () => {
        expect(scorer.score({ title: 'Test', wordCount: 800 }).factors.length).toBe(1);
      });

      it('reduces score for suspiciously long content', () => {
        expect(scorer.score({ title: 'Test', wordCount: 20000 }).factors.length).toBe(0.5);
      });

      it('counts words from content string when wordCount not provided', () => {
        const words = Array.from({ length: 500 }, (_, i) => `w${i}`).join(' ');
        expect(scorer.score({ title: 'Test', content: words }).factors.length).toBe(1);
      });
    });

    describe('metadata completeness scoring', () => {
      it('scores zero with no metadata', () => {
        expect(scorer.score({ title: 'T', wordCount: 500 }).factors.metadata).toBe(0);
      });

      it('includes author in metadata score (author must be longer than one char)', () => {
        expect(scorer.score({ title: 'T', wordCount: 500, author: 'Jane Doe' }).factors.metadata).toBeCloseTo(0.3);
        // single-character author is junk by design upstream
        expect(scorer.score({ title: 'T', wordCount: 500, author: 'A' }).factors.metadata).toBe(0);
      });

      it('includes date in metadata score via the date→publishDate mapping', () => {
        expect(scorer.score({ title: 'T', wordCount: 500, date: '2024-05-01' }).factors.metadata).toBeCloseTo(0.4);
      });

      it('accepts publishDate directly', () => {
        expect(scorer.score({ title: 'T', wordCount: 500, publishDate: '2024-05-01' }).factors.metadata).toBeCloseTo(0.4);
      });

      it('includes section in metadata score', () => {
        expect(scorer.score({ title: 'T', wordCount: 500, section: 'World' }).factors.metadata).toBeCloseTo(0.3);
      });

      it('scores complete metadata fully', () => {
        const r = scorer.score({ title: 'T', wordCount: 500, author: 'Jane Doe', date: '2024-05-01', section: 'World' });
        expect(r.factors.metadata).toBeCloseTo(1);
      });

      it('rejects dates before 1990', () => {
        expect(scorer.score({ title: 'T', wordCount: 500, date: '1989-01-01' }).factors.metadata).toBe(0);
      });

      it('rejects far-future dates', () => {
        expect(scorer.score({ title: 'T', wordCount: 500, date: '2050-01-01' }).factors.metadata).toBe(0);
      });
    });

    describe('readability output scoring', () => {
      it('is neutral (0.5) when no readability data is provided', () => {
        expect(scorer.score({ title: 'T', wordCount: 500 }).factors.readability).toBe(0.5);
      });

      it('scores rich readability output high (textContent/title/byline/excerpt)', () => {
        const r = scorer.score({
          title: 'T',
          wordCount: 500,
          readability: {
            textContent: 'x'.repeat(3000),
            title: 'A headline',
            byline: 'Jane Doe',
            excerpt: 'An excerpt of reasonable length'
          }
        });
        expect(r.factors.readability).toBeGreaterThan(0.9);
      });
    });

    describe('visual analysis scoring', () => {
      it('omits the visual factor when not provided', () => {
        expect(scorer.score({ title: 'Test', wordCount: 500 }).factors.visual).toBeUndefined();
      });

      it('uses visual analyzer confidence when available', () => {
        const withVisual = scorer.score({
          title: 'Test',
          wordCount: 500,
          visualAnalysis: { valid: true, confidence: 0.85 }
        });
        expect(withVisual.factors.visual).toBe(0.85);
        const without = scorer.score({ title: 'Test', wordCount: 500 });
        expect(withVisual.score).not.toBe(without.score);
      });
    });

    describe('overall score and levels', () => {
      it('gives a strong extraction a good level with no teacher review', () => {
        const r = scorer.score({
          title: 'A perfectly reasonable headline about events',
          wordCount: 500,
          author: 'Jane Doe',
          date: '2024-05-01',
          section: 'World',
          readability: { textContent: 'x'.repeat(3000), title: 'A headline', byline: 'Jane Doe', excerpt: 'An excerpt of reasonable length' }
        });
        expect(r.score).toBeGreaterThan(0.6);
        expect(['good', 'high']).toContain(r.level);
        expect(r.needsTeacherReview).toBe(false);
      });

      it('gives a bare extraction a low level needing teacher review', () => {
        const r = scorer.score({ wordCount: 5 });
        expect(r.score).toBeLessThan(0.3);
        expect(r.level).toBe('low');
        expect(r.needsTeacherReview).toBe(true);
      });

      it('names the failing factors in the teacher-required recommendation', () => {
        const r = scorer.score({ wordCount: 5 });
        expect(r.recommendation).toMatch(/^teacher-required:/);
        expect(r.recommendation).toContain('title');
        expect(r.recommendation).toContain('content-length');
      });
    });

    describe('factors structure', () => {
      it('exposes flat numeric factors (title, length, metadata, readability)', () => {
        const r = scorer.score({ title: 'Test', wordCount: 500 });
        expect(Object.keys(r.factors).sort()).toEqual(['length', 'metadata', 'readability', 'title']);
        for (const value of Object.values(r.factors)) {
          expect(typeof value).toBe('number');
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
      });
    });
  });

  describe('scoreBatch()', () => {
    it('scores each item and attaches its url', () => {
      const results = scorer.scoreBatch([
        { url: 'https://a.example/x', extraction: { title: 'A Well-Formed News Article Title About Climate Change', wordCount: 500 } },
        { url: 'https://b.example/y', extraction: { wordCount: 5 } }
      ]);
      expect(results).toHaveLength(2);
      expect(results[0].url).toBe('https://a.example/x');
      expect(typeof results[0].score).toBe('number');
      expect(results[1].url).toBe('https://b.example/y');
      expect(results[0].score).toBeGreaterThan(results[1].score);
    });

    it('returns empty array for non-array input', () => {
      expect(scorer.scoreBatch(null)).toEqual([]);
      expect(scorer.scoreBatch(undefined)).toEqual([]);
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
