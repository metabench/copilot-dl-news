const path = require('path');
const { existsSync } = require('fs');

const DEFAULT_START_URL = 'https://www.theguardian.com';
const PLACEHOLDER_START_URL = 'https://placeholder.local';
const DEFAULT_MAX_AGE_HUB_MS = 10 * 60 * 1000;
const GAZETTEER_TYPES = new Set(['geography', 'gazetteer', 'wikidata']);
const SPLIT_VALUE_FLAGS = new Set([
  '--db',
  '--country',
  '--gazetteer-stages',
  '--gazetteer-stage',
  '--geography-stages',
  '--geography-stage',
  '--sequence-config',
  '--config-dir',
  '--config-host',
  '--config-cli',
  '--shared-overrides',
  '--step-overrides',
  '--cached-seed'
]);

function resolveExplicitDbPath(args) {
  const eqValue = findArgValue(args, ['--db=']);
  if (eqValue) {
    const trimmed = eqValue.trim();
    if (trimmed) {
      return path.resolve(trimmed);
    }
  }
  for (let i = 0; i < args.length - 1; i += 1) {
    if (args[i] === '--db') {
      const next = args[i + 1];
      if (typeof next === 'string' && !next.startsWith('--') && next.trim()) {
        return path.resolve(next.trim());
      }
    }
  }
  return null;
}

function allocateNewDbPath(baseDir) {
  const resolvedBase = path.resolve(baseDir);
  let index = 1;
  while (index < 10000) {
    const candidate = path.join(resolvedBase, `news_${index}.db`);
    if (!existsSync(candidate)) {
      return candidate;
    }
    index += 1;
  }
  throw new Error('Unable to allocate new database filename in data directory');
}

function parseInteger(value) {
  if (value == null) {
    return undefined;
  }
  const parsed = parseInt(String(value), 10);
  return Number.isNaN(parsed) ? NaN : parsed;
}

function parseCommaSeparatedList(value) {
  if (typeof value !== 'string') {
    return undefined;
  }
  const items = value.split(',').map(token => token.trim()).filter(Boolean);
  return items.length ? items : undefined;
}

function parseCountrySpecifier(rawValue) {
  if (!rawValue) {
    return null;
  }
  const trimmed = String(rawValue).trim();
  if (!trimmed) {
    return null;
  }
  if (/^Q\d+$/i.test(trimmed)) {
    return { qid: trimmed.toUpperCase(), raw: trimmed };
  }
  if (/^[a-z]{2}$/i.test(trimmed) || /^[a-z]{3}$/i.test(trimmed)) {
    return { code: trimmed.toUpperCase(), raw: trimmed };
  }
  return { name: trimmed, nameLower: trimmed.toLowerCase(), raw: trimmed };
}

function collectCountrySpecifiers(args) {
  const parsed = [];
  const eqArgs = args.filter(arg => typeof arg === 'string' && arg.startsWith('--country='));
  for (const eq of eqArgs) {
    const [, valuePart] = eq.split('=');
    if (!valuePart) {
      continue;
    }
    const tokens = valuePart.split(',');
    for (const token of tokens) {
      const spec = parseCountrySpecifier(token);
      if (spec) {
        parsed.push(spec);
      }
    }
  }

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--country') {
      const next = args[i + 1];
      if (typeof next === 'string' && !next.startsWith('--')) {
        const tokens = next.split(',');
        for (const token of tokens) {
          const spec = parseCountrySpecifier(token);
          if (spec) {
            parsed.push(spec);
          }
        }
      }
    }
  }

  if (!parsed.length) {
    return undefined;
  }

  const seen = new Set();
  const unique = [];
  for (const entry of parsed) {
    const key = entry.qid ? `qid:${entry.qid}`
      : entry.code ? `code:${entry.code}`
      : `name:${entry.nameLower}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(entry);
  }

  return unique.length ? unique : undefined;
}

function collectCachedSeeds(args) {
  if (!Array.isArray(args) || !args.length) {
    return undefined;
  }

  const seeds = [];
  const pushSeed = (raw) => {
    if (raw === undefined || raw === null) {
      return;
    }
    const tokens = String(raw)
      .split(',')
      .map((token) => token.trim())
      .filter(Boolean);
    for (const token of tokens) {
      seeds.push(token);
    }
  };

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (typeof token !== 'string') {
      continue;
    }
    if (token.startsWith('--cached-seed=')) {
      const [, valuePart] = token.split('=');
      pushSeed(valuePart);
      continue;
    }
    if (token === '--cached-seed') {
      const next = args[i + 1];
      if (typeof next === 'string' && !next.startsWith('--')) {
        pushSeed(next);
        i += 1;
      }
    }
  }

  if (!seeds.length) {
    return undefined;
  }

  const uniqueSeeds = Array.from(new Set(seeds));
  return uniqueSeeds.length ? uniqueSeeds : undefined;
}

function collectGazetteerStages(args) {
  const parsed = [];
  const eqPrefixes = ['--gazetteer-stages=', '--geography-stages='];
  for (const prefix of eqPrefixes) {
    for (const arg of args) {
      if (typeof arg === 'string' && arg.startsWith(prefix)) {
        const valuePart = arg.substring(prefix.length);
        if (!valuePart) {
          continue;
        }
        for (const token of valuePart.split(',')) {
          const trimmed = String(token || '').trim();
          if (trimmed) {
            parsed.push(trimmed.toLowerCase());
          }
        }
      }
    }
  }

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--gazetteer-stages' || args[i] === '--geography-stages') {
      const next = args[i + 1];
      if (typeof next === 'string' && !next.startsWith('--')) {
        for (const token of next.split(',')) {
          const trimmed = String(token || '').trim();
          if (trimmed) {
            parsed.push(trimmed.toLowerCase());
          }
        }
      }
    }
    if (args[i] === '--gazetteer-stage' || args[i] === '--geography-stage') {
      const next = args[i + 1];
      if (typeof next === 'string' && !next.startsWith('--')) {
        parsed.push(String(next).trim().toLowerCase());
      }
    }
  }

  if (!parsed.length) {
    return undefined;
  }

  const seen = new Set();
  const ordered = [];
  for (const stage of parsed) {
    const key = stage.toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    ordered.push(key);
  }
  return ordered.length ? ordered : undefined;
}

function parseMaxAgeToMs(value) {
  if (!value) {
    return undefined;
  }
  const s = String(value).trim();
  const match = s.match(/^([0-9]+)\s*([smhd]?)$/i);
  if (!match) {
    return undefined;
  }
  const n = parseInt(match[1], 10);
  const unit = (match[2] || 's').toLowerCase();
  const multiplier = unit === 's' ? 1000
    : unit === 'm' ? 60 * 1000
    : unit === 'h' ? 3600 * 1000
    : unit === 'd' ? 86400 * 1000
    : 1000;
  return n * multiplier;
}

function findArgValue(args, prefixes) {
  for (const prefix of prefixes) {
    const match = args.find(arg => typeof arg === 'string' && arg.startsWith(prefix));
    if (match) {
      return match.substring(prefix.length);
    }
  }
  return undefined;
}

function findOptionValue(args, name) {
  const eqValue = findArgValue(args, [`--${name}=`]);
  if (eqValue !== undefined) {
    return eqValue;
  }
  const flag = `--${name}`;
  for (let i = 0; i < args.length - 1; i += 1) {
    if (args[i] === flag) {
      const next = args[i + 1];
      if (typeof next === 'string' && !next.startsWith('--')) {
        return next;
      }
      break;
    }
  }
  return undefined;
}

function findFirstPositionalArg(args) {
  if (!Array.isArray(args)) {
    return { value: undefined, explicit: false };
  }
  let skipNext = false;
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (typeof token !== 'string') {
      continue;
    }
    if (token.startsWith('--')) {
      if (!token.includes('=') && SPLIT_VALUE_FLAGS.has(token)) {
        skipNext = true;
      }
      continue;
    }
    return { value: token, explicit: true };
  }
  return { value: undefined, explicit: false };
}

function parseJsonOption(rawValue, flagLabel) {
  if (rawValue === undefined || rawValue === null) {
    return undefined;
  }
  if (typeof rawValue === 'object' && !Array.isArray(rawValue)) {
    return rawValue;
  }
  const trimmed = String(rawValue).trim();
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
    throw new Error(`${flagLabel} must be a JSON object.`);
  } catch (error) {
    const message = error?.message || error;
    throw new Error(`Invalid JSON for ${flagLabel}: ${message}`);
  }
}


function normalizeLegacyArguments(argv = [], { log = console } = {}) {
  if (!Array.isArray(argv)) {
    throw new Error('normalizeLegacyArguments expects argv to be an array.');
  }

  const args = argv.map((token) => (typeof token === 'string' ? token : String(token)));

  const hasFlag = (flag) => args.includes(flag);

  function getRawOption(primary, alias) {
    const direct = findOptionValue(args, primary);
    if (direct !== undefined) {
      return direct;
    }
    if (alias) {
      const fallback = findOptionValue(args, alias);
      if (fallback !== undefined) {
        return fallback;
      }
    }
    return undefined;
  }

  function getOption(primary, alias) {
    const raw = getRawOption(primary, alias);
    if (raw === undefined) {
      return undefined;
    }
    const trimmed = String(raw).trim();
    return trimmed.length ? trimmed : undefined;
  }

  function getIntegerOption(primary, options = {}) {
    const {
      alias,
      min = null,
      label = `--${primary}`
    } = options;

    const raw = getOption(primary);
    const rawAlias = raw === undefined && alias ? getOption(alias) : undefined;
    const value = raw !== undefined ? raw : rawAlias;
    if (value === undefined) {
      return undefined;
    }

    const parsed = parseInteger(value);
    if (Number.isNaN(parsed)) {
      throw new Error(`Invalid integer for ${label}: ${value}`);
    }

    if (min !== null && parsed < min) {
      throw new Error(`${label} must be >= ${min}`);
    }

    return parsed;
  }

  function getDurationOption(primary, alias, label) {
    const raw = getOption(primary);
    const rawAlias = raw === undefined && alias ? getOption(alias) : undefined;
    const value = raw !== undefined ? raw : rawAlias;
    if (value === undefined) {
      return undefined;
    }

    const parsed = parseMaxAgeToMs(value);
    if (parsed === undefined) {
      throw new Error(`Invalid duration for ${label || `--${primary}`}: ${value}`);
    }
    return parsed;
  }

  function resolveToggleFlag(enableFlag, disableFlag, defaultValue) {
    let current = defaultValue;
    let explicit = false;
    for (const token of args) {
      if (disableFlag && token === disableFlag) {
        current = false;
        explicit = true;
      } else if (enableFlag && token === enableFlag) {
        current = true;
        explicit = true;
      }
    }
    return { value: current, explicit };
  }

  const positionalStart = findFirstPositionalArg(args);
  const startUrlOption = getOption('start-url');
  let startUrl = startUrlOption || positionalStart.value;
  let startUrlExplicit = Boolean(startUrlOption || (positionalStart.value && positionalStart.explicit));

  const rawCrawlType = getOption('crawl-type');
  let crawlType = rawCrawlType ? rawCrawlType.toLowerCase() : null;
  if (!crawlType) {
    crawlType = 'basic';
  } else if (crawlType === 'news') {
    crawlType = 'basic';
  } else if (crawlType === 'intelligent-news') {
    crawlType = 'intelligent';
  }

  if (!startUrl) {
    startUrl = GAZETTEER_TYPES.has(crawlType) ? PLACEHOLDER_START_URL : DEFAULT_START_URL;
    startUrlExplicit = false;
  }

  try {
    // Validate URL early so the CLI fails fast on malformed input.
    new URL(startUrl);
  } catch (error) {
    throw new Error(`Invalid start URL: ${startUrl}`);
  }

  const dataDirOption = getOption('data-dir');
  const dataDir = dataDirOption ? path.resolve(dataDirOption) : undefined;

  const explicitDbPath = resolveExplicitDbPath(args);
  const wantsNewDb = hasFlag('--newdb');
  const disableDb = hasFlag('--no-db');
  if (disableDb && (explicitDbPath || wantsNewDb)) {
    throw new Error('Cannot combine --no-db with --db or --newdb.');
  }

  let dbPath = null;
  if (!disableDb) {
    if (wantsNewDb) {
      const baseDir = dataDir
        || (explicitDbPath ? path.dirname(explicitDbPath) : path.join(process.cwd(), 'data'));
      dbPath = allocateNewDbPath(baseDir);
    } else if (explicitDbPath) {
      dbPath = explicitDbPath;
    }
  }

  const maxDepth = getIntegerOption('depth', { min: 0, allowZero: true, label: '--depth' });
  const maxDownloads = getIntegerOption('max-pages', {
    alias: 'max-downloads',
    min: 1,
    label: '--max-pages/--max-downloads'
  });
  const rateLimitMs = getIntegerOption('rate-limit-ms', {
    min: 0,
    allowZero: true,
    label: '--rate-limit-ms'
  });
  const concurrency = getIntegerOption('concurrency', { min: 1, label: '--concurrency' });
  const maxQueue = getIntegerOption('max-queue', { min: 1, label: '--max-queue' });
  const retryLimit = getIntegerOption('retry-limit', { min: 1, label: '--retry-limit' });
  const backoffBaseMs = getIntegerOption('backoff-base-ms', {
    min: 0,
    allowZero: true,
    label: '--backoff-base-ms'
  });
  const backoffMaxMs = getIntegerOption('backoff-max-ms', {
    min: 0,
    allowZero: true,
    label: '--backoff-max-ms'
  });
  const requestTimeoutMs = getIntegerOption('request-timeout-ms', { min: 1, label: '--request-timeout-ms' });
  const pacerJitterMinMs = getIntegerOption('pacer-jitter-min-ms', {
    min: 0,
    allowZero: true,
    label: '--pacer-jitter-min-ms'
  });
  const pacerJitterMaxMs = getIntegerOption('pacer-jitter-max-ms', {
    min: 0,
    allowZero: true,
    label: '--pacer-jitter-max-ms'
  });
  const hubMaxPages = getIntegerOption('hub-max-pages', { min: 1, label: '--hub-max-pages' });
  const hubMaxDays = getIntegerOption('hub-max-days', {
    min: 0,
    allowZero: true,
    label: '--hub-max-days'
  });
  const intMaxSeeds = getIntegerOption('int-max-seeds', {
    min: 0,
    allowZero: true,
    label: '--int-max-seeds'
  });
  const limitCountries = getIntegerOption('limit-countries', { min: 1, label: '--limit-countries' });
  const plannerVerbosity = getIntegerOption('planner-verbosity', {
    min: 0,
    allowZero: true,
    label: '--planner-verbosity'
  });
  const connectionResetWindowMs = getIntegerOption('connection-reset-window-ms', {
    min: 1,
    label: '--connection-reset-window-ms'
  });
  const connectionResetThreshold = getIntegerOption('connection-reset-threshold', {
    min: 1,
    label: '--connection-reset-threshold'
  });
  const sitemapMaxUrls = getIntegerOption('sitemap-max', {
    min: 0,
    allowZero: true,
    label: '--sitemap-max'
  });

  const maxAgeMs = getDurationOption('max-age', 'refetch-if-older-than', '--max-age/--refetch-if-older-than');
  const maxAgeArticleMs = getDurationOption(
    'max-age-article',
    'refetch-article-if-older-than',
    '--max-age-article/--refetch-article-if-older-than'
  );
  const maxAgeHubMs = getDurationOption(
    'max-age-hub',
    'refetch-hub-if-older-than',
    '--max-age-hub/--refetch-hub-if-older-than'
  );

  const intTargetHostsRaw = getOption('int-target-hosts');
  const intTargetHosts = intTargetHostsRaw
    ? (parseCommaSeparatedList(intTargetHostsRaw) || []).map((host) => host.toLowerCase())
    : undefined;

  const targetCountriesRaw = collectCountrySpecifiers(args);
  const targetCountries = Array.isArray(targetCountriesRaw)
    ? targetCountriesRaw.map((entry) => ({ ...entry }))
    : undefined;

  const gazetteerStages = collectGazetteerStages(args);

  const jobId = getOption('job-id');
  const priorityModeOption = getOption('priority-mode');
  const priorityMode = priorityModeOption ? priorityModeOption.toLowerCase() : undefined;

  const slowMode = hasFlag('--slow-mode');
  const structureOnly = hasFlag('--structure-only');
  const countryHubExclusiveMode = hasFlag('--country-hub-exclusive');
  const exhaustiveCountryHubMode = hasFlag('--exhaustive-country-hub');
  const usePriorityQueue = hasFlag('--use-priority-queue');
  const verboseMode = hasFlag('--verbose');
  const continueOnError = hasFlag('--continue-on-error');

  const fastStartToggle = resolveToggleFlag('--fast-start', '--no-fast-start', true);
  const preferCacheToggle = resolveToggleFlag('--prefer-cache', '--no-prefer-cache', true);
  const useSitemapToggle = resolveToggleFlag('--use-sitemap', '--no-sitemap', true);
  const skipQueryToggle = resolveToggleFlag('--skip-query-urls', '--allow-query-urls', true);
  const interactiveControlsToggle = resolveToggleFlag('--interactive-controls', '--no-interactive-controls', true);

  const sitemapOnly = hasFlag('--sitemap-only');
  const useSitemap = sitemapOnly ? true : useSitemapToggle.value;
  const useSitemapExplicit = sitemapOnly || useSitemapToggle.explicit;
  const skipQueryUrls = skipQueryToggle.value;
  const skipQueryExplicit = skipQueryToggle.explicit || hasFlag('--allow-query-urls');
  const seedFromCache = hasFlag('--seed-from-cache');
  const cachedSeedUrls = collectCachedSeeds(args);

  const sharedOverridesRaw = getRawOption('shared-overrides');
  const stepOverridesRaw = getRawOption('step-overrides');
  const configCliRaw = getRawOption('config-cli');

  let sharedOverrides;
  if (sharedOverridesRaw !== undefined) {
    sharedOverrides = { ...parseJsonOption(sharedOverridesRaw, '--shared-overrides') };
  }

  let stepOverrides;
  if (stepOverridesRaw !== undefined) {
    const parsedSteps = parseJsonOption(stepOverridesRaw, '--step-overrides');
    stepOverrides = {};
    for (const [key, value] of Object.entries(parsedSteps)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`Invalid step override for "${key}" — expected a JSON object.`);
      }
      stepOverrides[key] = { ...value };
    }
  }

  let configCliOverrides;
  if (configCliRaw !== undefined) {
    configCliOverrides = { ...parseJsonOption(configCliRaw, '--config-cli') };
  }

  const configDirOption = getOption('config-dir');
  const configDir = configDirOption ? path.resolve(configDirOption) : undefined;
  const configHost = getOption('config-host');
  const sequenceConfigName = getOption('sequence-config');

  if (!sequenceConfigName) {
    if ((sharedOverrides !== undefined || stepOverrides !== undefined || configCliOverrides !== undefined) && log && typeof log.warn === 'function') {
      log.warn('Sequence overrides were provided but --sequence-config is missing; overrides will be ignored.');
    }
  }

  const options = {};

  options.crawlType = crawlType;

  if (jobId) {
    options.jobId = jobId;
  }
  if (slowMode) {
    options.slowMode = true;
  }
  if (fastStartToggle.explicit || fastStartToggle.value === false) {
    options.fastStart = fastStartToggle.value;
  }
  if (preferCacheToggle.explicit) {
    options.preferCache = preferCacheToggle.value;
  }
  if (useSitemapExplicit) {
    options.useSitemap = useSitemap;
  }
  if (sitemapOnly) {
    options.sitemapOnly = true;
  }
  if (typeof sitemapMaxUrls === 'number') {
    options.sitemapMaxUrls = sitemapMaxUrls;
  }
  if (skipQueryExplicit) {
    options.skipQueryUrls = skipQueryUrls;
  }
  if (usePriorityQueue) {
    options.usePriorityQueue = true;
  }
  if (structureOnly) {
    options.structureOnly = true;
  }
  if (countryHubExclusiveMode) {
    options.countryHubExclusiveMode = true;
  }
  if (exhaustiveCountryHubMode) {
    options.exhaustiveCountryHubMode = true;
  }
  if (priorityMode) {
    options.priorityMode = priorityMode;
  }
  if (verboseMode) {
    options.verbose = true;
  }
  if (seedFromCache) {
    options.seedStartFromCache = true;
  }
  if (Array.isArray(cachedSeedUrls) && cachedSeedUrls.length) {
    options.cachedSeedUrls = cachedSeedUrls;
  }

  if (dataDir) {
    options.dataDir = dataDir;
  }

  if (disableDb) {
    options.enableDb = false;
    options.dbPath = null;
  } else if (dbPath) {
    options.dbPath = dbPath;
  }

  if (typeof maxDepth === 'number') {
    options.maxDepth = maxDepth;
  }
  if (typeof maxDownloads === 'number') {
    options.maxDownloads = maxDownloads;
  }
  if (typeof rateLimitMs === 'number') {
    options.rateLimitMs = rateLimitMs;
  }
  if (typeof concurrency === 'number') {
    options.concurrency = concurrency;
  }
  if (typeof maxQueue === 'number') {
    options.maxQueue = maxQueue;
  }
  if (typeof retryLimit === 'number') {
    options.retryLimit = retryLimit;
  }
  if (typeof backoffBaseMs === 'number') {
    options.backoffBaseMs = backoffBaseMs;
  }
  if (typeof backoffMaxMs === 'number') {
    options.backoffMaxMs = backoffMaxMs;
  }
  if (typeof maxAgeMs === 'number') {
    options.maxAgeMs = maxAgeMs;
  }
  if (typeof maxAgeArticleMs === 'number') {
    options.maxAgeArticleMs = maxAgeArticleMs;
  }
  const effectiveMaxAgeHubMs = typeof maxAgeHubMs === 'number' ? maxAgeHubMs : DEFAULT_MAX_AGE_HUB_MS;
  if (Number.isFinite(effectiveMaxAgeHubMs)) {
    options.maxAgeHubMs = effectiveMaxAgeHubMs;
  }
  if (typeof requestTimeoutMs === 'number') {
    options.requestTimeoutMs = requestTimeoutMs;
  }
  if (typeof pacerJitterMinMs === 'number') {
    options.pacerJitterMinMs = pacerJitterMinMs;
  }
  if (typeof pacerJitterMaxMs === 'number') {
    options.pacerJitterMaxMs = pacerJitterMaxMs;
  }
  if (typeof hubMaxPages === 'number') {
    options.hubMaxPages = hubMaxPages;
  }
  if (typeof hubMaxDays === 'number') {
    options.hubMaxDays = hubMaxDays;
  }
  if (typeof intMaxSeeds === 'number') {
    options.intMaxSeeds = intMaxSeeds;
  }
  if (Array.isArray(intTargetHosts) && intTargetHosts.length) {
    options.intTargetHosts = intTargetHosts;
  }
  if (typeof plannerVerbosity === 'number') {
    options.plannerVerbosity = plannerVerbosity;
  }
  if (typeof connectionResetWindowMs === 'number') {
    options.connectionResetWindowMs = connectionResetWindowMs;
  }
  if (typeof connectionResetThreshold === 'number') {
    options.connectionResetThreshold = connectionResetThreshold;
  }
  if (limitCountries !== undefined) {
    options.limitCountries = limitCountries;
  }
  if (Array.isArray(targetCountries) && targetCountries.length) {
    options.targetCountries = targetCountries;
  }
  if (Array.isArray(gazetteerStages) && gazetteerStages.length) {
    options.gazetteerStages = gazetteerStages;
  }

  let sequenceConfig = null;
  if (sequenceConfigName) {
    sequenceConfig = {
      name: sequenceConfigName,
      continueOnError: Boolean(continueOnError)
    };
    if (configDir) {
      sequenceConfig.configDir = configDir;
    }
    if (configHost) {
      sequenceConfig.configHost = configHost;
    }
    if (sharedOverrides !== undefined) {
      sequenceConfig.sharedOverrides = sharedOverrides;
    }
    if (stepOverrides !== undefined) {
      sequenceConfig.stepOverrides = stepOverrides;
    }
    if (configCliOverrides !== undefined) {
      sequenceConfig.configCliOverrides = configCliOverrides;
    }
  }

  return {
    startUrl,
    startUrlExplicit,
    options,
    targetCountries: Array.isArray(targetCountries) && targetCountries.length ? targetCountries : null,
    sequenceConfig,
    interactiveControls: {
      enabled: interactiveControlsToggle.value,
      explicit: interactiveControlsToggle.explicit
    }
  };
}


module.exports = {
  normalizeLegacyArguments
};
