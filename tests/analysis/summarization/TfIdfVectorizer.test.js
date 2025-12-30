'use strict';

/**
 * TfIdfVectorizer Tests
 * 
 * Tests for TF-IDF vectorization and cosine similarity.
 */

const { TfIdfVectorizer, tokenizeWords } = require('../../../src/analysis/summarization/TfIdfVectorizer');

describe('TfIdfVectorizer', () => {
  describe('tokenizeWords()', () => {
    it('should tokenize text into lowercase words', () => {
      const tokens = tokenizeWords('Hello World Test');
      
      expect(tokens).toContain('hello');
      expect(tokens).toContain('test');
    });
    
    it('should remove stopwords', () => {
      const tokens = tokenizeWords('The quick brown fox jumps over the lazy dog');
      
      expect(tokens).not.toContain('the');
      expect(tokens).not.toContain('over');
      expect(tokens).toContain('quick');
      expect(tokens).toContain('brown');
      expect(tokens).toContain('fox');
    });
    
    it('should filter short words', () => {
      const tokens = tokenizeWords('I am a big cat');
      
      expect(tokens).not.toContain('i');
      expect(tokens).not.toContain('am');
      expect(tokens).not.toContain('a');
      expect(tokens).toContain('big');
      expect(tokens).toContain('cat');
    });
    
    it('should handle empty input', () => {
      expect(tokenizeWords('')).toEqual([]);
      expect(tokenizeWords(null)).toEqual([]);
      expect(tokenizeWords(undefined)).toEqual([]);
    });
  });
  
  describe('TfIdfVectorizer class', () => {
    let vectorizer;
    
    beforeEach(() => {
      vectorizer = new TfIdfVectorizer();
    });
    
    describe('fit()', () => {
      it('should build vocabulary from documents', () => {
        const docs = [
          'Machine learning is fascinating',
          'Deep learning uses neural networks',
          'Natural language processing'
        ];
        
        vectorizer.fit(docs);
        
        expect(vectorizer.vocabulary.size).toBeGreaterThan(0);
        expect(vectorizer.documentCount).toBe(3);
      });
      
      it('should compute IDF scores', () => {
        const docs = [
          'Python programming',
          'Java programming',
          'JavaScript is different'
        ];
        
        vectorizer.fit(docs);
        
        // 'programming' appears in 2 docs, should have lower IDF
        // than words appearing in only 1 doc
        expect(vectorizer.idf.get('programming')).toBeDefined();
        expect(vectorizer.idf.get('python')).toBeDefined();
      });
      
      it('should handle empty documents array', () => {
        vectorizer.fit([]);
        
        expect(vectorizer.vocabulary.size).toBe(0);
        expect(vectorizer.documentCount).toBe(0);
      });
    });
    
    describe('transform()', () => {
      beforeEach(() => {
        vectorizer.fit([
          'Machine learning algorithms',
          'Deep learning networks',
          'Natural language processing'
        ]);
      });
      
      it('should return sparse vector for document', () => {
        const vector = vectorizer.transform('Machine learning is great');
        
        expect(vector instanceof Map).toBe(true);
        expect(vector.size).toBeGreaterThan(0);
      });
      
      it('should return empty vector for empty text', () => {
        const vector = vectorizer.transform('');
        
        expect(vector.size).toBe(0);
      });
      
      it('should return empty vector for only stopwords', () => {
        const vector = vectorizer.transform('the and or but');
        
        expect(vector.size).toBe(0);
      });
      
      it('should normalize vectors when enabled', () => {
        const normalizedVectorizer = new TfIdfVectorizer({ normalize: true });
        normalizedVectorizer.fit(['test document one', 'test document two']);
        
        const vector = normalizedVectorizer.transform('test document');
        
        // Magnitude should be ~1 for normalized vector
        const magnitude = Math.sqrt(
          Array.from(vector.values()).reduce((sum, v) => sum + v * v, 0)
        );
        expect(magnitude).toBeCloseTo(1, 5);
      });
    });
    
    describe('fitTransform()', () => {
      it('should fit and transform in one step', () => {
        const docs = [
          'First document here',
          'Second document there',
          'Third document somewhere'
        ];
        
        const vectors = vectorizer.fitTransform(docs);
        
        expect(vectors).toHaveLength(3);
        expect(vectors[0] instanceof Map).toBe(true);
      });
    });
    
    describe('cosineSimilarity()', () => {
      it('should return 1 for identical vectors', () => {
        const vec = new Map([[0, 0.5], [1, 0.5]]);
        
        const similarity = TfIdfVectorizer.cosineSimilarity(vec, vec);
        
        expect(similarity).toBeCloseTo(1, 5);
      });
      
      it('should return 0 for orthogonal vectors', () => {
        const vec1 = new Map([[0, 1]]);
        const vec2 = new Map([[1, 1]]);
        
        const similarity = TfIdfVectorizer.cosineSimilarity(vec1, vec2);
        
        expect(similarity).toBe(0);
      });
      
      it('should return value between 0 and 1 for similar vectors', () => {
        const vec1 = new Map([[0, 1], [1, 1]]);
        const vec2 = new Map([[0, 1], [2, 1]]);
        
        const similarity = TfIdfVectorizer.cosineSimilarity(vec1, vec2);
        
        expect(similarity).toBeGreaterThan(0);
        expect(similarity).toBeLessThan(1);
      });
      
      it('should return 0 for empty vectors', () => {
        expect(TfIdfVectorizer.cosineSimilarity(new Map(), new Map())).toBe(0);
        expect(TfIdfVectorizer.cosineSimilarity(new Map([[0, 1]]), new Map())).toBe(0);
      });
      
      it('should handle normalized vectors correctly', () => {
        // Normalized vectors: magnitude = 1
        const vec1 = new Map([[0, 0.6], [1, 0.8]]);  // 0.6² + 0.8² = 1
        const vec2 = new Map([[0, 0.8], [1, 0.6]]);  // 0.8² + 0.6² = 1
        
        const similarity = TfIdfVectorizer.cosineSimilarity(vec1, vec2);
        
        // dot product = 0.6*0.8 + 0.8*0.6 = 0.96
        expect(similarity).toBeCloseTo(0.96, 2);
      });
    });
    
    describe('buildSimilarityMatrix()', () => {
      it('should build NxN matrix', () => {
        const vectors = [
          new Map([[0, 1]]),
          new Map([[1, 1]]),
          new Map([[0, 1], [1, 1]])
        ];
        
        const matrix = TfIdfVectorizer.buildSimilarityMatrix(vectors);
        
        expect(matrix.length).toBe(3);
        expect(matrix[0].length).toBe(3);
        expect(matrix[1].length).toBe(3);
        expect(matrix[2].length).toBe(3);
      });
      
      it('should have 1s on diagonal (self-similarity)', () => {
        const vectors = [
          new Map([[0, 1]]),
          new Map([[1, 1]])
        ];
        
        const matrix = TfIdfVectorizer.buildSimilarityMatrix(vectors);
        
        expect(matrix[0][0]).toBe(1);
        expect(matrix[1][1]).toBe(1);
      });
      
      it('should be symmetric', () => {
        const vectors = [
          new Map([[0, 1], [1, 0.5]]),
          new Map([[0, 0.5], [1, 1]]),
          new Map([[0, 1], [2, 1]])
        ];
        
        const matrix = TfIdfVectorizer.buildSimilarityMatrix(vectors);
        
        expect(matrix[0][1]).toBeCloseTo(matrix[1][0], 10);
        expect(matrix[0][2]).toBeCloseTo(matrix[2][0], 10);
        expect(matrix[1][2]).toBeCloseTo(matrix[2][1], 10);
      });
    });
    
    describe('getStats()', () => {
      it('should return vectorizer statistics', () => {
        vectorizer.fit(['doc one', 'doc two']);
        
        const stats = vectorizer.getStats();
        
        expect(stats.vocabularySize).toBeGreaterThan(0);
        expect(stats.documentCount).toBe(2);
        expect(stats.normalize).toBe(true);
      });
    });
  });
});
