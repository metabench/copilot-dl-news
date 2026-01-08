'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { ensureDb } = require('../../db/sqlite/ensureDb');
const { guessPlaceHubs } = require('../guess-place-hubs');

async function cleanupTempSqlite(dbPath) {
  const candidates = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];

  for (let attempt = 0; attempt < 6; attempt += 1) {
    let hadBusy = false;

    for (const filePath of candidates) {
      if (!fs.existsSync(filePath)) continue;
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        if (err && (err.code === 'EBUSY' || err.code === 'EPERM')) {
          hadBusy = true;
          continue;
        }
        // Unexpected cleanup error should still fail tests.
        throw err;
      }
    }

    if (!hadBusy) {
      return;
    }

    // Windows can hold SQLite files briefly after close; retry with backoff.
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
  }

  // Give up: don't fail the test for cleanup flakiness.
}

function createTempDbPath(label) {
  const name = `guess-place-hubs-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`;
  return path.join(os.tmpdir(), name);
}

function createResponse({ status = 200, body = '<html></html>', url = 'https://example.com/world/testland', headers = {} }) {
  const headerMap = new Map();
  for (const [key, value] of Object.entries(headers)) {
    headerMap.set(key.toLowerCase(), value);
  }
  return {
    status,
    ok: status >= 200 && status < 300,
    url,
    headers: {
      get(name) {
        return headerMap.get(String(name).toLowerCase()) || null;
      }
    },
    async text() {
      return body;
    }
  };
}

function stubLogger() {
  const calls = { info: [], warn: [], error: [] };
  const logger = {
    info: (msg) => calls.info.push(msg),
    warn: (msg) => calls.warn.push(msg),
    error: (msg) => calls.error.push(msg)
  };
  // Add calls property for testing
  logger.calls = calls;
  return logger;
}

function createHubHtml(title) {
  const links = Array.from({ length: 25 }, (_, index) => `<a href='/article-${index}'>Story ${index}</a>`).join('');
  return `<html><head><title>${title}</title></head><body>${links}</body></html>`;
}

describe('guess-place-hubs tool', () => {
  test('persists fetch and hub when apply flag set', async () => {
    const dbPath = createTempDbPath('apply');
    const db = ensureDb(dbPath);
    try {
      const placeRow = db.prepare(`
        INSERT INTO places(kind, country_code, status)
        VALUES ('country', 'TL', 'current')
      `).run();
      const placeId = placeRow.lastInsertRowid;
      const nameRow = db.prepare(`
        INSERT INTO place_names(place_id, name, is_preferred)
        VALUES (?, 'Testland', 1)
      `).run(placeId);
      db.prepare('UPDATE places SET canonical_name_id = ? WHERE id = ?').run(nameRow.lastInsertRowid, placeId);
    } finally {
      db.close();
    }

    const fetchFn = jest.fn((url, init = {}) => {
      const method = (init.method || 'GET').toUpperCase();
      if (method === 'HEAD') {
        return Promise.resolve(createResponse({ status: 200, body: '', url }));
      }
      return Promise.resolve(createResponse({
        status: 200,
        body: createHubHtml('Testland Hub'),
        url
      }));
    });
    const logger = stubLogger();

    try {
      const summary = await guessPlaceHubs({
        domain: 'example.com',
        dbPath,
        kinds: ['country'],
        limit: 1,
        patternsPerPlace: 1,
        apply: true,
        maxAgeDays: 0,
        refresh404Days: 0,
        verbose: true
      }, { fetchFn, logger, now: () => new Date('2025-10-16T00:00:00Z') });

      expect(fetchFn).toHaveBeenCalledTimes(2);
      expect((fetchFn.mock.calls[0][1]?.method || 'GET').toUpperCase()).toBe('HEAD');
      expect((fetchFn.mock.calls[1][1]?.method || 'GET').toUpperCase()).toBe('GET');
      expect(logger.calls.info.some(msg => msg.includes('HEAD 200 https://example.com/world/testland'))).toBe(true);
      expect(logger.calls.info.some(msg => msg.includes('GET 200 https://example.com/world/testland'))).toBe(true);
      expect(summary.fetched).toBe(1);
      const verifyDb = ensureDb(dbPath);
      try {
        const hub = verifyDb.prepare('SELECT url, place_slug, place_kind, title FROM place_hubs_with_urls').get();
        expect(hub).toMatchObject({
          place_slug: 'testland',
          place_kind: 'country'
        });
        const fetchRow = verifyDb.prepare(`
          SELECT hr.http_status
            FROM http_responses hr
            JOIN urls u ON u.id = hr.url_id
           WHERE u.url = ?
        ORDER BY COALESCE(hr.fetched_at, hr.request_started_at) DESC
           LIMIT 1
        `).get(hub.url);
        expect(fetchRow.http_status).toBe(200);
      } finally {
        verifyDb.close();
      }
    } finally {
      await cleanupTempSqlite(dbPath);
    }
  });

  test('records 404 fetch without inserting hub', async () => {
    const dbPath = createTempDbPath('404');
    const db = ensureDb(dbPath);
    try {
      const placeRow = db.prepare(`
        INSERT INTO places(kind, country_code, status)
        VALUES ('country', 'NF', 'current')
      `).run();
      const placeId = placeRow.lastInsertRowid;
      const nameRow = db.prepare(`
        INSERT INTO place_names(place_id, name, is_preferred)
        VALUES (?, 'Nowhere Federation', 1)
      `).run(placeId);
      db.prepare('UPDATE places SET canonical_name_id = ? WHERE id = ?').run(nameRow.lastInsertRowid, placeId);
    } finally {
      db.close();
    }

    const fetchFn = jest.fn((url, init = {}) => {
      const method = (init.method || 'GET').toUpperCase();
      if (method === 'HEAD') {
        return Promise.resolve(createResponse({ status: 404, body: '', url }));
      }
      return Promise.resolve(createResponse({
        status: 404,
        body: '<html><title>Not Found</title></html>',
        url
      }));
    });
    const logger = stubLogger();

    try {
      const summary = await guessPlaceHubs({
        domain: 'example.com',
        dbPath,
        kinds: ['country'],
        limit: 1,
        patternsPerPlace: 1,
        apply: true,
        maxAgeDays: 0,
        refresh404Days: 365
      }, { fetchFn, logger, now: () => new Date('2025-10-16T00:00:00Z') });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect((fetchFn.mock.calls[0][1]?.method || 'GET').toUpperCase()).toBe('HEAD');
      expect(summary.stored404).toBe(1);
      expect(summary.insertedHubs).toBe(0);
      expect(logger.calls.info.some(msg => msg.includes('HEAD 404 https://example.com/world/nowhere-federation'))).toBe(true);

      const verifyDb = ensureDb(dbPath);
      try {
        const hubCount = verifyDb.prepare('SELECT COUNT(*) AS cnt FROM place_hubs').get().cnt;
        expect(hubCount).toBe(0);
        const fetchRow = verifyDb.prepare('SELECT http_status FROM http_responses ORDER BY id DESC LIMIT 1').get();
        expect(fetchRow.http_status).toBe(404);
        const mapping = verifyDb.prepare(`
          SELECT place_id, host, page_kind, url, status, evidence
            FROM place_page_mappings
           LIMIT 1
        `).get();
        expect(mapping).toBeTruthy();
        expect(mapping.host).toBe('example.com');
        expect(mapping.page_kind).toBe('country-hub');
        expect(mapping.url).toBe('https://example.com/world/nowhere-federation');
        expect(mapping.status).toBe('verified');
        const evidence = JSON.parse(mapping.evidence);
        expect(evidence.presence).toBe('absent');
      } finally {
        verifyDb.close();
      }
    } finally {
      await cleanupTempSqlite(dbPath);
    }
  });

  test('generates region hubs using heuristics', async () => {
    const dbPath = createTempDbPath('region');
    const db = ensureDb(dbPath);
    try {
      const countryRow = db.prepare(`
        INSERT INTO places(kind, country_code, status)
        VALUES ('country', 'US', 'current')
      `).run();
      const countryId = countryRow.lastInsertRowid;
      const countryNameRow = db.prepare(`
        INSERT INTO place_names(place_id, name, is_preferred)
        VALUES (?, 'United States', 1)
      `).run(countryId);
      db.prepare('UPDATE places SET canonical_name_id = ? WHERE id = ?').run(countryNameRow.lastInsertRowid, countryId);

      const regionRow = db.prepare(`
        INSERT INTO places(kind, country_code, adm1_code, status, priority_score)
        VALUES ('region', 'US', 'US-CA', 'current', 100)
      `).run();
      const regionId = regionRow.lastInsertRowid;
      const regionNameRow = db.prepare(`
        INSERT INTO place_names(place_id, name, is_preferred)
        VALUES (?, 'California', 1)
      `).run(regionId);
      db.prepare('UPDATE places SET canonical_name_id = ? WHERE id = ?').run(regionNameRow.lastInsertRowid, regionId);
      db.prepare('INSERT OR IGNORE INTO place_hierarchy(parent_id, child_id, relation, depth) VALUES (?, ?, ?, 1)')
        .run(countryId, regionId, 'contains');
    } finally {
      db.close();
    }

    const fetchFn = jest.fn((url, init = {}) => {
      const method = (init.method || 'GET').toUpperCase();
      if (method === 'HEAD') {
        return Promise.resolve(createResponse({ status: 200, body: '', url }));
      }
      return Promise.resolve(createResponse({
        status: 200,
        url,
        body: createHubHtml('California Hub')
      }));
    });
    const logger = stubLogger();

    try {
      const summary = await guessPlaceHubs({
        domain: 'regionnews.com',
        dbPath,
        kinds: ['region'],
        limit: 1,
        patternsPerPlace: 1,
        apply: true,
        maxAgeDays: 0,
        refresh404Days: 0
      }, { fetchFn, logger, now: () => new Date('2025-10-16T00:00:00Z') });

      expect(summary.fetched).toBe(1);
      expect(fetchFn).toHaveBeenCalledTimes(2);
      expect((fetchFn.mock.calls[0][1]?.method || 'GET').toUpperCase()).toBe('HEAD');
      expect(fetchFn).toHaveBeenCalledWith('https://regionnews.com/california', expect.anything());

      const verifyDb = ensureDb(dbPath);
      try {
        const hub = verifyDb.prepare('SELECT place_kind, place_slug FROM place_hubs').get();
        expect(hub.place_kind).toBe('region');
        expect(hub.place_slug).toBe('california');
      } finally {
        verifyDb.close();
      }
    } finally {
      await cleanupTempSqlite(dbPath);
    }
  });

  test('generates city hubs using heuristics', async () => {
    const dbPath = createTempDbPath('city');
    const db = ensureDb(dbPath);
    try {
      const countryRow = db.prepare(`
        INSERT INTO places(kind, country_code, status)
        VALUES ('country', 'US', 'current')
      `).run();
      const countryId = countryRow.lastInsertRowid;
      const countryNameRow = db.prepare(`
        INSERT INTO place_names(place_id, name, is_preferred)
        VALUES (?, 'United States', 1)
      `).run(countryId);
      db.prepare('UPDATE places SET canonical_name_id = ? WHERE id = ?').run(countryNameRow.lastInsertRowid, countryId);

      const regionRow = db.prepare(`
        INSERT INTO places(kind, country_code, adm1_code, status, priority_score)
        VALUES ('region', 'US', 'US-CA', 'current', 100)
      `).run();
      const regionId = regionRow.lastInsertRowid;
      const regionNameRow = db.prepare(`
        INSERT INTO place_names(place_id, name, is_preferred)
        VALUES (?, 'California', 1)
      `).run(regionId);
      db.prepare('UPDATE places SET canonical_name_id = ? WHERE id = ?').run(regionNameRow.lastInsertRowid, regionId);
      db.prepare('INSERT OR IGNORE INTO place_hierarchy(parent_id, child_id, relation, depth) VALUES (?, ?, ?, 1)')
        .run(countryId, regionId, 'contains');

      const cityRow = db.prepare(`
        INSERT INTO places(kind, country_code, status, priority_score)
        VALUES ('city', 'US', 'current', 500)
      `).run();
      const cityId = cityRow.lastInsertRowid;
      const cityNameRow = db.prepare(`
        INSERT INTO place_names(place_id, name, is_preferred)
        VALUES (?, 'San Jose', 1)
      `).run(cityId);
      db.prepare('UPDATE places SET canonical_name_id = ? WHERE id = ?').run(cityNameRow.lastInsertRowid, cityId);
      db.prepare('INSERT OR IGNORE INTO place_hierarchy(parent_id, child_id, relation, depth) VALUES (?, ?, ?, 1)')
        .run(regionId, cityId, 'contains');
    } finally {
      db.close();
    }

    const fetchFn = jest.fn((url, init = {}) => {
      const method = (init.method || 'GET').toUpperCase();
      if (method === 'HEAD') {
        return Promise.resolve(createResponse({ status: 200, body: '', url }));
      }
      return Promise.resolve(createResponse({
        status: 200,
        url,
        body: createHubHtml('San Jose Hub')
      }));
    });
    const logger = stubLogger();

    try {
      const summary = await guessPlaceHubs({
        domain: 'citynews.com',
        dbPath,
        kinds: ['city'],
        limit: 1,
        patternsPerPlace: 1,
        apply: true,
        maxAgeDays: 0,
        refresh404Days: 0
      }, { fetchFn, logger, now: () => new Date('2025-10-16T00:00:00Z') });

      expect(summary.fetched).toBe(1);
      expect(fetchFn).toHaveBeenCalledTimes(2);
      expect((fetchFn.mock.calls[0][1]?.method || 'GET').toUpperCase()).toBe('HEAD');
      expect(fetchFn).toHaveBeenCalledWith('https://citynews.com/san-jose', expect.anything());

      const verifyDb = ensureDb(dbPath);
      try {
        const hub = verifyDb.prepare('SELECT place_kind, place_slug FROM place_hubs').get();
        expect(hub.place_kind).toBe('city');
        expect(hub.place_slug).toBe('san-jose');
      } finally {
        verifyDb.close();
      }
    } finally {
      await cleanupTempSqlite(dbPath);
    }
  });
});
