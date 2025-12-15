'use strict';

const { CrawlOperations } = require('../../../crawler/CrawlOperations');
const {
  createSequenceConfigLoader,
  SequenceConfigError
} = require('../../../orchestration/SequenceConfigLoader');
const { runSequenceConfig } = require('../../../orchestration/SequenceConfigRunner');

function buildOperationSummaries(facade) {
  return facade.listOperations().map((name) => {
    const preset = facade.getOperationPreset(name) || {};
    return {
      name,
      summary: preset.summary || null,
      defaultOptions: preset.options || {}
    };
  });
}

function buildSequenceSummaries(facade) {
  return facade.listSequencePresets().map((preset) => {
    const full = facade.getSequencePreset ? facade.getSequencePreset(preset.name) : null;
    const steps = Array.isArray(full?.steps)
      ? full.steps.map((step) => {
          if (typeof step === 'string') {
            return { operation: step, label: null };
          }
          return {
            operation: step.operation || step.name || null,
            label: step.label || null
          };
        })
      : [];

    return {
      name: preset.name,
      label: preset.label || null,
      description: preset.description || null,
      continueOnError: Boolean(preset.continueOnError),
      stepCount: preset.stepCount,
      steps
    };
  });
}

function buildAvailabilityPayload(availability, options = {}, includeAll = false) {
  if (!availability) return undefined;
  const includeOperations = includeAll || options.showOperationsList;
  const includeSequences = includeAll || options.showSequencesList;

  const payload = {};
  if (includeOperations) {
    payload.operations = availability.operations;
  }
  if (includeSequences) {
    payload.sequencePresets = availability.sequences;
  }

  return Object.keys(payload).length ? payload : undefined;
}

function createCrawlService({
  createFacade = ({ logger, telemetryIntegration: telemetry }) => new CrawlOperations({ logger, telemetryIntegration: telemetry }),
  createSequenceLoader = (loaderOptions = {}) => createSequenceConfigLoader(loaderOptions),
  sequenceConfigRunner = runSequenceConfig,
  telemetryIntegration
} = {}) {
  const resolvedTelemetry = telemetryIntegration && typeof telemetryIntegration.connectCrawler === 'function'
    ? telemetryIntegration
    : null;

  function instantiateFacade({ logger }) {
    if (resolvedTelemetry && createFacade) {
      // Backward compatible: only inject telemetryIntegration when using the default facade shape.
      // Custom createFacade implementations can choose to accept or ignore the extra field.
      return createFacade({ logger, telemetryIntegration: resolvedTelemetry });
    }
    return createFacade({ logger });
  }

  function getAvailability({ logger } = {}) {
    const facade = instantiateFacade({ logger });
    return {
      operations: buildOperationSummaries(facade),
      sequences: buildSequenceSummaries(facade)
    };
  }

  async function runOperation({ logger, operationName, startUrl, overrides = {} }) {
    if (!operationName) {
      throw new Error('operationName is required.');
    }
    const facade = instantiateFacade({ logger });
    const runner = facade[operationName];
    if (typeof runner !== 'function') {
      throw new Error(`Unknown crawl operation: ${operationName}`);
    }
    return runner(startUrl, overrides || {});
  }

  async function runSequencePreset({
    logger,
    sequenceName,
    startUrl,
    sharedOverrides,
    stepOverrides,
    continueOnError,
    onStepComplete,
    context
  }) {
    if (!sequenceName) {
      throw new Error('sequenceName is required.');
    }
    const facade = instantiateFacade({ logger });
    return facade.runSequencePreset(sequenceName, {
      startUrl,
      sharedOverrides,
      stepOverrides,
      continueOnError,
      onStepComplete,
      context
    });
  }

  async function runSequenceConfigRequest({
    logger,
    sequenceConfigName,
    configDir,
    configHost,
    startUrl,
    sharedOverrides,
    stepOverrides,
    continueOnError,
    configCliOverrides,
    onStepComplete
  }) {
    if (!sequenceConfigName) {
      throw new Error('sequenceConfigName is required.');
    }
    const facade = instantiateFacade({ logger });
    const loader = createSequenceLoader({ configDir: configDir || undefined });
    return sequenceConfigRunner({
      facade,
      loader,
      sequenceConfigName,
      configHost,
      startUrl,
      sharedOverrides,
      stepOverrides,
      continueOnError,
      configCliOverrides,
      onStepComplete
    });
  }

  return {
    getAvailability,
    runOperation,
    runSequencePreset,
    runSequenceConfig: runSequenceConfigRequest
  };
}

module.exports = {
  buildAvailabilityPayload,
  buildOperationSummaries,
  buildSequenceSummaries,
  createCrawlService,
  SequenceConfigError
};
