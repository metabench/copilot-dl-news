const { CountryHubPlanner } = require('../planner/CountryHubPlanner');

describe('CountryHubPlanner', () => {
  const baseUrl = 'https://example.com';

  test('uses db helper to fetch guardian slugs', async () => {
    const db = { getTopCountrySlugs: jest.fn(() => ['france', 'brazil']) };
    const planner = new CountryHubPlanner({ baseUrl, db });

    const result = await planner.computeCandidates('news.guardian.com');

    expect(db.getTopCountrySlugs).toHaveBeenCalledWith(100);
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({
        url: `${baseUrl}/world/france`,
        slug: 'france',
        reason: 'guardian-world-country'
      })
    ]));
  });

  test('falls back to defaults when db helper missing', async () => {
    const planner = new CountryHubPlanner({ baseUrl, db: null });

    const result = await planner.computeCandidates('news.guardian.com');

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].source).toBe('guardian-heuristic');
  });
});
