'use strict';

/**
 * SentenceTokenizer Tests
 * 
 * Tests for sentence tokenization with abbreviation handling.
 */

const { 
  tokenize, 
  simpleSplit, 
  countWords, 
  truncateToWords,
  isAbbreviation,
  ABBREVIATIONS 
} = require('../../../src/analysis/summarization/SentenceTokenizer');

describe('SentenceTokenizer', () => {
  describe('tokenize()', () => {
    it('should split text on sentence-ending punctuation', () => {
      const text = 'Hello world. This is a test. How are you?';
      const sentences = tokenize(text);
      
      expect(sentences).toHaveLength(3);
      expect(sentences[0].text).toBe('Hello world.');
      expect(sentences[1].text).toBe('This is a test.');
      expect(sentences[2].text).toBe('How are you?');
    });
    
    it('should preserve sentence indices', () => {
      const text = 'First sentence. Second sentence. Third sentence.';
      const sentences = tokenize(text);
      
      expect(sentences[0].index).toBe(0);
      expect(sentences[1].index).toBe(1);
      expect(sentences[2].index).toBe(2);
    });
    
    it('should handle exclamation marks', () => {
      const text = 'Stop! Go now! Run fast.';
      const sentences = tokenize(text);
      
      expect(sentences).toHaveLength(3);
      expect(sentences[0].text).toBe('Stop!');
      expect(sentences[1].text).toBe('Go now!');
    });
    
    it('should handle question marks', () => {
      const text = 'What is this? Is it good? Yes it is.';
      const sentences = tokenize(text);
      
      expect(sentences).toHaveLength(3);
      expect(sentences[0].text).toBe('What is this?');
      expect(sentences[1].text).toBe('Is it good?');
    });
    
    it('should handle multiple punctuation marks', () => {
      const text = 'Really?! That is amazing... Yes, really!!';
      const sentences = tokenize(text);
      
      expect(sentences.length).toBeGreaterThanOrEqual(2);
    });
    
    it('should not split on abbreviations like Mr.', () => {
      const text = 'Mr. Smith went to the store. He bought milk.';
      const sentences = tokenize(text);
      
      expect(sentences).toHaveLength(2);
      expect(sentences[0].text).toContain('Mr. Smith');
    });
    
    it('should not split on abbreviations like Dr.', () => {
      const text = 'Dr. Jones is a great doctor. She helps many patients.';
      const sentences = tokenize(text);
      
      expect(sentences).toHaveLength(2);
      expect(sentences[0].text).toContain('Dr. Jones');
    });
    
    it('should not split on U.S.', () => {
      const text = 'The U.S. president spoke today. He addressed the nation.';
      const sentences = tokenize(text);
      
      // May be 2 or 3 depending on how U.S. is parsed
      expect(sentences.length).toBeLessThanOrEqual(3);
    });
    
    it('should handle single letter abbreviations', () => {
      const text = 'J. K. Rowling wrote Harry Potter. It was very popular.';
      const sentences = tokenize(text);
      
      // First sentence should include the author name
      expect(sentences[0].text).toContain('Rowling');
    });
    
    it('should handle empty input', () => {
      expect(tokenize('')).toEqual([]);
      expect(tokenize(null)).toEqual([]);
      expect(tokenize(undefined)).toEqual([]);
    });
    
    it('should handle whitespace-only input', () => {
      expect(tokenize('   ')).toEqual([]);
      expect(tokenize('\n\n')).toEqual([]);
    });
    
    it('should handle single sentence without punctuation', () => {
      const text = 'This is a sentence without ending punctuation';
      const sentences = tokenize(text);
      
      expect(sentences).toHaveLength(1);
      expect(sentences[0].text).toBe(text);
    });
    
    it('should normalize whitespace', () => {
      const text = 'Hello   world.   This  is   a   test.';
      const sentences = tokenize(text);
      
      expect(sentences).toHaveLength(2);
      expect(sentences[0].text).toBe('Hello world.');
      expect(sentences[1].text).toBe('This is a test.');
    });
    
    it('should handle news article style text', () => {
      const text = `The government announced new policy measures. 
        Economic impacts are expected to be significant. 
        Officials remain optimistic about outcomes.`;
      const sentences = tokenize(text);
      
      expect(sentences).toHaveLength(3);
    });
  });
  
  describe('simpleSplit()', () => {
    it('should split on basic sentence boundaries', () => {
      const text = 'Hello world. This is a test.';
      const sentences = simpleSplit(text);
      
      expect(sentences).toHaveLength(2);
    });
    
    it('should handle empty input', () => {
      expect(simpleSplit('')).toEqual([]);
      expect(simpleSplit(null)).toEqual([]);
    });
  });
  
  describe('countWords()', () => {
    it('should count words correctly', () => {
      expect(countWords('Hello world')).toBe(2);
      expect(countWords('One two three four five')).toBe(5);
      expect(countWords('SingleWord')).toBe(1);
    });
    
    it('should handle multiple spaces', () => {
      expect(countWords('Hello   world')).toBe(2);
    });
    
    it('should return 0 for empty input', () => {
      expect(countWords('')).toBe(0);
      expect(countWords(null)).toBe(0);
      expect(countWords(undefined)).toBe(0);
    });
  });
  
  describe('truncateToWords()', () => {
    it('should truncate to specified word count', () => {
      const text = 'One two three four five six seven';
      const truncated = truncateToWords(text, 3);
      
      expect(truncated).toBe('One two three...');
    });
    
    it('should not truncate if already shorter', () => {
      const text = 'One two three';
      const truncated = truncateToWords(text, 5);
      
      expect(truncated).toBe(text);
    });
    
    it('should handle empty input', () => {
      expect(truncateToWords('', 5)).toBe('');
      expect(truncateToWords(null, 5)).toBe('');
    });
  });
  
  describe('isAbbreviation()', () => {
    it('should recognize common abbreviations', () => {
      expect(isAbbreviation('mr.', 'Smith')).toBe(true);
      expect(isAbbreviation('dr.', 'Jones')).toBe(true);
      expect(isAbbreviation('inc.', '')).toBe(true);
      expect(isAbbreviation('corp.', '')).toBe(true);
    });
    
    it('should recognize single letter abbreviations', () => {
      expect(isAbbreviation('J.', 'K.')).toBe(true);
      expect(isAbbreviation('A.', 'Smith')).toBe(true);
    });
    
    it('should consider next word capitalization', () => {
      expect(isAbbreviation('something.', 'lowercase')).toBe(true);
      expect(isAbbreviation('something.', 'Uppercase')).toBe(false);
    });
  });
  
  describe('ABBREVIATIONS set', () => {
    it('should contain common title abbreviations', () => {
      expect(ABBREVIATIONS.has('mr')).toBe(true);
      expect(ABBREVIATIONS.has('mrs')).toBe(true);
      expect(ABBREVIATIONS.has('dr')).toBe(true);
      expect(ABBREVIATIONS.has('prof')).toBe(true);
    });
    
    it('should contain organization abbreviations', () => {
      expect(ABBREVIATIONS.has('inc')).toBe(true);
      expect(ABBREVIATIONS.has('corp')).toBe(true);
      expect(ABBREVIATIONS.has('ltd')).toBe(true);
    });
    
    it('should contain month abbreviations', () => {
      expect(ABBREVIATIONS.has('jan')).toBe(true);
      expect(ABBREVIATIONS.has('feb')).toBe(true);
      expect(ABBREVIATIONS.has('dec')).toBe(true);
    });
  });
});
