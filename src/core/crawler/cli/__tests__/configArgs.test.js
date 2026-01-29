'use strict';

const path = require('path');
const {
  loadCliConfig,
  createArgvFromConfig,
  resolveCliArguments,
  DEFAULT_CONFIG_FILENAME
} = require('../configArgs');

describe('configArgs', () => {
  const sampleConfig = {
    startUrl: 'https://example.com ',
    depth: '3',
    concurrency: 4,
    maxPages: '100',
    additionalArgs: [' --foo ', '', '  --bar=baz']
  };

  const serializedSample = JSON.stringify(sampleConfig);
  const fakePath = path.join(process.cwd(), 'tmp-config.json');

  it('loads and normalizes CLI config', async () => {
    const fsModule = {
      readFile: jest.fn().mockResolvedValue(serializedSample)
    };

    const { config, configPath } = await loadCliConfig({ fsModule, configPath: fakePath });

    expect(configPath).toBe(path.resolve(fakePath));
    expect(config).toEqual({
      startUrl: 'https://example.com',
      depth: 3,
      concurrency: 4,
      maxPages: 100,
      additionalArgs: ['--foo', '--bar=baz']
    });
  });

  it('creates argv segments from config object', () => {
    const argv = createArgvFromConfig({
      startUrl: 'https://example.com',
      depth: 2,
      concurrency: 5,
      maxPages: 10,
      additionalArgs: ['--alpha', '--beta=1']
    });

    expect(argv).toEqual([
      'https://example.com',
      '--depth=2',
      '--concurrency=5',
      '--max-pages=10',
      '--alpha',
      '--beta=1'
    ]);
  });

  it('returns direct argv when provided', async () => {
    const fsModule = {
      readFile: jest.fn()
    };
    const directArgv = ['https://direct.example', '--depth=1'];

    const result = await resolveCliArguments({
      directArgv,
      fsModule,
      configPath: fakePath
    });

    expect(result).toEqual({
      argv: directArgv,
      origin: 'direct'
    });
    expect(fsModule.readFile).not.toHaveBeenCalled();
  });

  it('returns metadata when loading from config file', async () => {
    const fsModule = {
      readFile: jest.fn().mockResolvedValue(serializedSample)
    };

    const result = await resolveCliArguments({
      directArgv: [],
      fsModule,
      configPath: fakePath
    });

    expect(result.origin).toBe('config');
    expect(result.configPath).toBe(path.resolve(fakePath));
    expect(result.argv).toEqual([
      'https://example.com',
      '--depth=3',
      '--concurrency=4',
      '--max-pages=100',
      '--foo',
      '--bar=baz'
    ]);
  });

  it('throws ConfigLoadError when startUrl missing', async () => {
    const fsModule = {
      readFile: jest.fn().mockResolvedValue(JSON.stringify({}))
    };

    await expect(loadCliConfig({ fsModule, configPath: fakePath }))
      .rejects
      .toThrow(`${DEFAULT_CONFIG_FILENAME} must include a non-empty "startUrl" string.`);
  });

  it('throws ConfigLoadError when startUrl is not http(s)', async () => {
    const fsModule = {
      readFile: jest.fn().mockResolvedValue(JSON.stringify({ startUrl: 'ftp://example.com' }))
    };

    await expect(loadCliConfig({ fsModule, configPath: fakePath }))
      .rejects
      .toThrow(`${DEFAULT_CONFIG_FILENAME} startUrl must use http or https.`);
  });

  it('throws ConfigLoadError when file missing', async () => {
    const fsModule = {
      readFile: jest.fn().mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }))
    };

    await expect(loadCliConfig({ fsModule, configPath: fakePath }))
      .rejects
      .toThrow(`Missing ${DEFAULT_CONFIG_FILENAME} at ${path.resolve(fakePath)}.`);
  });
});
