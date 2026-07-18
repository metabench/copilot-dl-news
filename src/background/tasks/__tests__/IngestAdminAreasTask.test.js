'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const { BackgroundTaskManager } = require('../../BackgroundTaskManager');
const { IngestAdminAreasTask } = require('../IngestAdminAreasTask');
const { ensureDb } = require('../../../data/db/sqlite');
const { seedAdminClassMap } = require('news-crawler-db');

// Proves the FULL in-app path end to end: BackgroundTaskManager ->
// IngestAdminAreasTask -> ingestAdminAreas -> db, with INJECTED network so
// it is deterministic and needs no app-stop. This is exactly what the live
// app will run once the manager is mounted.

const SPARQL_ROWS = {
  results: {
    bindings: [
      { adm2: { value: 'http://www.wikidata.org/entity/Q3389' }, adm2Label: { value: 'Gard' } },
      { adm2: { value: 'http://www.wikidata.org/entity/Q12538' }, adm2Label: { value: 'Gironde' } },
    ],
  },
};
const ENTITIES = {
  entities: {
    Q3389: { labels: { en: { value: 'Gard' } }, claims: { P300: [{ mainsnak: { datavalue: { value: 'FR-30' } } }] } },
    Q12538: { labels: { en: { value: 'Gironde' } }, claims: { P300: [{ mainsnak: { datavalue: { value: 'FR-33' } } }] } },
  },
};

async function waitForStatus(manager, taskId, statuses, timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const t = manager.getTask(taskId);
    if (t && statuses.includes(t.status)) return t;
    await new Promise((r) => setTimeout(r, 15));
  }
  return manager.getTask(taskId);
}

describe('IngestAdminAreasTask (through the manager)', () => {
  let db, dbPath, manager;

  beforeEach(() => {
    const tmpDir = path.join(os.tmpdir(), 'ingest-admin-task-tests');
    fs.mkdirSync(tmpDir, { recursive: true });
    dbPath = path.join(tmpDir, `t-${process.pid}-${Date.now()}-${Math.random()}.db`);
    db = ensureDb(dbPath);
    db.prepare("INSERT INTO places (id, kind, country_code) VALUES (900, 'country', 'FR')").run();
    db.prepare("INSERT INTO place_names (place_id, name, normalized, lang, name_kind) VALUES (900, 'France', 'france', 'en', 'official')").run();
    seedAdminClassMap(db, [
      { countryCode: 'FR', adminLevel: 2, wikidataClassQid: 'Q6465', placeKind: 'county', label: 'department of France', provenance: 'review:test', verified: 1, subclassWalk: 0 },
    ]);
    manager = new BackgroundTaskManager({ db });
    manager.on('error', () => {});
    // Network injected via registrationOptions — the manager spreads these
    // into the task constructor.
    manager.registerTaskType('ingest-admin-areas', IngestAdminAreasTask, {
      fetchSparql: async () => SPARQL_ROWS,
      fetchEntities: async () => ENTITIES,
    });
  });

  afterEach(() => {
    try { db.close(); } catch (_) {}
    for (const suf of ['', '-shm', '-wal']) { try { fs.unlinkSync(dbPath + suf); } catch (_) {} }
  });

  it('runs to completion and writes counties in-process', async () => {
    const taskId = manager.createTask('ingest-admin-areas', { countries: 'FR', limit: 110 });
    await manager.startTask(taskId);
    const done = await waitForStatus(manager, taskId, ['completed', 'failed']);
    expect(done.status).toBe('completed');

    const counties = db.prepare("SELECT country_code, adm2_code FROM places WHERE kind='county' ORDER BY adm2_code").all();
    expect(counties).toEqual([
      { country_code: 'FR', adm2_code: 'FR-30' },
      { country_code: 'FR', adm2_code: 'FR-33' },
    ]);
  });

  it('an array-form countries config also works, and is idempotent on re-run', async () => {
    const t1 = manager.createTask('ingest-admin-areas', { countries: ['fr'] });
    await manager.startTask(t1);
    expect((await waitForStatus(manager, t1, ['completed', 'failed'])).status).toBe('completed');
    const t2 = manager.createTask('ingest-admin-areas', { countries: ['FR'] });
    await manager.startTask(t2);
    expect((await waitForStatus(manager, t2, ['completed', 'failed'])).status).toBe('completed');
    expect(db.prepare("SELECT COUNT(*) c FROM places WHERE kind='county'").get().c).toBe(2);
  });

  it('is registered in the task-definition catalog', () => {
    const { getTaskDefinition } = require('../taskDefinitions');
    const def = getTaskDefinition('ingest-admin-areas');
    expect(def).toBeTruthy();
    expect(def.fields.map((f) => f.name)).toEqual(['countries', 'limit']);
  });
});
