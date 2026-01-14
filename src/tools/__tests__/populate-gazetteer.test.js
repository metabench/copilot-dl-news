const path = require('path');
const fs = require('fs');
const { ensureDb } = require('../../data/db/sqlite');

function runNode(script, args = []) {
  const { spawnSync } = require('child_process');
  const proc = spawnSync(process.execPath, [script, ...args], { cwd: process.cwd(), env: { ...process.env, RESTCOUNTRIES_OFFLINE: '1' } });
  const out = (proc.stdout || '').toString().trim();
  const err = (proc.stderr || '').toString().trim();
  return { code: proc.status, out, err };
}

describe('populate-gazetteer script', () => {
  const tmpDir = path.join(process.cwd(), 'tmp-test');
  const dbPath = path.join(tmpDir, 'gazetteer.test.db');
  const script = path.join(process.cwd(), 'src', 'tools', 'populate-gazetteer.js');

  beforeAll(() => { if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true }); });
  afterAll(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} });

  test('imports filtered countries offline and is idempotent', () => {
    const args = [`--db=${dbPath}`, '--countries=GB,IE', '--offline=1'];
    const first = runNode(script, args);
    expect(first.code).toBe(0);
    const json = JSON.parse(first.out);
    expect(json.countries).toBeGreaterThanOrEqual(1);

    // Rerun should not add duplicates and should be quick
    const second = runNode(script, args);
    expect(second.code).toBe(0);

    const db = ensureDb(dbPath);
    const countries = db.prepare("select count(*) as c from places where kind='country'").get().c;
    const cities = db.prepare("select count(*) as c from places where kind='city'").get().c;
    const names = db.prepare("select count(*) as c from place_names").get().c;
    expect(countries).toBeGreaterThanOrEqual(2); // GB + IE
    expect(cities).toBeGreaterThanOrEqual(1); // at least capitals
    expect(names).toBeGreaterThanOrEqual(10);
    db.close();
  });

  test('early-exit when already populated without filters', () => {
    // Pre-populate with GB offline
    const pre = runNode(script, [`--db=${dbPath}`, '--countries=GB', '--offline=1']);
    expect(pre.code).toBe(0);

    const start = Date.now();
    const res = runNode(script, [`--db=${dbPath}`, '--offline=1']);
    const dur = Date.now() - start;
    expect(res.code).toBe(0);
    const json = JSON.parse(res.out);
    expect(json.skipped).toBe('already-populated');
    expect(dur).toBeLessThan(2000);
  });
});
