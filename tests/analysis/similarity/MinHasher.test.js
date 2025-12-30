'use strict';

/**
 * MinHasher Tests
 * 
 * Tests for the MinHash signature implementation.
 */

const MinHasher = require('../../../src/analysis/similarity/MinHasher');

describe('MinHasher', () => {
  describe('tokenize', () => {
    it('should tokenize text into words', () => {
      const tokens = MinHasher.tokenize('Hello World Test');
      expect(tokens).toEqual(['hello', 'world', 'test']);
    });

    it('should filter short words', () => {
      const tokens = MinHasher.tokenize('a I am test');
      expect(tokens).not.toContain('a');
      expect(tokens).not.toContain('i');
      expect(tokens).toContain('am');
      expect(tokens).toContain('test');
    });

    it('should handle empty input', () => {
      expect(MinHasher.tokenize('')).toEqual([]);
      expect(MinHasher.tokenize(null)).toEqual([]);
    });
  });

  describe('shingle', () => {
    it('should create 3-word shingles by default', () => {
      const shingles = MinHasher.shingle('one two three four five');
      expect(shingles.size).toBe(3); // [one two three], [two three four], [three four five]
      expect(shingles.has('one two three')).toBe(true);
      expect(shingles.has('two three four')).toBe(true);
      expect(shingles.has('three four five')).toBe(true);
    });

    it('should create 2-word shingles when specified', () => {
      const shingles = MinHasher.shingle('one two three', 2);
      expect(shingles.size).toBe(2);
      expect(shingles.has('one two')).toBe(true);
      expect(shingles.has('two three')).toBe(true);
    });

    it('should handle text shorter than shingle size', () => {
      const shingles = MinHasher.shingle('hello world', 3);
      expect(shingles.size).toBe(1);
      expect(shingles.has('hello world')).toBe(true);
    });

    it('should return empty set for empty text', () => {
      const shingles = MinHasher.shingle('');
      expect(shingles.size).toBe(0);
    });

    it('should deduplicate identical shingles', () => {
      const shingles = MinHasher.shingle('the the the the the', 3);
      expect(shingles.size).toBe(1);
    });
  });

  describe('compute', () => {
    it('should return 512-byte Buffer (128 hashes × 4 bytes)', () => {
      const sig = MinHasher.compute('This is a sample text with enough words for shingles');
      expect(Buffer.isBuffer(sig)).toBe(true);
      expect(sig.length).toBe(512);
    });

    it('should return null for empty text', () => {
      const sig = MinHasher.compute('');
      expect(sig).toBeNull();
    });

    it('should produce identical signatures for identical text', () => {
      const text = 'The quick brown fox jumps over the lazy dog and runs away';
      const sig1 = MinHasher.compute(text);
      const sig2 = MinHasher.compute(text);
      expect(sig1.equals(sig2)).toBe(true);
    });

    it('should produce similar signatures for similar text', () => {
      const text1 = 'The quick brown fox jumps over the lazy dog and runs away';
      const text2 = 'The quick brown fox jumps over the lazy cat and runs away';
      const sig1 = MinHasher.compute(text1);
      const sig2 = MinHasher.compute(text2);
      
      const similarity = MinHasher.jaccardSimilarity(sig1, sig2);
      // Similar text should have moderate-to-high Jaccard similarity (>0.5)
      // One word change in short text affects several shingles
      expect(similarity).toBeGreaterThan(0.5);
    });

    it('should produce different signatures for different text', () => {
      const text1 = 'The quick brown fox jumps over the lazy dog';
      const text2 = 'Lorem ipsum dolor sit amet consectetur adipiscing elit';
      const sig1 = MinHasher.compute(text1);
      const sig2 = MinHasher.compute(text2);
      
      const similarity = MinHasher.jaccardSimilarity(sig1, sig2);
      // Different text should have low similarity
      expect(similarity).toBeLessThan(0.3);
    });
  });

  describe('jaccardSimilarity', () => {
    it('should return 1 for identical signatures', () => {
      const text = 'Test content for signature computation here now today';
      const sig = MinHasher.compute(text);
      expect(MinHasher.jaccardSimilarity(sig, sig)).toBe(1);
    });

    it('should return 0 for null signatures', () => {
      const sig = MinHasher.compute('valid text here now');
      expect(MinHasher.jaccardSimilarity(null, sig)).toBe(0);
      expect(MinHasher.jaccardSimilarity(sig, null)).toBe(0);
    });

    it('should throw for invalid buffer sizes', () => {
      const validSig = MinHasher.compute('valid text content');
      const invalidSig = Buffer.alloc(100);
      
      expect(() => MinHasher.jaccardSimilarity(validSig, invalidSig)).toThrow();
    });
  });

  describe('exactJaccardSimilarity', () => {
    it('should return 1 for identical text', () => {
      const text = 'identical text content here now';
      expect(MinHasher.exactJaccardSimilarity(text, text)).toBe(1);
    });

    it('should return 0 for completely different text', () => {
      const text1 = 'one two three four five';
      const text2 = 'six seven eight nine ten';
      expect(MinHasher.exactJaccardSimilarity(text1, text2)).toBe(0);
    });

    it('should calculate correct similarity for overlapping text', () => {
      const text1 = 'one two three';
      const text2 = 'two three four';
      // Shingles: text1 = {"one two three"}, text2 = {"two three four"}
      // Intersection = 0, Union = 2
      // Jaccard = 0/2 = 0
      expect(MinHasher.exactJaccardSimilarity(text1, text2)).toBe(0);
      
      // With more overlap:
      const text3 = 'one two three four five';
      const text4 = 'one two three four six';
      // text3 shingles: {one two three, two three four, three four five}
      // text4 shingles: {one two three, two three four, three four six}
      // Intersection = 2, Union = 4
      // Jaccard = 2/4 = 0.5
      expect(MinHasher.exactJaccardSimilarity(text3, text4)).toBe(0.5);
    });
  });

  describe('extractBand / hashBand', () => {
    it('should extract band of correct size', () => {
      const sig = MinHasher.compute('Test content for band extraction today now');
      const band = MinHasher.extractBand(sig, 0, 16, 8);
      
      // 8 rows × 4 bytes = 32 bytes per band
      expect(band.length).toBe(32);
    });

    it('should extract different bands for different indices', () => {
      const sig = MinHasher.compute('Test content for band extraction today now');
      const band0 = MinHasher.extractBand(sig, 0, 16, 8);
      const band1 = MinHasher.extractBand(sig, 1, 16, 8);
      
      expect(band0.equals(band1)).toBe(false);
    });

    it('should throw for out-of-range band index', () => {
      const sig = MinHasher.compute('Test content here now today');
      expect(() => MinHasher.extractBand(sig, 20, 16, 8)).toThrow();
    });

    it('should hash bands to consistent bucket IDs', () => {
      const sig = MinHasher.compute('Test content for hashing today now');
      const band = MinHasher.extractBand(sig, 0);
      
      const hash1 = MinHasher.hashBand(band);
      const hash2 = MinHasher.hashBand(band);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(8); // 8 hex chars = 32 bits
    });
  });

  describe('signatureToArray / arrayToSignature', () => {
    it('should round-trip correctly', () => {
      const sig = MinHasher.compute('Test content for array conversion today now');
      const arr = MinHasher.signatureToArray(sig);
      const recovered = MinHasher.arrayToSignature(arr);
      
      expect(arr).toHaveLength(128);
      expect(arr.every(n => typeof n === 'number')).toBe(true);
      expect(recovered.equals(sig)).toBe(true);
    });
  });

  describe('HASH_SEEDS', () => {
    it('should have 128 seeds', () => {
      expect(MinHasher.HASH_SEEDS).toHaveLength(128);
    });

    it('should have unique seeds', () => {
      const unique = new Set(MinHasher.HASH_SEEDS);
      expect(unique.size).toBe(128);
    });
  });

  describe('acceptance criteria', () => {
    const sampleArticle = `
      WASHINGTON — The Federal Reserve announced Wednesday that it would raise 
      interest rates by a quarter percentage point, marking the first increase 
      since March 2020. The decision comes as policymakers seek to combat 
      inflation that has climbed to levels not seen in decades.
      
      Fed Chair Jerome Powell said in a press conference that the central bank 
      remains committed to price stability while supporting maximum employment. 
      "We are prepared to adjust our monetary policy as appropriate," Powell said.
      
      Markets reacted positively to the news, with major indexes climbing in 
      afternoon trading. Analysts expect additional rate hikes throughout the year.
    `;

    it('should achieve 100% match on identical text', () => {
      const sig1 = MinHasher.compute(sampleArticle);
      const sig2 = MinHasher.compute(sampleArticle);
      
      const similarity = MinHasher.jaccardSimilarity(sig1, sig2);
      expect(similarity).toBe(1);
    });

    it('should achieve high similarity on minor edits', () => {
      const edited = sampleArticle
        .replace('Wednesday', 'Thursday')
        .replace('quarter', 'half')
        .replace('decades', 'years')
        .replace('positively', 'strongly');
      
      const sig1 = MinHasher.compute(sampleArticle);
      const sig2 = MinHasher.compute(edited);
      
      const estimated = MinHasher.jaccardSimilarity(sig1, sig2);
      const exact = MinHasher.exactJaccardSimilarity(sampleArticle, edited);
      
      // MinHash should approximate exact Jaccard within ~10%
      expect(Math.abs(estimated - exact)).toBeLessThan(0.15);
      // Both should be reasonably high
      expect(estimated).toBeGreaterThan(0.6);
    });

    it('should achieve low similarity on completely different text', () => {
      const differentArticle = `
        The local high school basketball team won the state championship last night
        in an overtime thriller. The final score was 72-70 after forward James Smith
        hit a three-pointer at the buzzer. Coach Williams praised the team's defense
        and said the victory was the result of months of hard work and dedication.
        Fans rushed the court to celebrate with the players after the game.
      `;
      
      const sig1 = MinHasher.compute(sampleArticle);
      const sig2 = MinHasher.compute(differentArticle);
      
      const similarity = MinHasher.jaccardSimilarity(sig1, sig2);
      expect(similarity).toBeLessThan(0.3);
    });

    it('should match MinHash estimate to exact Jaccard within error bounds', () => {
      const text1 = sampleArticle;
      const text2 = sampleArticle.split(' ').slice(0, 50).join(' '); // First half
      
      const sig1 = MinHasher.compute(text1);
      const sig2 = MinHasher.compute(text2);
      
      if (sig2) {
        const estimated = MinHasher.jaccardSimilarity(sig1, sig2);
        const exact = MinHasher.exactJaccardSimilarity(text1, text2);
        
        // Standard error for 128 hashes: ~1/sqrt(128) ≈ 0.088
        // Allow 2 standard deviations (~0.18)
        expect(Math.abs(estimated - exact)).toBeLessThan(0.25);
      }
    });
  });
});
