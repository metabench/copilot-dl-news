/**
 * RecipeEngine — Parses, validates, and executes refactor recipes
 * 
 * Recipes are declarative JSON/YAML files that chain multiple js-edit and js-scan
 * operations into reusable workflows. Each step can feed its output to the next step,
 * enabling complex refactorings without manual orchestration.
 * 
 * @module tools/dev/js-edit/recipes/RecipeEngine
 */

const fs = require('fs');
const path = require('path');

/**
 * RecipeEngine — Main orchestrator for recipe parsing and execution
 */
class RecipeEngine {
  /**
   * @param {string} recipeFile - Path to recipe JSON/YAML file
   * @param {Object} options - Configuration options
   * @param {OperationDispatcher} options.dispatcher - Routes operations to js-scan/js-edit
   * @param {Object} options.builtInVariables - Pre-set variables (NOW, BRANCH, WORKSPACE, etc.)
   * @param {boolean} options.dryRun - Preview changes without applying
   * @param {Function} options.logger - Logging function (default: console.log)
   */
  constructor(recipeFile, options = {}) {
    this.recipeFile = recipeFile;
    this.dispatcher = options.dispatcher;
    this.builtInVariables = options.builtInVariables || this._createBuiltInVariables();
    this.dryRun = options.dryRun || false;
    this.logger = options.logger || console.log;
    this.verbose = options.verbose || false;

    this.recipe = null;
    this.stepResults = [];
    this.errors = [];
    this.manifest = {
      recipeName: '',
      recipeFile: recipeFile,
      startTime: null,
      endTime: null,
      steps: [],
      totalDuration: 0,
      status: 'pending',
      errorCount: 0
    };
  }

  /**
   * Create built-in variables available to all recipes
   */
  _createBuiltInVariables() {
    return {
      NOW: new Date().toISOString(),
      TODAY: new Date().toISOString().split('T')[0],
      WORKSPACE: process.cwd(),
      BRANCH: this._getCurrentGitBranch() || 'unknown'
    };
  }

  /**
   * Get current git branch (best effort)
   */
  _getCurrentGitBranch() {
    try {
      const { execSync } = require('child_process');
      return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
    } catch (e) {
      return null;
    }
  }

  /**
   * Load and parse recipe file
   */
  async load() {
    try {
      if (!fs.existsSync(this.recipeFile)) {
        throw new Error(`Recipe file not found: ${this.recipeFile}`);
      }

      const content = fs.readFileSync(this.recipeFile, 'utf-8');
      const ext = path.extname(this.recipeFile).toLowerCase();

      if (ext === '.json') {
        this.recipe = JSON.parse(content);
      } else if (ext === '.yaml' || ext === '.yml') {
        // TODO: Add YAML parsing support (optional dependency)
        throw new Error('YAML recipes not yet supported');
      } else {
        throw new Error(`Unsupported recipe format: ${ext}`);
      }

      this.manifest.recipeName = this.recipe.name || path.basename(this.recipeFile);
      return this;
    } catch (err) {
      this.errors.push(`Failed to load recipe: ${err.message}`);
      throw err;
    }
  }

  /**
   * Validate recipe structure and preconditions
   */
  async validate() {
    const errors = [];

    if (!this.recipe) {
      throw new Error('Recipe not loaded');
    }

    // Check required fields
    if (!this.recipe.version) errors.push('Recipe missing required "version" field');
    if (!this.recipe.name) errors.push('Recipe missing required "name" field');
    if (!Array.isArray(this.recipe.steps)) errors.push('Recipe missing required "steps" array');

    // Validate steps
    if (Array.isArray(this.recipe.steps)) {
      this.recipe.steps.forEach((step, idx) => {
        if (!step.name) errors.push(`Step ${idx} missing required "name" field`);
        if (!step.operation) errors.push(`Step ${idx} missing required "operation" field`);
      });
    }

    // Run precondition checks if specified
    if (this.recipe.validation) {
      const validation = this.recipe.validation;

      if (validation.checkFiles && Array.isArray(validation.checkFiles)) {
        for (const file of validation.checkFiles) {
          if (!fs.existsSync(file)) {
            errors.push(`Validation failed: file not found: ${file}`);
          }
        }
      }

      if (validation.checkDirExists && Array.isArray(validation.checkDirExists)) {
        for (const dir of validation.checkDirExists) {
          if (!fs.existsSync(dir)) {
            errors.push(`Validation failed: directory not found: ${dir}`);
          }
        }
      }
    }

    if (errors.length > 0) {
      this.errors.push(...errors);
      throw new Error(`Recipe validation failed:\n${errors.join('\n')}`);
    }

    return this;
  }

  /**
   * Execute recipe with provided parameters
   * @param {Object} params - User-supplied parameters overriding recipe defaults
   */
    async execute(params = {}) {
    this.manifest.startTime = new Date();

    try {
      if (!this.recipe) {
        throw new Error('Recipe not loaded. Call load() first.');
      }

      if (params && Object.prototype.hasOwnProperty.call(params, 'dryRun')) {
        this.dryRun = Boolean(params.dryRun);
      }

      // Merge parameters with defaults
      const resolvedParams = this._resolveParameters(params);
      this.manifest.dryRun = this.dryRun;

      if (this.verbose) {
        this.logger(`[Recipe] Starting: ${this.recipe.name}`);
        this.logger(`[Recipe] Parameters: ${JSON.stringify(resolvedParams, null, 2)}`);
      }

      // Execute each step
      for (let i = 0; i < this.recipe.steps.length; i++) {
        const step = this.recipe.steps[i];
        const stepStartTime = Date.now();
        const stepContext = this._buildStepContext();

        if (this.verbose) {
          this.logger(`[Step ${i + 1}/${this.recipe.steps.length}] ${step.name}`);
        }

        try {
          // Evaluate step condition if present
          if (step.condition) {
            const conditionEvaluator = require('./ConditionEvaluator');
            let conditionExpr = step.condition;
            let evaluationTarget = conditionExpr;

            if (typeof conditionExpr === 'string') {
              const trimmed = conditionExpr.trim();
              const fullTemplateMatch = trimmed.match(/^\$\{([\s\S]+)\}$/);

              if (fullTemplateMatch) {
                evaluationTarget = fullTemplateMatch[1];
              } else if (trimmed.includes('${')) {
                const VariableResolver = require('./VariableResolver');
                const resolver = new VariableResolver(resolvedParams, stepContext);
                evaluationTarget = resolver.resolve(conditionExpr);
              }
            }

            const conditionContext = { ...resolvedParams, ...stepContext };
            let shouldRun;

            if (typeof evaluationTarget === 'boolean') {
              shouldRun = evaluationTarget;
            } else if (typeof evaluationTarget === 'number') {
              shouldRun = evaluationTarget !== 0;
            } else {
              shouldRun = conditionEvaluator.evaluate(String(evaluationTarget), conditionContext);
            }

            if (!shouldRun) {
              if (this.verbose) {
                this.logger(`[Step ${i + 1}] Skipped (condition false)`);
              }

              const skipDuration = Date.now() - stepStartTime;
              this.stepResults.push({
                name: step.name,
                stepName: step.name,
                operation: step.operation,
                status: 'skipped',
                skipped: true,
                executed: false,
                condition: step.condition,
                duration: skipDuration
              });
              continue;
            }
          }

          // Handle forEach loops
          if (step.forEach) {
            await this._executeForEachStep(step, resolvedParams);
          } else {
            // Execute single step
            await this._executeSingleStep(step, resolvedParams);
          }

          const stepDuration = Date.now() - stepStartTime;
          const stepResult = this.stepResults[this.stepResults.length - 1];
          if (stepResult) {
            stepResult.duration = stepDuration;
            if (typeof stepResult.executed === 'undefined') {
              stepResult.executed = true;
            }
          }

          if (this.verbose) {
            this.logger(`[Step ${i + 1}] Complete (${stepDuration}ms)`);
          }
        } catch (error) {
          const stepDuration = Date.now() - stepStartTime;

          if (step.onError === 'abort') {
            this.errors.push(`Step ${i + 1} ("${step.name}") failed: ${error.message}`);
            this.manifest.status = 'failed';
            throw error;
          } else if (step.onError === 'continue') {
            if (this.verbose) {
              this.logger(`[Step ${i + 1}] Error (continuing): ${error.message}`);
            }
            this.errors.push(`Step ${i + 1} ("${step.name}") error (continued): ${error.message}`);
            this.stepResults.push({
              name: step.name,
              stepName: step.name,
              operation: step.operation,
              status: 'error',
              error: error.message,
              duration: stepDuration,
              executed: false
            });
          } else if (step.onError === 'retry') {
            // Retry logic (simplified - one retry)
            if (this.verbose) {
              this.logger(`[Step ${i + 1}] Retrying after error...`);
            }
            try {
              await this._executeSingleStep(step, resolvedParams);
              if (this.verbose) {
                this.logger(`[Step ${i + 1}] Retry succeeded`);
              }
              const retryResult = this.stepResults[this.stepResults.length - 1];
              if (retryResult) {
                retryResult.duration = Date.now() - stepStartTime;
                if (typeof retryResult.executed === 'undefined') {
                  retryResult.executed = true;
                }
              }
            } catch (retryError) {
              this.errors.push(`Step ${i + 1} ("${step.name}") failed after retry: ${retryError.message}`);
              this.manifest.status = 'failed';
              throw retryError;
            }
          } else {
            // Default: abort
            this.errors.push(`Step ${i + 1} ("${step.name}") failed: ${error.message}`);
            this.manifest.status = 'failed';
            throw error;
          }
        }
      }

      this.manifest.status = 'success';
      return this;
    } catch (error) {
      this.manifest.status = 'failed';
      this.manifest.errorCount = this.errors.length;
      throw error;
    } finally {
      this.manifest.endTime = new Date();
      this.manifest.totalDuration = this.manifest.endTime - this.manifest.startTime;
      this.manifest.steps = this.stepResults;
    }
  }




  /**
   * Execute recipe in dry-run mode (no actual changes)
   */
  async dryRun(params = {}) {
    const originalDryRun = this.dryRun;
    this.dryRun = true;
    try {
      return await this.execute(params);
    } finally {
      this.dryRun = originalDryRun;
    }
  }

  /**
   * Execute a single step
   */
    async _executeSingleStep(step, params) {
    if (!this.dispatcher) {
      throw new Error('No operation dispatcher configured');
    }

    // Resolve step variables
    const VariableResolver = require('./VariableResolver');
    const resolver = new VariableResolver(params, this._buildStepContext());

    const resolvedStep = {
      ...step,
      ...Object.keys(step).reduce((acc, key) => {
        if (key.startsWith('$') || key === 'condition') return acc; // Skip variables and raw conditions
        const value = step[key];
        if (typeof value === 'string' && value.includes('${')) {
          acc[key] = resolver.resolve(value);
        } else if (typeof value === 'object' && value !== null) {
          acc[key] = this._resolveObjectVariables(value, resolver);
        } else {
          acc[key] = value;
        }
        return acc;
      }, {})
    };

    // Dispatch operation
    const result = await this.dispatcher.dispatch(resolvedStep, {
      dryRun: this.dryRun,
      verbose: this.verbose
    });

    // Store result for next steps
    if (resolvedStep.emit) {
      params[resolvedStep.emit] = result;
    }

    const stepRecord = {
      name: step.name,
      stepName: step.name,
      operation: step.operation,
      status: result && result.error ? 'error' : 'success',
      results: result,
      emit: resolvedStep.emit
    };

    if (this.dryRun && typeof result !== 'undefined') {
      stepRecord.preview = result;
    }

    this.stepResults.push(stepRecord);

    return result;
  }


  /**
   * Execute a forEach loop step
   */
  async _executeForEachStep(step, params) {
    const VariableResolver = require('./VariableResolver');
    const resolver = new VariableResolver(params, this._buildStepContext());

    // Resolve the array to iterate over
    const arrayPath = step.forEach;
    const array = resolver.resolve(arrayPath);

    if (!Array.isArray(array)) {
      throw new Error(`forEach target is not an array: ${arrayPath}`);
    }

    const itemName = step.item || 'item';
    const results = [];

    for (let i = 0; i < array.length; i++) {
      const item = array[i];
      const loopContext = { ...params, [itemName]: item, _index: i };

      // Execute nested steps for each item
      for (const nestedStep of (step.steps || [])) {
        const nestedResolver = new VariableResolver(loopContext, this._buildStepContext());

        // Resolve nested step variables
        const resolvedNestedStep = {
          ...nestedStep,
          ...Object.keys(nestedStep).reduce((acc, key) => {
            if (key.startsWith('$')) return acc;
            const value = nestedStep[key];
            if (typeof value === 'string' && value.includes('${')) {
              acc[key] = nestedResolver.resolve(value);
            } else if (typeof value === 'object' && value !== null) {
              acc[key] = this._resolveObjectVariables(value, nestedResolver);
            } else {
              acc[key] = value;
            }
            return acc;
          }, {})
        };

        const result = await this.dispatcher.dispatch(resolvedNestedStep, {
          dryRun: this.dryRun,
          verbose: this.verbose
        });

        results.push(result);
      }
    }

    this.stepResults.push({
      stepName: step.name,
      operation: 'forEach',
      status: 'success',
      itemCount: array.length,
      results
    });
  }

  /**
   * Resolve parameters with recipe defaults
   */
  _resolveParameters(userParams) {
    const VariableResolver = require('./VariableResolver');
    const rawUserParams = userParams || {};
    const hasNestedParams = rawUserParams && typeof rawUserParams === 'object' && rawUserParams.params && typeof rawUserParams.params === 'object';
    const safeUserParams = hasNestedParams && rawUserParams.params && typeof rawUserParams.params === 'object'
      ? rawUserParams.params
      : (rawUserParams && typeof rawUserParams === 'object' ? rawUserParams : {});
    const passthroughMeta = hasNestedParams
      ? Object.keys(rawUserParams).reduce((acc, key) => {
          if (key !== 'params') {
            acc[key] = rawUserParams[key];
          }
          return acc;
        }, {})
      : {};
    const result = { ...this.builtInVariables, ...passthroughMeta };
    const parameterValues = {};
    const recipeParams = this.recipe?.parameters || {};

    Object.entries(recipeParams).forEach(([key, paramDef]) => {
      const hasUserOverride = Object.prototype.hasOwnProperty.call(safeUserParams, key);
      let value;

      if (hasUserOverride) {
        value = safeUserParams[key];
      } else if (paramDef && Object.prototype.hasOwnProperty.call(paramDef, 'default')) {
        value = paramDef.default;
      }

      if (value === undefined) {
        if (paramDef && paramDef.required) {
          throw new Error(`Required parameter missing: ${key}`);
        }
        return;
      }

      const coerced = VariableResolver.coerce(value, paramDef?.type);
      parameterValues[key] = coerced;
    });

    Object.keys(safeUserParams).forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(parameterValues, key)) {
        parameterValues[key] = safeUserParams[key];
      }
    });

    result.parameters = { ...parameterValues };
    Object.assign(result, parameterValues);

    this.manifest.parameters = { ...parameterValues };

    return result;
  }



  /**
   * Build context for current step (accumulated results from previous steps)
   */
      _buildStepContext() {
    const context = {};
    const toKey = (stepName) => {
      if (typeof stepName !== 'string') {
        return '';
      }

      const trimmed = stepName.trim();
      if (!trimmed) {
        return '';
      }

      const parts = trimmed.split(/[^a-zA-Z0-9]+/).filter(Boolean);
      if (parts.length === 0) {
        return '';
      }

      const [first, ...rest] = parts;
      const head = first.toLowerCase();
      const tail = rest.map(part => part.charAt(0).toUpperCase() + part.slice(1));

      return head + tail.join('');
    };

    for (const result of this.stepResults) {
      if (!result || typeof result !== 'object') {
        continue;
      }

      if (result.emit) {
        context[result.emit] = result.results;
      }

      if (result.stepName) {
        const key = toKey(result.stepName);
        if (key && !Object.prototype.hasOwnProperty.call(context, key)) {
          context[key] = result.results;
        }

        if (key) {
          if (!context.steps) {
            context.steps = {};
          }

          if (!Object.prototype.hasOwnProperty.call(context.steps, key)) {
            context.steps[key] = result.results;
          }
        }
      }
    }

    return context;
  }



  /**
   * Recursively resolve variables in object structures
   */
  _resolveObjectVariables(obj, resolver) {
    if (Array.isArray(obj)) {
      return obj.map(item => {
        if (typeof item === 'string' && item.includes('${')) {
          return resolver.resolve(item);
        } else if (typeof item === 'object' && item !== null) {
          return this._resolveObjectVariables(item, resolver);
        }
        return item;
      });
    }

    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string' && value.includes('${')) {
        result[key] = resolver.resolve(value);
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this._resolveObjectVariables(value, resolver);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * Get execution results
   */
  getResults() {
    return {
      recipe: this.recipe?.name,
      status: this.manifest.status,
      stepResults: this.stepResults,
      errors: this.errors,
      manifest: this.manifest,
      totalDuration: this.manifest.totalDuration
    };
  }

  /**
   * Export manifest for auditing
   */
  exportManifest() {
    return this.manifest;
  }
}

RecipeEngine.prototype.getSummary = function getSummary() {
  if (!this.manifest) {
    return 'Recipe not executed.';
  }

  const manifest = this.manifest;
  const name = manifest.recipeName || this.recipe?.name || 'Recipe';
  const status = manifest.status || 'unknown';
  const totalSteps = Array.isArray(manifest.steps) ? manifest.steps.length : 0;
  const executedSteps = Array.isArray(manifest.steps)
    ? manifest.steps.filter(step => step?.status === 'success').length
    : 0;
  const skippedSteps = Array.isArray(manifest.steps)
    ? manifest.steps.filter(step => step?.status === 'skipped').length
    : 0;
  const errorSteps = Array.isArray(manifest.steps)
    ? manifest.steps.filter(step => step?.status === 'error').length
    : 0;
  const dryRunNote = manifest.dryRun ? ' (dry run)' : '';

  const statusWord = status === 'success' ? 'completed' : status;
  const summarySegments = [];
  summarySegments.push(`${name} ${statusWord}${dryRunNote}.`);

  const detailParts = [`${totalSteps} steps`];
  if (executedSteps && executedSteps !== totalSteps) {
    detailParts.push(`${executedSteps} executed`);
  }
  if (skippedSteps) {
    detailParts.push(`${skippedSteps} skipped`);
  }
  if (errorSteps) {
    detailParts.push(`${errorSteps} errors`);
  }
  summarySegments.push(`${detailParts.join(', ')}.`);

  const formatDuration = (ms) => {
    if (!Number.isFinite(ms)) {
      return null;
    }
    if (ms < 1000) {
      return `${ms}ms`;
    }
    if (ms < 60000) {
      const seconds = ms / 1000;
      return `${seconds % 1 === 0 ? seconds.toFixed(0) : seconds.toFixed(1)}s`;
    }
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.round((ms % 60000) / 1000);
    const parts = [];
    if (minutes) {
      parts.push(`${minutes}m`);
    }
    if (seconds) {
      parts.push(`${seconds}s`);
    }
    return parts.join(' ') || `${ms}ms`;
  };

  const durationText = formatDuration(manifest.totalDuration);
  if (durationText) {
    summarySegments.push(`Duration ${durationText}.`);
  }

  if (this.errors.length) {
    const suffix = this.errors.length === 1 ? '' : 's';
    summarySegments.push(`${this.errors.length} error message${suffix} recorded.`);
  }

  return summarySegments.join(' ');
};

module.exports = RecipeEngine;
