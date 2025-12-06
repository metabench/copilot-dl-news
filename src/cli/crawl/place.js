const { printPlaceHelp, printGuessPlaceSummary, printExploreSummary } = require('./reporting');

// Import shared utilities (DRY)
const { mergeOverrideObjects, parseCommaSeparated, ensureAbsoluteUrl } = require('./shared');

async function runPlaceCommand(service, context, sharedOverrides, logger) {
  const subcommand = context.getPositional(0);
  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    printPlaceHelp(logger);
    return;
  }
  if (subcommand === 'guess') {
    await runPlaceGuess(service, context, sharedOverrides, logger);
    return;
  }
  if (subcommand === 'explore') {
    await runPlaceExplore(service, context, sharedOverrides, logger);
    return;
  }

  throw new Error(`Unknown place subcommand: ${subcommand}`);
}

async function runPlaceGuess(service, context, sharedOverrides, logger) {
  const target = context.getPositional(1);
  if (!target || target.startsWith('--')) {
    throw new Error('place guess requires <domain|url>.');
  }

  const schemeFlag = context.getFlag('--scheme');
  const startUrl = ensureAbsoluteUrl(target, schemeFlag || 'https');
  if (!startUrl) {
    throw new Error('Unable to determine start URL for place guess command.');
  }

  const overrides = mergeOverrideObjects(sharedOverrides);
  if (schemeFlag) {
    overrides.scheme = schemeFlag;
  }

  const kindsFlag = context.getFlag('--kinds');
  if (kindsFlag) {
    overrides.kinds = parseCommaSeparated(kindsFlag);
  }

  const limitValue = context.getIntegerFlag('--limit');
  if (limitValue !== undefined) {
    overrides.limit = limitValue;
  }

  const patternsValue = context.getIntegerFlag('--patterns-per-place');
  if (patternsValue !== undefined) {
    overrides.patternsPerPlace = patternsValue;
  }

  const topicsFlag = context.getFlag('--topics');
  if (topicsFlag) {
    overrides.topics = parseCommaSeparated(topicsFlag);
  }

  const domainOverride = context.getFlag('--domain');
  if (domainOverride) {
    overrides.domain = domainOverride;
  }

  if (context.hasFlag('--apply')) {
    overrides.apply = true;
  }

  if (context.hasFlag('--enable-topic-discovery')) {
    overrides.enableTopicDiscovery = true;
  }

  if (context.hasFlag('--enable-combination-discovery')) {
    overrides.enableCombinationDiscovery = true;
  }

  if (context.hasFlag('--enable-hierarchical-discovery')) {
    overrides.enableHierarchicalDiscovery = true;
  }

  const maxAge = context.getIntegerFlag('--max-age-days');
  if (maxAge !== undefined) {
    overrides.maxAgeDays = maxAge;
  }

  const refresh404 = context.getIntegerFlag('--refresh-404-days');
  if (refresh404 !== undefined) {
    overrides.refresh404Days = refresh404;
  }

  const retry4xx = context.getIntegerFlag('--retry-4xx-days');
  if (retry4xx !== undefined) {
    overrides.retry4xxDays = retry4xx;
  }

  const dataDir = context.getFlag('--data-dir');
  if (dataDir) {
    overrides.dataDir = dataDir;
  }

  const dbPath = context.getFlag('--db-path');
  if (dbPath) {
    overrides.dbPath = dbPath;
  }

  const runId = context.getFlag('--run-id');
  if (runId) {
    overrides.runId = runId;
  }

  if (context.hasFlag('--verbose')) {
    overrides.verbose = true;
  }

  const jsonOutput = context.hasFlag('--json');

  const response = await service.runOperation({
    logger: logger || console,
    operationName: 'guessPlaceHubs',
    startUrl,
    overrides
  });

  if (jsonOutput) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    printGuessPlaceSummary(response, logger);
  }
}

async function runPlaceExplore(service, context, sharedOverrides, logger) {
  const target = context.getPositional(1);
  if (!target || target.startsWith('--')) {
    throw new Error('place explore requires <domain|url>.');
  }

  const schemeFlag = context.getFlag('--scheme');
  const startUrl = ensureAbsoluteUrl(target, schemeFlag || 'https');
  if (!startUrl) {
    throw new Error('Unable to determine start URL for place explore command.');
  }

  const overrides = mergeOverrideObjects(sharedOverrides, context.getJsonFlag('--overrides'));

  if (schemeFlag) {
    overrides.scheme = schemeFlag;
  }

  const concurrency = context.getIntegerFlag('--concurrency');
  if (concurrency !== undefined) {
    overrides.concurrency = concurrency;
  }

  const maxDownloads = context.getIntegerFlag('--max-downloads') ?? context.getIntegerFlag('--limit');
  if (maxDownloads !== undefined) {
    overrides.maxDownloads = maxDownloads;
  }

  const plannerVerbosity = context.getIntegerFlag('--planner-verbosity');
  if (plannerVerbosity !== undefined) {
    overrides.plannerVerbosity = plannerVerbosity;
  }

  const outputVerbosity = context.getFlag('--output-verbosity');
  if (outputVerbosity) {
    overrides.outputVerbosity = outputVerbosity;
  }

  if (context.hasFlag('--structure-only')) {
    overrides.structureOnly = true;
  }

  if (context.hasFlag('--no-structure-only')) {
    overrides.structureOnly = false;
  }

  const intTargets = context.getFlag('--int-target-hosts');
  if (intTargets) {
    overrides.intTargetHosts = parseCommaSeparated(intTargets);
  }

  const jsonOutput = context.hasFlag('--json');

  const response = await service.runOperation({
    logger: logger || console,
    operationName: 'findPlaceAndTopicHubs',
    startUrl,
    overrides
  });

  if (jsonOutput) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    printExploreSummary(response, logger);
  }
}

module.exports = {
  runPlaceCommand,
  runPlaceGuess,
  runPlaceExplore
};
