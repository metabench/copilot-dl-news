'use strict';

const { countSqlSignatures, rankFiles } = require('../ncdb-debt-scan');

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
