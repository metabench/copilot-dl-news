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
  db.db.exec(`DELETE FROM places; DELETE FROM place_names; DELETE FROM place_hierarchy; DELETE FROM place_external_ids; DELETE FROM articles; DELETE FROM place_hubs;`);
  const city = db.db.prepare(`INSERT INTO places(kind, country_code, adm1_code, population) VALUES ('city','GB','ENG',900000)`);
  const placeId = city.run().lastInsertRowid;
  const nameId = db.db.prepare(`INSERT INTO place_names(place_id, name, normalized, lang, name_kind, is_preferred, is_official) VALUES (?,?,?,?,?,?,?)`).run(placeId, 'London', 'london', 'en', 'common', 1, 1).lastInsertRowid;
  db.db.prepare('UPDATE places SET canonical_name_id=? WHERE id=?').run(nameId, placeId);
  db.close();
}

describe('Gazetteer SSR pages', () => {
  let server;
  let port;
  const tmpDb = path.join(__dirname, 'tmp_gaz_ssr.db');
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

  test('list page renders HTML with results', async () => {
    const page = await getText('127.0.0.1', port, '/gazetteer/places?q=london');
    expect(page.status).toBe(200);
    expect(page.headers['content-type']).toMatch(/text\/html/);
    expect(page.text).toMatch(/Gazetteer/);
    expect(page.text).toMatch(/London/);
  });

  test('detail page renders HTML for a place', async () => {
    const list = await getText('127.0.0.1', port, '/gazetteer/places?q=london');
    const m = list.text.match(/\/gazetteer\/place\/(\d+)/);
    expect(m).toBeTruthy();
    const id = m[1];
    const detail = await getText('127.0.0.1', port, `/gazetteer/place/${id}`);
    expect(detail.status).toBe(200);
    expect(detail.text).toMatch(/Names/);
    expect(detail.text).toMatch(/Hierarchy/);
  expect(detail.text).toMatch(/Storage:\s*\d+[\d.,]*\s*(B|KB|MB|GB|TB)/);
  });

  test('summary landing renders counts and links', async () => {
    const page = await getText('127.0.0.1', port, '/gazetteer');
    expect(page.status).toBe(200);
    expect(page.headers['content-type']).toMatch(/text\/html/);
    expect(page.text).toMatch(/Gazetteer/);
    expect(page.text).toMatch(/Countries/);
    expect(page.text).toMatch(/All places|Places/);
  });
});
