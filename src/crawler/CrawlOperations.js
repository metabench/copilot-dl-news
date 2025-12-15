'use strict';

const {
  createDefaultOperations,
  CustomCrawlOperation,
  CrawlSequenceRunner,
  listSequencePresets,
  getSequencePreset,
  resolveSequencePreset,
  cloneOptions
} = require('./operations');
const {
  buildFacadeDefaults,
  createCrawlerFactory
} = require('./operations/facadeUtils');

class CrawlOperations {
  constructor({
    defaults = {},
    logger = console,
    crawlerFactory,
    telemetryIntegration
  } = {}) {
    this.defaults = buildFacadeDefaults(defaults);

    this.logger = logger || console;
    this.telemetryIntegration = telemetryIntegration && typeof telemetryIntegration.connectCrawler === 'function'
      ? telemetryIntegration
      : null;
    this.operations = new Map();
    this._customOperation = new CustomCrawlOperation();

    createDefaultOperations().forEach((operation) => this.registerOperation(operation));

    this.sequenceRunner = new CrawlSequenceRunner({
      runOperation: (name, startUrl, overrides) => this._runOperation(name, startUrl, overrides),
      listOperations: () => this.listOperations(),
      logger: this.logger
    });

    this.listSequencePresets = listSequencePresets;
    this.getSequencePreset = getSequencePreset;

    const baseCreateCrawler = createCrawlerFactory(crawlerFactory);
    this._createCrawler = (startUrl, options, services) => {
      const crawler = baseCreateCrawler(startUrl, options, services);

      if (this.telemetryIntegration && crawler && typeof crawler.on === 'function') {
        try {
          const disconnect = this.telemetryIntegration.connectCrawler(crawler, {
            jobId: crawler.jobId || options?.jobId,
            crawlType: options?.crawlType
          });

          if (typeof disconnect === 'function') {
            crawler.__crawlTelemetryDisconnect = disconnect;
          }
        } catch (error) {
          this.logger?.warn?.('[CrawlOperations] Failed to connect crawler telemetry:', error);
        }
      }

      return crawler;
    };
  }

  registerOperation(operation) {
    if (!operation || typeof operation.getName !== 'function') {
      throw new Error('registerOperation expects a CrawlOperation instance');
    }
    const name = operation.getName();
    this.operations.set(name, operation);
    this._attachShortcut(name);
  }

  listOperations() {
    return Array.from(this.operations.keys());
  }

  getOperationPreset(name) {
    const operation = this.operations.get(name);
    return operation ? operation.getPreset() : null;
  }

  async runCustom(startUrl, customOptions = {}) {
    return this._customOperation.run({
      startUrl,
      overrides: customOptions,
      defaults: this.defaults,
      logger: this.logger,
      createCrawler: this._createCrawler
    });
  }

  async executeSequence(sequence, {
    startUrl,
    sharedOverrides = {},
    continueOnError = false,
    stepOverrides,
    onStepComplete,
    context,
    telemetry
  } = {}) {
    return this.sequenceRunner.execute(sequence, {
      startUrl,
      sharedOverrides,
      continueOnError,
      stepOverrides,
      onStepComplete,
      context,
      telemetry
    });
  }

  async runSequencePreset(name, {
    startUrl,
    sharedOverrides,
    continueOnError,
    stepOverrides,
    onStepComplete,
    context,
    configMetadata
  } = {}) {
    const resolved = resolveSequencePreset(name, {
      startUrl,
      sharedOverrides,
      continueOnError,
      stepOverrides
    });

    if (!resolved.startUrl) {
      throw new Error(`Sequence preset "${name}" requires a startUrl`);
    }

    const presetMetadata = {
      name: resolved.preset?.name || name,
      label: resolved.preset?.label || null,
      description: resolved.preset?.description || null,
      stepCount: Array.isArray(resolved.sequence) ? resolved.sequence.length : 0,
      continueOnError: Boolean(resolved.preset?.continueOnError)
    };

    const sourceMetadata = resolved.metadata
      ? cloneOptions(resolved.metadata)
      : {
          type: 'builtin-preset',
          name: presetMetadata.name
        };

    const configMetadataClone = configMetadata ? cloneOptions(configMetadata) : null;

    const sequenceConfig = {
      metadata: {
        preset: presetMetadata,
        source: sourceMetadata,
        ...(configMetadataClone ? { config: configMetadataClone } : {})
      },
      startUrl: resolved.startUrl,
      sharedOverrides: resolved.sharedOverrides,
      steps: resolved.sequence
    };

    const baseContext = {
      preset: presetMetadata,
      source: sourceMetadata
    };

    if (configMetadataClone) {
      baseContext.config = configMetadataClone;
    }

    if (stepOverrides && Object.keys(stepOverrides).length > 0) {
      baseContext.stepOverrides = cloneOptions(stepOverrides);
    }

    const mergedContext = {
      ...baseContext,
      ...(context && typeof context === 'object' ? cloneOptions(context) : {})
    };

    return this.sequenceRunner.execute(sequenceConfig, {
      startUrl: resolved.startUrl,
      sharedOverrides: resolved.sharedOverrides,
      continueOnError: resolved.continueOnError,
      stepOverrides,
      onStepComplete,
      context: mergedContext
    });
  }


  async _runOperation(name, startUrl, overrides = {}) {
    const operation = this.operations.get(name);
    if (!operation) {
      throw new Error(`Unknown crawl operation: ${name}`);
    }

    return operation.run({
      startUrl,
      overrides,
      defaults: this.defaults,
      logger: this.logger,
      createCrawler: this._createCrawler
    });
  }

  _attachShortcut(name) {
    if (this[name]) {
      return;
    }
    this[name] = (startUrl, overrides) => this._runOperation(name, startUrl, overrides);
  }
}

module.exports = {
  CrawlOperations
};
