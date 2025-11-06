'use strict';

const { runSequenceConfig } = require('../SequenceConfigRunner');

describe('SequenceConfigRunner', () => {
  it('loads configuration and executes sequence via facade', async () => {
    const loadResult = {
      startUrl: 'https://config.example.com/start',
      sharedOverrides: { plannerVerbosity: 2 },
      steps: [
        { id: 'ensureCountryHubs#0', operation: 'ensureCountryHubs', label: 'Ensure Country Hubs' },
        { id: 'exploreCountryHubs#1', operation: 'exploreCountryHubs', label: 'Explore Country Hubs', continueOnError: true }
      ],
      metadata: {
        sequenceName: 'evening-sequence',
        host: 'uk',
        declaredHost: 'uk',
        source: {
          path: 'config/crawl-sequences/evening-sequence.json',
          relativePath: 'config/crawl-sequences/evening-sequence.json',
          format: 'json',
          bytes: 256,
          checksum: 'abc123',
          hostSpecific: true
        },
        startUrl: {
          value: 'https://config.example.com/start',
          source: 'config'
        },
        resolvedTokens: [
          { token: '@cli.startUrl', namespace: 'cli', key: 'startUrl', summary: { type: 'string' } }
        ],
        warnings: [{ code: 'HOST_MISMATCH', message: 'host mismatch' }]
      }
    };

    const loader = {
      load: jest.fn().mockResolvedValue(loadResult)
    };

    const facade = {
      executeSequence: jest.fn().mockResolvedValue({ status: 'ok', metadata: {} })
    };

    const onStepComplete = jest.fn();

    const response = await runSequenceConfig({
      facade,
      loader,
      sequenceConfigName: 'evening-sequence',
      configHost: 'uk',
      startUrl: 'https://override.example.com/start',
      sharedOverrides: { slowMode: true },
      stepOverrides: { exploreCountryHubs: { plannerVerbosity: 3 } },
      continueOnError: true,
      configCliOverrides: { region: 'gb' },
      context: { source: 'unit-test' },
      onStepComplete
    });

    expect(loader.load).toHaveBeenCalledWith({
      sequenceName: 'evening-sequence',
      host: 'uk',
      cliOverrides: {
        __sequenceHost: 'uk',
        region: 'gb',
        startUrl: 'https://override.example.com/start'
      }
    });

    expect(facade.executeSequence).toHaveBeenCalledTimes(1);
    const [sequenceDefinition, executionOptions] = facade.executeSequence.mock.calls[0];
    expect(sequenceDefinition.metadata.config.sequenceName).toBe('evening-sequence');
    expect(sequenceDefinition.steps).toHaveLength(2);
    expect(sequenceDefinition.steps[0]).toEqual(expect.objectContaining({
      id: 'ensureCountryHubs#0',
      operation: 'ensureCountryHubs',
      continueOnError: false
    }));
    expect(sequenceDefinition.steps[1]).toEqual(expect.objectContaining({
      id: 'exploreCountryHubs#1',
      operation: 'exploreCountryHubs',
      continueOnError: true
    }));

    expect(executionOptions.startUrl).toBe('https://override.example.com/start');
    expect(executionOptions.sharedOverrides).toEqual({ slowMode: true });
    expect(executionOptions.stepOverrides).toEqual({ exploreCountryHubs: { plannerVerbosity: 3 } });
    expect(executionOptions.continueOnError).toBe(true);
    expect(executionOptions.onStepComplete).toBe(onStepComplete);
    expect(executionOptions.context.sequenceConfigName).toBe('evening-sequence');
    expect(executionOptions.context.configHost).toBe('uk');
    expect(executionOptions.context.cliOverrides).toEqual({
      __sequenceHost: 'uk',
      region: 'gb',
      startUrl: 'https://override.example.com/start'
    });
    expect(executionOptions.context.source).toBe('unit-test');

    expect(response.sequenceStartUrl).toBe('https://override.example.com/start');
    expect(response.metadata.config.sequenceName).toBe('evening-sequence');
    expect(response.result.status).toBe('ok');
  });

  it('validates required inputs', async () => {
    await expect(runSequenceConfig()).rejects.toThrow(/facade/);
    await expect(runSequenceConfig({ facade: { executeSequence: () => {} } })).rejects.toThrow(/sequenceConfigName/);
  });

  it('emits telemetry hooks with resolver context', async () => {
    const loadResult = {
      startUrl: 'https://config.example.com/start',
      sharedOverrides: {},
      steps: [
        { id: 'alpha#0', operation: 'alpha', label: 'Alpha' }
      ],
      metadata: {
        sequenceName: 'alpha-sequence',
        host: 'example',
        declaredHost: 'example',
        source: {
          path: 'config/crawl-sequences/alpha-sequence.json',
          relativePath: 'config/crawl-sequences/alpha-sequence.json',
          format: 'json',
          bytes: 42,
          checksum: 'deadbeef',
          hostSpecific: true
        },
        startUrl: {
          value: 'https://config.example.com/start',
          source: 'config'
        },
        resolvedTokens: [
          { token: '@cli.startUrl', namespace: 'cli', key: 'startUrl', summary: { type: 'string' } },
          { token: '@playbook.primarySeed', namespace: 'playbook', key: 'primarySeed', summary: { type: 'string' } }
        ],
        warnings: []
      }
    };

    const loader = {
      load: jest.fn().mockResolvedValue(loadResult)
    };

    const facade = {
      executeSequence: jest.fn(async (_sequenceDefinition, options) => {
        options.telemetry.onSequenceStart({ sequence: { sequenceName: 'alpha-sequence' }, startedAt: '2025-11-14T00:00:00.000Z' });
        options.telemetry.onStepEvent({ phase: 'success', step: { id: 'alpha#0', operation: 'alpha' }, index: 0, result: { status: 'ok' } });
        options.telemetry.onSequenceComplete({ result: { status: 'ok' } });
        return { status: 'ok', metadata: { steps: 1 } };
      })
    };

    const telemetry = {
      onConfigResolved: jest.fn(),
      onSequenceStart: jest.fn(),
      onStepEvent: jest.fn(),
      onSequenceComplete: jest.fn(),
      onSequenceError: jest.fn()
    };

    await runSequenceConfig({
      facade,
      loader,
      sequenceConfigName: 'alpha-sequence',
      configHost: 'example',
      telemetry,
      resolvers: {
        playbook: jest.fn()
      }
    });

    expect(telemetry.onConfigResolved).toHaveBeenCalledTimes(1);
    const configResolvedPayload = telemetry.onConfigResolved.mock.calls[0][0];
    expect(configResolvedPayload.sequenceConfigName).toBe('alpha-sequence');
    expect(configResolvedPayload.configHost).toBe('example');
    expect(configResolvedPayload.resolverNamespaces).toEqual(expect.arrayContaining(['cli', 'playbook']));
    expect(configResolvedPayload.resolvedTokens).toHaveLength(2);

    expect(telemetry.onSequenceStart).toHaveBeenCalledWith(expect.objectContaining({
      sequenceConfigName: 'alpha-sequence',
      configHost: 'example',
      resolverNamespaces: expect.arrayContaining(['cli', 'playbook'])
    }));

    expect(telemetry.onStepEvent).toHaveBeenCalledWith(expect.objectContaining({
      sequenceConfigName: 'alpha-sequence',
      result: expect.objectContaining({ status: 'ok' })
    }));

    expect(telemetry.onSequenceComplete).toHaveBeenCalledWith(expect.objectContaining({
      sequenceConfigName: 'alpha-sequence',
      result: expect.objectContaining({ status: 'ok' })
    }));

    expect(telemetry.onSequenceError).not.toHaveBeenCalled();
  });
});
