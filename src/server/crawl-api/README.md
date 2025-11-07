# Crawl API Server Layout

This directory hosts the crawl API service implementations. Each version lives under a numbered folder (for example `v1/`), and each version exposes one or more framework-specific servers (such as `jsgui3/` or `express/`).

```
src/server/crawl-api/
  index.js                # Shared factory that selects the desired implementation
  README.md               # You are here
  v1/
    express/              # Express-based implementation (baseline)
    jsgui3/               # jsgui3-server implementation (stub until wired up)
```

Consumers instantiate servers through the factory:

```js
const { createCrawlApiServer } = require('../../src/server/crawl-api');
const server = createCrawlApiServer({ version: 'v1', framework: 'express' });
await server.start();
```

By keeping each implementation in its own folder we can iterate on multiple frameworks in parallel (for example, a jsgui3-server variant and an Express fallback) without code paths colliding. Versioning also lets us trial breaking changes behind explicit directories instead of sprinkling conditionals throughout the code.
