'use strict';

const { cloneOptions } = require('./CrawlOperation');

const freeze = (value) => Object.freeze(value);

const BASE_PRESETS = {
  ensureCountryStructure: freeze({
    name: 'ensureCountryStructure',
    label: 'Ensure Country Structure',
    description: 'Ensure base structure coverage for country hubs.',
    steps: freeze(['ensureCountryHubs']),
    continueOnError: false
  }),
  ensureAndExploreCountryHubs: freeze({
    name: 'ensureAndExploreCountryHubs',
    label: 'Ensure + Explore Country Hubs',
    description: 'Ensure baseline structure coverage then explore hub content for the same domain.',
    steps: freeze([
      'ensureCountryHubs',
      { operation: 'exploreCountryHubs', label: 'Explore Country Hubs' }
    ]),
    continueOnError: false
  }),
  basicArticleDiscovery: freeze({
    name: 'basicArticleDiscovery',
    label: 'Basic Article Discovery',
    description: 'Crawl articles using the basic crawler without hub discovery steps.',
    steps: freeze([
      { operation: 'basicArticleCrawl', label: 'Basic Article Crawl' }
    ]),
    continueOnError: false
  }),
  intelligentCountryHubDiscovery: freeze({
    name: 'intelligentCountryHubDiscovery',
    label: 'Intelligent Country Hub Discovery',
    description: 'Explore country hubs first, ensure structure, then expand into topic and place hubs.',
    sharedOverrides: freeze({ plannerVerbosity: 1 }),
    steps: freeze([
      { operation: 'exploreCountryHubs', label: 'Explore Country Hubs', overrides: { plannerVerbosity: 1 } },
      { operation: 'ensureCountryHubs', label: 'Ensure Country Hubs' },
      { operation: 'findTopicHubs', label: 'Discover Topic Hubs' },
      { operation: 'findPlaceAndTopicHubs', label: 'Discover Place & Topic Hubs' }
    ]),
    continueOnError: false
  }),
  fullCountryHubDiscovery: freeze({
    name: 'fullCountryHubDiscovery',
    label: 'Full Country Hub Discovery',
    description: 'Ensure, explore, then expand into topic/place hubs for comprehensive coverage.',
    sharedOverrides: freeze({ plannerVerbosity: 2 }),
    steps: freeze([
      { operation: 'ensureCountryHubs', label: 'Ensure Country Hubs' },
      { operation: 'exploreCountryHubs', label: 'Explore Country Hubs', overrides: { plannerVerbosity: 2 } },
      { operation: 'findTopicHubs', label: 'Discover Topic Hubs' },
      { operation: 'findPlaceAndTopicHubs', label: 'Discover Place & Topic Hubs' }
    ]),
    continueOnError: false
  }),
  countryHubHistoryRefresh: freeze({
    name: 'countryHubHistoryRefresh',
    label: 'Country Hub History Refresh',
    description: 'Refresh historical content for multiple hubs sequentially.',
    steps: freeze([
      { operation: 'crawlCountryHubsHistory', label: 'Refresh Hub History' }
    ]),
    continueOnError: false
  }),
  resilientCountryExploration: freeze({
    name: 'resilientCountryExploration',
    label: 'Resilient Country Exploration',
    description: 'Attempt ensure/explore/topic discovery but continue despite individual failures.',
    steps: freeze([
      { operation: 'ensureCountryHubs', label: 'Ensure Country Hubs' },
      { operation: 'exploreCountryHubs', label: 'Explore Country Hubs' },
      { operation: 'findTopicHubs', label: 'Discover Topic Hubs' }
    ]),
    continueOnError: true
  })
};

const PRESET_NAMES = Object.keys(BASE_PRESETS);

const listSequencePresets = () => PRESET_NAMES.map((name) => {
  const preset = BASE_PRESETS[name];
  return {
    name: preset.name,
    label: preset.label,
    description: preset.description,
    continueOnError: preset.continueOnError,
    stepCount: preset.steps.length
  };
});

const getSequencePreset = (name) => {
  const preset = BASE_PRESETS[name];
  if (!preset) {
    return null;
  }
  return {
    ...preset,
    sharedOverrides: cloneOptions(preset.sharedOverrides || {}),
    steps: preset.steps.map((step) => (
      typeof step === 'string' ? step : {
        ...step,
        overrides: cloneOptions(step.overrides || {})
      }
    ))
  };
};

const resolveSequencePreset = (name, {
  startUrl,
  sharedOverrides = {},
  continueOnError,
  stepOverrides = {}
} = {}) => {
  const preset = getSequencePreset(name);
  if (!preset) {
    throw new Error(`Unknown sequence preset: ${name}`);
  }

  const mergedSharedOverrides = {
    ...cloneOptions(preset.sharedOverrides || {}),
    ...cloneOptions(sharedOverrides || {})
  };

  const normalizedSteps = preset.steps.map((step) => {
    if (typeof step === 'string') {
      const overridesForStep = cloneOptions(stepOverrides[step] || {});
      if (Object.keys(overridesForStep).length === 0) {
        return step;
      }
      return {
        operation: step,
        label: step,
        overrides: overridesForStep
      };
    }

    const operationName = step.operation || step.name;
    const mergedOverrides = {
      ...cloneOptions(step.overrides || {}),
      ...cloneOptions(stepOverrides[operationName] || {})
    };

    const normalized = {
      ...step,
      operation: operationName
    };

    if (Object.keys(mergedOverrides).length > 0) {
      normalized.overrides = mergedOverrides;
    } else {
      delete normalized.overrides;
    }

    return normalized;
  });

  return {
    preset,
    sequence: normalizedSteps,
    sharedOverrides: mergedSharedOverrides,
    continueOnError: typeof continueOnError === 'boolean'
      ? continueOnError
      : Boolean(preset.continueOnError),
    startUrl: startUrl || preset.startUrl || undefined
  };
};

module.exports = {
  listSequencePresets,
  getSequencePreset,
  resolveSequencePreset
};
