'use strict';

const EventEmitter = require('events');

function createServer(options = {}) {
  const { logger = console } = options;
  const state = {
    started: false,
    events: new EventEmitter()
  };

  return {
    framework: 'jsgui3',
    version: options.version || 'v1',
    state,
    async start() {
      if (state.started) {
        throw new Error('jsgui3 crawl API server already started.');
      }
      state.started = true;
      if (logger && typeof logger.warn === 'function') {
        logger.warn(
          'jsgui3 crawl API server is currently a stub implementation. ' +
            'Use the Express variant until the jsgui3-server integration lands.'
        );
      }
      return { status: 'stub' };
    },
    async stop() {
      state.started = false;
      state.events.removeAllListeners();
    }
  };
}

module.exports = {
  createServer
};
