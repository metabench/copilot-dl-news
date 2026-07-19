'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const express = require('express');
const request = require('supertest');
const { mountBackgroundTasks } = require('../mountBackgroundTasks');
const { ensureDb } = require('../../../data/db/sqlite');
const { seedAdminClassMap } = require('news-crawler-db');

// Proves the mounted subsystem end to end over HTTP: POST create+autostart
// -> BackgroundTaskManager -> IngestAdminAreasTask -> ingestAdminAreas ->
// db, with injected fake network. This is the exact path the live app runs
// once server.js calls mountBackgroundTasks — but deterministic, no
// app-stop, no real WDQS.

const SPARQL_ROWS = {
  results: { bindings: [
    { adm2: { value: 'http://www.wikidata.org/entity/Q3389' }, adm2Label: { value: 'Gard' } },
    { adm2: { value: 'http://www.wikidata.org/entity/Q12538' }, adm2Label: { value: 'Gironde' } },
  ] },
};
const ENTITIES = { entities: {
  Q3389: { labels: { en: { value: 'Gard' } }, claims: { P300: [{ mainsnak: { datavalue: { value: 'FR-30' } } }] } },
  Q12538: { labels: { en: { value: 'Gironde' } }, claims: { P300: [{ mainsnak: { datavalue: { value: 'FR-33' } } }] } },
} };

describe('mountBackgroundTasks', () => {
  let db, dbPath, app;

  beforeEach(() => {
    const tmpDir = path.join(os.tmpdir(), 'mount-bg-tests');
    fs.mkdirSync(tmpDir, { recursive: true });
    dbPath = path.join(tmpDir, `m-${process.pid}-${Date.now()}-${Math.random()}.db`);
    db = ensureDb(dbPath);
    db.prepare("INSERT INTO places (id, kind, country_code) VALUES (900, 'country', 'FR')").run();
    db.prepare("INSERT INTO place_names (place_id, name, normalized, lang, name_kind) VALUES (900, 'France', 'france', 'en', 'official')").run();
    seedAdminClassMap(db, [
      { countryCode: 'FR', adminLevel: 2, wikidataClassQid: 'Q6465', placeKind: 'county', label: 'department of France', provenance: 'review:test', verified: 1, subclassWalk: 0 },
    ]);
    app = express();
    app.use(express.json());
    mountBackgroundTasks(app, () => db, {
      logger: { info() {}, warn() {}, error() {} },
      registrationOptions: { fetchSparql: async () => SPARQL_ROWS, fetchEntities: async () => ENTITIES },
    });
  });

  afterEach(() => {
    try { db.close(); } catch (_) {}
    for (const suf of ['', '-shm', '-wal']) { try { fs.unlinkSync(dbPath + suf); } catch (_) {} }
  });

  it('exposes the task catalog including ingest-admin-areas', async () => {
    const res = await request(app).get('/api/v1/background-tasks/types');
    expect(res.status).toBe(200);
    const ids = (res.body.taskTypes || res.body.types || []).map((t) => t.taskType || t.type || t);
    expect(ids).toContain('ingest-admin-areas');
  });

  it('BUILTIN_TASKS maps every class-backed taskType (map completeness)', () => {
    const { BUILTIN_TASKS } = require('../mountBackgroundTasks');
    expect(Object.keys(BUILTIN_TASKS).sort()).toEqual(
      ['analysis-run', 'article-compression', 'backfill-dates', 'compression-lifecycle', 'guess-place-hubs', 'ingest-admin-areas']
    );
  });

  it('registers the jest-safe tasks with correct taskType->class wiring + createTask', () => {
    // analysis-run and backfill-dates transitively require jsdom/parse5,
    // which throws under the jest transform (a KNOWN pre-existing issue) —
    // they register fine in production node (verified live via /types). Here
    // we assert the subset that loads under jest.
    const { manager, registered } = mountBackgroundTasks(express(), () => db, {
      logger: { info() {}, warn() {}, error() {} },
    });
    const jestSafe = { 'ingest-admin-areas': 'IngestAdminAreasTask', 'guess-place-hubs': 'GuessPlaceHubsTask', 'article-compression': 'CompressionTask', 'compression-lifecycle': 'CompressionLifecycleTask' };
    for (const [taskType, className] of Object.entries(jestSafe)) {
      expect(registered).toContain(taskType);
      const reg = manager.taskRegistry.get(taskType);
      expect(reg && reg.TaskClass && reg.TaskClass.name).toBe(className);
      // createTask INSERTs a pending row without constructing/running the
      // task — proves the type is creatable without needing its infra.
      const id = manager.createTask(taskType, {});
      expect(manager.getTask(id).status).toBe('pending');
    }
  });

  it('POST create+autostart ingests counties in-process via HTTP', async () => {
    const create = await request(app).post('/api/v1/background-tasks').send({
      taskType: 'ingest-admin-areas', parameters: { countries: 'FR', limit: 110 }, autoStart: true,
    });
    expect(create.status).toBeLessThan(300);
    const taskId = create.body.taskId ?? create.body.task?.id ?? create.body.id;
    expect(taskId).toBeTruthy();

    // Poll until the task completes.
    let status = null;
    for (let i = 0; i < 60; i++) {
      const g = await request(app).get(`/api/v1/background-tasks/${taskId}`);
      status = g.body.task?.status ?? g.body.status;
      if (status === 'completed' || status === 'failed') break;
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(status).toBe('completed');

    const counties = db.prepare("SELECT country_code, adm2_code FROM places WHERE kind='county' ORDER BY adm2_code").all();
    expect(counties).toEqual([
      { country_code: 'FR', adm2_code: 'FR-30' },
      { country_code: 'FR', adm2_code: 'FR-33' },
    ]);
  });
});
