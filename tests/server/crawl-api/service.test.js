'use strict';

const {
  createCrawlService,
  buildAvailabilityPayload,
  SequenceConfigError
} = require('../../../src/server/crawl-api/core/crawlService');

describe('crawlService', () => {
  test('getAvailability returns summaries for operations and sequences', () => {
    const service = createCrawlService({
      createFacade: () => ({
        listOperations: () => ['alpha'],
        getOperationPreset: (name) => {
          if (name === 'alpha') {
            return { summary: 'Runs alpha operation', options: { depth: 1 } };
          }
          return null;
        },
        listSequencePresets: () => [
          { name: 'preset-one', label: 'Preset One', description: 'Demo preset', stepCount: 1, continueOnError: false }
        ],
        getSequencePreset: () => ({
          steps: [
            { operation: 'alpha', label: 'Step 1' }
          ]
        })
      })
    });

    const availability = service.getAvailability({});
    expect(availability.operations).toEqual([
      {
        name: 'alpha',
        summary: 'Runs alpha operation',
        defaultOptions: { depth: 1 }
      }
    ]);
    expect(availability.sequences).toEqual([
      {
        name: 'preset-one',
        label: 'Preset One',
        description: 'Demo preset',
        continueOnError: false,
        stepCount: 1,
        steps: [
          { operation: 'alpha', label: 'Step 1' }
        ]
      }
    ]);
  });

  test('runOperation delegates to facade shortcuts', async () => {
    const runSpy = jest.fn().mockResolvedValue({ status: 'ok' });
    const service = createCrawlService({
      createFacade: () => ({
        listOperations: () => [],
        getOperationPreset: () => null,
        listSequencePresets: () => [],
        getSequencePreset: () => null,
        alpha: runSpy
      })
    });

    const result = await service.runOperation({
      operationName: 'alpha',
      startUrl: 'https://example.com',
      overrides: { depth: 2 }
    });

    expect(runSpy).toHaveBeenCalledWith('https://example.com', { depth: 2 });
    expect(result).toEqual({ status: 'ok' });
  });

  test('runSequencePreset forwards options to facade', async () => {
    const presetSpy = jest.fn().mockResolvedValue({ status: 'mixed' });
    const service = createCrawlService({
      createFacade: () => ({
        listOperations: () => [],
        getOperationPreset: () => null,
        listSequencePresets: () => [],
        getSequencePreset: () => null,
        runSequencePreset: presetSpy
      })
    });

    const result = await service.runSequencePreset({
      sequenceName: 'preset-one',
      startUrl: 'https://example.com',
      sharedOverrides: { depth: 2 },
      stepOverrides: { alpha: { depth: 4 } },
      continueOnError: true,
      onStepComplete: () => {},
      context: { requestId: 'abc123' }
    });

    expect(presetSpy).toHaveBeenCalledWith('preset-one', {
      startUrl: 'https://example.com',
      sharedOverrides: { depth: 2 },
      stepOverrides: { alpha: { depth: 4 } },
      continueOnError: true,
      onStepComplete: expect.any(Function),
      context: { requestId: 'abc123' }
    });
    expect(result).toEqual({ status: 'mixed' });
  });

  test('runSequenceConfig delegates to injected runner', async () => {
    const runnerSpy = jest.fn().mockResolvedValue({
      result: { status: 'ok' },
      loadResult: { startUrl: 'https://example.com' }
    });
    const service = createCrawlService({
      createFacade: () => ({
        listOperations: () => [],
        getOperationPreset: () => null,
        listSequencePresets: () => [],
        getSequencePreset: () => null,
        runSequencePreset: jest.fn()
      }),
      createSequenceLoader: jest.fn().mockReturnValue({}),
      sequenceConfigRunner: runnerSpy
    });

    const params = {
      sequenceConfigName: 'demo-config',
      configDir: 'config/crawl-sequences',
      configHost: 'example.com',
      startUrl: 'https://example.com',
      sharedOverrides: { depth: 1 },
      stepOverrides: { alpha: { depth: 3 } },
      continueOnError: false,
      configCliOverrides: { limit: 10 },
      onStepComplete: () => {}
    };

    const result = await service.runSequenceConfig(params);

    expect(runnerSpy).toHaveBeenCalledWith(expect.objectContaining({
      facade: expect.any(Object),
      loader: expect.any(Object),
      sequenceConfigName: 'demo-config',
      configHost: 'example.com',
      startUrl: 'https://example.com',
      sharedOverrides: { depth: 1 },
      stepOverrides: { alpha: { depth: 3 } },
      continueOnError: false,
      configCliOverrides: { limit: 10 },
      onStepComplete: expect.any(Function)
    }));
    expect(result).toEqual({
      result: { status: 'ok' },
      loadResult: { startUrl: 'https://example.com' }
    });
  });

  test('buildAvailabilityPayload filters payload based on flags', () => {
    const availability = {
      operations: [{ name: 'alpha' }],
      sequences: [{ name: 'preset-one' }]
    };

    expect(buildAvailabilityPayload(availability, { showOperationsList: true, showSequencesList: false })).toEqual({
      operations: [{ name: 'alpha' }]
    });
    expect(buildAvailabilityPayload(availability, { showOperationsList: false, showSequencesList: true })).toEqual({
      sequencePresets: [{ name: 'preset-one' }]
    });
    expect(buildAvailabilityPayload(availability, {}, true)).toEqual({
      operations: [{ name: 'alpha' }],
      sequencePresets: [{ name: 'preset-one' }]
    });
    expect(buildAvailabilityPayload(null, {})).toBeUndefined();
  });

  test('SequenceConfigError is re-exported for consumers', () => {
    expect(typeof SequenceConfigError).toBe('function');
  });
});
