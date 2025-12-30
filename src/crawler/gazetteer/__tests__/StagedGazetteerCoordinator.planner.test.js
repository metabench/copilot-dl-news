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

  test('emits crawl:progress-tree events for wikidata-cities ingestor', async () => {
    const crawlEvents = [];
    const telemetry = {
      events: {
        emitEvent: (event) => crawlEvents.push(event)
      },
      problem: () => {}
    };

    const coordinator = new StagedGazetteerCoordinator({
      db,
      logger: console,
      telemetry,
      stages: [
        {
          name: 'cities',
          priority: 100,
          kind: 'city',
          crawlDepth: 2,
          ingestors: [
            {
              id: 'wikidata-cities',
              name: 'wikidata-cities',
              execute: jest.fn(async ({ emitProgress }) => {
                emitProgress({
                  phase: 'discovery',
                  totalCountries: 25,
                  maxCitiesPerCountry: 10,
                  minPopulation: 10000,
                  estimatedTotal: 250,
                  message: 'Discovery'
                });

                for (let i = 1; i <= 25; i++) {
                  emitProgress({
                    phase: 'processing',
                    current: i,
                    totalItems: 25,
                    countryCode: `c${i}`,
                    citiesProcessed: i,
                    percentComplete: Math.round((i / 25) * 100),
                    message: `Processing c${i}`
                  });
                }

                emitProgress({ phase: 'complete', summary: { countriesProcessed: 25 } });

                return { recordsProcessed: 250, recordsUpserted: 250, errors: 0 };
              })
            }
          ]
        }
      ]
    });

    await coordinator.execute();

    const progressTreeEvents = crawlEvents.filter(
      (evt) => evt && typeof evt.type === 'string' && evt.type.startsWith('crawl:progress-tree:')
    );

    // Throttling can coalesce fast progress loops down to just:
    // - crawl:progress-tree:updated
    // - crawl:progress-tree:completed
    expect(progressTreeEvents.length).toBeGreaterThanOrEqual(2);
    expect(progressTreeEvents.some((evt) => evt.type === 'crawl:progress-tree:updated')).toBe(true);
    expect(progressTreeEvents[progressTreeEvents.length - 1].type).toBe('crawl:progress-tree:completed');
    expect(progressTreeEvents[0].data?.root?.id).toBe('wikidata-cities');
  });
});
