#!/usr/bin/env node

/*
  analyse-pages.js (refactored)
  - Orchestrates analysis for pages stored in the DB
  - Delegates to modular analyzers for places, hubs, and deep insights
*/

const path = require('path');
const { findProjectRoot } = require('../utils/project-root');
const { analysePages } = require('./analyse-pages-core');

function getArg(name, fallback) {
  const entry = process.argv.find(value => value.startsWith(`--${name}=`));
  if (!entry) return fallback;
  const value = entry.split('=')[1];
  if (value === undefined) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? value : numeric;
}

async function main() {
  const dbPath = getArg('db', path.join(findProjectRoot(__dirname), 'data', 'news.db'));
  const targetVersion = Number(getArg('analysis-version', 1));
  const limit = Number(getArg('limit', 10000));
  const verbose = Boolean(getArg('verbose', false));

  const summary = await analysePages({
    dbPath,
    analysisVersion: targetVersion,
    limit,
    verbose,
    onProgress(progress) {
      try {
        console.log(JSON.stringify({ event: 'progress', ...progress }));
      } catch (_) {
        // ignore console failures
      }
    }
  });

  console.log(JSON.stringify(summary));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
