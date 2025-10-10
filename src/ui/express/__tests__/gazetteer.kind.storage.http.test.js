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
  db.db.exec(`DELETE FROM places; DELETE FROM place_names;`);
  // Cities
  const c1 = db.db.prepare(`INSERT INTO places(kind, country_code, adm1_code, population) VALUES ('city','US','CA',100)`).run().lastInsertRowid;
  const n1 = db.db.prepare(`INSERT INTO place_names(place_id, name, normalized, lang, name_kind, is_preferred, is_official) VALUES (?,?,?,?,?,?,?)`).run(c1, 'Alpha', 'alpha', 'en', 'common', 1, 1).lastInsertRowid;
  db.db.prepare('UPDATE places SET canonical_name_id=? WHERE id=?').run(n1, c1);
  const c2 = db.db.prepare(`INSERT INTO places(kind, country_code, adm1_code, population) VALUES ('city','US','CA',200)`).run().lastInsertRowid;
  const n2 = db.db.prepare(`INSERT INTO place_names(place_id, name, normalized, lang, name_kind, is_preferred, is_official) VALUES (?,?,?,?,?,?,?)`).run(c2, 'Beta', 'beta', 'en', 'common', 1, 1).lastInsertRowid;
  db.db.prepare('UPDATE places SET canonical_name_id=? WHERE id=?').run(n2, c2);
  db.close();
}

describe('By-kind storage UI', () => {
  let server, port;
  const tmpDb = path.join(__dirname, 'tmp_gaz_kind_storage.db');
  beforeAll(async () => {
    try { fs.unlinkSync(tmpDb); } catch (_) {}
    seedDb(tmpDb);
    process.env.DB_PATH = tmpDb;
    process.env.PORT = '0';
    server = await startServer();
    await new Promise(r => setTimeout(r, 120));
    const addr = server.address();
    port = typeof addr === 'object' ? addr.port : 0;
  });
  afterAll(async () => {
    if (server) await new Promise(r => server.close(r));
    try { fs.unlinkSync(tmpDb); } catch (_) {}
    try { delete process.env.DB_PATH; } catch (_) {}
  });

  test('storage=1 adds column, totals, and approx markers', async () => {
    const res = await getText('127.0.0.1', port, '/gazetteer/kind/city?storage=1');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toMatch(/<th[^>]*>Storage<\/th>/);
    expect(res.text).toMatch(/Total shown storage:\s*~\s*\d/);
    expect(res.text).toMatch(/title=\"Approximate\"/);
  });

  test('no storage param hides storage UI', async () => {
    const res = await getText('127.0.0.1', port, '/gazetteer/kind/city');
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/<th[^>]*>Storage<\/th>/);
    expect(res.text).not.toMatch(/Total shown storage/);
  });
});
