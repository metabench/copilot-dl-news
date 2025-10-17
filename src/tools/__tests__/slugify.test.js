const { slugify, normalizeForMatching } = require('../slugify');

describe('slugify', () => {
  describe('basic functionality', () => {
    test('converts simple text to lowercase with hyphens', () => {
      expect(slugify('Hello World')).toBe('hello-world');
    });

    test('removes special characters', () => {
      expect(slugify('Hello, World!')).toBe('hello-world');
    });

    test('collapses multiple spaces', () => {
      expect(slugify('Hello   World')).toBe('hello-world');
    });

    test('removes leading and trailing hyphens', () => {
      expect(slugify('-Hello World-')).toBe('hello-world');
    });

    test('handles empty string', () => {
      expect(slugify('')).toBe('');
    });

    test('handles null/undefined', () => {
      expect(slugify(null)).toBe('');
      expect(slugify(undefined)).toBe('');
    });
  });

  describe('country names', () => {
    test('normalizes Sri Lanka correctly', () => {
      expect(slugify('Sri Lanka')).toBe('sri-lanka');
    });

    test('normalizes United States correctly', () => {
      expect(slugify('United States')).toBe('united-states');
    });

    test('normalizes United Kingdom correctly', () => {
      expect(slugify('United Kingdom')).toBe('united-kingdom');
    });

    test('normalizes New Zealand correctly', () => {
      expect(slugify('New Zealand')).toBe('new-zealand');
    });

    test('normalizes South Africa correctly', () => {
      expect(slugify('South Africa')).toBe('south-africa');
    });

    test('normalizes Costa Rica correctly', () => {
      expect(slugify('Costa Rica')).toBe('costa-rica');
    });

    test('normalizes Saudi Arabia correctly', () => {
      expect(slugify('Saudi Arabia')).toBe('saudi-arabia');
    });

    test('normalizes Solomon Islands correctly', () => {
      expect(slugify('Solomon Islands')).toBe('solomon-islands');
    });
  });

  describe('city names', () => {
    test('normalizes New York correctly', () => {
      expect(slugify('New York')).toBe('new-york');
    });

    test('normalizes Los Angeles correctly', () => {
      expect(slugify('Los Angeles')).toBe('los-angeles');
    });

    test('normalizes San Francisco correctly', () => {
      expect(slugify('San Francisco')).toBe('san-francisco');
    });

    test('normalizes Mexico City correctly', () => {
      expect(slugify('Mexico City')).toBe('mexico-city');
    });
  });

  describe('accented characters', () => {
    test('removes accents from French names', () => {
      expect(slugify('François')).toBe('francois');
    });

    test('removes accents from Spanish names', () => {
      expect(slugify('México')).toBe('mexico');
    });

    test('removes accents from German names', () => {
      expect(slugify('München')).toBe('munchen');
    });

    test('normalizes São Paulo correctly', () => {
      expect(slugify('São Paulo')).toBe('sao-paulo');
    });
  });

  describe('edge cases from URLs', () => {
    test('handles already-slugified names without spaces', () => {
      // This is the Sri Lanka bug case - URL has "srilanka"
      expect(slugify('srilanka')).toBe('srilanka');
    });

    test('handles already-slugified names with hyphens', () => {
      expect(slugify('sri-lanka')).toBe('sri-lanka');
    });

    test('handles mixed case without spaces', () => {
      expect(slugify('SriLanka')).toBe('srilanka');
    });

    test('handles underscores', () => {
      expect(slugify('sri_lanka')).toBe('sri-lanka');
    });
  });

  describe('normalizeForMatching', () => {
    test('normalizes for case-insensitive comparison', () => {
      expect(normalizeForMatching('Sri Lanka')).toBe('srilanka');
      expect(normalizeForMatching('sri-lanka')).toBe('srilanka');
      expect(normalizeForMatching('srilanka')).toBe('srilanka');
      expect(normalizeForMatching('SriLanka')).toBe('srilanka');
    });

    test('matches different representations of same place', () => {
      const normalized1 = normalizeForMatching('New York');
      const normalized2 = normalizeForMatching('new-york');
      const normalized3 = normalizeForMatching('newyork');
      
      expect(normalized1).toBe(normalized2);
      expect(normalized2).toBe(normalized3);
    });

    test('removes all non-alphanumeric characters', () => {
      expect(normalizeForMatching('São Paulo')).toBe('saopaulo');
      expect(normalizeForMatching('sao-paulo')).toBe('saopaulo');
    });

    test('handles empty strings', () => {
      expect(normalizeForMatching('')).toBe('');
      expect(normalizeForMatching(null)).toBe('');
      expect(normalizeForMatching(undefined)).toBe('');
    });
  });

  describe('round-trip consistency', () => {
    test('slugify is idempotent for already-slugified strings', () => {
      const slug = slugify('Sri Lanka');
      expect(slugify(slug)).toBe(slug);
    });

    test('multiple slugifications produce same result', () => {
      const text = 'New York City';
      expect(slugify(slugify(text))).toBe(slugify(text));
    });
  });

  describe('real-world examples from place_hubs table', () => {
    test('handles Guardian URL slugs', () => {
      // From https://www.theguardian.com/world/srilanka
      expect(slugify('srilanka')).toBe('srilanka');
      // Should match gazetteer name
      expect(normalizeForMatching('srilanka')).toBe(normalizeForMatching('Sri Lanka'));
    });

    test('handles Guardian URL slugs with hyphens', () => {
      // From https://www.theguardian.com/world/solomonislands
      expect(slugify('solomonislands')).toBe('solomonislands');
      // Should match gazetteer name
      expect(normalizeForMatching('solomonislands')).toBe(normalizeForMatching('Solomon Islands'));
    });

    test('handles properly formatted slugs', () => {
      expect(slugify('united-kingdom')).toBe('united-kingdom');
    });
  });
});
