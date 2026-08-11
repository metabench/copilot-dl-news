'use strict';

/**
 * delegationRecorder — preload (`node -r`) that records which files inside the
 * extracted engine package are ACTUALLY LOADED by a process.
 *
 * WHY. The extraction moved ~200 files from src/core/crawler into
 * news-crawler-itself. Structural fingerprints proved the surfaces matched and
 * unit suites proved the pieces behave — but neither proves the running crawler
 * reaches the moved code rather than some surviving copy or fallback. The
 * 2026-08-11 fetch-pipeline defect is the cautionary case: the require RESOLVED,
 * every suite was green, and `container.get('fetchPipeline')` still failed
 * outright for seven days.
 *
 * So this hooks Module._load and writes, on exit, the set of package files that
 * were really executed during a crawl. Delegation stops being an assumption.
 *
 * Usage:
 *   DELEGATION_RECORD=<out.json> node -r tests/helpers/delegationRecorder.js <script>
 */

const Module = require('module');
const fs = require('fs');
const path = require('path');

const OUT = process.env.DELEGATION_RECORD;
const PKG = 'news-crawler-itself';

if (OUT) {
  const loaded = new Set();
  const origLoad = Module._load;

  Module._load = function recordingLoad(request, parent, isMain) {
    const exports = origLoad.apply(this, arguments);
    try {
      const resolved = Module._resolveFilename(request, parent, isMain);
      const norm = String(resolved).replace(/\\/g, '/');
      // Only the package itself, and never its node_modules — a nested
      // dependency is not evidence that OUR delegated code ran.
      const i = norm.lastIndexOf(`/${PKG}/`);
      if (i >= 0 && !norm.slice(i).includes('/node_modules/')) {
        loaded.add(norm.slice(i + 1));
      }
    } catch (_) {
      // Reviewed swallow: a request we cannot resolve contributes no evidence,
      // and throwing here would break the process being measured.
    }
    return exports;
  };

  const flush = () => {
    try {
      fs.mkdirSync(path.dirname(OUT), { recursive: true });
      fs.writeFileSync(OUT, JSON.stringify([...loaded].sort(), null, 1));
    } catch (_) {
      // Reviewed swallow: the test asserts on the file's contents, so a failure
      // to write surfaces there as a missing/empty record rather than silently.
    }
  };
  process.on('exit', flush);
  // A crawl killed by its own timeout must still leave its evidence behind.
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.on(sig, () => { flush(); process.exit(0); });
  }
}

module.exports = { PKG };
