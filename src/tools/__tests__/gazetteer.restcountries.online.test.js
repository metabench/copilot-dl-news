const { fetchCountries } = require('../restcountries');

describe('REST Countries (live)', () => {
  const live = process.env.LIVE_NET === '1';
  const maybe = live ? test : test.skip;

  maybe('fetch IE with live network and minimal fields', async () => {
    jest.setTimeout(20000);
    const arr = await fetchCountries({ countriesFilter: ['IE'], retries: 0, timeoutMs: 15000, offline: false });
    expect(Array.isArray(arr)).toBe(true);
    expect(arr.length).toBeGreaterThan(0);
    const ie = arr.find(c => (c.cca2 || '').toUpperCase() === 'IE');
    expect(ie).toBeTruthy();
    expect(ie.name?.common).toBeTruthy();
  });
});
