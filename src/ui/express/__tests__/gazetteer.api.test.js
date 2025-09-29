const request = require('supertest');
const fs = require('fs');
const path = require('path');
const { createApp } = require('../server');
const pathResolveDb = require('path').resolve(__dirname, '../../../db.js');
let NewsDatabase;
beforeAll(() => {
  jest.isolateModules(() => {
    // Ensure the module path aligns with server.js resolution
    NewsDatabase = require(pathResolveDb);
  });
});

function seedMinimalGazetteer(dbPath) {
  const db = new NewsDatabase(dbPath);
  // Places: country, region, city
  db.db.exec(`
    DELETE FROM places; DELETE FROM place_names; DELETE FROM place_external_ids; DELETE FROM place_hierarchy;
    DELETE FROM articles; DELETE FROM article_places; DELETE FROM place_hubs;
  `);
  const insPlace = db.db.prepare(`INSERT INTO places(kind, country_code, adm1_code, population, canonical_name_id) VALUES (?,?,?,?,NULL)`);
  const ids = {};
  ids.us = insPlace.run('country', 'US', null, 330000000).lastInsertRowid;
  ids.ca = insPlace.run('country', 'CA', null, 38000000).lastInsertRowid;
  ids.ca_on = insPlace.run('region', 'CA', 'ON', 14000000).lastInsertRowid;
  ids.toronto = insPlace.run('city', 'CA', 'ON', 2800000).lastInsertRowid;
  const insName = db.db.prepare(`INSERT INTO place_names(place_id, name, normalized, lang, name_kind, is_preferred, is_official) VALUES (?,?,?,?,?,?,?)`);
  const nameId = insName.run(ids.toronto, 'Toronto', 'toronto', 'en', 'common', 1, 1).lastInsertRowid;
  db.db.prepare('UPDATE places SET canonical_name_id=? WHERE id=?').run(nameId, ids.toronto);
  insName.run(ids.ca_on, 'Ontario', 'ontario', 'en', 'common', 1, 1);
  insName.run(ids.us, 'United States', 'united states', 'en', 'official', 1, 1);
  insName.run(ids.ca, 'Canada', 'canada', 'en', 'official', 1, 1);
  // Hierarchy: CA > ON > Toronto
  db.db.prepare(`INSERT OR IGNORE INTO place_hierarchy(parent_id, child_id, relation, depth) VALUES (?,?,?,?)`).run(ids.ca, ids.ca_on, 'admin_parent', 1);
  db.db.prepare(`INSERT OR IGNORE INTO place_hierarchy(parent_id, child_id, relation, depth) VALUES (?,?,?,?)`).run(ids.ca_on, ids.toronto, 'admin_parent', 1);
  // Article and mention for Toronto
  const artUrl = 'https://example.com/news/toronto-story';
  const now = new Date().toISOString();
  db.upsertArticle({
    url: artUrl,
    title: 'Toronto wins',
    date: now,
    section: 'news',
    html: '<html></html>',
    crawled_at: now,
    canonical_url: null,
    referrer_url: null,
    discovered_at: now,
    crawl_depth: 0,
    fetched_at: now,
    request_started_at: now,
    http_status: 200,
    content_type: 'text/html',
    content_length: 0,
    etag: null,
    last_modified: null,
    redirect_chain: null,
    ttfb_ms: 1,
    download_ms: 1,
    total_ms: 2,
    bytes_downloaded: 1234,
    transfer_kbps: 100,
    html_sha256: null,
    text: 'Toronto story',
    word_count: 2,
    language: 'en'
  });
  db.db.prepare(`INSERT OR IGNORE INTO article_places(article_url, place, place_kind, method, source, offset_start, offset_end, context, first_seen_at) VALUES (?,?,?,?,?,?,?,?,datetime('now'))`)
    .run(artUrl, 'Toronto', 'city', 'gazetteer', 'title', null, null, null);
  // Hub page
  db.db.prepare(`INSERT OR IGNORE INTO place_hubs(host, url, place_slug, place_kind, topic_slug, topic_label, topic_kind, title, first_seen_at, last_seen_at, nav_links_count, article_links_count, evidence) VALUES (?,?,?,?,?,?,?, ?, datetime('now'),datetime('now'),?, ?, ?)`).run('example.com', 'https://example.com/ca/ontario/toronto/', 'toronto', 'city', null, null, null, 'Toronto hub', 50, 20, '{}');
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
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
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
