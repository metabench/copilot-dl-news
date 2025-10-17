const { CountryHubPlanner } = require('../planner/CountryHubPlanner');

describe('CountryHubPlanner', () => {
  const baseUrl = 'https://example.com';

  test('uses gazetteer helper to build country candidates', async () => {
    const db = { getTopCountrySlugs: jest.fn(() => ['france', 'brazil']) };
    const planner = new CountryHubPlanner({ baseUrl, db });

    const result = await planner.computeCandidates('example.com');

    expect(db.getTopCountrySlugs).toHaveBeenCalledWith(100);
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({
        url: `${baseUrl}/world/france`,
        slug: 'france',
        reason: 'country-hub-gazetteer',
        source: 'country-planner',
        pattern: 'country-hub-world-path'
      })
    ]));
  });

  test('falls back to default slug list when gazetteer helper missing', async () => {
    const planner = new CountryHubPlanner({ baseUrl, db: null });

    const result = await planner.computeCandidates('example.com');

    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toMatchObject({
      source: 'country-planner',
      reason: 'country-hub-default'
    });
  });
});
