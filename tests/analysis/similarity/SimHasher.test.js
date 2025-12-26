'use strict';

/**
 * SimHasher Tests
 * 
 * Tests for the SimHash fingerprinting implementation.
 */

const SimHasher = require('../../../src/analysis/similarity/SimHasher');

describe('SimHasher', () => {
  describe('tokenize', () => {
    it('should tokenize simple text', () => {
      const tokens = SimHasher.tokenize('Hello World');
      expect(tokens).toEqual(['hello', 'world']);
    });

    it('should handle punctuation', () => {
      const tokens = SimHasher.tokenize('Hello, World! How are you?');
      expect(tokens).toContain('hello');
      expect(tokens).toContain('world');
      expect(tokens).toContain('how');
      expect(tokens).toContain('are');
      expect(tokens).toContain('you');
    });

    it('should filter short words', () => {
      const tokens = SimHasher.tokenize('I am a test', { minWordLength: 2 });
      expect(tokens).not.toContain('i');
      expect(tokens).not.toContain('a');
      expect(tokens).toContain('am');
      expect(tokens).toContain('test');
    });

    it('should return empty array for null/empty input', () => {
      expect(SimHasher.tokenize(null)).toEqual([]);
      expect(SimHasher.tokenize('')).toEqual([]);
      expect(SimHasher.tokenize('   ')).toEqual([]);
    });
  });

  describe('fnv1a64', () => {
    it('should produce consistent hashes', () => {
      const hash1 = SimHasher.fnv1a64('test');
      const hash2 = SimHasher.fnv1a64('test');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different strings', () => {
      const hash1 = SimHasher.fnv1a64('hello');
      const hash2 = SimHasher.fnv1a64('world');
      expect(hash1).not.toBe(hash2);
    });

    it('should return BigInt', () => {
      const hash = SimHasher.fnv1a64('test');
      expect(typeof hash).toBe('bigint');
    });
  });

  describe('compute', () => {
    it('should return 8-byte Buffer', () => {
      const fp = SimHasher.compute('This is a test article with some content');
      expect(Buffer.isBuffer(fp)).toBe(true);
      expect(fp.length).toBe(8);
    });

    it('should return zero buffer for empty text', () => {
      const fp = SimHasher.compute('');
      expect(fp.length).toBe(8);
      expect(fp.readBigUInt64LE()).toBe(0n);
    });

    it('should produce identical fingerprints for identical text', () => {
      const text = 'The quick brown fox jumps over the lazy dog';
      const fp1 = SimHasher.compute(text);
      const fp2 = SimHasher.compute(text);
      expect(fp1.equals(fp2)).toBe(true);
    });

    it('should produce similar fingerprints for similar text', () => {
      const text1 = 'The quick brown fox jumps over the lazy dog';
      const text2 = 'The quick brown fox jumps over the lazy cat';
      const fp1 = SimHasher.compute(text1);
      const fp2 = SimHasher.compute(text2);
      
      const distance = SimHasher.hammingDistance(fp1, fp2);
      // Similar text should have low Hamming distance
      expect(distance).toBeLessThan(20);
    });

    it('should produce different fingerprints for different text', () => {
      const text1 = 'The quick brown fox jumps over the lazy dog';
      const text2 = 'Lorem ipsum dolor sit amet consectetur adipiscing elit';
      const fp1 = SimHasher.compute(text1);
      const fp2 = SimHasher.compute(text2);
      
      const distance = SimHasher.hammingDistance(fp1, fp2);
      // Different text should have higher Hamming distance
      expect(distance).toBeGreaterThan(10);
    });
  });

  describe('hammingDistance', () => {
    it('should return 0 for identical fingerprints', () => {
      const fp = SimHasher.compute('Test content');
      expect(SimHasher.hammingDistance(fp, fp)).toBe(0);
    });

    it('should return 64 for completely opposite fingerprints', () => {
      const fp1 = Buffer.alloc(8, 0x00);
      const fp2 = Buffer.alloc(8, 0xFF);
      expect(SimHasher.hammingDistance(fp1, fp2)).toBe(64);
    });

    it('should count differing bits correctly', () => {
      const fp1 = Buffer.alloc(8, 0x00);
      const fp2 = Buffer.from([0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
      expect(SimHasher.hammingDistance(fp1, fp2)).toBe(1);
    });

    it('should throw for invalid buffers', () => {
      const validFp = Buffer.alloc(8);
      expect(() => SimHasher.hammingDistance(validFp, Buffer.alloc(4))).toThrow();
      expect(() => SimHasher.hammingDistance(null, validFp)).toThrow();
    });
  });

  describe('isNearDuplicate', () => {
    it('should detect exact duplicates', () => {
      const fp = SimHasher.compute('Exact duplicate content');
      expect(SimHasher.isNearDuplicate(fp, fp)).toBe(true);
    });

    it('should detect near-duplicates with small edits', () => {
      const text1 = 'The president announced new economic policies today in Washington DC during a press conference';
      const text2 = 'The president announced new economic policy today in Washington DC during press conference';
      const fp1 = SimHasher.compute(text1);
      const fp2 = SimHasher.compute(text2);
      
      const distance = SimHasher.hammingDistance(fp1, fp2);
      // These should be near-duplicates (distance <= 3)
      expect(distance).toBeLessThanOrEqual(10);
    });

    it('should not detect completely different text as duplicates', () => {
      const text1 = 'Breaking news: Stock market reaches all-time high';
      const text2 = 'Weather forecast: Rain expected throughout the week';
      const fp1 = SimHasher.compute(text1);
      const fp2 = SimHasher.compute(text2);
      
      expect(SimHasher.isNearDuplicate(fp1, fp2, 3)).toBe(false);
    });
  });

  describe('getMatchType', () => {
    it('should return "exact" for distance 0', () => {
      expect(SimHasher.getMatchType(0)).toBe('exact');
    });

    it('should return "near" for distance 1-3', () => {
      expect(SimHasher.getMatchType(1)).toBe('near');
      expect(SimHasher.getMatchType(2)).toBe('near');
      expect(SimHasher.getMatchType(3)).toBe('near');
    });

    it('should return "similar" for distance 4-10', () => {
      expect(SimHasher.getMatchType(4)).toBe('similar');
      expect(SimHasher.getMatchType(10)).toBe('similar');
    });

    it('should return "different" for distance >10', () => {
      expect(SimHasher.getMatchType(11)).toBe('different');
      expect(SimHasher.getMatchType(64)).toBe('different');
    });
  });

  describe('distanceToSimilarity', () => {
    it('should return 1 for distance 0', () => {
      expect(SimHasher.distanceToSimilarity(0)).toBe(1);
    });

    it('should return 0 for distance 64', () => {
      expect(SimHasher.distanceToSimilarity(64)).toBe(0);
    });

    it('should return 0.5 for distance 32', () => {
      expect(SimHasher.distanceToSimilarity(32)).toBe(0.5);
    });
  });

  describe('toHexString / fromHexString', () => {
    it('should round-trip correctly', () => {
      const fp = SimHasher.compute('Test content for hex conversion');
      const hex = SimHasher.toHexString(fp);
      const recovered = SimHasher.fromHexString(hex);
      
      expect(hex).toHaveLength(16);
      expect(recovered.equals(fp)).toBe(true);
    });

    it('should throw for invalid hex string', () => {
      expect(() => SimHasher.fromHexString('tooshort')).toThrow();
      expect(() => SimHasher.fromHexString(null)).toThrow();
    });
  });

  describe('bufferToBigInt / bigIntToBuffer', () => {
    it('should round-trip correctly', () => {
      const original = 12345678901234567890n;
      const buffer = SimHasher.bigIntToBuffer(original);
      const recovered = SimHasher.bufferToBigInt(buffer);
      
      expect(recovered).toBe(original);
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
      const fp1 = SimHasher.compute(sampleArticle);
      const fp2 = SimHasher.compute(sampleArticle);
      
      const distance = SimHasher.hammingDistance(fp1, fp2);
      const similarity = SimHasher.distanceToSimilarity(distance);
      
      expect(distance).toBe(0);
      expect(similarity).toBe(1);
    });

    it('should achieve >95% match on minor edits (~5%)', () => {
      // Replace ~5% of words
      const edited = sampleArticle
        .replace('Wednesday', 'Thursday')
        .replace('quarter', 'half')
        .replace('decades', 'years')
        .replace('positively', 'strongly');
      
      const fp1 = SimHasher.compute(sampleArticle);
      const fp2 = SimHasher.compute(edited);
      
      const distance = SimHasher.hammingDistance(fp1, fp2);
      const similarity = SimHasher.distanceToSimilarity(distance);
      
      // Should be very similar - distance should be small
      expect(distance).toBeLessThan(10);
      expect(similarity).toBeGreaterThan(0.85);
    });

    it('should achieve <10% match on completely different text', () => {
      const differentArticle = `
        The local high school basketball team won the state championship last night
        in an overtime thriller. The final score was 72-70 after forward James Smith
        hit a three-pointer at the buzzer. Coach Williams praised the team's defense
        and said the victory was the result of months of hard work and dedication.
        Fans rushed the court to celebrate with the players after the game.
      `;
      
      const fp1 = SimHasher.compute(sampleArticle);
      const fp2 = SimHasher.compute(differentArticle);
      
      const distance = SimHasher.hammingDistance(fp1, fp2);
      const similarity = SimHasher.distanceToSimilarity(distance);
      
      // Should be quite different
      expect(distance).toBeGreaterThan(15);
      expect(similarity).toBeLessThan(0.75);
    });
  });
});
