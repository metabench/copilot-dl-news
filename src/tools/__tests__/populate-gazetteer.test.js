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

  // c215: the two tests above run the IMPORT path only — they never pass
  // --cleanup, so they did not exercise the duplicate-merge code at all.
  // That code was delegated to news-crawler-db this cycle, and a delegation
  // is only as good as the proof behind it, so the cleanup path gets its own
  // seeded end-to-end test.
  test('--cleanup-only merges a seeded duplicate and backfills its qid', () => {
    const cleanupDb = path.join(tmpDir, 'gazetteer.cleanup.test.db');
    try { fs.rmSync(cleanupDb, { force: true }); } catch (_) { /* fresh run */ }

    const db = ensureDb(cleanupDb);
    const addPlace = (name, source, qid, population) => {
      const id = db.prepare(
        'INSERT INTO places (kind, country_code, source, wikidata_qid, population) VALUES (?,?,?,?,?)'
      ).run('city', 'GB', source, qid, population).lastInsertRowid;
      db.prepare(
        "INSERT INTO place_names (place_id, name, normalized, lang, name_kind, source) VALUES (?,?,?,'en','official',?)"
      ).run(id, name, name.toLowerCase(), source);
      return id;
    };
    // A clear winner (wikidata + population) and a clear loser.
    const keep = addPlace('Ipswich', 'wikidata', 'Q130447', 144957);
    const drop = addPlace('Ipswich', 'restcountries@v3.1', null, null);
    // A place whose qid must be backfilled from its external id.
    const needsBackfill = addPlace('Norwich', 'wikidata', null, 195000);
    db.prepare("INSERT INTO place_external_ids (source, ext_id, place_id) VALUES ('wikidata','Q130191',?)").run(needsBackfill);
    db.close();

    const res = runNode(script, [`--db=${cleanupDb}`, '--cleanup-only', '--offline=1']);
    expect(res.code).toBe(0);

    const after = ensureDb(cleanupDb);
    const ids = after.prepare("SELECT id FROM places WHERE kind='city'").all().map((r) => r.id);
    expect(ids).toContain(keep);      // the higher-scoring place survived
    expect(ids).not.toContain(drop);  // the duplicate is gone
    // and the backfill ran through the delegated UPDATE
    expect(after.prepare('SELECT wikidata_qid FROM places WHERE id = ?').get(needsBackfill).wikidata_qid).toBe('Q130191');
    after.close();
  }, 60000);
});
