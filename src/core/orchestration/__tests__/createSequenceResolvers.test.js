'use strict';

const path = require('path');

const mockDbClose = jest.fn();

jest.mock('../../db/sqlite/ensureDb', () => ({
  ensureDb: jest.fn(() => ({ close: mockDbClose }))
}));

const mockLoadPlaybook = jest.fn(async () => ({
  seedPatterns: [{ example: 'https://playbook.example.com/hub', hubType: 'section' }],
  avoidanceRules: [],
  retryCadence: { default: { maxAttempts: 3 } }
}));

const mockGenerateCandidateActions = jest.fn(async () => [
  { url: 'https://candidate.example.com/start', source: 'hub-tree' }
]);

const mockClosePlaybookService = jest.fn();

jest.mock('../../crawler/CrawlPlaybookService', () => ({
  CrawlPlaybookService: jest.fn(() => ({
    loadPlaybook: mockLoadPlaybook,
    generateCandidateActions: mockGenerateCandidateActions,
    close: mockClosePlaybookService
  }))
}));

const mockCloseConfigManager = jest.fn();
const mockGetConfig = jest.fn(() => ({
  features: { crawlPlaybooks: true },
  queue: { weights: { article: { value: 1 } } }
}));
const mockGetFeatureFlags = jest.fn(() => ({
  crawlPlaybooks: true,
  plannerKnowledgeReuse: false
}));

jest.mock('../../config/ConfigManager', () => ({
  ConfigManager: jest.fn(() => ({
    getConfig: mockGetConfig,
    getFeatureFlags: mockGetFeatureFlags,
    close: mockCloseConfigManager
  }))
}));

const { createSequenceResolverMap } = require('../createSequenceResolvers');

describe('createSequenceResolverMap', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('provides config and playbook resolvers with lazy initialization', async () => {
    const logger = { warn: jest.fn() };
    const { resolvers, cleanup } = createSequenceResolverMap({
      logger,
      configHost: 'news.example.com',
      configCliOverrides: { dbPath: 'tmp/news.db' }
    });

    expect(typeof resolvers.config).toBe('function');
    expect(typeof resolvers.playbook).toBe('function');

    const featureFlag = resolvers.config('featureFlags.crawlPlaybooks');
    expect(featureFlag).toBe(true);

    const primarySeed = await resolvers.playbook('primarySeed');
    expect(primarySeed).toBe('https://candidate.example.com/start');

    const context = await resolvers.playbook('');
    expect(context.host).toBe('news.example.com');
    expect(context.candidateSeeds).toHaveLength(1);

    const { ensureDb } = require('../../../data/db/sqlite/ensureDb');
    expect(ensureDb).toHaveBeenCalledWith(path.resolve('tmp/news.db'), expect.objectContaining({ readonly: true, fileMustExist: true }));
    expect(mockGenerateCandidateActions).toHaveBeenCalledWith('news.example.com', expect.objectContaining({ maxActions: 5 }));

    cleanup();

    const { ConfigManager } = require('../../../shared/config/ConfigManager');
    expect(ConfigManager).toHaveBeenCalledTimes(1);
    expect(mockCloseConfigManager).toHaveBeenCalledTimes(1);
    expect(mockClosePlaybookService).toHaveBeenCalledTimes(1);
    expect(mockDbClose).toHaveBeenCalledTimes(1);
  });

  it('throws when playbook host is missing', async () => {
    const { resolvers, cleanup } = createSequenceResolverMap();
    await expect(resolvers.playbook('primarySeed')).rejects.toThrow('Sequence host is required before resolving playbook tokens');
    cleanup();
  });
});
