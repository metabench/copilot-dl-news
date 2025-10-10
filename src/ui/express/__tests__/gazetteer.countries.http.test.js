const http = require('http');
const fs = require('fs');
const path = require('path');
const { startServer } = require('../server');
const pathResolveDb = require('path').resolve(__dirname, '../../../db');
const NewsDatabase = require(pathResolveDb);

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
  db.db.exec(`DELETE FROM places; DELETE FROM place_names; DELETE FROM place_hierarchy; DELETE FROM place_external_ids; DELETE FROM articles;`);
  const ctry = db.db.prepare(`INSERT INTO places(kind, country_code, population) VALUES ('country','GB',67000000)`);
  const id = ctry.run().lastInsertRowid;
  const nameId = db.db.prepare(`INSERT INTO place_names(place_id, name, normalized, lang, name_kind, is_preferred, is_official) VALUES (?,?,?,?,?,?,?)`).run(id, 'United Kingdom', 'united kingdom', 'en', 'official', 1, 1).lastInsertRowid;
  db.db.prepare('UPDATE places SET canonical_name_id=? WHERE id=?').run(nameId, id);
  db.close();
}

describe('Gazetteer countries page', () => {
  let server;
  let port;
  const tmpDb = path.join(__dirname, 'tmp_gaz_countries.db');
  beforeAll(async () => {
    try { fs.unlinkSync(tmpDb); } catch (_) {}
    seedDb(tmpDb);
    process.env.DB_PATH = tmpDb;
    process.env.PORT = '0';
    server = await startServer();
    await new Promise((r) => setTimeout(r, 120));
    const addr = server.address();
    port = typeof addr === 'object' ? addr.port : 3000;
  });
  afterAll(async () => {
    if (server) await new Promise((r) => server.close(r));
    try { delete process.env.DB_PATH; } catch (_) {}
    try { fs.unlinkSync(tmpDb); } catch (_) {}
  });

  test('renders list of countries and links to detail', async () => {
    const page = await getText('127.0.0.1', port, '/gazetteer/countries');
    expect(page.status).toBe(200);
    expect(page.headers['content-type']).toMatch(/text\/html/);
    expect(page.text).toMatch(/Countries/);
    expect(page.text).toMatch(/United Kingdom/);
    expect(page.text).toMatch(/\/gazetteer\/place\//);
  });
});
