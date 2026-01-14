#!/usr/bin/env node

/*
  analyse-pages.js (refactored)
  - Orchestrates analysis for pages stored in the DB
  - Delegates to modular analyzers for places, hubs, and deep insights
*/

const path = require('path');
const { findProjectRoot } = require('../shared/utils/project-root');
const { analysePages } = require('./analyse-pages-core');
const { runAnalysisPostProcessing } = require('./analyze-post-run');

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

function getFlag(name, fallback = false) {
  if (process.argv.includes(`--${name}`)) return true;
  if (process.argv.includes(`--no-${name}`)) return false;
  const entry = process.argv.find(value => value.startsWith(`--${name}=`));
  if (!entry) return fallback;
  const value = entry.split('=')[1];
  if (value === undefined) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

async function main() {
  const dbPath = getArg('db', path.join(findProjectRoot(__dirname), 'data', 'news.db'));
  const targetVersion = Number(getArg('analysis-version', 1));
  const limit = Number(getArg('limit', 10000));
  const verbose = Boolean(getArg('verbose', false));
  const dryRun = getFlag('dry-run', false);
  const listHubs = getFlag('list', false);
  const includeEvidence = getFlag('include-evidence', false);
  const listLimitRaw = getArg('list-limit', listHubs ? 50 : 0);
  const listLimit = Number.isFinite(Number(listLimitRaw)) ? Number(listLimitRaw) : (listHubs ? 50 : 0);

  const summary = await analysePages({
    dbPath,
    analysisVersion: targetVersion,
    limit,
    verbose,
    dryRun,
    collectHubSummary: listHubs,
    hubSummaryLimit: listLimit,
    includeHubEvidence: includeEvidence,
    onProgress(progress) {
      try {
        console.log(JSON.stringify({ event: 'progress', ...progress }));
      } catch (_) {
        // ignore console failures
      }
    }
  });

  if (!dryRun) {
    try {
      const postRunResult = await runAnalysisPostProcessing({
        dbPath,
        summary,
        logger: console
      });
      if (verbose && postRunResult?.payload) {
        console.log(JSON.stringify({ event: 'post-run', payload: postRunResult.payload }));
      }
    } catch (error) {
      console.warn('[analyse-pages] Warning: post-run processing failed:', error.message || error);
    }
  }

  if (listHubs) {
    const assignments = Array.isArray(summary?.hubAssignments) ? summary.hubAssignments : [];
    if (!assignments.length) {
      console.log('No hub assignments detected.');
    } else {
      const limited = listLimit > 0 ? assignments.slice(0, listLimit) : assignments;
      console.log(`Hub assignments (${limited.length}${listLimit > 0 && assignments.length > listLimit ? ` of ${assignments.length}` : ''}):`);
      for (const entry of limited) {
        const action = entry.action === 'update' ? 'update' : 'insert';
        const topicPart = entry.topic_slug ? ` via ${entry.topic_slug}` : '';
        console.log(` - [${action}] ${entry.place_slug || '<unknown>'}@${entry.host}${topicPart} → ${entry.url}`);
      }
      if (listLimit > 0 && assignments.length > listLimit) {
        console.log(`… ${assignments.length - listLimit} more assignment(s) not shown (use --list-limit to adjust).`);
      }
    }
  }

  console.log(JSON.stringify(summary));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
