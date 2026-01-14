const path = require('path');
const fs = require('fs');
const { ensureDb } = require('../../data/db/sqlite');
const { spawnSync } = require('child_process');

describe('maintain-db dedupes place_sources', () => {
  const tmpDir = path.join(process.cwd(), 'tmp-maintain-test');
  const dbPath = path.join(tmpDir, 'maintain.db');
  const script = path.join(process.cwd(), 'src', 'tools', 'maintain-db.js');

  beforeAll(() => {
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const db = ensureDb(dbPath);
    try {
  // Allow duplicates for test setup
  try { db.exec('DROP INDEX IF EXISTS uniq_place_sources'); } catch (_) {}
      const ins = db.prepare('INSERT INTO place_sources(name,version,url,license) VALUES (?,?,?,?)');
      // Insert duplicates
      ins.run('restcountries','v3.1','https://restcountries.com','CC BY 4.0');
      ins.run('restcountries','v3.1','https://restcountries.com','CC BY 4.0');
      ins.run('restcountries','v3.1','https://restcountries.com','CC BY 4.0');
    } finally {
      db.close();
    }
  });

  afterAll(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} });

  it('removes duplicates and enforces unique index', () => {
    const proc = spawnSync(process.execPath, [script, `--db=${dbPath}`, '--quiet=1'], { cwd: process.cwd() });
    expect(proc.status).toBe(0);
    const db = ensureDb(dbPath);
    try {
      const rows = db.prepare('SELECT * FROM place_sources').all();
      expect(rows.length).toBe(1);
      // Inserting duplicate should now fail
      const ins = db.prepare('INSERT OR IGNORE INTO place_sources(name,version,url,license) VALUES (?,?,?,?)');
      const info = ins.run('restcountries','v3.1','https://restcountries.com','CC BY 4.0');
      expect(info.changes).toBe(0);
    } finally {
      db.close();
    }
  });
});
