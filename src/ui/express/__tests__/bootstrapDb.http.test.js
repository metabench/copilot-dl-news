const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { startServer } = require('../server');
const NewsDatabase = require(path.resolve(__dirname, '../../../db'));

function requestJson({ hostname, port, path: pathname, method = 'GET', body = null }) {
  const payload = body ? JSON.stringify(body) : null;
  const headers = {
    Accept: 'application/json'
  };
  if (payload) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(payload);
  }
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname, port, path: pathname, method, headers }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => buf += chunk);
      res.on('end', () => {
        try {
          const json = buf ? JSON.parse(buf) : null;
          resolve({ status: res.statusCode, json, text: buf });
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

function requestHtml({ hostname, port, path: pathname }) {
  return new Promise((resolve, reject) => {
    http.get({ hostname, port, path: pathname }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => buf += chunk);
      res.on('end', () => resolve({ status: res.statusCode, text: buf, headers: res.headers }));
    }).on('error', reject);
  });
}

function createTempDataset() {
  const dataset = {
    version: 'test-1',
    url: 'https://example.com/bootstrap/test',
    countries: [
      {
        code: 'US',
        continent: 'North America',
        region: 'Americas',
        names: {
          en: {
            official: ['United States of America'],
            common: ['United States'],
            aliases: ['USA']
          },
          es: {
            official: ['Estados Unidos de América'],
            common: ['Estados Unidos']
          }
        }
      }
    ],
    topics: [
      {
        id: 'politics',
        labels: {
          en: ['politics'],
          es: ['política']
        }
      }
    ],
    skipTerms: {
      en: [
        { term: 'weather', reason: 'not news' }
      ],
      es: [
        { term: 'horóscopo', reason: 'entertainment' }
      ]
    }
  };
  const filePath = path.join(os.tmpdir(), `bootstrap-dataset-${Date.now()}.json`);
  fs.writeFileSync(filePath, JSON.stringify(dataset, null, 2), 'utf8');
  return filePath;
}

function seedManualData(dbPath) {
  const db = new NewsDatabase(dbPath);
  const countryId = db.db.prepare(`INSERT INTO places(kind, country_code, source) VALUES ('country', 'US', 'manual-seed')`).run().lastInsertRowid;
  const nameId = db.db.prepare(`INSERT INTO place_names(place_id, name, normalized, lang, name_kind, is_preferred, is_official, source)
    VALUES (?, 'United States', 'united states', 'en', 'official', 1, 1, 'manual-seed')`).run(countryId).lastInsertRowid;
  db.db.prepare(`UPDATE places SET canonical_name_id = ? WHERE id = ?`).run(nameId, countryId);
  db.db.prepare(`INSERT INTO topic_keywords(topic, lang, term, normalized, source, metadata) VALUES ('politics', 'en', 'politics', 'politics', 'manual-seed', NULL)`).run();
  db.db.prepare(`INSERT INTO crawl_skip_terms(lang, term, normalized, reason, source, metadata) VALUES ('en', 'weather', 'weather', 'manual override', 'manual-seed', NULL)`).run();
  db.close();
}

describe('bootstrap-db management surface', () => {
  let server;
  let port;
  let tmpDb;
  let datasetPath;

  beforeAll(async () => {
    datasetPath = createTempDataset();
    tmpDb = path.join(os.tmpdir(), `bootstrap-db-${Date.now()}.db`);
    try { fs.unlinkSync(tmpDb); } catch (_) {}
    const db = new NewsDatabase(tmpDb);
    db.close();
    process.env.DB_PATH = tmpDb;
    process.env.PORT = '0';
    process.env.UI_BOOTSTRAP_DATASET_PATH = datasetPath;
    server = startServer();
    await new Promise((resolve) => setTimeout(resolve, 150));
    const addr = server.address();
    port = typeof addr === 'object' ? addr.port : 0;
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    delete process.env.DB_PATH;
    delete process.env.PORT;
    delete process.env.UI_BOOTSTRAP_DATASET_PATH;
    try { fs.unlinkSync(tmpDb); } catch (_) {}
    try { fs.unlinkSync(`${tmpDb}-shm`); } catch (_) {}
    try { fs.unlinkSync(`${tmpDb}-wal`); } catch (_) {}
    try { fs.unlinkSync(datasetPath); } catch (_) {}
  });

  test('status endpoint reports zero counts before running', async () => {
    const res = await requestJson({ hostname: '127.0.0.1', port, path: '/api/bootstrap-db/status' });
    expect(res.status).toBe(200);
    expect(res.json?.status).toMatchObject({ countries: 0, topicKeywords: 0, skipTerms: 0 });
    expect(res.json?.datasetPath).toBe(datasetPath);
    expect(res.json?.status?.safeToBootstrap).toBe(true);
  });

  test('run endpoint seeds dataset and refreshes counts', async () => {
    const res = await requestJson({ hostname: '127.0.0.1', port, path: '/api/bootstrap-db/run', method: 'POST', body: {} });
    expect(res.status).toBe(200);
    expect(res.json?.summary?.countries?.inserted).toBeGreaterThanOrEqual(1);
    expect(res.json?.summary?.skipTerms?.totalTerms).toBeGreaterThanOrEqual(2);
    expect(res.json?.forceApplied).toBe(false);

    const statusAfter = await requestJson({ hostname: '127.0.0.1', port, path: '/api/bootstrap-db/status' });
    expect(statusAfter.status).toBe(200);
    expect(statusAfter.json?.status).toMatchObject({ countries: 1, topicKeywords: 2, skipTerms: 2 });
    expect(statusAfter.json?.status?.safeToBootstrap).toBe(true);
  });

  test('rerun without force is allowed after bootstrap seeding', async () => {
    const res = await requestJson({ hostname: '127.0.0.1', port, path: '/api/bootstrap-db/run', method: 'POST', body: {} });
    expect(res.status).toBe(200);
    expect(res.json?.forceApplied).toBe(false);
  });

  test('SSR page renders navigation shell', async () => {
    const res = await requestHtml({ hostname: '127.0.0.1', port, path: '/bootstrap-db' });
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Bootstrap database/);
    expect(res.text).toMatch(/Run bootstrap/);
    expect(res.text).toMatch(/global-nav__item--active/);
  });
});

describe('bootstrap-db guard against existing data', () => {
  let server;
  let port;
  let tmpDb;
  let datasetPath;

  beforeAll(async () => {
    datasetPath = createTempDataset();
    tmpDb = path.join(os.tmpdir(), `bootstrap-db-guard-${Date.now()}.db`);
    try { fs.unlinkSync(tmpDb); } catch (_) {}
    seedManualData(tmpDb);
    process.env.DB_PATH = tmpDb;
    process.env.PORT = '0';
    process.env.UI_BOOTSTRAP_DATASET_PATH = datasetPath;
    server = startServer();
    await new Promise((resolve) => setTimeout(resolve, 150));
    const addr = server.address();
    port = typeof addr === 'object' ? addr.port : 0;
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    delete process.env.DB_PATH;
    delete process.env.PORT;
    delete process.env.UI_BOOTSTRAP_DATASET_PATH;
    try { fs.unlinkSync(tmpDb); } catch (_) {}
    try { fs.unlinkSync(`${tmpDb}-shm`); } catch (_) {}
    try { fs.unlinkSync(`${tmpDb}-wal`); } catch (_) {}
    try { fs.unlinkSync(datasetPath); } catch (_) {}
  });

  test('status marks database as unsafe to bootstrap', async () => {
    const res = await requestJson({ hostname: '127.0.0.1', port, path: '/api/bootstrap-db/status' });
    expect(res.status).toBe(200);
    expect(res.json?.status?.safeToBootstrap).toBe(false);
  });

  test('run endpoint returns conflict without force flag', async () => {
    const res = await requestJson({ hostname: '127.0.0.1', port, path: '/api/bootstrap-db/run', method: 'POST', body: {} });
    expect(res.status).toBe(409);
    expect(res.json?.code).toBe('BOOTSTRAP_UNSAFE');
    expect(res.json?.status?.safeToBootstrap).toBe(false);
  });

  test('forcing bootstrap succeeds when requested', async () => {
    const res = await requestJson({ hostname: '127.0.0.1', port, path: '/api/bootstrap-db/run', method: 'POST', body: { force: true } });
    expect(res.status).toBe(200);
    expect(res.json?.forceApplied).toBe(true);

    const status = await requestJson({ hostname: '127.0.0.1', port, path: '/api/bootstrap-db/status' });
    expect(status.status).toBe(200);
    expect(status.json?.status?.safeToBootstrap).toBe(true);
  });
});
