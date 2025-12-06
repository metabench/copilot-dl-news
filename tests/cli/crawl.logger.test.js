const {
  getLoggerWriter,
  resolveLoggerVerbosity,
  resolveOverrides
} = require('../../crawl.js');
const { DEFAULT_BASIC_OUTPUT_VERBOSITY } = require('../../src/config/ConfigurationService');
const { OUTPUT_VERBOSITY_LEVELS } = require('../../src/utils/outputVerbosity');

describe('getLoggerWriter', () => {
  test('prefers info over log', () => {
    const logger = { info: jest.fn(), log: jest.fn() };
    const writer = getLoggerWriter(logger, 'info');
    writer('hello');
    expect(logger.info).toHaveBeenCalledWith('hello');
    expect(logger.log).not.toHaveBeenCalled();
  });

  test('warn falls back to error when warn is missing', () => {
    const logger = { error: jest.fn() };
    const writer = getLoggerWriter(logger, 'warn');
    writer('warn-message');
    expect(logger.error).toHaveBeenCalledWith('warn-message');
  });

  test('falls back to console.log when logger is missing', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const writer = getLoggerWriter(null, 'info');
    writer('fallback');
    expect(spy).toHaveBeenCalledWith('fallback');
    spy.mockRestore();
  });
});

describe('resolveLoggerVerbosity', () => {
  const [firstLevel, secondLevel = firstLevel] = OUTPUT_VERBOSITY_LEVELS;

  test('prefers explicit flag over shared overrides and defaults', () => {
    const context = {
      getFlag: (flag) => (flag === '--output-verbosity' ? secondLevel : undefined),
      getDefaultRunConfig: () => ({ sharedOverrides: { outputVerbosity: firstLevel } })
    };
    const result = resolveLoggerVerbosity(context, { outputVerbosity: firstLevel });
    expect(result).toBe(secondLevel);
  });

  test('uses shared overrides when no flag is provided', () => {
    const context = {
      getFlag: () => undefined,
      getDefaultRunConfig: () => ({ sharedOverrides: { outputVerbosity: secondLevel } })
    };
    const result = resolveLoggerVerbosity(context, { outputVerbosity: firstLevel });
    expect(result).toBe(firstLevel);
  });

  test('falls back to default run config then default verbosity', () => {
    const context = {
      getFlag: () => undefined,
      getDefaultRunConfig: () => ({ sharedOverrides: { outputVerbosity: secondLevel } })
    };
    const result = resolveLoggerVerbosity(context, {});
    expect(result).toBe(secondLevel || DEFAULT_BASIC_OUTPUT_VERBOSITY);
  });

  test('returns DEFAULT_BASIC_OUTPUT_VERBOSITY when nothing else is set', () => {
    const context = {
      getFlag: () => undefined,
      getDefaultRunConfig: () => null
    };
    const result = resolveLoggerVerbosity(context, {});
    expect(result).toBe(DEFAULT_BASIC_OUTPUT_VERBOSITY);
  });
});

describe('resolveOverrides', () => {
  const makeContext = ({ maxDownloads, concurrency } = {}) => ({
    getIntegerFlag: (flag) => {
      if (flag === '--max-downloads' || flag === '--limit') return maxDownloads;
      if (flag === '--concurrency') return concurrency;
      return undefined;
    },
    getBooleanFlag: () => undefined,
    getFlag: () => undefined
  });

  test('applies context flags before merging additional overrides', () => {
    const context = makeContext({ maxDownloads: 10, concurrency: 3 });
    const sharedOverrides = { maxDownloads: 5 };
    const overrides = resolveOverrides(context, sharedOverrides, { maxDownloads: 15, plannerVerbosity: 2 });
    expect(overrides).toEqual({ maxDownloads: 15, concurrency: 3, plannerVerbosity: 2 });
  });

  test('preserves shared overrides when context flags are absent', () => {
    const context = makeContext();
    const overrides = resolveOverrides(context, { concurrency: 4 }, { loggingQueue: true });
    expect(overrides).toEqual({ concurrency: 4, loggingQueue: true });
  });
});
