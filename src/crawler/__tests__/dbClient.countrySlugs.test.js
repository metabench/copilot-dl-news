const { createCrawlerDb } = require('../dbClient');

describe('CrawlerDb#getTopCountrySlugs', () => {
  test('delegates to underlying database implementation', () => {
    const adapter = createCrawlerDb({});
    const stub = { getTopCountrySlugs: jest.fn(() => ['france', 'germany']) };
    adapter.db = stub;

    const result = adapter.getTopCountrySlugs(10);

    expect(stub.getTopCountrySlugs).toHaveBeenCalledWith(10);
    expect(result).toEqual(['france', 'germany']);
  });

  test('returns null when database helper is missing or throws', () => {
    const adapter = createCrawlerDb({});

    adapter.db = null;
    expect(adapter.getTopCountrySlugs(5)).toBeNull();

    adapter.db = { getTopCountrySlugs: jest.fn(() => { throw new Error('nope'); }) };
    expect(adapter.getTopCountrySlugs(5)).toBeNull();
  });
});
