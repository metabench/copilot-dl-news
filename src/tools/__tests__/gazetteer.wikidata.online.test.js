const path = require('path');
const { ensureDb } = require('../../ensure_db');
const { spawnSync } = require('child_process');

describe('Wikidata imports (live)', () => {
  const live = process.env.LIVE_NET === '1';
  const maybe = live ? test : test.skip;
  const script = path.join(process.cwd(), 'src', 'tools', 'populate-gazetteer.js');
  const dbPath = path.join(process.cwd(), 'tmp-test', 'gazetteer.live.db');

  function run(args) {
    const env = { ...process.env, LIVE_NET: '1' };
    const proc = spawnSync(process.execPath, [script, ...args], { cwd: process.cwd(), env });
    return { code: proc.status, out: (proc.stdout||'').toString(), err: (proc.stderr||'').toString() };
  }

  maybe('imports ADM1 for IE quickly (limit)', () => {
    jest.setTimeout(40000);
    const res = run([`--db=${dbPath}`, '--countries=IE', '--import-adm1=1', '--adm1-limit=40', '--verbose=0']);
    expect(res.code).toBe(0);
    const db = ensureDb(dbPath);
    const adm1 = db.prepare("select count(*) c from places where kind='region' and adm1_code is not null and country_code='IE'").get().c;
    expect(adm1).toBeGreaterThan(0);
    db.close();
  });

  maybe('imports a few cities for IE (limit)', () => {
    jest.setTimeout(40000);
    const res = run([`--db=${dbPath}`, '--countries=IE', '--import-cities=1', '--cities-per-country=5', '--verbose=0']);
    expect(res.code).toBe(0);
    const db = ensureDb(dbPath);
    const cities = db.prepare("select count(*) c from places where kind='city' and country_code='IE'").get().c;
    expect(cities).toBeGreaterThan(0);
    db.close();
  });
});
