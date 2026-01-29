'use strict';

/**
 * Schema for guessPlaceHubs operation.
 * Guesses place hub candidates based on URL patterns and gazetteer data.
 * This operation doesn't use the standard crawler - it's a specialized
 * hub discovery process.
 */
module.exports = {
  operation: 'guessPlaceHubs',
  label: 'Guess Place Hubs',
  description: 'Generate place hub URL candidates based on URL patterns and gazetteer data. Optionally probes URLs to verify existence.',
  category: 'hub-discovery',
  icon: '🎯',
  options: {
    // Place selection
    kinds: {
      type: 'array',
      itemType: 'enum',
      label: 'Place Kinds',
      description: 'Types of places to generate hub candidates for',
      default: ['country'],
      options: [
        { value: 'country', label: 'Countries' },
        { value: 'region', label: 'Regions/States' },
        { value: 'city', label: 'Cities' },
        { value: 'continent', label: 'Continents' }
      ],
      category: 'targeting'
    },
    patternsPerPlace: {
      type: 'number',
      label: 'Patterns per Place',
      description: 'Maximum URL patterns to generate per place',
      default: 3,
      min: 1,
      max: 20,
      step: 1,
      category: 'targeting'
    },

    // Verification behavior
    apply: {
      type: 'boolean',
      label: 'Apply Results',
      description: 'Persist guessed hub candidates to the database',
      default: false,
      category: 'storage'
    },
    maxAgeDays: {
      type: 'number',
      label: 'Max Age (days)',
      description: 'Skip places with hubs verified within this many days',
      default: 7,
      min: 0,
      max: 365,
      step: 1,
      category: 'freshness'
    },
    refresh404Days: {
      type: 'number',
      label: 'Refresh 404s (days)',
      description: 'Re-probe previously 404 URLs after this many days',
      default: 180,
      min: 1,
      max: 365,
      step: 1,
      category: 'freshness'
    },
    retry4xxDays: {
      type: 'number',
      label: 'Retry 4xx (days)',
      description: 'Re-probe other 4xx errors after this many days',
      default: 7,
      min: 1,
      max: 90,
      step: 1,
      category: 'freshness'
    },

    // Discovery modes
    enableTopicDiscovery: {
      type: 'boolean',
      label: 'Enable Topic Discovery',
      description: 'Also discover topic-based hubs (e.g., /politics, /sports)',
      default: false,
      category: 'discovery'
    },
    enableCombinationDiscovery: {
      type: 'boolean',
      label: 'Enable Combination Discovery',
      description: 'Discover place+topic combinations (e.g., /world/africa/business)',
      default: false,
      category: 'discovery'
    },
    enableHierarchicalDiscovery: {
      type: 'boolean',
      label: 'Enable Hierarchical Discovery',
      description: 'Discover nested place hierarchies (e.g., /world/africa/nigeria)',
      default: false,
      category: 'discovery'
    },

    // Network
    scheme: {
      type: 'enum',
      label: 'URL Scheme',
      description: 'Protocol to use for URL probing',
      default: 'https',
      options: [
        { value: 'https', label: 'HTTPS' },
        { value: 'http', label: 'HTTP' }
      ],
      category: 'network',
      advanced: true
    },

    // Logging
    verbose: {
      type: 'boolean',
      label: 'Verbose Logging',
      description: 'Enable detailed logging output',
      default: false,
      category: 'logging'
    }
  }
};
