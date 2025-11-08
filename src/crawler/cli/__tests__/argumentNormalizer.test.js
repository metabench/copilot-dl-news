'use strict';

const { normalizeLegacyArguments } = require('../argumentNormalizer');

describe('normalizeLegacyArguments', () => {
  const createMockLogger = () => ({
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn()
  });

  it('parses sequence configuration flags and JSON overrides', () => {
    const argv = [
      '--sequence-config', 'evening-sequence',
      '--config-host', 'uk',
      '--config-cli', '{"region":"gb"}',
      '--shared-overrides', '{"slowMode":true}',
      '--step-overrides', '{"ensureCountryHubs":{"plannerVerbosity":3}}',
      '--continue-on-error',
      '--start-url', 'https://news.example.com',
      '--crawl-type=geography',
      '--country=GB'
    ];

    const result = normalizeLegacyArguments(argv, { log: createMockLogger() });

    expect(result.startUrl).toBe('https://news.example.com');
    expect(result.startUrlExplicit).toBe(true);

    expect(result.options.crawlType).toBe('geography');
    expect(result.options.targetCountries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'GB' })
      ])
    );

    expect(result.sequenceConfig).toEqual(expect.objectContaining({
      name: 'evening-sequence',
      configHost: 'uk',
      continueOnError: true
    }));
    expect(result.sequenceConfig.sharedOverrides).toEqual({ slowMode: true });
    expect(result.sequenceConfig.stepOverrides).toEqual({
      ensureCountryHubs: { plannerVerbosity: 3 }
    });
    expect(result.sequenceConfig.configCliOverrides).toEqual({ region: 'gb' });
    expect(result.interactiveControls).toEqual({ enabled: true, explicit: false });
  });

  it('defaults geography start url to placeholder when explicit start is absent', () => {
    const result = normalizeLegacyArguments([
      '--crawl-type=geography'
    ], { log: createMockLogger() });

    expect(result.startUrl).toBe('https://placeholder.local');
    expect(result.startUrlExplicit).toBe(false);
    expect(result.interactiveControls).toEqual({ enabled: true, explicit: false });
  });

  it('throws on invalid JSON for step overrides', () => {
    expect(() => normalizeLegacyArguments([
      '--sequence-config', 'demo',
      '--step-overrides', 'not-json'
    ], { log: createMockLogger() })).toThrow(/Invalid JSON/);
  });

  it('respects interactive control toggles', () => {
    const disable = normalizeLegacyArguments([
      '--no-interactive-controls'
    ], { log: createMockLogger() });

    expect(disable.interactiveControls).toEqual({ enabled: false, explicit: true });

    const enable = normalizeLegacyArguments([
      '--interactive-controls'
    ], { log: createMockLogger() });

    expect(enable.interactiveControls).toEqual({ enabled: true, explicit: true });
  });
});
