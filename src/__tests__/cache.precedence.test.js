const { shouldUseCache } = require('../cache');

describe('shouldUseCache precedence and edges', () => {
  const fixedNow = new Date('2025-09-16T12:00:00.000Z').getTime();
  beforeAll(() => {
    jest.spyOn(Date, 'now').mockReturnValue(fixedNow);
  });
  afterAll(() => {
    Date.now.mockRestore?.();
  });

  test('maxAgeMs overrides preferCache when stale', () => {
    const crawledAt = new Date(fixedNow - (10 * 60 * 1000)).toISOString(); // 10m ago
    const r = shouldUseCache({ preferCache: true, maxAgeMs: 5 * 60 * 1000, crawledAt });
    expect(r.use).toBe(false);
  });

  test('maxAgeMs boundary is inclusive (fresh when equal)', () => {
    const crawledAt = new Date(fixedNow - (5 * 60 * 1000)).toISOString(); // 5m ago
    const r = shouldUseCache({ maxAgeMs: 5 * 60 * 1000, crawledAt });
    expect(r.use).toBe(true);
  });

  test('maxAgeMs=0 means never use cache (always refetch)', () => {
    const crawledAt = new Date(fixedNow - (1 * 1000)).toISOString(); // 1s ago
    const r = shouldUseCache({ preferCache: true, maxAgeMs: 0, crawledAt });
    expect(r.use).toBe(false);
  });

  test('preferCache with unknown age uses cache, ageSeconds null', () => {
    const r = shouldUseCache({ preferCache: true, crawledAt: undefined });
    expect(r.use).toBe(true);
    expect(r.ageSeconds).toBeNull();
  });
});
