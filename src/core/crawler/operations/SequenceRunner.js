'use strict';

const { cloneOptions } = require('./CrawlOperation');
const { normalizeSequence } = require('./sequenceUtils');
const { createSequenceRunner } = require('../sequence/SequenceRunner');

const createOperationsFacade = (invokeOperation, listOperations) => new Proxy({}, {
  get(_, prop) {
    if (prop === 'listOperations') {
      return listOperations;
    }
    if (typeof prop === 'symbol') {
      return undefined;
    }
    return (startUrl, overrides) => invokeOperation(prop, startUrl, overrides);
  },
  has(_, prop) {
    if (prop === 'listOperations') {
      return true;
    }
    return typeof prop === 'string' && listOperations().includes(prop);
  },
  ownKeys() {
    return listOperations();
  }
});

const cloneStepOverrides = (overrides) => cloneOptions(overrides || {});

class CrawlSequenceRunner {
  constructor({ runOperation, listOperations, logger = console } = {}) {
    if (typeof runOperation !== 'function') {
      throw new Error('CrawlSequenceRunner requires a runOperation function');
    }

    this.runOperation = runOperation;
    this.listOperations = typeof listOperations === 'function'
      ? listOperations
      : () => [];
    this.logger = logger || console;
    this._activeOnStepComplete = null;
    this._activeTelemetry = null;

    this._sequenceRunner = createSequenceRunner({
      operations: createOperationsFacade(
        (operation, startUrl, overrides) => this._invokeOperation(operation, startUrl, overrides),
        () => this.listOperations()
      ),
      logger: this.logger,
      telemetry: {
        onSequenceStart: (payload) => this._emitTelemetry('onSequenceStart', payload),
        onSequenceComplete: (payload) => this._emitTelemetry('onSequenceComplete', payload),
        onStepEvent: (event) => {
          this._emitTelemetry('onStepEvent', event);
          this._handleStepEvent(event);
        }
      }
    });
  }

  async execute(sequence, {
    startUrl,
    sharedOverrides = {},
    continueOnError = false,
    stepOverrides,
    onStepComplete,
    context,
    telemetry
  } = {}) {
    const sequenceConfig = this._buildSequenceConfig(sequence);
    const previousCallback = this._activeOnStepComplete;
    this._activeOnStepComplete = typeof onStepComplete === 'function'
      ? onStepComplete
      : null;
    const previousTelemetry = this._activeTelemetry;
    this._activeTelemetry = this._sanitizeTelemetry(telemetry);

    const runContext = {
      source: 'CrawlOperations',
      ...(context && typeof context === 'object' ? cloneOptions(context) : {})
    };

    try {
      const summary = await this._sequenceRunner.run({
        sequenceConfig,
        startUrl,
        sharedOverrides,
        stepOverrides,
        continueOnError,
        context: runContext
      });

      return {
        status: summary.status,
        startedAt: summary.startedAt,
        finishedAt: summary.finishedAt,
        elapsedMs: summary.elapsedMs,
        startUrl: startUrl || sequenceConfig.startUrl || null,
        metadata: cloneOptions(summary.metadata || {}),
        context: cloneOptions(runContext),
        steps: summary.steps.map((step) => this._adaptStep(step))
      };
    } finally {
      this._activeOnStepComplete = previousCallback;
      this._activeTelemetry = previousTelemetry;
    }
  }



  _buildSequenceConfig(sequence) {
    if (Array.isArray(sequence)) {
      return {
        sharedOverrides: {},
        steps: this._normalizeSteps(sequence)
      };
    }

    if (sequence && typeof sequence === 'object' && Array.isArray(sequence.steps)) {
      return {
        metadata: cloneOptions(sequence.metadata || {}),
        startUrl: sequence.startUrl,
        sharedOverrides: cloneStepOverrides(sequence.sharedOverrides),
        steps: this._normalizeSteps(sequence.steps)
      };
    }

    throw new Error('CrawlSequenceRunner.execute expects an array or config with steps');
  }

  _normalizeSteps(sequence) {
    const normalized = Array.isArray(sequence) && sequence.every((entry) => typeof entry === 'string' || typeof entry === 'object')
      ? normalizeSequence(sequence)
      : sequence;

    return normalized.map((step, index) => ({
      id: step.id || `${step.operation || 'step'}-${index}`,
      operation: step.operation,
      label: step.label || step.operation,
      startUrl: step.startUrl,
      overrides: cloneStepOverrides(step.overrides),
      continueOnError: Boolean(step.continueOnError)
    }));
  }

  async _invokeOperation(name, startUrl, overrides = {}) {
    return this.runOperation(name, startUrl, overrides);
  }

  _sanitizeTelemetry(telemetry) {
    if (!telemetry || typeof telemetry !== 'object') {
      return null;
    }
    const handlers = {
      onSequenceStart: () => {},
      onSequenceComplete: () => {},
      onStepEvent: () => {}
    };

    const merged = {};
    for (const key of Object.keys(handlers)) {
      const candidate = telemetry[key];
      if (typeof candidate === 'function') {
        merged[key] = candidate;
      } else {
        merged[key] = handlers[key];
      }
    }

    return merged;
  }

  _emitTelemetry(handlerName, payload) {
    if (!this._activeTelemetry) {
      return;
    }
    const handler = this._activeTelemetry[handlerName];
    if (typeof handler !== 'function') {
      return;
    }
    try {
      handler(payload);
    } catch (error) {
      this.logger.warn?.(`[CrawlOperations] telemetry handler "${handlerName}" failed: ${error?.message || error}`);
    }
  }

  _handleStepEvent(event) {
    if (!this._activeOnStepComplete) {
      return;
    }
    if (event.phase !== 'success' && event.phase !== 'failure') {
      return;
    }
    const { result, index } = event;
    if (!result) {
      return;
    }
    const adapted = this._adaptStep(result);
    try {
      const maybePromise = this._activeOnStepComplete(adapted, index);
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.catch((error) => {
          this.logger.warn?.(`[CrawlOperations] onStepComplete callback failed: ${error?.message || error}`);
        });
      }
    } catch (error) {
      this.logger.warn?.(`[CrawlOperations] onStepComplete callback failed: ${error?.message || error}`);
    }
  }

  _adaptStep(step) {
    const operationResult = step.result ? cloneOptions(step.result) : {};
    if (!operationResult.operation) {
      operationResult.operation = step.operation;
    }
    if (!operationResult.startUrl) {
      operationResult.startUrl = step.startUrl;
    }
    if (!operationResult.status) {
      operationResult.status = step.status;
    }
    if (!operationResult.startedAt && step.startedAt) {
      operationResult.startedAt = step.startedAt;
    }
    if (!operationResult.finishedAt && step.finishedAt) {
      operationResult.finishedAt = step.finishedAt;
    }
    if (operationResult.elapsedMs == null && step.elapsedMs != null) {
      operationResult.elapsedMs = step.elapsedMs;
    }
    if (step.error && !operationResult.error) {
      operationResult.error = step.error;
    }
    operationResult.sequenceIndex = step.sequenceIndex;
    operationResult.label = step.label || step.operation;
    operationResult.overrides = cloneStepOverrides(step.overrides);

    return operationResult;
  }
}

module.exports = {
  CrawlSequenceRunner
};
