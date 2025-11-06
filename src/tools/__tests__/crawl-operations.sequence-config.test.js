const loadModule = () => {
  jest.resetModules();
  return require('../crawl-operations');
};

const createContext = () => ({
  operations: [{ name: 'ensureCountryHubs' }],
  sequences: [{ name: 'fullCountryHubDiscovery' }]
});

describe('crawl-operations sequence config options', () => {
  it('parses sequence config CLI flags into normalized options', () => {
    const { parseCliArgs, normalizeOptions } = loadModule();
    const rawArgs = parseCliArgs([
      '--sequence-config', 'evening-sequence',
      '--config-host', 'uk',
      '--config-dir', 'config/crawl',
      '--config-cli', '{"region":"gb"}',
      '--continue-on-error'
    ]);

    const options = normalizeOptions(rawArgs, createContext());

    expect(options.mode).toBe('sequence-config');
    expect(options.sequenceConfigName).toBe('evening-sequence');
    expect(options.configHost).toBe('uk');
    expect(options.configDir).toBe('config/crawl');
    expect(options.configCliOverrides).toEqual({ region: 'gb' });
    expect(options.continueOnError).toBe(true);
    expect(options.sharedOverrides).toEqual({});
    expect(options.stepOverrides).toEqual({});
  });

  it('defaults config overrides and host metadata when unset', () => {
    const { parseCliArgs, normalizeOptions } = loadModule();
    const rawArgs = parseCliArgs([
      '--sequence-config', 'evening-sequence'
    ]);

    const options = normalizeOptions(rawArgs, createContext());

    expect(options.mode).toBe('sequence-config');
    expect(options.configCliOverrides).toEqual({});
    expect(options.configHost).toBeNull();
    expect(options.configDir).toBeNull();
    expect(options.startUrl).toBeUndefined();
  });

  it('rejects mixing --sequence and --sequence-config', () => {
    const { parseCliArgs, normalizeOptions } = loadModule();
    const rawArgs = parseCliArgs([
      '--sequence', 'fullCountryHubDiscovery',
      '--sequence-config', 'override'
    ]);

    expect(() => normalizeOptions(rawArgs, createContext())).toThrow('Specify only one of --operation, --sequence, or --sequence-config.');
  });
});
