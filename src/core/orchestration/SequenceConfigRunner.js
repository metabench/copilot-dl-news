'use strict';

const { createSequenceConfigLoader } = require('./SequenceConfigLoader');

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function buildSequenceConfigMetadata(sequenceConfigName, loadResult) {
  if (!loadResult || typeof loadResult !== 'object') {
    return {};
  }

  const loaderMetadata = loadResult.metadata || {};
  const source = loaderMetadata.source || {};
  const warnings = Array.isArray(loaderMetadata.warnings) ? loaderMetadata.warnings.slice() : [];

  const configMetadata = {
    sequenceName: loaderMetadata.sequenceName || sequenceConfigName,
    host: loaderMetadata.host,
    declaredHost: loaderMetadata.declaredHost,
    version: loaderMetadata.version,
    startUrl: loaderMetadata.startUrl,
    resolvedTokens: Array.isArray(loaderMetadata.resolvedTokens)
      ? loaderMetadata.resolvedTokens.slice()
      : []
  };

  if (isPlainObject(source) && Object.keys(source).length > 0) {
    configMetadata.source = {
      path: source.path,
      relativePath: source.relativePath,
      format: source.format,
      bytes: source.bytes,
      checksum: source.checksum,
      hostSpecific: source.hostSpecific
    };
  }

  if (warnings.length) {
    configMetadata.warnings = warnings;
  }

  return {
    source: {
      type: 'config-file',
      name: sequenceConfigName,
      path: source.path,
      relativePath: source.relativePath,
      format: source.format,
      bytes: source.bytes,
      checksum: source.checksum,
      hostSpecific: source.hostSpecific
    },
    config: configMetadata,
    warnings
  };
}

function cloneSequenceConfigSteps(steps) {
  if (!Array.isArray(steps)) {
    return [];
  }

  return steps.map((step, index) => ({
    id: step.id || `${step.operation || 'step'}-${index}`,
    operation: step.operation,
    label: step.label || step.operation,
    startUrl: step.startUrl,
    overrides: isPlainObject(step.overrides) ? { ...step.overrides } : {},
    continueOnError: Boolean(step.continueOnError)
  }));
}

async function runSequenceConfig({
  facade,
  loader,
  sequenceConfigName,
  configHost,
  configDir,
  startUrl,
  sharedOverrides = {},
  stepOverrides = {},
  continueOnError = false,
  configCliOverrides = {},
  onStepComplete,
  context,
  resolvers,
  telemetry
} = {}) {
  if (!facade || typeof facade.executeSequence !== 'function') {
    throw new Error('runSequenceConfig requires a facade with executeSequence(startUrl, options) support');
  }
  if (!sequenceConfigName || typeof sequenceConfigName !== 'string') {
    throw new Error('sequenceConfigName must be provided to runSequenceConfig');
  }

  const loaderInstance = loader || createSequenceConfigLoader({
    configDir: configDir || undefined
  });

  const telemetryHandlers = {
    onConfigResolved: typeof telemetry?.onConfigResolved === 'function' ? telemetry.onConfigResolved : () => {},
    onSequenceStart: typeof telemetry?.onSequenceStart === 'function' ? telemetry.onSequenceStart : () => {},
    onStepEvent: typeof telemetry?.onStepEvent === 'function' ? telemetry.onStepEvent : () => {},
    onSequenceComplete: typeof telemetry?.onSequenceComplete === 'function' ? telemetry.onSequenceComplete : () => {},
    onSequenceError: typeof telemetry?.onSequenceError === 'function' ? telemetry.onSequenceError : () => {}
  };

  const cliOverrides = { ...(configCliOverrides || {}) };
  if (startUrl) {
    cliOverrides.startUrl = startUrl;
  }
  if (configHost && !cliOverrides.__sequenceHost) {
    cliOverrides.__sequenceHost = configHost;
  }

  const loadOptions = {
    sequenceName: sequenceConfigName,
    host: configHost,
    cliOverrides
  };

  if (resolvers && typeof resolvers === 'object' && Object.keys(resolvers).length > 0) {
    loadOptions.resolvers = resolvers;
  }

  const loadResult = await loaderInstance.load(loadOptions);

  const metadata = buildSequenceConfigMetadata(sequenceConfigName, loadResult);
  const resolverNamespaces = Array.isArray(loadResult?.metadata?.resolvedTokens)
    ? Array.from(new Set(loadResult.metadata.resolvedTokens.map((entry) => entry.namespace))).sort()
    : (resolvers ? Object.keys(resolvers) : []);

  const resolvedTokens = Array.isArray(metadata?.config?.resolvedTokens)
    ? metadata.config.resolvedTokens
    : [];

  telemetryHandlers.onConfigResolved({
    sequenceConfigName,
    configHost: configHost || null,
    cliOverrides,
    configMetadata: metadata,
    resolverNamespaces,
    resolvedTokens
  });

  const sequenceDefinition = {
    metadata,
    startUrl: loadResult.startUrl,
    sharedOverrides: loadResult.sharedOverrides || {},
    steps: cloneSequenceConfigSteps(loadResult.steps)
  };

  const sequenceStartUrl = startUrl || loadResult.startUrl;

  const baseContext = isPlainObject(context) ? { ...context } : {};
  baseContext.config = metadata.config;
  baseContext.configSource = metadata.source;
  baseContext.cliOverrides = cliOverrides;
  baseContext.sequenceConfigName = sequenceConfigName;
  baseContext.configHost = configHost || null;

  const injectTelemetryContext = (payload = {}) => ({
    ...payload,
    sequenceConfigName,
    configHost: configHost || null,
    cliOverrides,
    configMetadata: metadata,
    resolverNamespaces,
    resolvedTokens
  });

  let sequenceExecution;

  try {
    sequenceExecution = await facade.executeSequence(sequenceDefinition, {
      startUrl: sequenceStartUrl,
      sharedOverrides,
      stepOverrides,
      continueOnError,
      onStepComplete,
      context: baseContext,
      telemetry: {
        onSequenceStart: (payload) => telemetryHandlers.onSequenceStart(injectTelemetryContext(payload)),
        onSequenceComplete: (payload) => telemetryHandlers.onSequenceComplete(injectTelemetryContext(payload)),
        onStepEvent: (event) => telemetryHandlers.onStepEvent(injectTelemetryContext(event))
      }
    });
  } catch (error) {
    telemetryHandlers.onSequenceError(injectTelemetryContext({ error }));
    throw error;
  }

  return {
    result: sequenceExecution,
    loadResult,
    metadata,
    cliOverrides,
    sequenceStartUrl
  };
}


module.exports = {
  buildSequenceConfigMetadata,
  cloneSequenceConfigSteps,
  runSequenceConfig
};
