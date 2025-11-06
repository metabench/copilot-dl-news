'use strict';

const clone = (value) => JSON.parse(JSON.stringify(value || {}));

class SequenceRunnerError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'SequenceRunnerError';
    this.code = code;
    this.details = details;
  }
}

const defaultTelemetry = {
  onSequenceStart: () => {},
  onSequenceComplete: () => {},
  onStepEvent: () => {}
};

const createSequenceRunner = ({
  operations,
  logger = console,
  telemetry = {}
} = {}) => {
  if (!operations) {
    throw new SequenceRunnerError('OPERATIONS_MISSING', 'SequenceRunner requires an operations facade');
  }

  const telemetryHandlers = {
    ...defaultTelemetry,
    ...telemetry
  };

  const resolveOperation = (name) => {
    if (!name || typeof name !== 'string') {
      throw new SequenceRunnerError('STEP_OPERATION_INVALID', 'Sequence step is missing an operation name', { name });
    }

    const candidate = operations[name];
    if (typeof candidate === 'function') {
      return candidate;
    }

    if (Array.isArray(operations.listOperations) && operations.listOperations.includes?.(name)) {
      throw new SequenceRunnerError('STEP_OPERATION_UNAVAILABLE', `Operation "${name}" is registered but not callable`);
    }

    if (typeof operations.listOperations === 'function' && operations.listOperations().includes(name)) {
      throw new SequenceRunnerError('STEP_OPERATION_UNAVAILABLE', `Operation "${name}" is registered but not callable`);
    }

    throw new SequenceRunnerError('STEP_OPERATION_UNKNOWN', `Unknown sequence operation "${name}"`, { name });
  };

  const mergeStepOverrides = (sharedOverrides = {}, stepOverrides = {}, runtimeOverrides = {}) => ({
    ...clone(sharedOverrides),
    ...clone(stepOverrides),
    ...clone(runtimeOverrides)
  });

  const normalizeStepOverrideInput = (stepOverrides = {}, step, index) => {
    if (!stepOverrides) {
      return undefined;
    }
    if (stepOverrides[step.id]) {
      return stepOverrides[step.id];
    }
    if (stepOverrides[step.operation]) {
      return stepOverrides[step.operation];
    }
    if (Object.prototype.hasOwnProperty.call(stepOverrides, index)) {
      return stepOverrides[index];
    }
    return undefined;
  };

  const run = async ({
    sequenceConfig,
    startUrl,
    sharedOverrides,
    stepOverrides,
    continueOnError = false,
    context = {}
  } = {}) => {
    if (!sequenceConfig || !Array.isArray(sequenceConfig.steps)) {
      throw new SequenceRunnerError('CONFIG_INVALID', 'Sequence configuration must include steps array');
    }

    const sequenceMetadata = sequenceConfig.metadata || {};
    const effectiveStartUrl = startUrl || sequenceConfig.startUrl;
    if (!effectiveStartUrl || typeof effectiveStartUrl !== 'string') {
      throw new SequenceRunnerError('START_URL_MISSING', 'Sequence startUrl is required');
    }

    const mergedSharedOverrides = mergeStepOverrides(sequenceConfig.sharedOverrides, sharedOverrides);

    const runStartedMs = Date.now();
    telemetryHandlers.onSequenceStart({
      sequence: sequenceMetadata,
      context,
      startedAt: new Date(runStartedMs).toISOString()
    });

    const stepResults = [];
    let aborted = false;

    for (let index = 0; index < sequenceConfig.steps.length; index += 1) {
      const step = sequenceConfig.steps[index];
      const operationFn = resolveOperation(step.operation);
      const finalStartUrl = step.startUrl || effectiveStartUrl;
      if (!finalStartUrl) {
        throw new SequenceRunnerError('STEP_START_URL_MISSING', `Step ${index} is missing a startUrl`, { step });
      }

      const runtimeOverride = normalizeStepOverrideInput(stepOverrides, step, index);
      const finalOverrides = mergeStepOverrides(mergedSharedOverrides, step.overrides, runtimeOverride);

      const stepStartedMs = Date.now();
      telemetryHandlers.onStepEvent({
        phase: 'start',
        step,
        index,
        sequence: sequenceMetadata,
        context,
        startUrl: finalStartUrl,
        overrides: finalOverrides
      });

      let operationResult = null;
      let status = 'ok';
      let error = null;

      try {
        operationResult = await operationFn(finalStartUrl, finalOverrides);
        if (operationResult && typeof operationResult.status === 'string') {
          status = operationResult.status;
        } else if (!operationResult) {
          status = 'ok';
        }
      } catch (err) {
        status = 'error';
        error = {
          message: err?.message || String(err),
          stack: err?.stack || null
        };
        logger.error?.(`[SequenceRunner] ${step.operation} failed: ${error.message}`);
      }

      const stepFinishedMs = Date.now();
      const elapsedMs = stepFinishedMs - stepStartedMs;

      if (operationResult && typeof operationResult.elapsedMs !== 'number') {
        operationResult.elapsedMs = operationResult.elapsedMs ?? elapsedMs;
      }

      const stepResult = {
        id: step.id,
        sequenceIndex: index,
        operation: step.operation,
        label: step.label || step.operation,
        status,
        startUrl: finalStartUrl,
        overrides: clone(finalOverrides),
        continueOnError: Boolean(step.continueOnError),
        startedAt: new Date(stepStartedMs).toISOString(),
        finishedAt: new Date(stepFinishedMs).toISOString(),
        elapsedMs,
        result: operationResult ? clone(operationResult) : null,
        error
      };

      stepResults.push(stepResult);

      telemetryHandlers.onStepEvent({
        phase: status === 'ok' ? 'success' : 'failure',
        step,
        index,
        sequence: sequenceMetadata,
        context,
        startUrl: finalStartUrl,
        overrides: finalOverrides,
        result: stepResult
      });

      const allowContinue = status === 'ok'
        || Boolean(step.continueOnError)
        || Boolean(continueOnError);

      if (!allowContinue) {
        aborted = true;
        break;
      }
    }

    const runFinishedMs = Date.now();
    const allOk = stepResults.length === sequenceConfig.steps.length && stepResults.every((step) => step.status === 'ok');
    const status = allOk ? 'ok' : aborted ? 'aborted' : 'mixed';

    const summary = {
      status,
      steps: stepResults,
      metadata: sequenceMetadata,
      startedAt: new Date(runStartedMs).toISOString(),
      finishedAt: new Date(runFinishedMs).toISOString(),
      elapsedMs: runFinishedMs - runStartedMs
    };

    telemetryHandlers.onSequenceComplete({
      sequence: sequenceMetadata,
      context,
      result: summary
    });

    return summary;
  };

  return {
    run,
    resolveOperation
  };
};

module.exports = {
  createSequenceRunner,
  SequenceRunnerError
};