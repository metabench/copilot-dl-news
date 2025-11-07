'use strict';

const IMPLEMENTATIONS = {
  'v1:jsgui3': {
    version: 'v1',
    framework: 'jsgui3',
    createServer: require('./v1/jsgui3/server').createServer
  },
  'v1:express': {
    version: 'v1',
    framework: 'express',
    createServer: require('./v1/express/server').createServer
  }
};

const crawlService = require('./core/crawlService');

const AVAILABLE_IMPLEMENTATIONS = Object.freeze(
  Object.values(IMPLEMENTATIONS).map((entry) => ({
    version: entry.version,
    framework: entry.framework
  }))
);

function createCrawlApiServer(options = {}) {
  const { version = 'v1', framework = 'jsgui3' } = options;
  const key = `${version}:${framework}`;
  const implementation = IMPLEMENTATIONS[key];

  if (!implementation) {
    const available = AVAILABLE_IMPLEMENTATIONS.map((entry) => `${entry.version}/${entry.framework}`)
      .sort()
      .join(', ');
    throw new Error(
      `Unsupported crawl API server implementation "${framework}" for version "${version}". ` +
        `Available combinations: ${available}`
    );
  }

  return implementation.createServer({
    ...options,
    version: implementation.version,
    framework: implementation.framework
  });
}

module.exports = {
  createCrawlApiServer,
  AVAILABLE_IMPLEMENTATIONS,
  ...crawlService
};
