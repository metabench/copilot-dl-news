'use strict';

const { findBareComparisons, recommendedFix, resolveTable } = require('../checks/timestamp-comparison.check');

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

describe('timestamp-comparison resolveTable', () => {
  // c223: keying the census by bare COLUMN name gave a wrong recommendation.
  // `discovered_at` is all-ISO on links (4.9M rows) but uniformly sqlite on
  // site_url_patterns (72 rows) — and the only site comparing one reads
  // site_url_patterns. The tool told me to "bind an ISO threshold", which
  // would have broken a working query. Resolution is by table now.
  const q = (sql) => {
    const hits = findBareComparisons(sql);
    return hits.length ? hits[0].table : null;
  };

  test('resolves the table from a plain FROM', () => {
    expect(q("SELECT COUNT(*) FROM site_url_patterns WHERE discovered_at > datetime('now', ?)"))
      .toBe('site_url_patterns');
  });

  test('the SAME column in another table resolves differently', () => {
    expect(q("SELECT * FROM links WHERE discovered_at > datetime('now', '-7 day')"))
      .toBe('links');
  });

  test('and the two get OPPOSITE advice — the c223 regression', () => {
    expect(recommendedFix("discovered_at > datetime('now', ?)", 'site_url_patterns'))
      .toMatch(/NOT A DEFECT/);
    expect(recommendedFix("discovered_at > datetime('now', ?)", 'links'))
      .toMatch(/bind an ISO threshold/);
  });

  test('an alias-qualified column resolves through its alias', () => {
    expect(q("SELECT * FROM http_responses hr WHERE hr.fetched_at < datetime('now', '-1 day')"))
      .toBe('http_responses');
  });

  test('DELETE FROM resolves too', () => {
    expect(q("DELETE FROM rate_limits WHERE updated_at < datetime('now', '-30 days')"))
      .toBe('rate_limits');
  });

  test('an unresolvable table yields null, and the advice refuses to guess', () => {
    expect(recommendedFix("some_col > datetime('now')", null)).toMatch(/unattributed/);
  });
});

describe('timestamp-comparison recommendedFix', () => {
  // c222 measured the live db EXACTLY (counting every non-null value, not
  // sampling) and the fix is NOT the same for every column.

  // c223: the signature takes the resolved TABLE as well, because the column
  // name alone gave opposite-and-wrong advice for site_url_patterns.

  test('the MIXED branch still gives wrap-advice — no column is mixed TODAY', () => {
    // urls.created_at WAS 870,754 ISO + 925,136 sqlite. c224 normalised all
    // fifteen mixed columns (2,117,429 rows), so nothing in the live census
    // is mixed any more — but the branch must stay correct, because a new
    // writer using a different format would recreate the condition.
    const { COLUMN_FORMAT } = require('../checks/timestamp-comparison.check');
    expect(Object.values(COLUMN_FORMAT)).not.toContain('mixed');

    COLUMN_FORMAT['synthetic_table.synthetic_at'] = 'mixed';
    try {
      expect(recommendedFix("synthetic_at < datetime('now', '-7 day')", 'synthetic_table'))
        .toMatch(/wrap in datetime/);
      expect(recommendedFix("synthetic_at < datetime('now', '-7 day')", 'synthetic_table'))
        .toMatch(/BOTH formats/);
    } finally {
      delete COLUMN_FORMAT['synthetic_table.synthetic_at'];
    }
  });

  test('the normalised columns are bindable now', () => {
    // The point of the c224 rewrite: these were the blocked ones.
    expect(recommendedFix("created_at < datetime('now', '-7 day')", 'urls')).toMatch(/bind an ISO threshold/);
    expect(recommendedFix("fetched_at >= datetime('now', '-1 day')", 'fetches')).toMatch(/bind an ISO threshold/);
  });

  test('a uniformly-ISO column can bind a threshold and keep its index', () => {
    // links.discovered_at: 4,874,880 rows, all ISO — the sargable fix is both
    // correct and worth it there.
    expect(recommendedFix("discovered_at > datetime('now', ?)", 'links')).toMatch(/bind an ISO threshold/);
  });

  test('a uniformly-SQLITE column is NOT a defect at all', () => {
    // content_analysis.analyzed_at: 89,532 rows, zero ISO. urls.fetched_at:
    // 165,990 rows, zero ISO. Reporting these would be crying wolf forever.
    expect(recommendedFix("ca.analyzed_at > datetime('now', '-30 days')", 'content_analysis')).toMatch(/NOT A DEFECT/);
    expect(recommendedFix("fetched_at >= datetime('now', ?)", 'urls')).toMatch(/NOT A DEFECT/);
  });

  test('a table the live schema does not have is a DEAD PATH, not debt', () => {
    expect(recommendedFix("sent_at >= datetime('now', ?)", 'alert_history')).toMatch(/DEAD PATH/);
  });

  test('an empty table is a free latent fix', () => {
    expect(recommendedFix("computed_at < datetime('now', '-1 day')", 'recommendations')).toMatch(/free latent fix/);
  });

  test('an unknown table.column says so rather than guessing', () => {
    expect(recommendedFix("whatever_at < datetime('now', '-1 day')", 'some_table')).toMatch(/unmeasured/);
  });
});
