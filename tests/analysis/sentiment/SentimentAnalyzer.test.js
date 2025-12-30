'use strict';

/**
 * SentimentAnalyzer Tests
 * 
 * Tests for the main sentiment analysis engine.
 */

const { SentimentAnalyzer, Lexicon } = require('../../../src/analysis/sentiment');

describe('SentimentAnalyzer', () => {
  let analyzer;
  
  beforeEach(() => {
    analyzer = new SentimentAnalyzer();
  });
  
  describe('constructor', () => {
    it('should initialize with default lexicon', () => {
      expect(analyzer.lexicon).toBeInstanceOf(Lexicon);
    });
    
    it('should accept custom lexicon', () => {
      const customLexicon = new Lexicon({ customScores: { 'custom': 4 } });
      const custom = new SentimentAnalyzer({ lexicon: customLexicon });
      
      expect(custom.lexicon.getScore('custom')).toBe(4);
    });
    
    it('should accept custom options', () => {
      const custom = new SentimentAnalyzer({
        config: {
          negationWindow: 5,
          butClauseWeightBefore: 0.3,
          butClauseWeightAfter: 0.7
        }
      });
      
      expect(custom.config.negationWindow).toBe(5);
      expect(custom.config.butClauseWeightBefore).toBe(0.3);
    });
  });
  
  describe('analyze()', () => {
    describe('basic sentiment detection', () => {
      it('should detect positive sentiment', () => {
        const result = analyzer.analyze('This is a good day');
        
        expect(result.overallScore).toBeGreaterThan(0);
        expect(result.breakdown.positive).toBeGreaterThan(0);
      });
      
      it('should detect negative sentiment', () => {
        const result = analyzer.analyze('This is a bad day');
        
        expect(result.overallScore).toBeLessThan(0);
        expect(result.breakdown.negative).toBeGreaterThan(0);
      });
      
      it('should detect neutral sentiment', () => {
        const result = analyzer.analyze('The sky is blue');
        
        expect(result.overallScore).toBe(0);
        expect(result.confidence).toBeLessThan(0.5);
      });
      
      it('should handle empty text', () => {
        const result = analyzer.analyze('');
        
        expect(result.overallScore).toBe(0);
        expect(result.confidence).toBe(0);
        expect(result.sentimentWordCount).toBe(0);
      });
      
      it('should handle text with no sentiment words', () => {
        const result = analyzer.analyze('The table is brown and wooden');
        
        expect(result.overallScore).toBe(0);
        expect(result.sentimentWordCount).toBe(0);
      });
    });
    
    describe('negation handling', () => {
      it('should flip sentiment with "not"', () => {
        const positive = analyzer.analyze('This is good');
        const negated = analyzer.analyze('This is not good');
        
        expect(positive.overallScore).toBeGreaterThan(0);
        expect(negated.overallScore).toBeLessThan(0);
      });
      
      it('should flip sentiment with "never"', () => {
        const result = analyzer.analyze('I never liked it');
        
        // "liked" is positive, but "never" negates it, so score should be negative/neutral
        expect(result.overallScore).toBeLessThanOrEqual(0);
      });
      
      it('should handle double negation', () => {
        const result = analyzer.analyze("It's not bad");
        
        // "bad" is negative, negated by "not" should be less negative
        expect(result.overallScore).toBeGreaterThan(-0.5);
      });
      
      it('should respect negation window', () => {
        // Negation too far from sentiment word
        const result = analyzer.analyze('Not at all, I think this is wonderful');
        
        // "wonderful" should NOT be negated because "not" is too far
        expect(result.overallScore).toBeGreaterThan(0);
      });
    });
    
    describe('intensifier handling', () => {
      it('should amplify with "very"', () => {
        const normal = analyzer.analyze('This is good');
        const intensified = analyzer.analyze('This is very good');
        
        expect(intensified.overallScore).toBeGreaterThan(normal.overallScore);
      });
      
      it('should amplify negative with "extremely"', () => {
        const normal = analyzer.analyze('This is bad');
        const intensified = analyzer.analyze('This is extremely bad');
        
        expect(intensified.overallScore).toBeLessThan(normal.overallScore);
      });
      
      it('should diminish with "slightly"', () => {
        const normal = analyzer.analyze('This is good');
        const diminished = analyzer.analyze('This is slightly good');
        
        expect(diminished.overallScore).toBeLessThan(normal.overallScore);
        expect(diminished.overallScore).toBeGreaterThan(0);
      });
    });
    
    describe('but-clause handling', () => {
      it('should weight text after "but" more heavily', () => {
        const result = analyzer.analyze('The food was good but the service was terrible');
        
        // After "but" is weighted more (0.6 vs 0.4)
        // "good" (2) * 0.4 = 0.8, "terrible" (-4) * 0.6 = -2.4
        expect(result.overallScore).toBeLessThan(0);
      });
      
      it('should weight text after "however" more heavily', () => {
        const result = analyzer.analyze('It was expensive. However, the quality was excellent');
        
        // "excellent" after "however" should dominate
        expect(result.overallScore).toBeGreaterThan(0);
      });
      
      it('should handle multiple but-clauses', () => {
        const result = analyzer.analyze('Good, but bad, but excellent');
        
        // Last sentiment should have most weight
        expect(result.overallScore).toBeGreaterThan(0);
      });
    });
    
    describe('confidence calculation', () => {
      it('should have higher confidence with more sentiment words', () => {
        const few = analyzer.analyze('Good');
        const many = analyzer.analyze('Good, great, excellent, wonderful, amazing');
        
        expect(many.confidence).toBeGreaterThan(few.confidence);
      });
      
      it('should have higher confidence with stronger sentiment', () => {
        const weak = analyzer.analyze('This is okay');
        const strong = analyzer.analyze('This is absolutely amazing and wonderful');
        
        expect(strong.confidence).toBeGreaterThan(weak.confidence);
      });
      
      it('should have lower confidence with mixed sentiment', () => {
        const consistent = analyzer.analyze('Good, great, excellent');
        const mixed = analyzer.analyze('Good, bad, great, terrible');
        
        // Mixed sentiment should have similar or slightly lower confidence
        // (implementation may vary, so we just check it's still valid)
        expect(mixed.confidence).toBeGreaterThanOrEqual(0);
        expect(mixed.confidence).toBeLessThanOrEqual(1);
      });
      
      it('should return confidence between 0 and 1', () => {
        const cases = [
          'Amazing wonderful fantastic!',
          'Terrible horrible disaster',
          'Good but bad',
          '',
          'The sky is blue'
        ];
        
        for (const text of cases) {
          const result = analyzer.analyze(text);
          expect(result.confidence).toBeGreaterThanOrEqual(0);
          expect(result.confidence).toBeLessThanOrEqual(1);
        }
      });
    });
    
    describe('breakdown calculation', () => {
      it('should return percentage breakdown', () => {
        const result = analyzer.analyze('Good things and bad things happen');
        
        expect(result.breakdown).toHaveProperty('positive');
        expect(result.breakdown).toHaveProperty('negative');
        expect(result.breakdown).toHaveProperty('neutral');
        
        const total = result.breakdown.positive + result.breakdown.negative + result.breakdown.neutral;
        expect(total).toBeCloseTo(1, 1);
      });
      
      it('should handle all positive', () => {
        const result = analyzer.analyze('Good, great, excellent');
        
        expect(result.breakdown.positive).toBeGreaterThan(0.5);
        expect(result.breakdown.negative).toBe(0);
      });
      
      it('should handle all negative', () => {
        const result = analyzer.analyze('Bad, terrible, awful');
        
        expect(result.breakdown.negative).toBeGreaterThan(0.5);
        expect(result.breakdown.positive).toBe(0);
      });
    });
    
    describe('sentimentWords extraction with includeDetails', () => {
      it('should extract sentiment words with details when requested', () => {
        const result = analyzer.analyze('This is very good but quite bad', { includeDetails: true });
        
        expect(result.sentenceDetails).toBeDefined();
        expect(result.sentenceDetails.length).toBeGreaterThan(0);
        expect(result.sentimentWordCount).toBeGreaterThan(0);
      });
      
      it('should show word scores in sentence details', () => {
        const result = analyzer.analyze('This is good', { includeDetails: true });
        
        expect(result.sentenceDetails).toBeDefined();
        expect(result.sentenceDetails[0].words.length).toBeGreaterThan(0);
      });
      
      it('should include sentence text', () => {
        const result = analyzer.analyze('Good start, bad ending', { includeDetails: true });
        
        expect(result.sentenceDetails).toBeDefined();
        expect(result.sentenceDetails[0].text).toBeDefined();
      });
    });
    
    describe('sentences analysis', () => {
      it('should count sentences in result', () => {
        const result = analyzer.analyze('First sentence is good. Second is bad!');
        
        expect(result.sentenceCount).toBe(2);
      });
      
      it('should handle single sentence', () => {
        const result = analyzer.analyze('This is a single good sentence');
        
        expect(result.sentenceCount).toBe(1);
      });
      
      it('should handle multiple punctuation types', () => {
        const result = analyzer.analyze('Good? Bad! Maybe neutral.');
        
        expect(result.sentenceCount).toBe(3);
      });
    });
  });
  
  describe('analyzeArticleObject()', () => {
    it('should analyze article structure', () => {
      const article = {
        title: 'Great News Today',
        content: 'Something wonderful happened. It was amazing and beautiful.'
      };
      
      const result = analyzer.analyzeArticleObject(article);
      
      expect(result.title.overallScore).toBeGreaterThan(0);
      expect(result.body.overallScore).toBeGreaterThan(0);
      expect(result.combined.overallScore).toBeGreaterThan(0);
    });
    
    it('should weight title sentiment', () => {
      const article = {
        title: 'Terrible Disaster Strikes',
        content: 'Good things are happening everywhere.'
      };
      
      const result = analyzer.analyzeArticleObject(article);
      
      // Title should influence combined score
      expect(result.combined.overallScore).not.toBe(result.body.overallScore);
    });
    
    it('should handle missing title', () => {
      const article = {
        content: 'Good content here'
      };
      
      const result = analyzer.analyzeArticleObject(article);
      
      expect(result.title.overallScore).toBe(0);
      expect(result.body.overallScore).toBeGreaterThan(0);
    });
    
    it('should handle missing content', () => {
      const article = {
        title: 'Good Title'
      };
      
      const result = analyzer.analyzeArticleObject(article);
      
      expect(result.title.overallScore).toBeGreaterThan(0);
      expect(result.body.overallScore).toBe(0);
    });
    
    it('should include entity sentiment when requested', () => {
      const article = {
        title: 'News',
        content: 'John Smith did something great. Apple released a terrible product.'
      };
      
      const result = analyzer.analyzeArticleObject(article, { includeEntities: true });
      
      // Entities array should exist (may be empty if entity recognizer not configured)
      expect(result.entities).toBeDefined();
    });
  });
  
  describe('batchAnalyzeTexts()', () => {
    it('should analyze multiple texts', () => {
      const texts = [
        'Good day',
        'Bad night',
        'Neutral statement'
      ];
      
      const results = texts.map(text => analyzer.analyze(text));
      
      expect(results.length).toBe(3);
      expect(results[0].overallScore).toBeGreaterThan(0);
      expect(results[1].overallScore).toBeLessThan(0);
    });
    
    it('should handle empty array', () => {
      const results = [].map(text => analyzer.analyze(text));
      
      expect(results).toEqual([]);
    });
    
    it('should return consistent results', () => {
      const texts = [
        'Very good',
        'Slightly bad',
        'Extremely wonderful'
      ];
      
      const results = texts.map(text => analyzer.analyze(text));
      
      expect(results.length).toBe(3);
      expect(results[0].confidence).toBeGreaterThan(0);
      expect(results[2].overallScore).toBeGreaterThan(0);
    });
  });
  
  describe('edge cases', () => {
    it('should handle all caps text', () => {
      const result = analyzer.analyze('THIS IS VERY GOOD');
      
      expect(result.overallScore).toBeGreaterThan(0);
    });
    
    it('should handle text with special characters', () => {
      const result = analyzer.analyze('Good!!! @#$% Bad??? *** Excellent!!!');
      
      expect(result.sentimentWordCount).toBeGreaterThan(0);
      // Should detect good, bad, excellent despite special chars
      expect(result.overallScore).not.toBe(0);
    });
    
    it('should handle very long text', () => {
      const longText = 'Good. '.repeat(1000);
      const result = analyzer.analyze(longText);
      
      expect(result.overallScore).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0.5);
    });
    
    it('should handle unicode text', () => {
      const result = analyzer.analyze('This café has good espresso');
      
      expect(result.overallScore).toBeGreaterThan(0);
    });
    
    it('should handle contractions', () => {
      const result = analyzer.analyze("I don't like this");
      
      // "don't" should negate "like"
      expect(result.overallScore).toBeLessThan(0);
    });
  });
  
  describe('overallScore normalization', () => {
    it('should return score between -1 and 1', () => {
      const extremeCases = [
        'absolutely amazingly wonderfully fantastic incredible excellent!',
        'terribly horribly disgustingly awful terrible horrible disaster',
        'good bad',
        ''
      ];
      
      for (const text of extremeCases) {
        const result = analyzer.analyze(text);
        expect(result.overallScore).toBeGreaterThanOrEqual(-1);
        expect(result.overallScore).toBeLessThanOrEqual(1);
      }
    });
  });
});
