/**
 * Pipeline-over-flags orchestration pattern
 * 
 * Instead of branching on boolean flags throughout the codebase,
 * this module builds an ordered array of steps based on configuration
 * and executes them sequentially with a shared context.
 * 
 * @module src/crawler/pipeline/runPipeline
 */

/**
 * @typedef {Object} StepResult
 * @property {boolean} ok - Whether the step succeeded
 * @property {*} [value] - Optional result value on success
 * @property {Error|string} [err] - Error on failure
 * @property {string} [reason] - Human-readable failure reason
 */

/**
 * @typedef {Object} PipelineContext
 * @property {string} url - Current URL being processed
 * @property {number} depth - Crawl depth
 * @property {Object} [meta] - Additional metadata
 * @property {Object} [results] - Accumulated results from previous steps
 */

/**
 * @typedef {Object} PipelineDeps
 * @property {Object} [logger] - Logger instance with info/warn/error methods
 * @property {Object} [metrics] - Metrics/telemetry instance
 * @property {Object} [dbAdapter] - Database adapter
 * @property {Object} [cache] - Cache instance
 */

/**
 * @typedef {Object} PipelineStep
 * @property {string} id - Unique step identifier
 * @property {string} [label] - Human-readable label
 * @property {(ctx: PipelineContext, deps: PipelineDeps) => Promise<StepResult>|StepResult} execute - Step execution function
 * @property {boolean} [optional] - If true, failure doesn't abort pipeline
 * @property {(ctx: PipelineContext) => boolean} [shouldRun] - Predicate to skip step
 */

/**
 * @typedef {Object} PipelineOptions
 * @property {boolean} [stopOnError=true] - Stop pipeline on first error
 * @property {boolean} [collectMetrics=true] - Collect timing metrics
 * @property {number} [timeoutMs] - Overall pipeline timeout
 */

/**
 * @typedef {Object} PipelineResult
 * @property {boolean} ok - Whether pipeline completed successfully
 * @property {PipelineContext} ctx - Final context with accumulated results
 * @property {Array<{stepId: string, ok: boolean, durationMs: number, result?: StepResult}>} stepResults - Per-step outcomes
 * @property {number} durationMs - Total pipeline duration
 * @property {string} [abortedAt] - Step ID where pipeline was aborted (if any)
 * @property {Error|string} [err] - Error that caused abort
 */

const DEFAULT_LOGGER = {
  info: (...args) => console.log('[pipeline]', ...args),
  warn: (...args) => console.warn('[pipeline]', ...args),
  error: (...args) => console.error('[pipeline]', ...args),
  debug: () => {} // silent by default
};

/**
 * Execute a pipeline of steps sequentially
 * 
 * @param {PipelineStep[]} steps - Ordered array of steps to execute
 * @param {PipelineContext} ctx - Initial context
 * @param {PipelineDeps} [deps={}] - Shared dependencies
 * @param {PipelineOptions} [options={}] - Pipeline options
 * @returns {Promise<PipelineResult>}
 * 
 * @example
 * const steps = buildSteps(config);
 * const result = await runPipeline(steps, { url, depth: 0 }, { logger, metrics });
 * if (!result.ok) {
 *   console.error(`Pipeline failed at ${result.abortedAt}: ${result.err}`);
 * }
 */
async function runPipeline(steps, ctx, deps = {}, options = {}) {
  const {
    stopOnError = true,
    collectMetrics = true,
    timeoutMs = null
  } = options;

  const logger = deps.logger || DEFAULT_LOGGER;
  const metrics = deps.metrics || null;
  
  const pipelineStart = Date.now();
  const stepResults = [];
  
  // Clone context to avoid mutations affecting caller
  const runCtx = {
    ...ctx,
    results: ctx.results ? { ...ctx.results } : {}
  };

  let abortedAt = null;
  let pipelineError = null;

  // Timeout handling
  let timeoutHandle = null;
  let timedOut = false;
  
  const timeoutPromise = timeoutMs
    ? new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
          timedOut = true;
          reject(new Error(`Pipeline timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      })
    : null;

  try {
    for (let i = 0; i < steps.length; i++) {
      if (timedOut) break;

      const step = steps[i];
      const stepId = step.id || `step-${i}`;
      const stepLabel = step.label || stepId;

      // Check if step should run
      if (typeof step.shouldRun === 'function') {
        try {
          if (!step.shouldRun(runCtx)) {
            logger.debug?.(`Skipping step: ${stepLabel} (shouldRun=false)`);
            stepResults.push({
              stepId,
              ok: true,
              skipped: true,
              durationMs: 0
            });
            continue;
          }
        } catch (predicateError) {
          logger.warn(`Step ${stepLabel} shouldRun predicate threw: ${predicateError.message}`);
          // Treat predicate error as "should not run"
          stepResults.push({
            stepId,
            ok: true,
            skipped: true,
            skipReason: 'predicate-error',
            durationMs: 0
          });
          continue;
        }
      }

      const stepStart = Date.now();
      logger.debug?.(`Executing step: ${stepLabel}`);

      try {
        // Execute step (may be sync or async)
        const executePromise = Promise.resolve(step.execute(runCtx, deps));
        
        const result = timeoutPromise
          ? await Promise.race([executePromise, timeoutPromise])
          : await executePromise;

        const stepDuration = Date.now() - stepStart;

        if (result && result.ok) {
          // Success - store result value if provided
          if (result.value !== undefined) {
            runCtx.results[stepId] = result.value;
            // If value is an object, merge it into runCtx for subsequent steps
            // This enables context accumulation across the pipeline
            if (typeof result.value === 'object' && result.value !== null) {
              Object.assign(runCtx, result.value);
            }
          }
          
          stepResults.push({
            stepId,
            ok: true,
            durationMs: stepDuration,
            result
          });

          if (collectMetrics && metrics?.recordStepDuration) {
            metrics.recordStepDuration(stepId, stepDuration, 'success');
          }
        } else {
          // Failure
          const reason = result?.reason || result?.err?.message || 'Unknown error';
          
          stepResults.push({
            stepId,
            ok: false,
            durationMs: stepDuration,
            result,
            error: reason
          });

          if (collectMetrics && metrics?.recordStepDuration) {
            metrics.recordStepDuration(stepId, stepDuration, 'failure');
          }

          if (step.optional) {
            logger.warn(`Optional step ${stepLabel} failed: ${reason}`);
          } else if (stopOnError) {
            logger.error(`Pipeline aborted at ${stepLabel}: ${reason}`);
            abortedAt = stepId;
            pipelineError = result?.err || new Error(reason);
            break;
          } else {
            logger.warn(`Step ${stepLabel} failed (continuing): ${reason}`);
          }
        }
      } catch (stepError) {
        const stepDuration = Date.now() - stepStart;
        const errorMessage = stepError?.message || String(stepError);
        
        stepResults.push({
          stepId,
          ok: false,
          durationMs: stepDuration,
          error: errorMessage,
          exception: true
        });

        if (collectMetrics && metrics?.recordStepDuration) {
          metrics.recordStepDuration(stepId, stepDuration, 'exception');
        }

        if (step.optional) {
          logger.warn(`Optional step ${stepLabel} threw: ${errorMessage}`);
        } else if (stopOnError) {
          logger.error(`Pipeline aborted at ${stepLabel}: ${errorMessage}`);
          abortedAt = stepId;
          pipelineError = stepError;
          break;
        } else {
          logger.warn(`Step ${stepLabel} threw (continuing): ${errorMessage}`);
        }
      }
    }
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }

  const totalDuration = Date.now() - pipelineStart;

  if (collectMetrics && metrics?.recordPipelineDuration) {
    metrics.recordPipelineDuration(totalDuration, abortedAt ? 'aborted' : 'completed');
  }

  return {
    ok: !abortedAt && !timedOut,
    ctx: runCtx,
    stepResults,
    durationMs: totalDuration,
    abortedAt: abortedAt || (timedOut ? 'timeout' : undefined),
    err: pipelineError || (timedOut ? new Error('Pipeline timeout') : undefined)
  };
}

/**
 * Create a step definition
 * 
 * @param {string} id - Step ID
 * @param {Function} execute - Step execution function
 * @param {Object} [options] - Step options
 * @returns {PipelineStep}
 */
function createStep(id, execute, options = {}) {
  return {
    id,
    execute,
    label: options.label || id,
    optional: options.optional || false,
    shouldRun: options.shouldRun || null
  };
}

/**
 * Compose multiple pipelines into one
 * 
 * @param {...PipelineStep[]} pipelines - Pipelines to compose
 * @returns {PipelineStep[]}
 */
function composePipelines(...pipelines) {
  return pipelines.flat();
}

module.exports = {
  runPipeline,
  createStep,
  composePipelines
};
