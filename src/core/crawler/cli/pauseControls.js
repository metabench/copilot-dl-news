'use strict';

const readline = require('readline');

function createPauseResumeControls({ crawler, stdin, logger } = {}) {
  let interfaceRef = null;

  const handleLine = (line) => {
    const command = String(line || '').trim().toUpperCase();
    if (!crawler) {
      return;
    }
    if (command === 'PAUSE' && typeof crawler.pause === 'function') {
      crawler.pause();
    } else if (command === 'RESUME' && typeof crawler.resume === 'function') {
      crawler.resume();
    }
  };

  const attach = ({ enabled = true, explicit = false } = {}) => {
    if (!enabled) {
      return false;
    }
    if (!stdin || typeof stdin.on !== 'function') {
      return false;
    }
    if (interfaceRef) {
      return true;
    }

    const sourceIsTTY = typeof stdin.isTTY === 'boolean'
      ? stdin.isTTY
      : Boolean(process.stdin && process.stdin.isTTY);

    if (!explicit && !sourceIsTTY) {
      if (logger && typeof logger.debug === 'function') {
        logger.debug('Skipping interactive controls: stdin is not a TTY.');
      }
      return false;
    }

    try {
      interfaceRef = readline.createInterface({
        input: stdin,
        crlfDelay: Infinity
      });
      interfaceRef.on('line', handleLine);
      interfaceRef.on('close', () => {
        if (interfaceRef) {
          interfaceRef.removeListener('line', handleLine);
          interfaceRef = null;
        }
      });
      return true;
    } catch (error) {
      if (logger && typeof logger.debug === 'function') {
        logger.debug(`Failed to enable interactive controls: ${error?.message || error}`);
      }
      interfaceRef = null;
      return false;
    }
  };

  const teardown = () => {
    if (!interfaceRef) {
      return;
    }
    try {
      interfaceRef.removeListener('line', handleLine);
      interfaceRef.close();
    } catch (_) {
      // ignore teardown errors
    }
    interfaceRef = null;
  };

  return {
    attach,
    teardown,
    isAttached: () => Boolean(interfaceRef)
  };
}

module.exports = {
  createPauseResumeControls
};
