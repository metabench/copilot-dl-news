const request = require('supertest');
const fs = require('fs');
const path = require('path');

jest.mock('jsdom', () => {
  class MockJSDOM {
    constructor() {
      this.window = {
        document: {
          body: {},
          createElement: () => ({})
        },
        navigator: {}
      };
    }
    static fragment() {
      return { firstChild: null };
    }
  }

  class MockVirtualConsole {
    on() {
      return this;
    }
  }

  return { JSDOM: MockJSDOM, VirtualConsole: MockVirtualConsole };
});

const { createApp } = require('../server');
const { ensureDb } = require('../../../db/sqlite/v1/ensureDb');

function tableExists(db, tableName) {
  try {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(tableName);
    return Boolean(row);
  } catch (_) {
    return false;
  }
}

function seedMinimalGazetteer(dbPath) {
  const db = ensureDb(dbPath);
  const tablesToClear = [
    'article_places',
    'place_hubs',
    'place_hierarchy',
    'place_external_ids',
    'place_names',
    'places',
    'urls'
  ];

  for (const table of tablesToClear) {
    if (tableExists(db, table)) {
      db.prepare(`DELETE FROM ${table}`).run();
    }
  }

  if (tableExists(db, 'articles')) {
    try {
      db.exec('DROP TABLE IF EXISTS articles');
    } catch (_) {
      // ignore drop errors; schema may already exclude the table
    }
  }
  const insPlace = db.prepare(`INSERT INTO places(kind, country_code, adm1_code, population, canonical_name_id) VALUES (?,?,?,?,NULL)`);
  const ids = {};
  ids.us = insPlace.run('country', 'US', null, 330000000).lastInsertRowid;
  ids.ca = insPlace.run('country', 'CA', null, 38000000).lastInsertRowid;
  ids.ca_on = insPlace.run('region', 'CA', 'ON', 14000000).lastInsertRowid;
  ids.toronto = insPlace.run('city', 'CA', 'ON', 2800000).lastInsertRowid;
  const insName = db.prepare(`INSERT INTO place_names(place_id, name, normalized, lang, name_kind, is_preferred, is_official) VALUES (?,?,?,?,?,?,?)`);
  const nameId = insName.run(ids.toronto, 'Toronto', 'toronto', 'en', 'common', 1, 1).lastInsertRowid;
  db.prepare('UPDATE places SET canonical_name_id=? WHERE id=?').run(nameId, ids.toronto);
  insName.run(ids.ca_on, 'Ontario', 'ontario', 'en', 'common', 1, 1);
  insName.run(ids.us, 'United States', 'united states', 'en', 'official', 1, 1);
  insName.run(ids.ca, 'Canada', 'canada', 'en', 'official', 1, 1);
  // Hierarchy: CA > ON > Toronto
  db.prepare(`INSERT OR IGNORE INTO place_hierarchy(parent_id, child_id, relation, depth) VALUES (?,?,?,?)`).run(ids.ca, ids.ca_on, 'admin_parent', 1);
  db.prepare(`INSERT OR IGNORE INTO place_hierarchy(parent_id, child_id, relation, depth) VALUES (?,?,?,?)`).run(ids.ca_on, ids.toronto, 'admin_parent', 1);
  // Article and mention for Toronto
  // Note: no article records or article_places rows are inserted; endpoint must handle empty results
  // Hub page
  db.prepare(`INSERT OR IGNORE INTO place_hubs(host, url, place_slug, place_kind, topic_slug, topic_label, topic_kind, title, first_seen_at, last_seen_at, nav_links_count, article_links_count, evidence) VALUES (?,?,?,?,?,?,?, ?, datetime('now'),datetime('now'),?, ?, ?)`).run('example.com', 'https://example.com/ca/ontario/toronto/', 'toronto', 'city', null, null, null, 'Toronto hub', 50, 20, '{}');
  db.close();
}

describe('Gazetteer API', () => {
  const tmpDb = path.join(__dirname, 'tmp_gazetteer.db');
  let app;
  beforeAll(() => {
    try { fs.unlinkSync(tmpDb); } catch (_) {}
    seedMinimalGazetteer(tmpDb);
    app = createApp({ dbPath: tmpDb, runner: { start() { return { stdout: null, stderr: null, on(){}, kill(){} }; } } });
  });
  afterAll(() => { try { fs.unlinkSync(tmpDb); } catch (_) {} });

  test('summary returns counts', async () => {
    const res = await request(app).get('/api/gazetteer/summary');
    expect(res.statusCode).toBe(200);
    expect(res.body.countries).toBeGreaterThanOrEqual(2);
    expect(res.body.names).toBeGreaterThanOrEqual(4);
  });

  test('places search and pagination', async () => {
    const res = await request(app).get('/api/gazetteer/places').query({ q: 'toronto', page: 1, pageSize: 10 });
    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    const row = res.body.rows.find(r => (r.name || '').toLowerCase().includes('toronto'));
    expect(row).toBeTruthy();
    expect(row.kind).toBe('city');
  });

  test('place details includes names, parents, children', async () => {
    const list = await request(app).get('/api/gazetteer/places').query({ q: 'toronto' });
    const id = list.body.rows[0].id;
    const res = await request(app).get('/api/gazetteer/place/' + id);
    expect(res.statusCode).toBe(200);
    expect(res.body.place.id).toBe(id);
    expect(Array.isArray(res.body.names)).toBe(true);
    expect(Array.isArray(res.body.parents)).toBe(true);
    expect(Array.isArray(res.body.children)).toBe(true);
    // size metrics should be present
    expect(typeof res.body.size_bytes).toBe('number');
    expect(['dbstat', 'approx']).toContain(res.body.size_method);
  });

  test('place details rejects non-numeric ids', async () => {
    const res = await request(app).get('/api/gazetteer/place/not-a-number');
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/positive integer/i);
  });

  test('place details returns 404 when missing', async () => {
    const res = await request(app).get('/api/gazetteer/place/999999');
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Not found');
  });

  test('articles endpoint returns recent mentions', async () => {
    const list = await request(app).get('/api/gazetteer/places').query({ q: 'toronto' });
    const id = list.body.rows[0].id;
    const res = await request(app).get('/api/gazetteer/articles').query({ id });
    expect(res.statusCode).toBe(200);
    expect(res.body.system).toBe('legacy_fallback');
    expect(Array.isArray(res.body.articles)).toBe(true);
    expect(res.body.total).toBe(res.body.articles.length);
    expect(res.body.articles.length).toBe(0);
  });

  test('hubs endpoint lists hub pages', async () => {
    const res = await request(app).get('/api/gazetteer/hubs').query({ host: 'example.com' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  test('resolve suggests correct candidate', async () => {
    const res = await request(app).get('/api/gazetteer/resolve').query({ q: 'toronto', url: 'https://www.cbc.ca/news' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const top = res.body[0];
    expect(top.name.toLowerCase()).toBe('toronto');
  });
});
