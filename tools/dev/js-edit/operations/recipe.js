const path = require('path');
const OperationDispatcher = require('../recipes/OperationDispatcher');
const RecipeEngine = require('../recipes/RecipeEngine');
const { outputJson } = require('../shared/io');

/**
 * Handle recipe mode execution
 * Loads a recipe JSON file and executes multi-step refactoring workflow
 * @param {Object} options - CLI options including recipe path and params
 * @param {Object} fmt - CliFormatter instance
 */
async function handleRecipeMode(options, fmt) {
  try {
    const recipePath = path.isAbsolute(options.recipe)
      ? options.recipe
      : path.resolve(process.cwd(), options.recipe);

    // Create operation dispatcher
    const dispatcher = new OperationDispatcher({
      logger: options.verbose ? console.log : () => {},
      verbose: options.verbose || false
    });

    const engine = new RecipeEngine(recipePath, {
      dispatcher,
      verbose: options.verbose,
      dryRun: !options.fix
    });

    await engine.load();
    const recipeDefinition = engine.recipe || {};

    // Parse --param arguments into parameter overrides
    const paramOverrides = {};
    const cliParams = Array.isArray(options.param)
      ? options.param
      : (typeof options.param === 'string' ? [options.param] : []);

    cliParams.forEach((param) => {
      const [rawKey, rawValue] = param.split('=', 2);
      if (!rawKey || rawValue === undefined) {
        return;
      }

      const key = rawKey.trim();
      let value = rawValue.trim();
      const quoted = (value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith('\'') && value.endsWith('\''));
      if (quoted && value.length >= 2) {
        value = value.slice(1, -1);
      }

      if (key) {
        paramOverrides[key] = value;
      }
    });

    await engine.validate();

    if (!options.json) {
      console.log('Recipe validated successfully');

      fmt.header('Recipe Execution');
      const recipeName = recipeDefinition.name || path.basename(recipePath);
      const stepCount = Array.isArray(recipeDefinition.steps) ? recipeDefinition.steps.length : 0;
      fmt.stat('Recipe', recipeName);
      fmt.stat('Steps', stepCount, 'number');
      console.log();
    }

    await engine.execute(Object.keys(paramOverrides).length > 0 ? { params: paramOverrides } : {});
    const baseResult = engine.getResults();
    const result = {
      ...baseResult,
      recipeFile: recipePath,
      builtInVariables: { ...engine.builtInVariables },
      parameters: engine.manifest?.parameters || {}
    };

    // Print results
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printRecipeResult(result, fmt);
    }

    if (result.status === 'failed') {
      process.exitCode = 1;
    }
  } catch (error) {
    fmt.error(`Recipe execution failed: ${error.message}`);
    if (error.stack && options.verbose) {
      console.error(error.stack);
    }
    process.exitCode = 1;
  }
}

/**
 * Print recipe execution results in human-readable format
 * @param {Object} result - Result from engine.execute()
 * @param {Object} fmt - CliFormatter instance
 */
function printRecipeResult(result, fmt) {
  const stepResults = result.stepResults || [];
  const isChinese = fmt.getLanguageMode() === 'zh';

  fmt.stat('Status', result.status === 'success' ? fmt.COLORS.success('SUCCESS') : fmt.COLORS.error('FAILED'));
  fmt.stat('Total Duration', `${result.totalDuration}ms`, 'number');
  fmt.stat('Steps Executed', stepResults.length, 'number');

  if (result.errorCount > 0) {
    fmt.stat('Errors', fmt.COLORS.error(result.errorCount), 'number');
  }

  console.log();

  // Show per-step results
  if (stepResults.length > 0) {
    const stepsLabel = isChinese ? '步骤结果' : 'Step Results';
    fmt.header(stepsLabel);
    stepResults.forEach((step, idx) => {
      const status = step.status === 'success'
        ? fmt.COLORS.success('✓')
        : step.status === 'skipped'
          ? fmt.COLORS.muted('○')
          : fmt.COLORS.error('✗');
      const stepNum = fmt.COLORS.muted(`[${idx + 1}]`);
      const stepName = step.stepName || 'unnamed';
      const duration = step.duration ? ` (${step.duration}ms)` : '';

      console.log(`  ${stepNum} ${status} ${stepName}${duration}`);

      if (step.error) {
        fmt.warn(`     Error: ${step.error}`);
      }
    });
  }

  fmt.footer();
}

module.exports = {
  handleRecipeMode,
  printRecipeResult
};
