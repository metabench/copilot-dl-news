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

function seedDb(p, n = 80) {
  const db = new NewsDatabase(p);
  db.db.exec(`DELETE FROM places; DELETE FROM place_names; DELETE FROM place_hierarchy; DELETE FROM place_external_ids;`);
  // Seed enough cities to guarantee multiple pages
  const count = Math.max(60, n);
  for (let i = 0; i < count; i++) {
    const id = db.db.prepare(`INSERT INTO places(kind, country_code, adm1_code, population) VALUES ('city','US','CA',?)`).run(100 + i).lastInsertRowid;
    const name = 'City-' + String(i).padStart(3, '0');
    const norm = name.toLowerCase();
    const nameId = db.db.prepare(`INSERT INTO place_names(place_id, name, normalized, lang, name_kind, is_preferred, is_official) VALUES (?,?,?,?,?,?,?)`)
      .run(id, name, norm, 'en', 'common', 1, 1).lastInsertRowid;
    db.db.prepare('UPDATE places SET canonical_name_id=? WHERE id=?').run(nameId, id);
  }
  db.close();
}

describe('/gazetteer/places pager storage propagation', () => {
  let server, port;
  const tmpDb = path.join(__dirname, 'tmp_gaz_places_pager_storage.db');
  beforeAll(async () => {
    try { fs.unlinkSync(tmpDb); } catch (_) {}
    seedDb(tmpDb, 80);
    process.env.DB_PATH = tmpDb;
    process.env.PORT = '0';
    server = await startServer();
    const addr = server.address();
    port = typeof addr === 'object' ? addr.port : 0;
  });
  afterAll(async () => {
    if (server) await new Promise(r => server.close(r));
    try { fs.unlinkSync(tmpDb); } catch (_) {}
    try { delete process.env.DB_PATH; } catch (_) {}
  });

  test('prev/next include storage=1 when enabled', async () => {
    // Use small page size to ensure multiple pages
    const res = await getText('127.0.0.1', port, '/gazetteer/places?kind=city&storage=1&page=2&pageSize=10');
    expect(res.status).toBe(200);
    // Extract pager links
    const prev = res.text.match(/<a href="(\?[^"#>]*)">\s*←\s*Prev\s*<\/a>/);
    const next = res.text.match(/<a href="(\?[^"#>]*)">\s*Next\s*→\s*<\/a>/);
    expect(prev).toBeTruthy();
    expect(next).toBeTruthy();
    expect(prev && prev[1]).toMatch(/(?:^|&)storage=1(?:&|$)/);
    expect(next && next[1]).toMatch(/(?:^|&)storage=1(?:&|$)/);
  });
});
