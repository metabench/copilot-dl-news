'use strict';

/**
 * fixture-server.js — a deterministic local site for crawler performance measurement.
 *
 * WHY THIS EXISTS (2026-07-26, owner decision #3): four cycles failed to measure whether
 * raising crawl concurrency helps, because live publishers produce ~1.6x run-to-run
 * variance at IDENTICAL settings — larger than the ~1.3-2x effect being hunted. No arm
 * arrangement can beat that. This removes the variance instead of fighting it.
 *
 * Properties that make it a usable instrument:
 *  - CONTROLLABLE per-request latency (the thing concurrency overlaps) and page size.
 *  - A deterministic link graph, so every run sees exactly the same work.
 *  - It COUNTS ITS OWN REQUESTS. That counter never consults a timestamp column or the
 *    news DB, so it is structurally immune to the mixed-timestamp and attribution bugs
 *    that invalidated earlier measurements — the independent instrument the earlier
 *    cycles lacked.
 *  - No third-party traffic, so politeness/429 concerns do not apply.
 *
 * Usage (as a module):
 *   const { startFixture } = require('./fixture-server');
 *   const fx = await startFixture({ latencyMs: 120, pageBytes: 20000, pages: 400 });
 *   ... fx.url ... fx.stats() ... await fx.close();
 */

const http = require('http');

function makeHtml({ id, links, padBytes }) {
  const linkTags = links.map((n) => `<a href="/p/${n}">Story ${n}</a>`).join('\n');
  // Pad with inert text so page WEIGHT is a controlled variable. Kept outside <article>
  // so it does not distort extracted body text.
  const pad = padBytes > 0 ? `<!-- ${'x'.repeat(Math.max(0, padBytes))} -->` : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Fixture story ${id}</title>
<meta property="article:published_time" content="2026-07-26T00:00:00Z">
</head><body>
<article>
<h1>Fixture story ${id}</h1>
<p>${'Synthetic body sentence for deterministic crawl benchmarking. '.repeat(12)}</p>
</article>
<nav>${linkTags}</nav>
${pad}
</body></html>`;
}

/**
 * @param {object} opts
 * @param {number} opts.latencyMs   simulated server think-time before responding (TTFB)
 * @param {number} opts.pageBytes   approximate padding bytes per page
 * @param {number} opts.pages       size of the synthetic graph
 * @param {number} opts.linksPerPage out-degree
 */
function startFixture({ latencyMs = 100, pageBytes = 15000, pages = 500, linksPerPage = 8 } = {}) {
  let requests = 0;
  let firstAt = null;
  let lastAt = null;
  let inFlight = 0;
  let maxInFlight = 0;          // <- directly observes whether concurrency is real
  const perPath = new Map();

  const linksFor = (id) => {
    const out = [];
    for (let i = 1; i <= linksPerPage; i++) {
      const n = ((id * linksPerPage + i) % pages) + 1;
      out.push(n);
    }
    return out;
  };

  const server = http.createServer((req, res) => {
    const now = Date.now();
    requests += 1;
    if (firstAt === null) firstAt = now;
    lastAt = now;
    inFlight += 1;
    if (inFlight > maxInFlight) maxInFlight = inFlight;
    perPath.set(req.url, (perPath.get(req.url) || 0) + 1);

    const done = (status, body, type = 'text/html; charset=utf-8') => {
      // Latency is applied asynchronously so the server can hold many requests at once —
      // that overlap is exactly what concurrency is supposed to exploit.
      setTimeout(() => {
        inFlight -= 1;
        res.writeHead(status, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(body) });
        res.end(body);
      }, latencyMs);
    };

    if (req.url === '/robots.txt') return done(200, 'User-agent: *\nAllow: /\n', 'text/plain');
    if (req.url === '/favicon.ico') return done(404, 'not found', 'text/plain');
    if (req.url === '/') return done(200, makeHtml({ id: 0, links: linksFor(0), padBytes: pageBytes }));
    const m = /^\/p\/(\d+)$/.exec(req.url);
    if (m) {
      const id = Number(m[1]);
      if (id >= 1 && id <= pages) return done(200, makeHtml({ id, links: linksFor(id), padBytes: pageBytes }));
    }
    return done(404, 'not found', 'text/plain');
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        port,
        url: `http://127.0.0.1:${port}/`,
        stats() {
          return {
            requests,
            maxInFlight,
            spanMs: firstAt !== null && lastAt !== null ? (lastAt - firstAt) : 0,
            distinctPaths: perPath.size
          };
        },
        reset() { requests = 0; firstAt = null; lastAt = null; maxInFlight = 0; perPath.clear(); },
        close: () => new Promise((r) => server.close(() => r()))
      });
    });
  });
}

module.exports = { startFixture };
