'use strict';

const { createSequenceRunner, SequenceRunnerError } = require('../SequenceRunner');

describe('SequenceRunner', () => {
  const createOperations = () => {
    const calls = [];
    const operations = {
      alpha: jest.fn(async (url, overrides) => {
        calls.push({ name: 'alpha', url, overrides });
        return { status: 'ok', options: { url, overrides } };
      }),
      beta: jest.fn(async () => ({ status: 'ok' })),
      gamma: jest.fn(async () => { throw new Error('boom'); })
    };

    operations.listOperations = () => Object.keys(operations).filter((key) => typeof operations[key] === 'function');
    operations.calls = calls;

    return operations;
  };

  const createSequence = () => ({
    metadata: { sequenceName: 'test-sequence' },
    startUrl: 'https://example.com',
    sharedOverrides: { foo: 'bar' },
    steps: [
      { id: 'first', operation: 'alpha', overrides: { alpha: 1 } },
      { id: 'second', operation: 'beta' }
    ]
  });

  const createLogger = () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() });

  it('runs each step sequentially with merged overrides', async () => {
    const operations = createOperations();
    const telemetry = { onSequenceStart: jest.fn(), onSequenceComplete: jest.fn(), onStepEvent: jest.fn() };
    const runner = createSequenceRunner({ operations, telemetry, logger: createLogger() });

    const result = await runner.run({
      sequenceConfig: createSequence(),
      stepOverrides: { first: { injected: true } }
    });

    expect(result.status).toBe('ok');
    expect(operations.alpha).toHaveBeenCalledTimes(1);
    expect(operations.beta).toHaveBeenCalledTimes(1);
    expect(operations.calls[0]).toMatchObject({
      name: 'alpha',
      url: 'https://example.com',
      overrides: { foo: 'bar', alpha: 1, injected: true }
    });
    expect(telemetry.onSequenceStart).toHaveBeenCalled();
    expect(telemetry.onSequenceComplete).toHaveBeenCalled();
    expect(telemetry.onStepEvent).toHaveBeenCalled();
  });

  it('aborts when a step fails without continueOnError', async () => {
    const operations = createOperations();
    const runner = createSequenceRunner({ operations, logger: createLogger() });

    const sequence = createSequence();
    sequence.steps.push({ id: 'third', operation: 'gamma' });
    sequence.steps.push({ id: 'fourth', operation: 'beta' });

    const result = await runner.run({ sequenceConfig: sequence });

    expect(result.status).toBe('aborted');
    expect(result.steps).toHaveLength(3);
    expect(result.steps[2].status).toBe('error');
    expect(result.steps[2].error.message).toBe('boom');
  });

  it('continues when continueOnError is set', async () => {
    const operations = createOperations();
    const runner = createSequenceRunner({ operations, logger: createLogger() });

    const sequence = createSequence();
    sequence.steps.push({ id: 'third', operation: 'gamma', continueOnError: true });
    sequence.steps.push({ id: 'fourth', operation: 'beta' });

    const result = await runner.run({ sequenceConfig: sequence });

    expect(result.status).toBe('mixed');
    expect(result.steps).toHaveLength(4);
    expect(result.steps[2].status).toBe('error');
    expect(result.steps[3].status).toBe('ok');
  });

  it('throws when configuration is invalid', async () => {
    const operations = createOperations();
    const runner = createSequenceRunner({ operations, logger: createLogger() });

    await expect(runner.run({ sequenceConfig: {} })).rejects.toThrow(SequenceRunnerError);
    await expect(runner.run({ sequenceConfig: { steps: [] }, startUrl: null })).rejects.toThrow(SequenceRunnerError);
  });
});