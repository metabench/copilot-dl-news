'use strict';

const {
  formatMissingCountries,
  normalizeHost
} = require('../CountryHubGapReporter');

describe('CountryHubGapReporter utilities', () => {
  test('formatMissingCountries creates preview and respects limits', () => {
    const missing = [
      { name: 'Country A', code: 'AA' },
      { name: 'Country B', code: 'BB', url: 'https://example.com/world/bb' },
      { name: 'Country C' },
      { name: 'Country D' },
      { name: 'Country E' },
      { name: 'Country F' }
    ];

    const formatted = formatMissingCountries(missing, { lineLimit: 3, previewLimit: 2 });

    expect(formatted.lines).toHaveLength(3);
    expect(formatted.lines[0]).toContain('Country A');
    expect(formatted.lines[1]).toContain('Country B');
    expect(formatted.lines[1]).toContain('→ https://example.com/world/bb');
    expect(formatted.moreAfterLines).toBe(3);
    expect(formatted.previewNames).toEqual(['Country A', 'Country B']);
    expect(formatted.moreAfterPreview).toBe(4);
    expect(formatted.total).toBe(6);
  });

  test('normalizeHost strips protocol and www prefix', () => {
    expect(normalizeHost('https://www.example.com/path')).toBe('example.com');
    expect(normalizeHost('example.com')).toBe('example.com');
    expect(normalizeHost('')).toBe('');
  });
});
