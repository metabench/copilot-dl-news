'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs/promises');

const { createSequenceConfigLoader, SequenceConfigError } = require('../SequenceConfigLoader');

const writeJson = (dir, fileName, data) => fs.writeFile(
  path.join(dir, fileName),
  `${JSON.stringify(data, null, 2)}\n`,
  'utf8'
);

const writeText = (dir, fileName, contents) => fs.writeFile(
  path.join(dir, fileName),
  contents.endsWith('\n') ? contents : `${contents}\n`,
  'utf8'
);

const createTempDir = async () => {
  const prefix = path.join(os.tmpdir(), 'sequence-config-loader-');
  return fs.mkdtemp(prefix);
};

describe('SequenceConfigLoader', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it('loads JSON configuration, resolves tokens, and normalizes steps', async () => {
    await writeJson(tempDir, 'news.json', {
      version: '1.0.0',
      startUrl: 'https://example.com/start',
      sharedOverrides: {
        maxDepth: 2
      },
      steps: [
        'ExploreCountryHubsOperation',
        {
          id: 'ensure-hubs',
          operation: 'EnsureCountryHubsOperation',
          startUrl: '@playbook.seedUrl',
          overrides: {
            limit: '@config.limit'
          },
          continueOnError: true
        }
      ]
    });

    const loader = createSequenceConfigLoader({ configDir: tempDir });
    const result = await loader.load({
      sequenceName: 'news',
      resolvers: {
        playbook: (key) => {
          if (key === 'seedUrl') {
            return 'https://playbook.example.com/hub';
          }
          return undefined;
        },
        config: (key) => {
          if (key === 'limit') {
            return 25;
          }
          return undefined;
        }
      }
    });

    expect(result.startUrl).toBe('https://example.com/start');
    expect(result.sharedOverrides).toEqual({ maxDepth: 2 });
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0]).toEqual({
      id: 'ExploreCountryHubsOperation#0',
      operation: 'ExploreCountryHubsOperation',
      label: 'ExploreCountryHubsOperation',
      overrides: {}
    });
    expect(result.steps[1]).toEqual({
      id: 'ensure-hubs',
      operation: 'EnsureCountryHubsOperation',
      label: 'EnsureCountryHubsOperation',
      overrides: { limit: 25 },
      continueOnError: true,
      startUrl: 'https://playbook.example.com/hub'
    });
    expect(result.metadata.source.format).toBe('json');
    expect(result.metadata.sequenceName).toBe('news');
    expect(result.metadata.resolvedTokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ token: '@playbook.seedUrl', namespace: 'playbook' }),
        expect.objectContaining({ token: '@config.limit', namespace: 'config' })
      ])
    );
  });

  it('prefers host-specific configuration and resolves YAML entries', async () => {
    await writeJson(tempDir, 'crawler.json', {
      startUrl: 'https://default.example.com',
      steps: ['ExploreCountryHubsOperation']
    });

    await writeText(tempDir, 'crawler.news-example-com.yaml', [
      'version: "1"',
      'host: news-example-com',
      'startUrl: "@playbook.primary"',
      'sharedOverrides:',
      '  retries: 1',
      'steps:',
      '  - operation: EnsureCountryHubsOperation',
      '    startUrl: "@config.seed"'
    ].join('\n'));

    const loader = createSequenceConfigLoader({ configDir: tempDir });
    const result = await loader.load({
      sequenceName: 'crawler',
      host: 'news.example.com',
      resolvers: {
        playbook: (key) => (key === 'primary' ? 'https://primary.example.com' : undefined),
        config: (key) => (key === 'seed' ? 'https://seed.example.com' : undefined)
      }
    });

    expect(result.startUrl).toBe('https://primary.example.com');
    expect(result.sharedOverrides).toEqual({ retries: 1 });
    expect(result.steps).toEqual([
      {
        id: 'EnsureCountryHubsOperation#0',
        operation: 'EnsureCountryHubsOperation',
        label: 'EnsureCountryHubsOperation',
        continueOnError: false,
        overrides: {},
        startUrl: 'https://seed.example.com'
      }
    ]);
    expect(result.metadata.source.hostSpecific).toBe(true);
    expect(result.metadata.host).toBe('news-example-com');
    expect(result.metadata.startUrl.source).toBe('resolver');
  });

  it('honours CLI overrides for startUrl and reports metadata source', async () => {
    await writeJson(tempDir, 'batch.json', {
      startUrl: '@playbook.default',
      steps: ['FindTopicHubsOperation']
    });

    const loader = createSequenceConfigLoader({ configDir: tempDir });
    const result = await loader.load({
      sequenceName: 'batch',
      cliOverrides: { startUrl: 'https://cli.example.com' },
      resolvers: {
        playbook: () => 'https://playbook.example.com/unused'
      }
    });

    expect(result.startUrl).toBe('https://cli.example.com');
    expect(result.metadata.startUrl).toEqual({ value: 'https://cli.example.com', source: 'cli' });
    expect(result.metadata.resolvedTokens).toEqual([]);
  });

  it('throws a validation error for malformed configurations', async () => {
    await writeJson(tempDir, 'invalid.json', {
      startUrl: 'https://example.com',
      steps: []
    });

    const loader = createSequenceConfigLoader({ configDir: tempDir });

    await expect(loader.load({ sequenceName: 'invalid' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR'
    });
  });

  it('reports dry-run failures without throwing', async () => {
    const loader = createSequenceConfigLoader({ configDir: tempDir });
    const dryRun = await loader.loadDryRun({ sequenceName: 'missing' });

    expect(dryRun.ok).toBe(false);
    expect(dryRun.error).toBeInstanceOf(SequenceConfigError);
    expect(dryRun.error.code).toBe('CONFIG_NOT_FOUND');
  });

  it('fails when resolver namespaces are missing', async () => {
    await writeJson(tempDir, 'needs-resolver.json', {
      startUrl: '@config.required',
      steps: ['ExploreCountryHubsOperation']
    });

    const loader = createSequenceConfigLoader({ configDir: tempDir });

    await expect(loader.load({ sequenceName: 'needs-resolver' })).rejects.toMatchObject({
      code: 'TOKEN_NAMESPACE'
    });
  });
});
