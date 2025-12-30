'use strict';

/**
 * Lexicon Tests
 * 
 * Tests for the AFINN-based sentiment lexicon.
 */

const { 
  Lexicon, 
  AFINN_SCORES, 
  NEGATION_WORDS, 
  INTENSIFIERS, 
  BUT_WORDS 
} = require('../../../src/analysis/sentiment/Lexicon');

describe('Lexicon', () => {
  let lexicon;
  
  beforeEach(() => {
    lexicon = new Lexicon();
  });
  
  describe('constructor', () => {
    it('should initialize with default AFINN scores', () => {
      expect(lexicon.scores).toBeDefined();
      expect(Object.keys(lexicon.scores).length).toBeGreaterThan(100);
    });
    
    it('should accept custom scores', () => {
      const custom = new Lexicon({
        customScores: {
          'customword': 3,
          'anothercustom': -2
        }
      });
      
      expect(custom.getScore('customword')).toBe(3);
      expect(custom.getScore('anothercustom')).toBe(-2);
    });
    
    it('should override existing scores with custom scores', () => {
      const custom = new Lexicon({
        customScores: {
          'good': 5  // Override default 'good' score
        }
      });
      
      expect(custom.getScore('good')).toBe(5);
    });
  });
  
  describe('getScore()', () => {
    it('should return score for known positive word', () => {
      expect(lexicon.getScore('good')).toBe(2);
      expect(lexicon.getScore('excellent')).toBe(3);
      expect(lexicon.getScore('amazing')).toBe(3);
    });
    
    it('should return score for known negative word', () => {
      expect(lexicon.getScore('bad')).toBe(-2);
      expect(lexicon.getScore('terrible')).toBe(-4);
      expect(lexicon.getScore('disaster')).toBe(-4);
    });
    
    it('should return null for unknown word', () => {
      expect(lexicon.getScore('qwertyuiop')).toBeNull();
      expect(lexicon.getScore('asdfghjkl')).toBeNull();
    });
    
    it('should be case-insensitive', () => {
      expect(lexicon.getScore('GOOD')).toBe(2);
      expect(lexicon.getScore('Good')).toBe(2);
      expect(lexicon.getScore('gOoD')).toBe(2);
    });
    
    it('should trim whitespace', () => {
      expect(lexicon.getScore('  good  ')).toBe(2);
      expect(lexicon.getScore('\tgood\n')).toBe(2);
    });
  });
  
  describe('hasWord()', () => {
    it('should return true for known words', () => {
      expect(lexicon.hasWord('good')).toBe(true);
      expect(lexicon.hasWord('bad')).toBe(true);
    });
    
    it('should return false for unknown words', () => {
      expect(lexicon.hasWord('asdfghjkl')).toBe(false);
    });
  });
  
  describe('isNegation()', () => {
    it('should identify negation words', () => {
      expect(lexicon.isNegation('not')).toBe(true);
      expect(lexicon.isNegation('never')).toBe(true);
      expect(lexicon.isNegation("don't")).toBe(true);
      expect(lexicon.isNegation('without')).toBe(true);
    });
    
    it('should return false for non-negation words', () => {
      expect(lexicon.isNegation('good')).toBe(false);
      expect(lexicon.isNegation('very')).toBe(false);
    });
    
    it('should be case-insensitive', () => {
      expect(lexicon.isNegation('NOT')).toBe(true);
      expect(lexicon.isNegation('Never')).toBe(true);
    });
  });
  
  describe('getIntensifier()', () => {
    it('should return multiplier for intensifiers', () => {
      expect(lexicon.getIntensifier('very')).toBe(1.5);
      expect(lexicon.getIntensifier('extremely')).toBe(1.75);
      expect(lexicon.getIntensifier('somewhat')).toBe(0.75);
      expect(lexicon.getIntensifier('slightly')).toBe(0.5);
    });
    
    it('should return null for non-intensifiers', () => {
      expect(lexicon.getIntensifier('good')).toBeNull();
      expect(lexicon.getIntensifier('the')).toBeNull();
    });
  });
  
  describe('isButWord()', () => {
    it('should identify but-clause markers', () => {
      expect(lexicon.isButWord('but')).toBe(true);
      expect(lexicon.isButWord('however')).toBe(true);
      expect(lexicon.isButWord('although')).toBe(true);
      expect(lexicon.isButWord('nevertheless')).toBe(true);
    });
    
    it('should return false for non-but words', () => {
      expect(lexicon.isButWord('and')).toBe(false);
      expect(lexicon.isButWord('or')).toBe(false);
    });
  });
  
  describe('addWord()', () => {
    it('should add new word with score', () => {
      lexicon.addWord('newword', 4);
      expect(lexicon.getScore('newword')).toBe(4);
    });
    
    it('should clamp scores to -5 to +5 range', () => {
      lexicon.addWord('toohigh', 10);
      lexicon.addWord('toolow', -10);
      
      expect(lexicon.getScore('toohigh')).toBe(5);
      expect(lexicon.getScore('toolow')).toBe(-5);
    });
    
    it('should normalize word to lowercase', () => {
      lexicon.addWord('UPPERCASE', 3);
      expect(lexicon.getScore('uppercase')).toBe(3);
    });
  });
  
  describe('addWords()', () => {
    it('should add multiple words', () => {
      lexicon.addWords({
        'word1': 2,
        'word2': -3,
        'word3': 1
      });
      
      expect(lexicon.getScore('word1')).toBe(2);
      expect(lexicon.getScore('word2')).toBe(-3);
      expect(lexicon.getScore('word3')).toBe(1);
    });
  });
  
  describe('getPositiveWords()', () => {
    it('should return array of positive words with scores', () => {
      const positive = lexicon.getPositiveWords();
      
      expect(positive.length).toBeGreaterThan(0);
      expect(positive[0].score).toBeGreaterThan(0);
      
      // Should be sorted by score descending
      for (let i = 1; i < positive.length; i++) {
        expect(positive[i].score).toBeLessThanOrEqual(positive[i - 1].score);
      }
    });
  });
  
  describe('getNegativeWords()', () => {
    it('should return array of negative words with scores', () => {
      const negative = lexicon.getNegativeWords();
      
      expect(negative.length).toBeGreaterThan(0);
      expect(negative[0].score).toBeLessThan(0);
      
      // Should be sorted by score ascending (most negative first)
      for (let i = 1; i < negative.length; i++) {
        expect(negative[i].score).toBeGreaterThanOrEqual(negative[i - 1].score);
      }
    });
  });
  
  describe('getStats()', () => {
    it('should return lexicon statistics', () => {
      const stats = lexicon.getStats();
      
      expect(stats.totalWords).toBeGreaterThan(0);
      expect(stats.positiveWords).toBeGreaterThan(0);
      expect(stats.negativeWords).toBeGreaterThan(0);
      expect(stats.averagePositive).toBeGreaterThan(0);
      expect(stats.averageNegative).toBeLessThan(0);
      expect(stats.negationWords).toBeGreaterThan(0);
      expect(stats.intensifiers).toBeGreaterThan(0);
      expect(stats.butWords).toBeGreaterThan(0);
    });
  });
  
  describe('AFINN_SCORES', () => {
    it('should have expected sample words', () => {
      expect(AFINN_SCORES['good']).toBe(2);
      expect(AFINN_SCORES['bad']).toBe(-2);
      expect(AFINN_SCORES['excellent']).toBe(3);
      expect(AFINN_SCORES['terrible']).toBe(-4);
    });
    
    it('should have scores in valid range', () => {
      for (const [word, score] of Object.entries(AFINN_SCORES)) {
        expect(score).toBeGreaterThanOrEqual(-5);
        expect(score).toBeLessThanOrEqual(5);
      }
    });
  });
  
  describe('NEGATION_WORDS', () => {
    it('should be a Set', () => {
      expect(NEGATION_WORDS instanceof Set).toBe(true);
    });
    
    it('should contain common negation words', () => {
      expect(NEGATION_WORDS.has('not')).toBe(true);
      expect(NEGATION_WORDS.has('never')).toBe(true);
      expect(NEGATION_WORDS.has("don't")).toBe(true);
    });
  });
  
  describe('INTENSIFIERS', () => {
    it('should be an object with multipliers', () => {
      expect(typeof INTENSIFIERS).toBe('object');
      expect(INTENSIFIERS['very']).toBe(1.5);
      expect(INTENSIFIERS['extremely']).toBe(1.75);
    });
    
    it('should have multipliers greater than 0', () => {
      for (const mult of Object.values(INTENSIFIERS)) {
        expect(mult).toBeGreaterThan(0);
      }
    });
  });
  
  describe('BUT_WORDS', () => {
    it('should be a Set', () => {
      expect(BUT_WORDS instanceof Set).toBe(true);
    });
    
    it('should contain common but-clause markers', () => {
      expect(BUT_WORDS.has('but')).toBe(true);
      expect(BUT_WORDS.has('however')).toBe(true);
    });
  });
});
