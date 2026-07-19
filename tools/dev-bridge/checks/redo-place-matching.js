#!/usr/bin/env node
'use strict';

/**
 * redo-place-matching.js — re-run article→place matching via the RUNNING app.
 *
 * Why: the pre-2026-07-19 ArticlePlaceMatcher read another article's headline
 * (wrong-row join), so existing article_place_relations rows are suspect.
 * This drives the in-app 'analysis-run' background task with
 * redoPlaceMatching=true (per-article delete + re-match + persist) and shows
 * live progress; the task API + fixed matcher must be DEPLOYED (app restarted
 * after 2026-07-19) or --apply will fail its preflight.
 *
 * Safety: thin HTTP client of http://127.0.0.1:3170 — never opens the live DB
 * read-write itself (the app owns it). Read-only probes use {readonly:true}.
 * Default is REPORT mode (no writes); --apply creates + starts the task.
 *
 * Usage:
 *   node tools/dev-bridge/checks/redo-place-matching.js                 # report
 *   node tools/dev-bridge/checks/redo-place-matching.js --apply         # run
 *   node tools/dev-bridge/checks/redo-place-matching.js --apply --limit 50
 *     [--rule-level 1] [--analysis-version N] [--port 3170]
 */

const path = require('path');

const argv = process.argv.slice(2);
const hasFlag = (f) => argv.includes(f);
const getArg = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};

const APPLY = hasFlag('--apply');
const PORT = Number(getArg('--port', 3170));
const LIMIT = Number(getArg('--limit', 1000));
const RULE_LEVEL = Number(getArg('--rule-level', 1));
// --articles 67828,67830 → targeted redo (reaches old articles that
// newest-first ordering would bury behind everything fetched since).
const ARTICLE_IDS = String(getArg('--articles', ''))
  .split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = path.resolve(__dirname, '..', '..', '..');
const DB_PATH = path.join(ROOT, 'data', 'news.db');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function openReadonly() {
  const Database = require(require.resolve('better-sqlite3', {
    paths: [ROOT, path.join(ROOT, '..', 'news-crawler-db')]
  }));
  return new Database(DB_PATH, { readonly: true, fileMustExist: true });
}

function relationsSnapshot() {
  const db = openReadonly();
  try {
    const total = db.prepare('SELECT COUNT(*) c FROM article_place_relations').get().c;
    const articles = db.prepare('SELECT COUNT(DISTINCT article_id) c FROM article_place_relations').get().c;
    const range = db.prepare('SELECT MIN(created_at) mn, MAX(created_at) mx FROM article_place_relations').get();
    return { total, articles, ...range };
  } finally {
    db.close();
  }
}

function bar(percent, width = 34) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  const filled = Math.round((p / 100) * width);
  return `[${'█'.repeat(filled)}${'░'.repeat(width - filled)}] ${String(p).padStart(3)}%`;
}

async function api(pathname, options) {
  const res = await fetch(`${BASE}${pathname}`, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${options?.method || 'GET'} ${pathname} -> HTTP ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  }
  return body;
}

async function main() {
  // Preflight: app up + the redo field actually deployed (restart-gated).
  const typeInfo = await api('/api/v1/background-tasks/types/analysis-run');
  // Response shape: { success, definition: { fields: [...] } }
  const fields = typeInfo.definition?.fields || typeInfo.data?.fields || typeInfo.fields || [];
  const redoField = fields.find((f) => f.name === 'redoPlaceMatching');
  const versionField = fields.find((f) => f.name === 'analysisVersion');
  const analysisVersion = Number(getArg('--analysis-version', versionField?.default ?? 1));

  const before = relationsSnapshot();
  console.log(`[redo-place-matching] app :${PORT} OK; analysis-run task ${redoField ? 'SUPPORTS redoPlaceMatching' : 'does NOT expose redoPlaceMatching (app restart needed?)'}`);
  console.log(`[redo-place-matching] relations before: ${before.total} rows across ${before.articles} articles (${before.mn || '-'} -> ${before.mx || '-'})`);

  if (!APPLY) {
    console.log(`[redo-place-matching] REPORT mode. Would POST analysis-run {redoPlaceMatching:true, skipPages, skipDomains, skipMilestones, pageLimit:${LIMIT}, placeMatchingRuleLevel:${RULE_LEVEL}, analysisVersion:${analysisVersion}} and watch progress. Re-run with --apply.`);
    return 0;
  }
  if (!redoField) {
    console.error('[redo-place-matching] ABORT: redoPlaceMatching not in /types — deploy (restart the app) first.');
    return 2;
  }

  const created = await api('/api/v1/background-tasks', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      taskType: 'analysis-run',
      autoStart: true,
      parameters: {
        analysisVersion,
        skipPages: true,
        skipDomains: true,
        skipMilestones: true,
        redoPlaceMatching: true,
        ...(ARTICLE_IDS.length ? { redoArticleIds: ARTICLE_IDS.join(',') } : {}),
        placeMatchingRuleLevel: RULE_LEVEL,
        pageLimit: LIMIT
      }
    })
  });
  const task = created.task || created.data || created;
  console.log(`[redo-place-matching] task ${task.id} created + started`);

  const TERMINAL = new Set(['completed', 'failed', 'stopped', 'cancelled']);
  let last = '';
  for (;;) {
    await sleep(1000);
    let current;
    try {
      const body = await api(`/api/v1/background-tasks/${task.id}`);
      current = body.task || body.data || body;
    } catch (e) {
      process.stdout.write(`\n[redo-place-matching] poll error: ${e.message}\n`);
      continue;
    }
    const prog = current.progress || {};
    const line = `${bar(prog.percent)} ${current.status} ${String(prog.message || '').slice(0, 70)}`;
    if (line !== last) {
      process.stdout.write(`\r${line.padEnd(120)}`);
      last = line;
    }
    if (TERMINAL.has(current.status)) {
      process.stdout.write('\n');
      const after = relationsSnapshot();
      console.log(`[redo-place-matching] final status: ${current.status}`);
      console.log(`[redo-place-matching] relations after: ${after.total} rows across ${after.articles} articles (${after.mn || '-'} -> ${after.mx || '-'})`);
      console.log(`[redo-place-matching] delta: ${after.total - before.total} rows; verify with read-only queries, not task stats.`);
      return current.status === 'completed' ? 0 : 1;
    }
  }
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error('[redo-place-matching] FATAL:', err.message);
  process.exit(3);
});
