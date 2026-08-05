'use strict';

const { countSqlSignatures, rankFiles, classifyReachability, exclusionReason, staleExclusions } = require('../ncdb-debt-scan');

describe('ncdb-debt-scan countSqlSignatures', () => {
  test('counts prepare/exec/better-sqlite3 and flags connection ownership', () => {
    const text = [
      "const Database = require('better-sqlite3');",
      "const db = new Database(path);",
      "db.prepare('SELECT 1').get();",
      "db.prepare(`SELECT * FROM urls`).all();",
      "db.exec('CREATE TABLE t (id INT)');"
    ].join('\n');
    const c = countSqlSignatures(text);
    expect(c.prepare).toBe(2);
    expect(c.exec).toBe(1);
    expect(c.betterSqlite3).toBe(1);
    expect(c.total).toBe(4);
    expect(c.ownsConnection).toBe(true);
  });

  test('a file that only calls .prepare (no driver require) does not own a connection', () => {
    const c = countSqlSignatures("adapter.prepare('SELECT 1');");
    expect(c.betterSqlite3).toBe(0);
    expect(c.ownsConnection).toBe(false);
    expect(c.total).toBe(1);
  });

  test('regex .exec(variable) is NOT counted as SQL; db.exec(string/template) IS', () => {
    // The precision fix (2026-07-20): FactExtractor.js had 8 regex .exec()
    // calls miscounted as SQL. A string/template arg = real db.exec DDL.
    const regexy = "while ((m = pattern.exec(text)) !== null) {}\nre.exec(str);";
    expect(countSqlSignatures(regexy).exec).toBe(0);
    const sqly = "db.exec('CREATE TABLE t (id INT)');\ndb.exec(`PRAGMA foreign_keys=ON`);";
    expect(countSqlSignatures(sqly).exec).toBe(2);
  });

  test('line comments are stripped so commented-out SQL is not counted', () => {
    const c = countSqlSignatures("// db.prepare('SELECT 1')\nreal.prepare('SELECT 2');");
    expect(c.prepare).toBe(1);
  });

  test('the ESM import form of better-sqlite3 is also caught', () => {
    const c = countSqlSignatures("import Database from 'better-sqlite3';");
    expect(c.betterSqlite3).toBe(1);
  });

  test('empty / null input is zero, never throws', () => {
    expect(countSqlSignatures('').total).toBe(0);
    expect(countSqlSignatures(null).total).toBe(0);
  });
});

describe('ncdb-debt-scan rankFiles', () => {
  test('ranks by total desc, drops zero-signature files, stable by name on ties', () => {
    const entries = [
      { file: 'b.js', counts: { total: 3 } },
      { file: 'z.js', counts: { total: 0 } },   // dropped
      { file: 'a.js', counts: { total: 3 } },   // tie with b -> name order
      { file: 'big.js', counts: { total: 9 } }
    ];
    expect(rankFiles(entries).map((e) => e.file)).toEqual(['big.js', 'a.js', 'b.js']);
  });
});

describe('ncdb-debt-scan classifyReachability', () => {
  test('a file nothing requires, with no entry guard, is an orphan', () => {
    // The c217 case: bootstrapDbLoader.js, 13 SQL sites, zero callers —
    // ncdb's ensureSqliteNewsDatabase took over bootstrap seeding at B10c.
    expect(classifyReachability({ file: 'src/bootstrap/bootstrapDbLoader.js', refs: 0, hasEntryGuard: false }))
      .toBe('orphan');
  });

  test('any file something requires is imported, guard or not', () => {
    expect(classifyReachability({ file: 'src/shared/utils/UrlResolver.js', refs: 6, hasEntryGuard: false }))
      .toBe('imported');
  });

  test('an unreferenced file with require.main === module is an entry point', () => {
    expect(classifyReachability({ file: 'src/intelligence/matching/match-articles.js', refs: 0, hasEntryGuard: true }))
      .toBe('entry');
  });

  test('src/tools is an entry point EVEN WITHOUT a guard — the c213 lesson', () => {
    // gazetteer-cleanup.js called main() unconditionally at module scope
    // with no require.main guard at all. Treating "no guard" as "dead"
    // would have condemned a live, destructive CLI.
    expect(classifyReachability({ file: 'src/tools/add-planet-hub.js', refs: 0, hasEntryGuard: false }))
      .toBe('entry');
  });

  test('windows backslash paths classify the same as posix ones', () => {
    expect(classifyReachability({ file: 'src\\tools\\add-planet-hub.js', refs: 0, hasEntryGuard: false }))
      .toBe('entry');
  });

  test('missing fields never throw and default to orphan', () => {
    expect(classifyReachability({})).toBe('orphan');
  });
});

describe('ncdb-debt-scan exclusionReason', () => {
  test('the two UNAPPLIED migrations are excluded for a stated, measured reason', () => {
    expect(exclusionReason('src/tools/normalize-urls/normalize-fetches.js')).toMatch(/NOT yet applied/);
    expect(exclusionReason('src/tools/normalize-urls/normalize-place-hub-candidates.js')).toMatch(/NOT yet applied/);
  });

  test('an ordinary file has no exclusion', () => {
    expect(exclusionReason('src/shared/utils/UrlResolver.js')).toBeNull();
  });
});

describe('ncdb-debt-scan staleExclusions', () => {
  // An exclusion for a file that no longer exists is dead weight, and a table
  // of dead weight is exactly how the 2026-07-20 "these are migration
  // one-offs, skip" ruling rotted into uselessness. The tool prunes itself.
  test('an exclusion matching no file is reported as stale', () => {
    expect(staleExclusions(['src/shared/utils/UrlResolver.js'])).not.toHaveLength(0);
  });

  test('an exclusion whose file is still present is not stale', () => {
    const live = staleExclusions([
      'src/tools/normalize-urls/normalize-fetches.js',
      'src/tools/normalize-urls/normalize-place-hub-candidates.js',
      'src/intelligence/matching/populate-place-names.js'
    ]);
    expect(live).toEqual([]);
  });

  test('the CURRENT table has no stale entries — c218 retired three files and pruned their entry', () => {
    const fs = require('fs');
    const path = require('path');
    const root = path.resolve(__dirname, '..', '..', '..');
    const present = [];
    const walk = (dir) => {
      for (const name of fs.readdirSync(dir)) {
        if (name === 'node_modules' || name === '.git') continue;
        const full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) walk(full);
        else if (name.endsWith('.js')) present.push(path.relative(root, full).replace(/\\/g, '/'));
      }
    };
    walk(path.join(root, 'src'));
    expect(staleExclusions(present)).toEqual([]);
  });

  test('non-array input never throws', () => {
    expect(() => staleExclusions(null)).not.toThrow();
  });
});
