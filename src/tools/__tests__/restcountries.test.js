const { fetchCountries } = require('../restcountries');

describe('restcountries helper', () => {
  jest.setTimeout(20000);
  test('filters list when countriesFilter provided (offline)', async () => {
    const res = await fetchCountries({ countriesFilter: ['GB','IE'], offline: true }, { log: () => {} });
    expect(Array.isArray(res)).toBe(true);
    const codes = new Set(res.map(c => (c.cca2||'').toUpperCase()));
    expect(codes.has('GB')).toBe(true);
    expect(codes.has('IE')).toBe(true);
    expect(codes.size).toBeLessThanOrEqual(2);
  });

  test('falls back to local minimal dataset when offline and no cache', async () => {
    const res = await fetchCountries({ offline: true }, { log: () => {} });
    expect(Array.isArray(res)).toBe(true);
    // Minimal file in repo includes at least GB and IE
    const codes = new Set(res.map(c => (c.cca2||'').toUpperCase()));
    expect(codes.has('GB') || codes.has('IE')).toBe(true);
  });
});
