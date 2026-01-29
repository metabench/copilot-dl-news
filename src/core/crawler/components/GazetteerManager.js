const path = require('path');
const os = require('os');
const { createCliLogger, isVerboseMode } = require('../cli/progressReporter');
const { GazetteerModeController } = require('../gazetteer/GazetteerModeController');
const { StagedGazetteerCoordinator } = require('../gazetteer/StagedGazetteerCoordinator');
const { WikidataCountryIngestor } = require('../gazetteer/ingestors/WikidataCountryIngestor');
const WikidataAdm1Ingestor = require('../gazetteer/ingestors/WikidataAdm1Ingestor');
const WikidataCitiesIngestor = require('../gazetteer/ingestors/WikidataCitiesIngestor');
const OsmBoundaryIngestor = require('../gazetteer/ingestors/OsmBoundaryIngestor');

const log = createCliLogger();

class GazetteerManager {
  constructor(crawler) {
    this.crawler = crawler;
    this.pipelineConfigured = false;
    this.controller = null;
    this.profile = null;
    this.options = crawler.options?.gazetteer || {};
  }

  resolveVariant(crawlType) {
    if (!crawlType) {
      return null;
    }
    const normalized = String(crawlType).toLowerCase();
    if (normalized === 'wikidata') {
      return 'wikidata';
    }
    if (normalized === 'geography' || normalized === 'gazetteer') {
      return 'geography';
    }
    return null;
  }

  applyDefaults(options = {}) {
    this.crawler.structureOnly = false;
    this.crawler.useSitemap = false;
    this.crawler.sitemapOnly = false;
    if (options.skipQueryUrls == null) {
      this.crawler.skipQueryUrls = false;
    }
    if (options.preferCache == null) {
      this.crawler.preferCache = false;
    }
    // Store concurrency as maximum allowed, not as required parallelism level
    this.crawler.concurrency = Math.max(1, options.concurrency || 1);
    this.crawler.usePriorityQueue = false;

    // Geography/gazetteer crawls should process all stages regardless of depth
    // Set maxDepth to 999 to effectively disable depth filtering
    if (options.maxDepth == null) {
      this.crawler.maxDepth = 999;
    }
  }

  shouldBypassDepth(info = {}) {
    if (this.crawler.isGazetteerMode) {
      return true;
    }
    const meta = info.meta || null;
    if (meta && (meta.depthPolicy === 'ignore' || meta.depthPolicy === 'bypass' || meta.origin === 'gazetteer' || meta.mode === 'gazetteer')) {
      return true;
    }
    const decisionMeta = info.decision?.meta || null;
    if (decisionMeta && (decisionMeta.depthPolicy === 'ignore' || decisionMeta.depthPolicy === 'bypass')) {
      return true;
    }
    return false;
  }

  setupController(options = {}) {
    const gazetteerOptions = options.gazetteer || {};
    const controllerOptions = {
      telemetry: this.crawler.telemetry,
      milestoneTracker: this.crawler.milestoneTracker,
      state: this.crawler.state,
      dbAdapter: this.crawler.dbAdapter,
      logger: console,
      jobId: this.crawler.jobId,
      mode: this.crawler.gazetteerVariant || 'gazetteer'
    };
    if (gazetteerOptions.ingestionCoordinator) {
      controllerOptions.ingestionCoordinator = gazetteerOptions.ingestionCoordinator;
    }
    this.crawler.gazetteerOptions = gazetteerOptions;
    this.controller = new GazetteerModeController(controllerOptions);
    this.profile = controllerOptions.mode;

    // Link back to crawler
    this.crawler.gazetteerModeController = this.controller;
    this.crawler.gazetteerModeProfile = this.profile;
  }

  configurePipeline() {
    if (!this.crawler.isGazetteerMode || this.pipelineConfigured) {
      return;
    }

    // Emit milestone at start of configuration
    log.debug('[GAZETTEER-DEBUG] configurePipeline() STARTING');
    try {
      this.crawler.telemetry.milestoneOnce('gazetteer:pipeline-config-start', {
        kind: 'debug',
        message: 'configurePipeline() starting',
        details: { variant: this.crawler.gazetteerVariant }
      });
    } catch (_) { }

    if (this.crawler.gazetteerOptions && this.crawler.gazetteerOptions.ingestionCoordinator) {
      this.pipelineConfigured = true;
      log.debug('[GAZETTEER-DEBUG] Using provided ingestionCoordinator, returning early');
      return;
    }
    if (!this.crawler.dbAdapter || typeof this.crawler.dbAdapter.getDb !== 'function') {
      this.pipelineConfigured = true;
      log.debug('[GAZETTEER-DEBUG] No dbAdapter, returning early');
      return;
    }

    const dbWrapper = this.crawler.dbAdapter.getDb();
    if (!dbWrapper) {
      this.pipelineConfigured = true;
      log.debug('[GAZETTEER-DEBUG] No dbWrapper, returning early');
      return;
    }

    // Get raw better-sqlite3 database handle for gazetteer operations
    // Gazetteer ingestors use db.prepare() directly for performance
    const db = dbWrapper.getHandle();
    if (!db) {
      this.pipelineConfigured = true;
      log.debug('[GAZETTEER-DEBUG] No db handle, returning early');
      return;
    }

    const variant = this.crawler.gazetteerVariant || 'geography';
    const logger = console;
    const testMode = this.crawler.maxPages <= 1000;
    const cacheRoot = testMode
      ? path.join(os.tmpdir(), 'copilot-gazetteer-test-cache')
      : path.join(this.crawler.dataDir, 'cache', 'gazetteer');

    const stages = [];

    const resolveIngestorOverrides = (...keys) => {
      if (!this.crawler.gazetteerOptions || typeof this.crawler.gazetteerOptions !== 'object') {
        return {};
      }
      const sources = [this.crawler.gazetteerOptions];
      if (this.crawler.gazetteerOptions.ingestors && typeof this.crawler.gazetteerOptions.ingestors === 'object') {
        sources.push(this.crawler.gazetteerOptions.ingestors);
      }
      const merged = {};
      for (const source of sources) {
        for (const key of keys) {
          const value = source?.[key];
          if (value && typeof value === 'object') {
            Object.assign(merged, value);
          }
        }
      }
      return merged;
    };

    const pickIngestorOptions = (source, allowedKeys) => {
      if (!source || typeof source !== 'object') {
        return {};
      }
      const picked = {};
      for (const key of allowedKeys) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
          picked[key] = source[key];
        }
      }
      return picked;
    };

    const normalizeFreshnessWindow = (options) => {
      if (!options || typeof options !== 'object') {
        return {};
      }
      const normalized = { ...options };
      if (normalized.freshnessIntervalMs == null) {
        if (normalized.freshnessIntervalDays != null) {
          const days = Number(normalized.freshnessIntervalDays);
          if (Number.isFinite(days) && days >= 0) {
            normalized.freshnessIntervalMs = days * 24 * 60 * 60 * 1000;
          }
        } else if (normalized.freshnessIntervalHours != null) {
          const hours = Number(normalized.freshnessIntervalHours);
          if (Number.isFinite(hours) && hours >= 0) {
            normalized.freshnessIntervalMs = hours * 60 * 60 * 1000;
          }
        }
      }
      delete normalized.freshnessIntervalDays;
      delete normalized.freshnessIntervalHours;
      return normalized;
    };

    const wikidataCountryOverrides = normalizeFreshnessWindow(pickIngestorOptions(
      resolveIngestorOverrides('countries', 'country', 'wikidataCountry'),
      [
        'entitiesBatchSize',
        'entityBatchDelayMs',
        'freshnessIntervalMs',
        'freshnessIntervalDays',
        'freshnessIntervalHours',
        'transactionChunkSize',
        'timeoutMs',
        'sleepMs',
        'useCache',
        'maxRetries'
      ]
    ));

    const osmBoundaryOverrides = normalizeFreshnessWindow(pickIngestorOptions(
      resolveIngestorOverrides('boundaries', 'boundary', 'osmBoundaries', 'osmBoundary'),
      [
        'batchSize',
        'overpassTimeout',
        'maxConcurrentFetches',
        'maxBatchSize',
        'freshnessIntervalMs',
        'freshnessIntervalDays',
        'freshnessIntervalHours'
      ]
    ));

    if (osmBoundaryOverrides.maxConcurrentFetches != null) {
      const cap = Math.max(1, this.crawler.concurrency || 1);
      const requested = Number(osmBoundaryOverrides.maxConcurrentFetches);
      if (Number.isFinite(requested) && requested > 0) {
        osmBoundaryOverrides.maxConcurrentFetches = Math.max(1, Math.min(Math.floor(requested), cap));
      } else {
        delete osmBoundaryOverrides.maxConcurrentFetches;
      }
    }

    // Emit milestone before creating WikidataCountryIngestor
    log.debug('[GAZETTEER-DEBUG] About to create WikidataCountryIngestor');
    try {
      this.crawler.telemetry.milestoneOnce('gazetteer:creating-wikidata-ingestor', {
        kind: 'debug',
        message: 'Creating WikidataCountryIngestor',
        details: { variant }
      });
    } catch (_) { }

    const maxCountriesForQuery = (this.crawler.targetCountries && this.crawler.targetCountries.length)
      ? null
      : (this.crawler.limitCountries || null);

    const wikidataCountry = new WikidataCountryIngestor({
      db,
      logger,
      cacheDir: path.join(cacheRoot, 'wikidata'),
      useCache: this.crawler.preferCache !== false,
      maxCountries: maxCountriesForQuery,
      targetCountries: this.crawler.targetCountries,
      verbose: isVerboseMode(),
      ...wikidataCountryOverrides
    });

    if (variant === 'wikidata') {
      stages.push({
        name: 'countries',
        kind: 'country',
        crawlDepth: 0,
        priority: 1000,
        ingestors: [wikidataCountry]
      });
    } else {
      stages.push({
        name: 'countries',
        kind: 'country',
        crawlDepth: 0,
        priority: 1000,
        ingestors: [wikidataCountry]
      });
      stages.push({
        name: 'adm1',
        kind: 'region',
        crawlDepth: 1,
        priority: 100,
        ingestors: [
          new WikidataAdm1Ingestor({
            db,
            logger,
            cacheDir: path.join(cacheRoot, 'wikidata'),
            useCache: this.crawler.preferCache !== false,
            useDynamicFetch: true,  // Enable dynamic Wikidata fetching per country
            limitCountries: this.crawler.limitCountries,
            targetCountries: this.crawler.targetCountries
          })
        ]
      });

      // Add cities stage for geography crawl
      stages.push({
        name: 'cities',
        kind: 'city',
        crawlDepth: 2,
        priority: 90,
        ingestors: [
          new WikidataCitiesIngestor({
            db,
            logger,
            cacheDir: path.join(cacheRoot, 'wikidata'),
            useCache: this.crawler.preferCache !== false,
            maxCitiesPerCountry: 200,  // Increased from 50 to 200
            minPopulation: 10000,  // Lowered from 100000 to 10000
            limitCountries: this.crawler.limitCountries,
            targetCountries: this.crawler.targetCountries,
            verbose: isVerboseMode()
          })
        ]
      });
    }

    if (variant === 'geography') {
      if (this.crawler.limitCountries || (this.crawler.targetCountries && this.crawler.targetCountries.length)) {
        log.debug('[GAZETTEER-DEBUG] Skipping boundaries stage because limit or target countries are set');
      } else {
        stages.push({
          name: 'boundaries',
          kind: 'boundary',
          crawlDepth: 1,
          priority: 80,
          ingestors: [
            new OsmBoundaryIngestor({
              db,
              logger,
              ...osmBoundaryOverrides
            })
          ]
        });
      }
    }

    const originalStageOrder = stages.map(stage => stage.name);
    let selectedStages = stages;

    if (this.crawler.gazetteerStageFilter && this.crawler.gazetteerStageFilter.size) {
      const requestedStages = Array.from(this.crawler.gazetteerStageFilter).map(name => String(name).toLowerCase());
      const availableStages = new Map(stages.map(stage => [stage.name.toLowerCase(), stage.name]));
      const dependencyMap = new Map([
        ['adm1', ['countries']],
        ['adm2', ['adm1', 'countries']],
        ['cities', ['countries', 'adm1']],
        ['boundaries', ['countries']]
      ]);

      const resolvedStages = new Set();
      const missingStages = new Set();

      const addStageWithDependencies = (stageName, stack = []) => {
        const normalized = String(stageName || '').toLowerCase();
        if (!normalized) {
          return;
        }
        if (stack.includes(normalized)) {
          return; // Prevent cyclic dependencies
        }
        if (!resolvedStages.has(normalized) && availableStages.has(normalized)) {
          resolvedStages.add(normalized);
        }
        if (!availableStages.has(normalized) && !dependencyMap.has(normalized)) {
          missingStages.add(normalized);
        }
        const deps = dependencyMap.get(normalized);
        if (deps && deps.length) {
          for (const dep of deps) {
            addStageWithDependencies(dep, stack.concat(normalized));
          }
        }
      };

      for (const stageName of requestedStages) {
        addStageWithDependencies(stageName);
        if (!availableStages.has(stageName) && !dependencyMap.has(stageName)) {
          missingStages.add(stageName);
        }
      }

      if (resolvedStages.size === 0) {
        log.warn('[GAZETTEER] Stage filter requested, but no matching stages were found. Available stages:', originalStageOrder);
      } else {
        selectedStages = stages.filter(stage => resolvedStages.has(stage.name.toLowerCase()));
        const resolvedList = Array.from(resolvedStages);
        log.info('[GAZETTEER] Applying stage filter', {
          requested: requestedStages,
          resolved: resolvedList,
          dependenciesAdded: resolvedList.filter(name => !requestedStages.includes(name)),
          missing: Array.from(missingStages)
        });
        try {
          this.crawler.telemetry?.milestoneOnce('gazetteer:stage-filter-applied', {
            kind: 'debug',
            message: 'Gazetteer stage filter applied',
            details: {
              requested: requestedStages,
              resolved: resolvedList,
              missing: Array.from(missingStages)
            }
          });
        } catch (_) { }
      }
    }

    // Create planner for gazetteer mode
    // Uses GazetteerPlanRunner with optional advanced planning support
    try {
      this.crawler.telemetry.milestoneOnce('gazetteer:creating-planner', {
        kind: 'debug',
        message: 'Creating GazetteerPlanRunner',
        details: { variant }
      });
    } catch (_) { }

    const { GazetteerPlanRunner } = require('../gazetteer/GazetteerPlanRunner');
    const useAdvancedPlanning = this.crawler.config?.features?.advancedPlanningSuite === true;

    // Get enhanced database adapter for meta-planning (if available)
    const dbAdapter = this.crawler.enhancedDbAdapter || null;

    const planner = new GazetteerPlanRunner({
      telemetry: this.crawler.telemetry,
      logger,
      config: this.crawler.config,
      useAdvancedPlanning,
      dbAdapter
    });

    try {
      this.crawler.telemetry.milestoneOnce('gazetteer:planner-created', {
        kind: 'debug',
        message: 'GazetteerPlanRunner created successfully',
        details: {
          useAdvancedPlanning,
          hasDbAdapter: !!dbAdapter
        }
      });
    } catch (_) { }

    try {
      this.crawler.telemetry.milestoneOnce('gazetteer:creating-coordinator', {
        kind: 'debug',
        message: 'Creating StagedGazetteerCoordinator',
        details: { stageCount: selectedStages.length }
      });
    } catch (_) { }

    log.debug('[CRAWL] About to create StagedGazetteerCoordinator with', selectedStages.length, 'stages');
    log.debug('[CRAWL] Stage summary (before depth filter):', selectedStages.map(s => ({
      name: s.name,
      kind: s.kind,
      priority: s.priority,
      crawlDepth: s.crawlDepth,
      ingestors: s.ingestors.length
    })));

    // Filter stages based on maxDepth (if specified)
    // Stages with crawlDepth <= maxDepth are included
    const filteredStages = typeof this.crawler.maxDepth === 'number'
      ? selectedStages.filter(s => s.crawlDepth <= this.crawler.maxDepth)
      : selectedStages;

    log.debug('[CRAWL] Stages after depth filter:', filteredStages.map(s => ({
      name: s.name,
      crawlDepth: s.crawlDepth
    })));
    log.debug('[CRAWL] maxDepth:', this.crawler.maxDepth);

    const ingestionCoordinator = new StagedGazetteerCoordinator({
      db,
      telemetry: this.crawler.telemetry,
      logger,
      stages: filteredStages,
      planner
    });

    try {
      this.crawler.telemetry.milestoneOnce('gazetteer:coordinator-created', {
        kind: 'debug',
        message: 'StagedGazetteerCoordinator created successfully',
        details: {}
      });
    } catch (_) { }

    if (this.controller) {
      this.controller.ingestionCoordinator = ingestionCoordinator;
    }
    this.crawler.gazetteerPlanner = planner;
    this.pipelineConfigured = true;
    this.crawler._gazetteerPipelineConfigured = true; // Keep sync

    try {
      this.crawler.telemetry.milestoneOnce('gazetteer:pipeline-config-complete', {
        kind: 'debug',
        message: 'configurePipeline() complete',
        details: { stageCount: filteredStages.length }
      });
    } catch (_) { }
  }

  async run() {
    if (!this.controller) {
      throw new Error('Gazetteer mode controller not configured');
    }

    await this.crawler._trackStartupStage('gazetteer-prepare', 'Preparing gazetteer services', async () => {
      this.controller.dbAdapter = this.crawler.dbAdapter;

      // Wrap entire preparation phase in timeout
      const prepareTimeout = 30000; // 30 seconds for pipeline + initialization

      try {
        await Promise.race([
          (async () => {
            // Emit telemetry before pipeline configuration
            try {
              this.crawler.telemetry.milestoneOnce('gazetteer:configuring-pipeline', {
                kind: 'gazetteer-config',
                message: 'Configuring gazetteer ingestion pipeline',
                details: { mode: this.crawler.gazetteerVariant || 'geography' }
              });
            } catch (_) { }

            this.configurePipeline();

            // Emit milestone after pipeline configured
            try {
              this.crawler.telemetry.milestoneOnce('gazetteer:pipeline-configured', {
                kind: 'gazetteer-config',
                message: 'Gazetteer pipeline configuration complete',
                details: { mode: this.crawler.gazetteerVariant || 'geography' }
              });
            } catch (_) { }

            // Emit telemetry before controller initialization
            try {
              this.crawler.telemetry.milestoneOnce('gazetteer:initializing-controller', {
                kind: 'gazetteer-init',
                message: 'Initializing gazetteer mode controller',
                details: { mode: this.crawler.gazetteerVariant || 'geography' }
              });
            } catch (_) { }

            // Add separate timeout for initialize() to diagnose hang
            const initTimeout = 15000; // 15 seconds for initialize
            await Promise.race([
              (async () => {
                await this.controller.initialize();

                try {
                  this.crawler.telemetry.milestoneOnce('gazetteer:controller-initialized', {
                    kind: 'gazetteer-init',
                    message: 'Controller initialization complete',
                    details: {}
                  });
                } catch (_) { }
              })(),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`Controller initialize() timeout after ${initTimeout}ms`)), initTimeout)
              )
            ]);
          })(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Gazetteer preparation timeout after ${prepareTimeout}ms`)), prepareTimeout)
          )
        ]);
      } catch (err) {
        const message = err?.message || String(err);
        try {
          this.crawler.telemetry.problem({
            kind: 'gazetteer-init-failed',
            scope: this.crawler.domain || 'gazetteer',
            message,
            details: { stack: err?.stack || null }
          });
        } catch (_) { }
        throw err;
      }

      return { status: 'completed' };
    });

    this.crawler._markStartupComplete('Gazetteer services ready');

    let summary = null;
    try {
      summary = await this.controller.run();
      log.success('Gazetteer crawl completed');
      if (summary && summary.totals) {
        try {
          console.log(`[gazetteer] Totals: ${JSON.stringify(summary.totals)}`);
        } catch (_) { }
      }
      this.crawler.emitProgress(true);
      this.crawler.milestoneTracker.emitCompletionMilestone({ outcomeErr: null });
      await this.controller.shutdown({ reason: 'completed' });
      if (this.crawler.dbAdapter && this.crawler.dbAdapter.isEnabled && this.crawler.dbAdapter.isEnabled()) {
        const count = this.crawler.dbAdapter.getArticleCount();
        console.log(`Database contains ${count} article records`);
        this.crawler.dbAdapter.close();
      }
    } catch (err) {
      log.error('Gazetteer crawl failed:', err);
      this.crawler.milestoneTracker.emitCompletionMilestone({ outcomeErr: err });
      throw err;
    }

    return summary;
  }
}

module.exports = { GazetteerManager };