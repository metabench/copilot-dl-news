const PriorityCalculator = require('../PriorityCalculator');

describe('PriorityCalculator', () => {
  test('compute base priority for known types', () => {
    const calc = new PriorityCalculator();
    const baseArticle = calc.compute({ type: 'article', depth: 1 });
    const baseNav = calc.compute({ type: 'nav', depth: 1 });
    const baseRefresh = calc.compute({ type: 'refresh', depth: 1 });
    expect(baseArticle).toBeLessThan(baseNav);
    expect(baseRefresh).toBeGreaterThan(baseNav);
  });

  test('compute equals computeBase', () => {
    const calc = new PriorityCalculator();
    const args = { type: 'history', depth: 2, discoveredAt: 1234567890 };
    expect(calc.compute(args)).toBe(calc.computeBase(args));
  });

  test('bias and depth applied correctly', () => {
    const calc = new PriorityCalculator();
    const base = calc.compute({ type: 'nav', depth: 2, bias: 5 });
    const withoutBias = calc.compute({ type: 'nav', depth: 2 });
    expect(base).toBe(withoutBias + 5);
  });
});
