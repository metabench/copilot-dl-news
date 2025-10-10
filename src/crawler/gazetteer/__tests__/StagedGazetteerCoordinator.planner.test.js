'use strict';

const Database = require('better-sqlite3');
const { initGazetteerTables } = require('../../../db/sqlite/schema');
const { StagedGazetteerCoordinator } = require('../StagedGazetteerCoordinator');
const { PlannerTelemetryBridge } = require('../../planner/PlannerTelemetryBridge');
const { PlannerOrchestrator } = require('../../planner/PlannerOrchestrator');

describe('StagedGazetteerCoordinator with planner orchestrator', () => {
  let db;
  let telemetryEvents;

  beforeEach(() => {
    db = new Database(':memory:');
    initGazetteerTables(db, { verbose: false, logger: console });
    telemetryEvents = [];
  });

  afterEach(() => {
    try {
      db.close();
    } catch (_) {
      // ignore close errors
    }
  });

  function createIngestor(id, recordsProcessed) {
    return {
      id,
      name: id,
      execute: jest.fn(async ({ emitProgress }) => {
        if (emitProgress) {
          emitProgress({ phase: 'processing', recordsProcessed });
        }
        return {
          recordsProcessed,
          recordsUpserted: recordsProcessed,
          errors: 0
        };
      })
    };
  }

  test('emits planner stage telemetry and produces ordered plan summary', async () => {
    const plannerBridge = new PlannerTelemetryBridge({
      telemetry: {
        plannerStage: (event) => telemetryEvents.push(event)
      }
    });
    const planner = new PlannerOrchestrator({ telemetryBridge: plannerBridge });

    const coordinator = new StagedGazetteerCoordinator({
      db,
      logger: console,
      stages: [
        {
          name: 'countries',
          priority: 1000,
          kind: 'country',
          crawlDepth: 0,
          ingestors: [createIngestor('wikidata-countries', 5)]
        },
        {
          name: 'adm1',
          priority: 900,
          kind: 'region',
          crawlDepth: 1,
          ingestors: [createIngestor('wikidata-adm1', 10)]
        }
      ],
      planner
    });

    const summary = await coordinator.execute();

    expect(summary.plan).toBeTruthy();
    expect(summary.plan.totalStages).toBe(2);
    expect(summary.plan.stages.map((stage) => stage.stage)).toEqual(['countries', 'adm1']);

    expect(telemetryEvents.filter((evt) => evt.status === 'started').length).toBe(2);
    expect(telemetryEvents.filter((evt) => evt.status === 'completed').length).toBe(2);
    expect(telemetryEvents[0].stage).toBe('gazetteer:countries');
    expect(telemetryEvents[1].stage).toBe('gazetteer:countries');
    expect(telemetryEvents[2].stage).toBe('gazetteer:adm1');

    const firstStage = summary.plan.stages[0];
    expect(firstStage.totals.recordsProcessed).toBe(5);
    const secondStage = summary.plan.stages[1];
    expect(secondStage.totals.recordsProcessed).toBe(10);
  });
});
