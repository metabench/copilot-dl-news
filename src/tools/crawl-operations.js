#!/usr/bin/env node
'use strict';

const { CliArgumentParser } = require('../utils/CliArgumentParser');
const { CliFormatter } = require('../utils/CliFormatter');
const { CrawlOperations } = require('../crawler/CrawlOperations');
const {
  createSequenceConfigLoader,
  SequenceConfigError
} = require('../orchestration/SequenceConfigLoader');
const { runSequenceConfig } = require('../orchestration/SequenceConfigRunner');

function parseCliArgs(argv) {
  const parser = new CliArgumentParser(
    'crawl-operations',
    'Run crawl facade operations and sequence presets with standardized output.'
  );

  parser
    .add('--operation <name>', 'Run a single crawl operation', null)
    .add('--sequence <name>', 'Run a sequence preset', null)
    .add('--sequence-config <name>', 'Run a sequence defined via configuration files', null)
    .add('--config-host <host>', 'Optional host segment when resolving sequence configuration', null)
    .add('--config-dir <path>', 'Override the sequence configuration directory', null)
    .add('--config-cli <json>', 'JSON object supplying values for the CLI resolver namespace', null)
    .add('--start-url <url>', 'Start URL for the selected operation or sequence')
    .add('--db-path <path>', 'Database path for playbook integration', null)
    .add('--overrides <json>', 'JSON object of overrides for a single operation run')
    .add('--shared-overrides <json>', 'JSON overrides applied to every step in a sequence')
    .add('--step-overrides <json>', 'JSON object mapping operation names to per-step overrides in a sequence')
    .add('--continue-on-error', 'Continue running sequence steps after failures', false, 'boolean')
    .add('--list-operations', 'List available operations before exiting', false, 'boolean')
    .add('--list-sequences', 'List available sequence presets before exiting', false, 'boolean')
    .add('--summary-format <format>', 'Summary output format: ascii | json', 'ascii')
    .add('--json', 'Emit JSON summary output (alias for --summary-format json)', false, 'boolean')
    .add('--quiet', 'Emit JSON without pretty printing and suppress ASCII summaries', false, 'boolean')
    .add('--logger-level <level>', 'Logger verbosity: info | warn | error | silent', 'info');

  return parser.parse(argv);
}

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

function parseJsonObject(value, label) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return {};
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed === null) {
        return {};
      }
      if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
      throw new Error(`${label} must be a JSON object.`);
    } catch (error) {
      throw new Error(`Invalid JSON for ${label}: ${error?.message || error}`);
    }
  }

  throw new Error(`${label} must be provided as a JSON object.`);
}

function normalizeOptions(raw, context) {
  const positional = Array.isArray(raw.positional) ? raw.positional : [];

  let summaryFormat = raw.json === true ? 'json' : (raw.summaryFormat || 'ascii');
  summaryFormat = String(summaryFormat).trim().toLowerCase();
  if (!['ascii', 'json'].includes(summaryFormat)) {
    throw new Error(`Unsupported summary format: ${summaryFormat}`);
  }

  const quiet = Boolean(raw.quiet);
  const loggerLevel = typeof raw.loggerLevel === 'string'
    ? raw.loggerLevel.trim().toLowerCase()
    : 'info';
  if (!['info', 'warn', 'error', 'silent'].includes(loggerLevel)) {
    throw new Error(`Unsupported logger level: ${raw.loggerLevel}`);
  }

  const operationSet = new Set(context.operations.map((op) => op.name));
  const sequenceSet = new Set(context.sequences.map((seq) => seq.name));

  let operationName = raw.operation || null;
  let sequenceName = raw.sequence || null;
  let sequenceConfigName = raw.sequenceConfig || null;

  if (!operationName && !sequenceName && !sequenceConfigName && positional.length > 0) {
    const candidate = String(positional[0]);
    if (operationSet.has(candidate)) {
      operationName = candidate;
    } else if (sequenceSet.has(candidate)) {
      sequenceName = candidate;
    }
  }

  const startUrl = raw.startUrl || (positional.length > 1 ? positional[1] : undefined);

  const overrides = parseJsonObject(raw.overrides, '--overrides') || {};
  const sharedOverrides = parseJsonObject(raw.sharedOverrides, '--shared-overrides') || {};
  const stepOverrides = parseJsonObject(raw.stepOverrides, '--step-overrides') || {};
  const configCliOverrides = parseJsonObject(raw.configCli, '--config-cli') || {};

  if (stepOverrides && typeof stepOverrides === 'object') {
    for (const [key, value] of Object.entries(stepOverrides)) {
      if (value && typeof value !== 'object') {
        throw new Error(`Invalid step override for "${key}" — expected an object of overrides.`);
      }
    }
  }

  const continueOnError = raw.continueOnError === true;
  const showOperationsList = raw.listOperations === true;
  const showSequencesList = raw.listSequences === true;

  const configDir = typeof raw.configDir === 'string' && raw.configDir.trim().length > 0
    ? raw.configDir.trim()
    : null;
  const configHost = typeof raw.configHost === 'string' && raw.configHost.trim().length > 0
    ? raw.configHost.trim()
    : null;

  const modeSelections = [operationName, sequenceName, sequenceConfigName].filter(Boolean);
  if (modeSelections.length > 1) {
    throw new Error('Specify only one of --operation, --sequence, or --sequence-config.');
  }

  let mode = 'list';
  if (operationName) {
    if (!operationSet.has(operationName)) {
      throw new Error(`Unknown operation: ${operationName}`);
    }
    if (!startUrl) {
      throw new Error('startUrl is required for operations (use --start-url <url>).');
    }
    mode = 'operation';
  } else if (sequenceName) {
    if (!sequenceSet.has(sequenceName)) {
      throw new Error(`Unknown sequence preset: ${sequenceName}`);
    }
    if (!startUrl) {
      throw new Error('startUrl is required for sequences (use --start-url <url>).');
    }
    mode = 'sequence';
  } else if (sequenceConfigName) {
    mode = 'sequence-config';
  } else if (!showOperationsList && !showSequencesList) {
    return {
      mode: 'list',
      summaryFormat,
      quiet,
      loggerLevel,
      showOperationsList: true,
      showSequencesList: true,
      continueOnError,
      overrides,
      sharedOverrides,
      stepOverrides,
      startUrl: undefined,
      operationName: null,
      sequenceName: null,
      sequenceConfigName: null,
      configDir,
      configHost,
      configCliOverrides
    };
  }

  return {
    mode,
    operationName,
    sequenceName,
    sequenceConfigName,
    startUrl,
    overrides,
    sharedOverrides,
    stepOverrides,
    continueOnError,
    summaryFormat,
    quiet,
    loggerLevel,
    showOperationsList,
    showSequencesList,
    configDir,
    configHost,
    configCliOverrides
  };
}


function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) {
    return '—';
  }
  if (ms < 1000) {
    return `${Math.round(ms)} ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds < 10 ? seconds.toFixed(2) : seconds.toFixed(1)} s`;
  }
  const minutes = seconds / 60;
  return `${minutes < 10 ? minutes.toFixed(1) : minutes.toFixed(0)} min`;
}

function formatStatus(fmt, status) {
  if (!status) return fmt.COLORS.info('UNKNOWN');
  const upper = String(status).toUpperCase();
  if (status === 'ok') {
    return fmt.COLORS.success(upper);
  }
  if (status === 'error') {
    return fmt.COLORS.error(upper);
  }
  if (status === 'mixed' || status === 'aborted') {
    return fmt.COLORS.warning(upper);
  }
  return fmt.COLORS.info(upper);
}

function printStat(fmt, label, value, type) {
  if (value === undefined || value === null) {
    return;
  }
  if (typeof value === 'string' && value.trim().length === 0) {
    return;
  }
  fmt.stat(label, value, type);
}

function renderSequenceMetadata(fmt, metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return;
  }

  const preset = metadata.preset;
  const source = metadata.source;
  const config = metadata.config;
  const warnings = Array.isArray(metadata.warnings) ? metadata.warnings : [];

  const hasUsefulContent = Boolean(preset || source || config || warnings.length);
  if (!hasUsefulContent) {
    return;
  }

  fmt.section('Metadata');

  if (preset) {
    printStat(fmt, 'Preset Name', preset.name || preset.label || null);
    printStat(fmt, 'Preset Label', preset.label && preset.label !== preset.name ? preset.label : null);
    printStat(fmt, 'Preset Description', preset.description || null);
    if (typeof preset.stepCount === 'number') {
      printStat(fmt, 'Preset Step Count', preset.stepCount, 'number');
    }
    if (typeof preset.continueOnError === 'boolean') {
      printStat(fmt, 'Preset Continue on Error', preset.continueOnError ? 'Yes' : 'No');
    }
  }

  if (source) {
    printStat(fmt, 'Source Type', source.type || null);
    printStat(fmt, 'Source Name', source.name || null);
    printStat(fmt, 'Source Path', source.path || null);
    printStat(fmt, 'Source Relative Path', source.relativePath || null);
    printStat(fmt, 'Source Format', source.format || null);
    if (typeof source.bytes === 'number') {
      printStat(fmt, 'Source Size (bytes)', source.bytes, 'number');
    }
    if (source.checksum) {
      printStat(fmt, 'Source Checksum', source.checksum);
    }
    if (source.hostSpecific !== undefined) {
      printStat(fmt, 'Host Specific', source.hostSpecific ? 'Yes' : 'No');
    }
  }

  let configWarnings = [];
  if (config && typeof config === 'object') {
    const configSource = config.source || {};
    printStat(fmt, 'Config Sequence Name', config.sequenceName || null);
    printStat(fmt, 'Config Host', config.host || null);
    printStat(fmt, 'Config Declared Host', config.declaredHost || null);
    if (config.version !== undefined && config.version !== null) {
      printStat(fmt, 'Config Version', config.version);
    }
    if (config.startUrl && typeof config.startUrl === 'object') {
      printStat(fmt, 'Config Start URL', config.startUrl.value || null);
      printStat(fmt, 'Config Start URL Source', config.startUrl.source || null);
    }
    printStat(fmt, 'Config File', configSource.relativePath || configSource.path || null);
    printStat(fmt, 'Config Format', configSource.format || null);
    if (typeof configSource.bytes === 'number') {
      printStat(fmt, 'Config Size (bytes)', configSource.bytes, 'number');
    }
    if (configSource.checksum) {
      printStat(fmt, 'Config Checksum', configSource.checksum);
    }
    if (Array.isArray(config.resolvedTokens)) {
      printStat(fmt, 'Resolved Tokens', config.resolvedTokens.length, 'number');
    }
    configWarnings = Array.isArray(config.warnings) ? config.warnings : [];
    configWarnings.forEach((warning) => {
      const message = warning?.message || JSON.stringify(warning);
      fmt.warn(`[Config] ${warning?.code ? `${warning.code}: ` : ''}${message}`);
    });
  }

  const configWarningRefs = new Set(configWarnings);
  warnings.forEach((warning) => {
    if (configWarningRefs.has(warning)) {
      return;
    }
    const message = warning?.message || JSON.stringify(warning);
    fmt.warn(`${warning?.code ? `${warning.code}: ` : ''}${message}`);
  });
}


function createLogger(fmt, options) {
  const level = options.loggerLevel;
  const suppressInfo = options.quiet || options.summaryFormat === 'json' || level !== 'info';
  const suppressWarn = options.quiet || options.summaryFormat === 'json' || !['info', 'warn'].includes(level);
  const suppressError = level === 'silent';

  return {
    info: suppressInfo ? () => {} : (message) => fmt.info(message),
    warn: suppressWarn ? () => {} : (message) => fmt.warn(message),
    error: suppressError
      ? () => {}
      : (message) => {
          if (options.summaryFormat === 'ascii' && !options.quiet) {
            fmt.error(message);
          } else {
            console.error(`[ERROR] ${message}`);
          }
        }
  };
}

function buildAvailabilityPayload(availability, options, includeAll = false) {
  if (!availability) return undefined;
  const payload = {};
  const includeOperations = includeAll || options?.showOperationsList;
  const includeSequences = includeAll || options?.showSequencesList;

  if (includeOperations) {
    payload.operations = availability.operations;
  }
  if (includeSequences) {
    payload.sequencePresets = availability.sequences;
  }

  return Object.keys(payload).length ? payload : undefined;
}

function renderAvailabilityAscii(fmt, availability, showOperations, showSequences) {
  fmt.header('Crawl Operations Overview');

  if (showOperations) {
    fmt.section('Available Operations');
    const rows = availability.operations.map((op) => ({
      Operation: op.name,
      Summary: op.summary || '—'
    }));
    fmt.table(rows, { columns: ['Operation', 'Summary'] });
  }

  if (showSequences) {
    fmt.section('Sequence Presets');
    const rows = availability.sequences.map((seq) => ({
      Preset: seq.name,
      Description: seq.description || '—',
      Steps: seq.steps.map((step) => step.operation).join(' → '),
      'Continue on Error': seq.continueOnError ? 'Yes' : 'No'
    }));
    fmt.table(rows, { columns: ['Preset', 'Description', 'Steps', 'Continue on Error'] });
  }
}

function renderOperationAscii(fmt, result, options) {
  fmt.header('Crawl Operation');

  fmt.section('Configuration');
  fmt.stat('Operation', options.operationName);
  fmt.stat('Start URL', options.startUrl);
  fmt.stat('Overrides', Object.keys(options.overrides).length ? JSON.stringify(options.overrides) : '—');

  fmt.section('Result');
  fmt.stat('Status', formatStatus(fmt, result.status));
  if (result.elapsedMs != null) {
    fmt.stat('Elapsed', formatDuration(result.elapsedMs), 'duration');
  }
  if (result.startedAt) {
    fmt.stat('Started', result.startedAt);
  }
  if (result.finishedAt) {
    fmt.stat('Finished', result.finishedAt);
  }

  if (result.error && result.error.message) {
    fmt.error(`Error: ${result.error.message}`);
  }

  if (result.stats && Object.keys(result.stats).length) {
    const rows = Object.entries(result.stats).map(([key, value]) => ({
      Metric: key,
      Value: typeof value === 'object' ? JSON.stringify(value) : value
    }));
    fmt.section('Crawler Stats');
    fmt.table(rows, { columns: ['Metric', 'Value'] });
  }

  fmt.footer();
  if (result.status === 'ok') {
    fmt.success('Operation completed successfully.');
  } else {
    fmt.warn('Operation completed with errors.');
  }
}

function renderSequenceAscii(fmt, result, options) {
  fmt.header('Crawl Sequence');

  fmt.section('Configuration');
  if (options.sequenceName) {
    fmt.stat('Preset', options.sequenceName);
  }
  if (options.sequenceConfigName) {
    fmt.stat('Sequence Config', options.sequenceConfigName);
  }
  if (options.configHost) {
    fmt.stat('Config Host', options.configHost);
  }
  if (options.configDir) {
    fmt.stat('Config Directory', options.configDir);
  }

  const effectiveStartUrl = options.startUrl
    || result.startUrl
    || (result.metadata && result.metadata.config && result.metadata.config.startUrl && result.metadata.config.startUrl.value)
    || '—';
  fmt.stat('Start URL', effectiveStartUrl);

  fmt.stat('Continue on Error', options.continueOnError ? 'Yes' : 'No');

  const sharedOverrides = options.sharedOverrides || {};
  fmt.stat('Shared Overrides', Object.keys(sharedOverrides).length ? JSON.stringify(sharedOverrides) : '—');

  const stepOverrides = options.stepOverrides || {};
  fmt.stat('Step Overrides', Object.keys(stepOverrides).length ? JSON.stringify(stepOverrides) : '—');

  const configCliOverrides = options.configCliOverrides || {};
  if (Object.keys(configCliOverrides).length) {
    fmt.stat('Config CLI Overrides', JSON.stringify(configCliOverrides));
  }

  renderSequenceMetadata(fmt, result.metadata);

  fmt.section('Overall Result');
  fmt.stat('Status', formatStatus(fmt, result.status));
  if (result.elapsedMs != null) {
    fmt.stat('Elapsed', formatDuration(result.elapsedMs), 'duration');
  }
  if (result.startedAt) {
    fmt.stat('Started', result.startedAt);
  }
  if (result.finishedAt) {
    fmt.stat('Finished', result.finishedAt);
  }
  fmt.stat('Steps Executed', result.steps ? result.steps.length : 0, 'number');

  if (Array.isArray(result.steps) && result.steps.length) {
    const rows = result.steps.map((step, index) => ({
      '#': index + 1,
      Operation: step.operation,
      Label: step.label || '—',
      Status: formatStatus(fmt, step.status),
      Elapsed: step.elapsedMs != null ? formatDuration(step.elapsedMs) : '—',
      Error: step.error?.message || '—'
    }));
    fmt.section('Steps');
    fmt.table(rows, { columns: ['#', 'Operation', 'Label', 'Status', 'Elapsed', 'Error'] });
  }

  fmt.footer();
  if (result.status === 'ok') {
    fmt.success('Sequence completed successfully.');
  } else {
    fmt.warn(`Sequence finished with status ${result.status}.`);
  }
}


async function runOperation(facade, options) {
  return facade[options.operationName](options.startUrl, options.overrides);
}


async function runSequence(facade, options, fmt) {
  const onStepComplete = (options.summaryFormat === 'ascii' && !options.quiet)
    ? (stepResult, index) => {
        fmt.info(`Step ${index + 1}: ${stepResult.operation} → ${stepResult.status}`);
      }
    : undefined;

  return facade.runSequencePreset(options.sequenceName, {
    startUrl: options.startUrl,
    sharedOverrides: options.sharedOverrides,
    stepOverrides: options.stepOverrides,
    continueOnError: options.continueOnError,
    onStepComplete
  });
}

function emitJson(payload, options) {
  console.log(JSON.stringify(payload, null, options.quiet ? undefined : 2));
}

async function main() {
  const fmt = new CliFormatter();

  let rawArgs;
  try {
    rawArgs = parseCliArgs(process.argv.slice(2));
  } catch (error) {
    fmt.error(error?.message || error);
    process.exit(1);
    return;
  }

  const probeFacade = new CrawlOperations();
  const probeAvailability = {
    operations: buildOperationSummaries(probeFacade),
    sequences: buildSequenceSummaries(probeFacade)
  };

  let options;
  try {
    options = normalizeOptions(rawArgs, probeAvailability);
  } catch (error) {
    fmt.error(error?.message || error);
    process.exit(1);
    return;
  }

  const logger = createLogger(fmt, options);
  const facade = new CrawlOperations({ logger });
  const availability = {
    operations: buildOperationSummaries(facade),
    sequences: buildSequenceSummaries(facade)
  };

  if (options.mode === 'list') {
    if (options.summaryFormat === 'json' || options.quiet) {
      const payload = buildAvailabilityPayload(availability, options, true) || {};
      emitJson({ mode: 'list', availability: payload }, options);
    } else {
      renderAvailabilityAscii(fmt, availability, true, true);
    }
    return;
  }

  if (options.summaryFormat === 'ascii' && !options.quiet && (options.showOperationsList || options.showSequencesList)) {
    renderAvailabilityAscii(fmt, availability, options.showOperationsList, options.showSequencesList);
  }

  try {
    if (options.mode === 'operation') {
      const result = await runOperation(facade, options);
      if (options.summaryFormat === 'json' || options.quiet) {
        const payload = {
          mode: 'operation',
          operation: options.operationName,
          startUrl: options.startUrl,
          overrides: options.overrides,
          result,
          availability: buildAvailabilityPayload(availability, options)
        };
        emitJson(payload, options);
      } else {
        renderOperationAscii(fmt, result, options);
      }
      if (result.status !== 'ok') {
        process.exitCode = 1;
      }
    } else if (options.mode === 'sequence') {
      const result = await runSequence(facade, options, fmt);
      if (options.summaryFormat === 'json' || options.quiet) {
        const payload = {
          mode: 'sequence',
          preset: options.sequenceName,
          startUrl: options.startUrl,
          continueOnError: options.continueOnError,
          sharedOverrides: options.sharedOverrides,
          stepOverrides: options.stepOverrides,
          result,
          availability: buildAvailabilityPayload(availability, options)
        };
        emitJson(payload, options);
      } else {
        renderSequenceAscii(fmt, result, options);
      }
      if (result.status !== 'ok') {
        process.exitCode = 1;
      }
    } else if (options.mode === 'sequence-config') {
      const loader = createSequenceConfigLoader({
        configDir: options.configDir || undefined
      });
      const onStepComplete = (options.summaryFormat === 'ascii' && !options.quiet)
        ? (stepResult, index) => {
            fmt.info(`Step ${index + 1}: ${stepResult.operation} → ${stepResult.status}`);
          }
        : undefined;
      const {
        result,
        loadResult,
        metadata,
        cliOverrides,
        sequenceStartUrl
      } = await runSequenceConfig({
        facade,
        loader,
        sequenceConfigName: options.sequenceConfigName,
        configHost: options.configHost,
        startUrl: options.startUrl,
        sharedOverrides: options.sharedOverrides,
        stepOverrides: options.stepOverrides,
        continueOnError: options.continueOnError,
        configCliOverrides: options.configCliOverrides,
        onStepComplete
      });

      if (options.summaryFormat === 'json' || options.quiet) {
        const payload = {
          mode: 'sequence-config',
          sequenceConfig: {
            name: options.sequenceConfigName,
            host: options.configHost || null,
            directory: options.configDir || null
          },
          startUrl: sequenceStartUrl,
          continueOnError: options.continueOnError,
          sharedOverrides: options.sharedOverrides,
          stepOverrides: options.stepOverrides,
          configCliOverrides: cliOverrides,
          loader: {
            startUrl: loadResult.startUrl,
            sharedOverrides: loadResult.sharedOverrides,
            steps: loadResult.steps,
            metadata: loadResult.metadata || metadata
          },
          result,
          availability: buildAvailabilityPayload(availability, options)
        };
        emitJson(payload, options);
      } else {
        const asciiOptions = {
          ...options,
          startUrl: sequenceStartUrl,
          configCliOverrides: cliOverrides
        };
        renderSequenceAscii(fmt, result, asciiOptions);
      }
      if (result.status !== 'ok') {
        process.exitCode = 1;
      }
    } else {
      throw new Error(`Unsupported mode: ${options.mode}`);
    }
  } catch (error) {
    const message = error?.message || String(error);
    const isConfigError = error instanceof SequenceConfigError;

    if (options.summaryFormat === 'json' || options.quiet) {
      emitJson({
        mode: options.mode,
        error: {
          message,
          ...(isConfigError ? { code: error.code, details: error.details } : {})
        }
      }, options);
    } else {
      if (isConfigError && error.code) {
        fmt.error(`${error.code}: ${message}`);
      } else {
        fmt.error(message);
      }
      if (isConfigError && error.details && Object.keys(error.details).length) {
        fmt.warn(`Details: ${JSON.stringify(error.details)}`);
      }
      if (process.env.DEBUG) {
        console.error(error?.stack || error);
      }
    }
    process.exitCode = 1;
  }
}


if (require.main === module) {
  main();
}

module.exports = {
  parseCliArgs,
  normalizeOptions,
  formatDuration,
  buildOperationSummaries,
  buildSequenceSummaries
};
