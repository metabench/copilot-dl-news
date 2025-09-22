const http = require('http');
const fs = require('fs');
const path = require('path');
const { startServer } = require('../server');
const NewsDatabase = require(path.resolve(__dirname, '../../../db.js'));

function getText(hostname, port, pathStr) {
  return new Promise((resolve, reject) => {
    http.get({ hostname, port, path: pathStr }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (d) => buf += d);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: buf }));
    }).on('error', reject);
  });
}

function seedDb(p) {
  const db = new NewsDatabase(p);
  db.db.exec(`DELETE FROM places; DELETE FROM place_names;`);
  // Country GB
  const countryId = db.db.prepare(`INSERT INTO places(kind, country_code, population) VALUES ('country','GB',67000000)`).run().lastInsertRowid;
  const cNameId = db.db.prepare(`INSERT INTO place_names(place_id, name, normalized, lang, name_kind, is_preferred, is_official) VALUES (?,?,?,?,?,?,?)`).run(countryId, 'United Kingdom', 'united kingdom', 'en', 'official', 1, 1).lastInsertRowid;
  db.db.prepare('UPDATE places SET canonical_name_id=? WHERE id=?').run(cNameId, countryId);
  // Region England
  const regionId = db.db.prepare(`INSERT INTO places(kind, country_code, adm1_code) VALUES ('region','GB','ENG')`).run().lastInsertRowid;
  const rNameId = db.db.prepare(`INSERT INTO place_names(place_id, name, normalized, lang, name_kind, is_preferred, is_official) VALUES (?,?,?,?,?,?,?)`).run(regionId, 'England', 'england', 'en', 'official', 1, 1).lastInsertRowid;
  db.db.prepare('UPDATE places SET canonical_name_id=? WHERE id=?').run(rNameId, regionId);
  // City London
  const cityId = db.db.prepare(`INSERT INTO places(kind, country_code, adm1_code, population) VALUES ('city','GB','ENG',9000000)`).run().lastInsertRowid;
  const tNameId = db.db.prepare(`INSERT INTO place_names(place_id, name, normalized, lang, name_kind, is_preferred, is_official) VALUES (?,?,?,?,?,?,?)`).run(cityId, 'London', 'london', 'en', 'common', 1, 1).lastInsertRowid;
  db.db.prepare('UPDATE places SET canonical_name_id=? WHERE id=?').run(tNameId, cityId);
  db.close();
}

describe('Country page storage toggle', () => {
  let server;
  let port;
  const tmpDb = path.join(__dirname, 'tmp_gaz_country_storage.db');
  beforeAll(async () => {
    try { fs.unlinkSync(tmpDb); } catch (_) {}
    seedDb(tmpDb);
    process.env.DB_PATH = tmpDb;
    process.env.PORT = '0';
    server = startServer();
    await new Promise((r) => setTimeout(r, 120));
    const addr = server.address();
    port = typeof addr === 'object' ? addr.port : 3000;
  });
  afterAll(async () => {
    if (server) await new Promise((r) => server.close(r));
    try { delete process.env.DB_PATH; } catch (_) {}
    try { fs.unlinkSync(tmpDb); } catch (_) {}
  });

  test('storage=1 shows storage info and headers', async () => {
    const res = await getText('127.0.0.1', port, '/gazetteer/country/GB?storage=1');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
  // Infobox storage (allowing tags between label and value)
  expect(res.text).toMatch(/Storage:\s*(?:<[^>]+>)*\s*[~\d]/);
    // Cities table includes Storage header
    expect(res.text).toMatch(/<th[^>]*>Storage<\/th>/);
    // At least one size cell with units
    expect(res.text).toMatch(/\b(B|KB|MB|GB|TB)\b/);
  // Toggle link should show it's on and point to storage=0 to turn off
  expect(res.text).toMatch(/Storage:\s*On/);
  expect(res.text).toMatch(/storage=0/);
  });

  test('no storage param hides storage UI', async () => {
    const res = await getText('127.0.0.1', port, '/gazetteer/country/GB');
    expect(res.status).toBe(200);
  // Header should not include a Storage column
  expect(res.text).not.toMatch(/<th[^>]*>Storage<\/th>/);
  // No units typically used for storage sizes should appear in table cells
  expect(res.text).not.toMatch(/\b(KB|MB|TB)\b/);
  });

  test('404 on unknown country', async () => {
    const res = await getText('127.0.0.1', port, '/gazetteer/country/ZZ');
    expect(res.status).toBe(404);
  });
});
