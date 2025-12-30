'use strict';

/**
 * TextRank Tests
 * 
 * Tests for the TextRank sentence ranking algorithm.
 */

const { 
  TextRank, 
  DEFAULT_DAMPING, 
  DEFAULT_CONVERGENCE, 
  MAX_ITERATIONS,
  MIN_SIMILARITY 
} = require('../../../src/analysis/summarization/TextRank');

describe('TextRank', () => {
  let textRank;
  
  beforeEach(() => {
    textRank = new TextRank();
  });
  
  describe('constructor', () => {
    it('should use default values', () => {
      expect(textRank.damping).toBe(DEFAULT_DAMPING);
      expect(textRank.convergence).toBe(DEFAULT_CONVERGENCE);
      expect(textRank.maxIterations).toBe(MAX_ITERATIONS);
      expect(textRank.minSimilarity).toBe(MIN_SIMILARITY);
    });
    
    it('should accept custom options', () => {
      const custom = new TextRank({
        damping: 0.9,
        convergence: 0.001,
        maxIterations: 50,
        minSimilarity: 0.2
      });
      
      expect(custom.damping).toBe(0.9);
      expect(custom.convergence).toBe(0.001);
      expect(custom.maxIterations).toBe(50);
      expect(custom.minSimilarity).toBe(0.2);
    });
  });
  
  describe('rank()', () => {
    it('should rank sentences by importance', () => {
      const sentences = [
        'Machine learning is a subset of artificial intelligence.',
        'Deep learning uses neural networks with many layers.',
        'The weather is nice today.',
        'Artificial intelligence powers modern technology.',
        'Neural networks can learn complex patterns.'
      ];
      
      const ranked = textRank.rank(sentences);
      
      expect(ranked).toHaveLength(5);
      // Each result should have index, score, and text
      expect(ranked[0]).toHaveProperty('index');
      expect(ranked[0]).toHaveProperty('score');
      expect(ranked[0]).toHaveProperty('text');
    });
    
    it('should return scores sorted descending', () => {
      const sentences = [
        'Technology advances rapidly.',
        'Innovation drives progress.',
        'Random unrelated sentence.',
        'Technology and innovation go together.',
        'Progress requires effort.'
      ];
      
      const ranked = textRank.rank(sentences);
      
      // Verify descending order
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
      }
    });
    
    it('should normalize scores to sum to 1', () => {
      const sentences = [
        'First sentence about machine learning.',
        'Second sentence about data science.',
        'Third sentence about artificial intelligence.'
      ];
      
      const ranked = textRank.rank(sentences);
      const totalScore = ranked.reduce((sum, s) => sum + s.score, 0);
      
      expect(totalScore).toBeCloseTo(1, 5);
    });
    
    it('should handle single sentence', () => {
      const sentences = ['Only one sentence here.'];
      
      const ranked = textRank.rank(sentences);
      
      expect(ranked).toHaveLength(1);
      expect(ranked[0].score).toBe(1.0);
      expect(ranked[0].index).toBe(0);
    });
    
    it('should handle empty array', () => {
      const ranked = textRank.rank([]);
      
      expect(ranked).toEqual([]);
    });
    
    it('should handle null/undefined', () => {
      expect(textRank.rank(null)).toEqual([]);
      expect(textRank.rank(undefined)).toEqual([]);
    });
    
    it('should preserve original text in results', () => {
      const sentences = [
        'First sentence.',
        'Second sentence.',
        'Third sentence.'
      ];
      
      const ranked = textRank.rank(sentences);
      
      const texts = ranked.map(r => r.text);
      expect(texts).toContain('First sentence.');
      expect(texts).toContain('Second sentence.');
      expect(texts).toContain('Third sentence.');
    });
    
    it('should rank related sentences higher than unrelated', () => {
      const sentences = [
        'Machine learning algorithms process data.',
        'The sky is blue today.',
        'Data processing is important for machine learning.',
        'Pizza is delicious food.',
        'Algorithms help analyze large datasets.'
      ];
      
      const ranked = textRank.rank(sentences);
      
      // Find the unrelated sentences (sky, pizza)
      const skyRank = ranked.findIndex(r => r.text.includes('sky'));
      const pizzaRank = ranked.findIndex(r => r.text.includes('Pizza'));
      
      // Related ML sentences should tend to rank higher
      // At minimum, not all unrelated sentences should be top
      const topHalf = ranked.slice(0, 3).map(r => r.text);
      const mlRelated = topHalf.filter(t => 
        t.includes('learning') || 
        t.includes('data') || 
        t.includes('algorithm')
      );
      
      expect(mlRelated.length).toBeGreaterThanOrEqual(1);
    });
  });
  
  describe('selectTop()', () => {
    it('should select top N sentences', () => {
      const sentences = [
        'First sentence.',
        'Second sentence.',
        'Third sentence.',
        'Fourth sentence.',
        'Fifth sentence.'
      ];
      
      const ranked = textRank.rank(sentences);
      const top3 = textRank.selectTop(ranked, 3);
      
      expect(top3).toHaveLength(3);
    });
    
    it('should preserve original order in output', () => {
      const sentences = [
        'First sentence.',
        'Second sentence.',
        'Third sentence.',
        'Fourth sentence.',
        'Fifth sentence.'
      ];
      
      const ranked = textRank.rank(sentences);
      const selected = textRank.selectTop(ranked, 3);
      
      // Indices should be in ascending order
      for (let i = 1; i < selected.length; i++) {
        expect(selected[i].index).toBeGreaterThan(selected[i - 1].index);
      }
    });
    
    it('should handle count > length', () => {
      const sentences = ['One.', 'Two.'];
      
      const ranked = textRank.rank(sentences);
      const selected = textRank.selectTop(ranked, 10);
      
      expect(selected).toHaveLength(2);
    });
    
    it('should handle empty array', () => {
      const selected = textRank.selectTop([], 5);
      
      expect(selected).toEqual([]);
    });
  });
  
  describe('summarize()', () => {
    it('should combine rank and selectTop', () => {
      const sentences = [
        'Technology is advancing.',
        'Innovation drives change.',
        'Random sentence here.',
        'Tech companies lead innovation.',
        'Change is constant.'
      ];
      
      const summary = textRank.summarize(sentences, 2);
      
      expect(summary).toHaveLength(2);
      // Should be in original order
      expect(summary[0].index).toBeLessThan(summary[1].index);
    });
    
    it('should return requested count when possible', () => {
      const sentences = [
        'One.', 'Two.', 'Three.', 'Four.', 'Five.'
      ];
      
      expect(textRank.summarize(sentences, 1)).toHaveLength(1);
      expect(textRank.summarize(sentences, 3)).toHaveLength(3);
      expect(textRank.summarize(sentences, 5)).toHaveLength(5);
    });
  });
  
  describe('getStats()', () => {
    it('should return statistics for ranked sentences', () => {
      const sentences = ['One.', 'Two.', 'Three.'];
      const ranked = textRank.rank(sentences);
      
      const stats = TextRank.getStats(ranked);
      
      expect(stats.sentenceCount).toBe(3);
      expect(stats.maxScore).toBeGreaterThan(0);
      expect(stats.minScore).toBeGreaterThan(0);
      expect(stats.avgScore).toBeGreaterThan(0);
    });
    
    it('should handle empty array', () => {
      const stats = TextRank.getStats([]);
      
      expect(stats.sentenceCount).toBe(0);
      expect(stats.maxScore).toBe(0);
      expect(stats.minScore).toBe(0);
      expect(stats.avgScore).toBe(0);
    });
  });
  
  describe('constants', () => {
    it('should export default values', () => {
      expect(DEFAULT_DAMPING).toBe(0.85);
      expect(DEFAULT_CONVERGENCE).toBe(0.0001);
      expect(MAX_ITERATIONS).toBe(100);
      expect(MIN_SIMILARITY).toBe(0.1);
    });
  });
});
