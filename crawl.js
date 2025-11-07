#!/usr/bin/env node
'use strict';

const {
  createCrawlService,
  buildAvailabilityPayload
} = require('./src/server/crawl-api');

function printHelp() {
  console.log(`crawl.js — minimal crawl playground\n\n` +
`Usage:\n` +
`  node crawl.js availability [--all|--operations|--sequences]\n` +
`  node crawl.js run-operation <operationName> <startUrl> [--overrides <json>]\n` +
`  node crawl.js run-sequence <sequenceName> <startUrl> [--shared-overrides <json>] [--step-overrides <json>] [--continue-on-error]\n` +
`  node crawl.js run-sequence-config <configName> [--config-dir <path>] [--config-host <host>] [--start-url <url>] [--shared-overrides <json>] [--step-overrides <json>] [--config-cli-overrides <json>] [--continue-on-error]\n\n` +
`Flags accept compact JSON objects (for example: --overrides "{\"plannerVerbosity\":2}").\n`);
}

function readFlag(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  const value = args[index + 1];
  if (value === undefined) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function readJsonFlag(args, flag) {
  const value = readFlag(args, flag);
  if (value === undefined) {
    return undefined;
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Invalid JSON for ${flag}: ${error.message}`);
  }
}

function hasFlag(args, flag) {
  return args.includes(flag);
}

function printAvailabilitySummary(availability, includeOperations, includeSequences) {
  console.log('Crawl Availability');
  if (includeOperations && Array.isArray(availability.operations)) {
    console.log('\nOperations:');
    availability.operations.forEach((op) => {
      console.log(`  • ${op.name}${op.summary ? ` — ${op.summary}` : ''}`);
    });
  }
  if (includeSequences && Array.isArray(availability.sequences)) {
    console.log('\nSequence Presets:');
    availability.sequences.forEach((seq) => {
      const description = seq.description ? ` — ${seq.description}` : '';
      const steps = Array.isArray(seq.steps) && seq.steps.length
        ? ` (${seq.steps.map((step) => step.operation).join(' → ')})`
        : '';
      console.log(`  • ${seq.name}${description}${steps}`);
    });
  }
}

async function runOperation(service, args) {
  const operationName = args[1];
  const startUrl = args[2];
  if (!operationName || !startUrl) {
    throw new Error('run-operation requires <operationName> and <startUrl>.');
  }
  const overrides = readJsonFlag(args, '--overrides') || {};
  const result = await service.runOperation({
    logger: console,
    operationName,
    startUrl,
    overrides
  });
  console.log(`Operation ${operationName} finished with status: ${result?.status || 'unknown'}`);
  if (result?.elapsedMs != null) {
    console.log(`Elapsed: ${result.elapsedMs} ms`);
  }
  if (result?.error) {
    console.error('Error:', result.error);
  }
}

async function runSequencePreset(service, args) {
  const sequenceName = args[1];
  const startUrl = args[2];
  if (!sequenceName || !startUrl) {
    throw new Error('run-sequence requires <sequenceName> and <startUrl>.');
  }
  const sharedOverrides = readJsonFlag(args, '--shared-overrides') || {};
  const stepOverrides = readJsonFlag(args, '--step-overrides') || {};
  const continueOnError = hasFlag(args, '--continue-on-error');
  const result = await service.runSequencePreset({
    logger: console,
    sequenceName,
    startUrl,
    sharedOverrides,
    stepOverrides,
    continueOnError
  });
  console.log(`Sequence ${sequenceName} finished with status: ${result?.status || 'unknown'}`);
  if (Array.isArray(result?.steps)) {
    result.steps.forEach((step) => {
      console.log(`  - ${step.name || step.operation || 'step'}: ${step.status || 'unknown'}`);
    });
  }
}

async function runSequenceConfig(service, args) {
  const sequenceConfigName = args[1];
  if (!sequenceConfigName) {
    throw new Error('run-sequence-config requires <configName>.');
  }
  const configDir = readFlag(args, '--config-dir');
  const configHost = readFlag(args, '--config-host');
  const startUrl = readFlag(args, '--start-url');
  const sharedOverrides = readJsonFlag(args, '--shared-overrides') || {};
  const stepOverrides = readJsonFlag(args, '--step-overrides') || {};
  const configCliOverrides = readJsonFlag(args, '--config-cli-overrides') || {};
  const continueOnError = hasFlag(args, '--continue-on-error');

  const result = await service.runSequenceConfig({
    logger: console,
    sequenceConfigName,
    configDir,
    configHost,
    startUrl,
    sharedOverrides,
    stepOverrides,
    continueOnError,
    configCliOverrides
  });

  const status = result?.result?.status || result?.status || 'unknown';
  console.log(`Sequence config ${sequenceConfigName} finished with status: ${status}`);
  if (result?.metadata?.source?.path) {
    console.log(`Config file: ${result.metadata.source.path}`);
  }
}

async function main(argv) {
  const args = argv.slice();
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  const service = createCrawlService();

  if (command === 'availability') {
    const includeAll = hasFlag(args, '--all');
    const includeOperations = includeAll || hasFlag(args, '--operations') || (!hasFlag(args, '--operations') && !hasFlag(args, '--sequences'));
    const includeSequences = includeAll || hasFlag(args, '--sequences') || (!hasFlag(args, '--operations') && !hasFlag(args, '--sequences'));
    const availability = service.getAvailability({ logger: console });
    const payload =
      buildAvailabilityPayload(
        availability,
        {
          showOperationsList: includeOperations,
          showSequencesList: includeSequences
        },
        includeAll
      ) || {};

    printAvailabilitySummary(payload, includeOperations, includeSequences);
    return;
  }

  if (command === 'run-operation') {
    await runOperation(service, args);
    return;
  }

  if (command === 'run-sequence') {
    await runSequencePreset(service, args);
    return;
  }

  if (command === 'run-sequence-config') {
    await runSequenceConfig(service, args);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message || error);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  });
}
