'use strict';

const {
  findArityMismatches, countArgs, countPlaceholders
} = require('../checks/placeholder-arity.check');

describe('placeholder-arity countPlaceholders', () => {
  test('counts positional placeholders', () => {
    expect(countPlaceholders('SELECT * FROM t WHERE a = ? AND b = ?')).toBe(2);
  });

  test('ignores a ? inside a SQL string literal', () => {
    expect(countPlaceholders("SELECT * FROM t WHERE a = ? AND b = 'what?'")).toBe(1);
  });

  test('empty input is zero, never throws', () => {
    expect(countPlaceholders('')).toBe(0);
    expect(countPlaceholders(null)).toBe(0);
  });
});

describe('placeholder-arity countArgs', () => {
  test('counts top-level arguments only', () => {
    expect(countArgs('a, b, c')).toBe(3);
    expect(countArgs('a, fn(b, c), d')).toBe(3);
    expect(countArgs('{ x: 1, y: 2 }')).toBe(1);
    expect(countArgs("'a, b', c")).toBe(2);
  });

  test('an empty argument list is zero', () => {
    expect(countArgs('')).toBe(0);
    expect(countArgs('   ')).toBe(0);
  });
});

describe('placeholder-arity findArityMismatches', () => {
  test('flags a statement whose caller binds nothing — the c225 shape', () => {
    // Four ncdb statements were left exactly like this: a `?` introduced by a
    // mechanical edit, and a caller that had never needed an argument.
    const src = "db.prepare(`SELECT * FROM t WHERE ts > ?`).all();";
    const hits = findArityMismatches(src);
    expect(hits).toHaveLength(1);
    expect(hits[0].placeholders).toBe(1);
    expect(hits[0].args).toBe(0);
    expect(hits[0].method).toBe('all');
  });

  test('flags an argument passed to SQL with no placeholder', () => {
    // The c230 find: better-sqlite3 throws "Too many parameter values".
    const src = "db.prepare('SELECT * FROM places LIMIT 50').all(this.max);";
    const hits = findArityMismatches(src);
    expect(hits).toHaveLength(1);
    expect(hits[0].placeholders).toBe(0);
    expect(hits[0].args).toBe(1);
  });

  test('a matching statement is not flagged', () => {
    expect(findArityMismatches("db.prepare('SELECT * FROM t WHERE a = ? AND b = ?').get(1, 2)")).toHaveLength(0);
    expect(findArityMismatches("db.prepare('SELECT 1').get()")).toHaveLength(0);
  });

  test('ESCAPED QUOTES inside the SQL do not end the string early', () => {
    // The check's own first run produced 40 confident, entirely bogus findings
    // because a naive non-greedy match stopped at the escaped quote and then
    // ran on through real code into a later one.
    const src = [
      "db.prepare('INSERT INTO t (a, b) VALUES (?, datetime(\\'now\\'))').run(1);",
      "articles.forEach(x => other.run(x));",
      "db.prepare('SELECT 1').get();"
    ].join('\n');
    expect(findArityMismatches(src)).toHaveLength(0);
  });

  test('interpolated SQL is skipped — the placeholder count is not fixed', () => {
    expect(findArityMismatches('db.prepare(`SELECT * FROM t WHERE id IN (${marks})`).all(a, b)')).toHaveLength(0);
  });

  test('a spread argument is skipped — the arity is not fixed', () => {
    expect(findArityMismatches("db.prepare('SELECT * FROM t WHERE a = ?').all(...params)")).toHaveLength(0);
  });

  test('named parameters are skipped — one object is bound', () => {
    expect(findArityMismatches("db.prepare('INSERT INTO t VALUES (@a, @b)').run(obj)")).toHaveLength(0);
  });

  test('a commented-out statement is not code', () => {
    expect(findArityMismatches("// db.prepare('SELECT ?').get()")).toHaveLength(0);
  });

  test('empty and null input never throw', () => {
    expect(findArityMismatches('')).toEqual([]);
    expect(findArityMismatches(null)).toEqual([]);
  });
});
