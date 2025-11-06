'use strict';

const RESOLVER_NAMESPACE_CATALOG = [
  {
    namespace: 'cli',
    description: 'Values supplied via CLI overrides when invoking the sequence loader (automatically available).',
    providedBy: 'SequenceConfigLoader',
    examples: ['startUrl', 'sharedOverrides.*']
  },
  {
    namespace: 'playbook',
    description: 'Values exposed by CrawlPlaybookService to describe host-specific defaults (e.g., seeds, credentials).',
    providedBy: 'caller',
    examples: ['primarySeed', 'resumeToken', 'countryCode']
  },
  {
    namespace: 'config',
    description: 'Project configuration settings sourced from ConfigManager / priority-config.json.',
    providedBy: 'caller',
    examples: ['featureFlags', 'language', 'throttles']
  }
];

const getResolverNamespaceInfo = (namespace) => RESOLVER_NAMESPACE_CATALOG.find((entry) => entry.namespace === namespace) || null;

module.exports = {
  RESOLVER_NAMESPACE_CATALOG,
  getResolverNamespaceInfo
};
