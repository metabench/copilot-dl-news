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

// 2026-07-26: a URL typed on the command line was SILENTLY IGNORED whenever
// crawl.js.config.json set a startUrl — the merge appended directArgv after configArgv,
// and since the start URL is a POSITIONAL the normalizer took configArgv[0]. A benchmark
// aimed at a local fixture crawled https://www.theguardian.com instead, with no warning.
describe('explicit command-line start URL beats the config startUrl', () => {
  const { resolveCliArguments, findExplicitStartUrl } = require('../configArgs');

  const fsModuleWith = (config) => ({
    readFile: async () => JSON.stringify(config)
  });
  const CONFIG = { startUrl: 'https://config.example.com/', depth: 3, concurrency: 2, maxPages: 5000 };

  it('puts the CLI URL first and drops the config start URL', async () => {
    const res = await resolveCliArguments({
      directArgv: ['http://127.0.0.1:8080/', '--max-pages=8'],
      fsModule: fsModuleWith(CONFIG)
    });
    expect(res.argv).not.toContain('https://config.example.com/');
    // The first positional (non-flag) argument is what the normalizer uses as start URL.
    expect(res.argv.find((a) => !String(a).startsWith('-'))).toBe('http://127.0.0.1:8080/');
    expect(res.explicitStartUrl).toBe('http://127.0.0.1:8080/');
    expect(res.overriddenConfigStartUrl).toBe('https://config.example.com/');
  });

  it('still applies config FLAGS when the CLI overrides only the URL', async () => {
    const res = await resolveCliArguments({
      directArgv: ['http://127.0.0.1:8080/'],
      fsModule: fsModuleWith(CONFIG)
    });
    expect(res.argv).toContain('--depth=3');
    expect(res.argv).toContain('--concurrency=2');
  });

  it('keeps the config start URL when the CLI supplies none', async () => {
    const res = await resolveCliArguments({
      directArgv: ['--max-pages=8'],
      fsModule: fsModuleWith(CONFIG)
    });
    expect(res.argv[0]).toBe('https://config.example.com/');
    expect(res.explicitStartUrl).toBeNull();
    expect(res.overriddenConfigStartUrl).toBeNull();
  });

  it('reports no override when the CLI URL equals the config URL', async () => {
    const res = await resolveCliArguments({
      directArgv: ['https://config.example.com/'],
      fsModule: fsModuleWith(CONFIG)
    });
    expect(res.explicitStartUrl).toBe('https://config.example.com/');
    expect(res.overriddenConfigStartUrl).toBeNull();
  });

  describe('findExplicitStartUrl is conservative', () => {
    it('finds a bare http(s) URL', () => {
      expect(findExplicitStartUrl(['https://a.test/', '--depth=2'])).toBe('https://a.test/');
      expect(findExplicitStartUrl(['--depth=2', 'http://b.test/'])).toBe('http://b.test/');
    });

    it('does NOT treat a space-separated flag VALUE as the start URL', () => {
      // `--cached-seed https://…` passes a URL to a flag; hijacking it would change the
      // crawl target. When ambiguous the detector must decline.
      expect(findExplicitStartUrl(['--cached-seed', 'https://seed.test/'])).toBeNull();
    });

    it('still finds a URL after an =-form flag', () => {
      expect(findExplicitStartUrl(['--depth=2', 'https://a.test/'])).toBe('https://a.test/');
    });

    it('ignores non-URL positionals and empty input', () => {
      expect(findExplicitStartUrl(['--db', 'C:/tmp/x.db'])).toBeNull();
      expect(findExplicitStartUrl([])).toBeNull();
      expect(findExplicitStartUrl(undefined)).toBeNull();
    });
  });
});
