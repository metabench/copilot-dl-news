'use strict';

const { findBareComparisons, recommendedFix } = require('../checks/timestamp-comparison.check');

describe('timestamp-comparison findBareComparisons', () => {
  test('flags a bare column compared to datetime(now) and calls it EXPIRY', () => {
    const hits = findBareComparisons("WHERE expires_at > datetime('now')");
    expect(hits).toHaveLength(1);
    expect(hits[0].severity).toBe('expiry');
  });

  test('a threshold WITH a modifier is the lesser window severity', () => {
    // Only rows landing on the boundary date are misclassified here, versus
    // "everything expiring today" for a bare 'now'.
    const hits = findBareComparisons("WHERE fetched_at < datetime('now', '-7 day')");
    expect(hits).toHaveLength(1);
    expect(hits[0].severity).toBe('window');
  });

  test('a column already wrapped in datetime() is NOT flagged', () => {
    expect(findBareComparisons("WHERE datetime(expires_at) > datetime('now')")).toHaveLength(0);
    expect(findBareComparisons("WHERE datetime(hr.cache_expires_at) <= datetime('now', '-1 day')")).toHaveLength(0);
  });

  test('julianday and strftime comparisons are explicit, not raw strings', () => {
    expect(findBareComparisons("WHERE julianday(ts) < julianday('now') - 7")).toHaveLength(0);
    expect(findBareComparisons("WHERE strftime('%Y', ts) > datetime('now')")).toHaveLength(0);
  });

  test('a bound threshold is fine — there is no datetime(now) to mismatch', () => {
    expect(findBareComparisons('WHERE discovered_at > ?')).toHaveLength(0);
  });

  test('COMMENTS are not code — the c220 write-up quotes the bug to explain it', () => {
    // ncdb's legacy-httpResponseCache header quotes
    // `cache_expires_at > datetime('now')` verbatim while describing why it
    // was wrong. A checker that reports the explanation as the defect is a
    // checker nobody trusts, so comments are stripped.
    const block = [
      '/**',
      " * its finder filtered `cache_expires_at > datetime('now')` in SQL, so",
      ' * the expiry branch was unreachable.',
      ' */',
      "const sql = \"WHERE a > datetime('now')\";"
    ].join('\n');
    const hits = findBareComparisons(block);
    expect(hits).toHaveLength(1);
    expect(hits[0].line).toBe(5); // only the real one, and the line number survived
  });

  test('a line comment is stripped too, without shifting line numbers', () => {
    const src = [
      "// old: expires_at > datetime('now')",
      "WHERE datetime(expires_at) > datetime('now')",
      "WHERE other_at > datetime('now')"
    ].join('\n');
    const hits = findBareComparisons(src);
    expect(hits).toHaveLength(1);
    expect(hits[0].line).toBe(3);
  });

  test('empty and null input never throw', () => {
    expect(findBareComparisons('')).toEqual([]);
    expect(findBareComparisons(null)).toEqual([]);
  });
});

describe('timestamp-comparison recommendedFix', () => {
  // c222 measured the live db EXACTLY (counting every non-null value, not
  // sampling) and the fix is NOT the same for every column.

  test('a MIXED column must be wrapped — binding a threshold would be wrong', () => {
    // urls.created_at is 870,754 ISO + 925,136 sqlite. A bound ISO threshold
    // silently misjudges the sqlite-format half.
    expect(recommendedFix("created_at < datetime('now', '-7 day')")).toMatch(/wrap in datetime/);
    expect(recommendedFix("fetched_at >= datetime('now', '-1 day')")).toMatch(/BOTH formats/);
  });

  test('a uniformly-ISO column can bind a threshold and keep its index', () => {
    // links.discovered_at: 4,874,880 rows, all ISO — the one place where the
    // sargable fix is both correct and worth it.
    expect(recommendedFix("discovered_at > datetime('now', ?)")).toMatch(/bind an ISO threshold/);
  });

  test('a uniformly-SQLITE column is NOT a defect at all', () => {
    // content_analysis.analyzed_at: 89,532 rows, zero ISO. Reporting this as
    // something to fix would be crying wolf forever.
    expect(recommendedFix("ca.analyzed_at > datetime('now', '-30 days')")).toMatch(/NOT A DEFECT/);
  });

  test('an empty table is a free latent fix', () => {
    expect(recommendedFix("computed_at < datetime('now', '-1 day')")).toMatch(/free latent fix/);
  });

  test('an unknown column says so rather than guessing', () => {
    expect(recommendedFix("some_unmeasured_at < datetime('now', '-1 day')")).toMatch(/unmeasured/);
  });
});
