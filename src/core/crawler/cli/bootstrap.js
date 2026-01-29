const {
  setVerboseMode
} = require('./progressReporter');
const {
  createCliConsoleInterceptor
} = require('./progressAdapter');

/**
 * Configure console output for the legacy crawl CLI.
 * Applies verbose mode settings, installs console interceptors, and returns a
 * teardown function that restores the original console methods.
 *
 * @param {Object} options
 * @param {string[]} options.args - Raw CLI arguments
 * @param {import('./progressReporter').CliLogger} options.log - Shared CLI logger
 * @returns {{ verboseModeEnabled: boolean, restoreConsole: () => void }}
 */
function setupLegacyCliEnvironment({ args, log }) {
  if (!Array.isArray(args)) {
    throw new TypeError('setupLegacyCliEnvironment expects args to be an array');
  }
  if (!log || typeof log !== 'object') {
    throw new TypeError('setupLegacyCliEnvironment requires a logger instance');
  }

  const verboseModeEnabled = args.includes('--verbose');
  setVerboseMode(verboseModeEnabled);
  // Preserve legacy global for gazetteer helpers that still read this flag.
  global.__COPILOT_GAZETTEER_VERBOSE = verboseModeEnabled;

  const { restore: restoreConsoleOverrides } = createCliConsoleInterceptor({ log });

  const restoreConsole = () => {
    restoreConsoleOverrides();
    global.__COPILOT_GAZETTEER_VERBOSE = undefined;
    setVerboseMode(false);
  };

  return {
    verboseModeEnabled,
    restoreConsole
  };
}

module.exports = {
  setupLegacyCliEnvironment
};
