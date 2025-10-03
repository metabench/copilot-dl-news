const Database = require('better-sqlite3');
const {
  parseArgs,
  selectQueries,
  computeStats,
  benchmarkDatabase,
  measureExecution
} = require('../crawl-query-benchmark');

describe('crawl-query-benchmark utilities', () => {
  it('parses CLI arguments with coercion and camelCase', () => {
    const args = parseArgs(['node', 'script', '--db=my.db', '--warmup=2', '--json=true', '--only=foo,bar', '--list']);
    expect(args.db).toBe('my.db');
    expect(args.warmup).toBe(2);
    expect(args.json).toBe(true);
    expect(args.only).toBe('foo,bar');
    expect(args.list).toBe(true);
  });

  it('filters queries by id or label', () => {
    const defs = [
      { id: 'foo', label: 'Foo Query' },
      { id: 'bar', label: 'Bar Query' }
    ];
    const filteredById = selectQueries(defs, { only: 'foo' });
    expect(filteredById).toHaveLength(1);
    expect(filteredById[0].id).toBe('foo');

    const filteredByLabel = selectQueries(defs, { only: 'Bar Query' });
    expect(filteredByLabel).toHaveLength(1);
    expect(filteredByLabel[0].id).toBe('bar');
  });

  it('computes summary statistics for samples', () => {
    const stats = computeStats([1, 2, 3, 4, 5]);
    expect(stats).toMatchObject({
      count: 5,
      min: 1,
      max: 5,
      median: 3
    });
    expect(stats.mean).toBeCloseTo(3, 5);
    expect(stats.p95).toBeGreaterThanOrEqual(4);
  });

  it('returns samples and handles errors during measureExecution', () => {
    let counter = 0;
    const fn = () => {
      counter += 1;
      if (counter === 3) throw new Error('boom');
    };
    const { samples, error } = measureExecution(fn, 5, 1);
    expect(samples.length).toBeLessThanOrEqual(5);
    expect(error).toBeInstanceOf(Error);
  });
});

describe('crawl-query-benchmark database integration', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE foo (id INTEGER PRIMARY KEY, value TEXT);
      INSERT INTO foo(value) VALUES ('a'), ('b'), ('c');
    `);
  });

  afterEach(() => {
    if (db) {
      try { db.close(); } catch (_) {}
    }
    db = null;
  });

  it('collects timings and row counts for valid queries', () => {
    const queries = [
      {
        id: 'foo_count',
        label: 'Foo count',
        sql: 'SELECT COUNT(*) AS count FROM foo',
        mode: 'get',
        requiresTables: ['foo']
      }
    ];
    const results = benchmarkDatabase(db, queries, { iterations: 3, warmup: 1 });
    expect(results).toHaveLength(1);
    const [result] = results;
    expect(result.stats.count).toBe(3);
    expect(result.rowCount).toBe(3);
    expect(result.error).toBeNull();
    expect(result.sample).toEqual({ count: 3 });
  });

  it('skips queries when required tables are missing', () => {
    const queries = [
      {
        id: 'missing',
        label: 'Missing Table',
        sql: 'SELECT 1',
        mode: 'get',
        requiresTables: ['nope']
      }
    ];
    const results = benchmarkDatabase(db, queries, { iterations: 2, warmup: 0 });
    expect(results[0].skipped).toBe(true);
    expect(results[0].skipReason).toContain('missing tables');
  });
});
