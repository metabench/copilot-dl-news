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

  test('skips candidates with known 404 responses from database', async () => {
    const prepare = jest.fn((sql) => {
      if (sql.includes('http_responses')) {
        return { get: jest.fn(() => ({ status: 404 })) };
      }
      return { get: jest.fn(() => null) };
    });

    const dbAdapter = {
      getTopCountrySlugs: jest.fn(() => ['france']),
      getDb: () => ({ prepare })
    };

    const planner = new CountryHubPlanner({ baseUrl, db: dbAdapter });

    const result = await planner.computeCandidates('example.com');

    expect(dbAdapter.getTopCountrySlugs).toHaveBeenCalledWith(100);
    expect(prepare).toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});
