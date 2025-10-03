const http = require('http');
const fs = require('fs');
const path = require('path');
const { startServer } = require('../server');
const NewsDatabase = require(path.resolve(__dirname, '../../../db'));

function getText(host, port, pathStr) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: host, port, path: pathStr }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (d) => buf += d);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: buf }));
    }).on('error', reject);
  });
}

function seedDb(p) {
  const db = new NewsDatabase(p);
  db.db.exec(`DELETE FROM places; DELETE FROM place_names; DELETE FROM place_hierarchy; DELETE FROM place_external_ids;`);
  // Create two cities with different approximate sizes
  const c1 = db.db.prepare(`INSERT INTO places(kind, country_code, adm1_code, population) VALUES ('city','US','CA',100)`).run().lastInsertRowid;
  const n1a = db.db.prepare(`INSERT INTO place_names(place_id, name, normalized, lang, name_kind, is_preferred, is_official) VALUES (?,?,?,?,?,?,?)`).run(c1, 'Alpha', 'alpha', 'en', 'common', 1, 1).lastInsertRowid;
  db.db.prepare('UPDATE places SET canonical_name_id=? WHERE id=?').run(n1a, c1);

  const c2 = db.db.prepare(`INSERT INTO places(kind, country_code, adm1_code, population) VALUES ('city','US','CA',200)`).run().lastInsertRowid;
  const n2a = db.db.prepare(`INSERT INTO place_names(place_id, name, normalized, lang, name_kind, is_preferred, is_official) VALUES (?,?,?,?,?,?,?)`).run(c2, 'Betaopolis-superlongname', 'betaopolis-superlongname', 'en', 'common', 1, 1).lastInsertRowid;
  // Add an extra alias to make c2 bigger
  db.db.prepare(`INSERT INTO place_names(place_id, name, normalized, lang, name_kind, is_preferred, is_official) VALUES (?,?,?,?,?,?,?)`).run(c2, 'Beta', 'beta', 'en', 'alias', 0, 0);
  db.db.prepare('UPDATE places SET canonical_name_id=? WHERE id=?').run(n2a, c2);
  db.close();
}

describe('/gazetteer/places storage and sorting', () => {
  let server, port;
  const tmpDb = path.join(__dirname, 'tmp_gaz_places_storage.db');
  beforeAll(async () => {
    try { fs.unlinkSync(tmpDb); } catch (_) {}
    seedDb(tmpDb);
    process.env.DB_PATH = tmpDb;
    process.env.PORT = '0';
    server = startServer();
    await new Promise(r => setTimeout(r, 120));
    const addr = server.address();
    port = typeof addr === 'object' ? addr.port : 0;
  });
  afterAll(async () => {
    if (server) await new Promise(r => server.close(r));
    try { fs.unlinkSync(tmpDb); } catch (_) {}
    try { delete process.env.DB_PATH; } catch (_) {}
  });

  test('no storage column by default', async () => {
    const res = await getText('127.0.0.1', port, '/gazetteer/places?kind=city');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).not.toMatch(/<th[^>]*>Storage<\/th>/);
    expect(res.text).not.toMatch(/Total shown storage/);
    expect(res.text).not.toMatch(/title="Approximate"/);
  });

  test('storage=1 shows column, totals, and markers', async () => {
    const res = await getText('127.0.0.1', port, '/gazetteer/places?kind=city&storage=1');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<th[^>]*>Storage<\/th>/);
    expect(res.text).toMatch(/Total shown storage:\s*~\s*\d/);
    expect(res.text).toMatch(/title=\"Approximate\"/);
  });

  test('sort=storage orders by size desc', async () => {
    const res = await getText('127.0.0.1', port, '/gazetteer/places?kind=city&storage=1&sort=storage&dir=desc');
    expect(res.status).toBe(200);
    // First row should be the larger city 'Betaopolis-superlongname'
    const m = res.text.match(/<tbody>\s*<tr>\s*<td><a [^>]*>([^<]+)<\/a><\/td>/i);
    expect(m).toBeTruthy();
    expect(m && m[1]).toMatch(/Betaopolis/);
  });
});
