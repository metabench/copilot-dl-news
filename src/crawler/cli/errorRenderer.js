'use strict';

function renderCliError(error, {
  stderr = console.error,
  fallbackMessage = 'News crawl CLI failed',
  prefix,
  showStack
} = {}) {
  const baseMessage = error && error.message ? error.message : fallbackMessage;
  const formattedMessage = prefix ? `${prefix}: ${baseMessage}` : baseMessage;
  stderr(formattedMessage);

  if (error && error.configPath) {
    stderr(`Config file: ${error.configPath}`);
  }

  const shouldShowStack = showStack !== undefined
    ? Boolean(showStack)
    : Boolean(error && error.showStack);
  if (shouldShowStack && error && error.stack) {
    stderr(error.stack);
  }
}

module.exports = {
  renderCliError
};
