const {
  extractDomain,
  extractBaseDomain,
  groupByDomain,
  isSameDomain,
  deduplicateByDomain,
  extractUniqueDomains,
  matchesDomainPattern,
  getDomainDepth,
  normalizeDomain
} = require('../domainUtils');

describe('domainUtils', () => {
  describe('extractDomain', () => {
    test('extracts hostname from valid URL', () => {
      expect(extractDomain('https://www.example.com/path')).toBe('www.example.com');
      expect(extractDomain('http://bbc.co.uk')).toBe('bbc.co.uk');
      expect(extractDomain('https://news.ycombinator.com/item?id=123')).toBe('news.ycombinator.com');
    });

    test('returns null for invalid URLs', () => {
      expect(extractDomain('')).toBeNull();
      expect(extractDomain(null)).toBeNull();
      expect(extractDomain('not-a-url')).toBeNull();
    });

    test('returns empty string for schemes without hostname', () => {
      // javascript:, data:, etc. URLs have empty hostnames
      expect(extractDomain('javascript:alert(1)')).toBe('');
      expect(extractDomain('data:text/html,<p>test</p>')).toBe('');
    });

    test('lowercases hostnames', () => {
      expect(extractDomain('https://WWW.EXAMPLE.COM')).toBe('www.example.com');
      expect(extractDomain('https://Example.Com/Path')).toBe('example.com');
    });

    test('accepts URL objects', () => {
      const url = new URL('https://www.example.com/path');
      expect(extractDomain(url)).toBe('www.example.com');
    });
  });

  describe('extractBaseDomain', () => {
    test('removes www subdomain', () => {
      expect(extractBaseDomain('https://www.example.com')).toBe('example.com');
      expect(extractBaseDomain('https://www.bbc.co.uk')).toBe('bbc.co.uk');
    });

    test('handles special TLDs correctly', () => {
      expect(extractBaseDomain('https://www.news.bbc.co.uk')).toBe('bbc.co.uk');
      expect(extractBaseDomain('https://subdomain.example.com.au')).toBe('example.com.au');
      expect(extractBaseDomain('https://www.stuff.co.nz')).toBe('stuff.co.nz');
    });

    test('handles standard TLDs', () => {
      expect(extractBaseDomain('https://news.example.com')).toBe('example.com');
      expect(extractBaseDomain('https://api.github.io')).toBe('github.io');
    });

    test('returns full hostname for single-part domains', () => {
      expect(extractBaseDomain('https://localhost')).toBe('localhost');
    });

    test('returns null for invalid URLs', () => {
      expect(extractBaseDomain('')).toBeNull();
      expect(extractBaseDomain('invalid')).toBeNull();
    });
  });

  describe('groupByDomain', () => {
    test('groups URLs by hostname', () => {
      const urls = [
        'https://www.example.com/page1',
        'https://www.example.com/page2',
        'https://other.com/page',
        'https://www.example.com/page3'
      ];

      const groups = groupByDomain(urls);
      
      expect(groups.size).toBe(2);
      expect(groups.get('www.example.com')).toHaveLength(3);
      expect(groups.get('other.com')).toHaveLength(1);
    });

    test('groups by base domain when flag set', () => {
      const urls = [
        'https://www.example.com/page1',
        'https://api.example.com/page2',
        'https://other.com/page'
      ];

      const groups = groupByDomain(urls, true);
      
      expect(groups.size).toBe(2);
      expect(groups.get('example.com')).toHaveLength(2);
      expect(groups.get('other.com')).toHaveLength(1);
    });

    test('skips invalid URLs', () => {
      const urls = [
        'https://example.com/page',
        'invalid-url',
        '',
        'https://other.com/page'
      ];

      const groups = groupByDomain(urls);
      
      expect(groups.size).toBe(2);
      expect(groups.has('invalid-url')).toBe(false);
    });
  });

  describe('isSameDomain', () => {
    test('returns true for same hostname', () => {
      expect(isSameDomain(
        'https://www.example.com/page1',
        'https://www.example.com/page2'
      )).toBe(true);
    });

    test('returns false for different hostnames', () => {
      expect(isSameDomain(
        'https://www.example.com/page',
        'https://api.example.com/page'
      )).toBe(false);
    });

    test('compares base domains when flag set', () => {
      expect(isSameDomain(
        'https://www.example.com/page',
        'https://api.example.com/page',
        true
      )).toBe(true);

      expect(isSameDomain(
        'https://www.example.com/page',
        'https://www.other.com/page',
        true
      )).toBe(false);
    });

    test('returns false for invalid URLs', () => {
      expect(isSameDomain('invalid', 'https://example.com')).toBe(false);
      expect(isSameDomain('', '')).toBe(false);
    });
  });

  describe('deduplicateByDomain', () => {
    test('keeps first URL per domain', () => {
      const urls = [
        'https://example.com/page1',
        'https://example.com/page2',
        'https://other.com/page1',
        'https://example.com/page3'
      ];

      const result = deduplicateByDomain(urls);
      
      expect(result).toHaveLength(2);
      expect(result[0]).toBe('https://example.com/page1');
      expect(result[1]).toBe('https://other.com/page1');
    });

    test('deduplicates by base domain when flag set', () => {
      const urls = [
        'https://www.example.com/page1',
        'https://api.example.com/page2',
        'https://other.com/page'
      ];

      const result = deduplicateByDomain(urls, true);
      
      expect(result).toHaveLength(2);
      expect(result[0]).toBe('https://www.example.com/page1');
      expect(result[1]).toBe('https://other.com/page');
    });
  });

  describe('extractUniqueDomains', () => {
    test('returns Set of unique domains', () => {
      const urls = [
        'https://example.com/page1',
        'https://example.com/page2',
        'https://other.com/page',
        'https://example.com/page3'
      ];

      const domains = extractUniqueDomains(urls);
      
      expect(domains.size).toBe(2);
      expect(domains.has('example.com')).toBe(true);
      expect(domains.has('other.com')).toBe(true);
    });

    test('extracts base domains when flag set', () => {
      const urls = [
        'https://www.example.com/page',
        'https://api.example.com/page',
        'https://other.com/page'
      ];

      const domains = extractUniqueDomains(urls, true);
      
      expect(domains.size).toBe(2);
      expect(domains.has('example.com')).toBe(true);
      expect(domains.has('other.com')).toBe(true);
    });
  });

  describe('matchesDomainPattern', () => {
    test('matches exact domain', () => {
      expect(matchesDomainPattern('example.com', 'example.com')).toBe(true);
      expect(matchesDomainPattern('example.com', 'other.com')).toBe(false);
    });

    test('matches wildcard patterns', () => {
      expect(matchesDomainPattern('www.example.com', '*.example.com')).toBe(true);
      expect(matchesDomainPattern('api.example.com', '*.example.com')).toBe(true);
      expect(matchesDomainPattern('example.com', '*.example.com')).toBe(false);
    });

    test('matches full wildcards', () => {
      expect(matchesDomainPattern('anything.com', '*')).toBe(true);
      expect(matchesDomainPattern('www.example.co.uk', '*')).toBe(true);
    });

    test('is case-insensitive', () => {
      expect(matchesDomainPattern('Example.Com', 'example.com')).toBe(true);
      expect(matchesDomainPattern('WWW.Example.Com', '*.example.com')).toBe(true);
    });

    test('returns false for null/empty', () => {
      expect(matchesDomainPattern('', 'example.com')).toBe(false);
      expect(matchesDomainPattern('example.com', '')).toBe(false);
    });
  });

  describe('getDomainDepth', () => {
    test('returns 0 for base domains', () => {
      expect(getDomainDepth('https://example.com')).toBe(0);
      expect(getDomainDepth('https://bbc.co.uk')).toBe(0);
    });

    test('returns correct depth for subdomains', () => {
      expect(getDomainDepth('https://www.example.com')).toBe(1);
      expect(getDomainDepth('https://api.service.example.com')).toBe(2);
      expect(getDomainDepth('https://www.bbc.co.uk')).toBe(1);
    });

    test('returns 0 for invalid URLs', () => {
      expect(getDomainDepth('')).toBe(0);
      expect(getDomainDepth('invalid')).toBe(0);
    });
  });

  describe('normalizeDomain', () => {
    test('lowercases domains', () => {
      expect(normalizeDomain('Example.Com')).toBe('example.com');
      expect(normalizeDomain('WWW.EXAMPLE.COM')).toBe('example.com');
    });

    test('removes www prefix', () => {
      expect(normalizeDomain('www.example.com')).toBe('example.com');
      expect(normalizeDomain('WWW.example.com')).toBe('example.com');
    });

    test('trims whitespace', () => {
      expect(normalizeDomain('  example.com  ')).toBe('example.com');
      expect(normalizeDomain('\texample.com\n')).toBe('example.com');
    });

    test('returns empty string for null/undefined', () => {
      expect(normalizeDomain('')).toBe('');
      expect(normalizeDomain(null)).toBe('');
      expect(normalizeDomain(undefined)).toBe('');
    });
  });
});
