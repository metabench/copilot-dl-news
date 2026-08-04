#!/usr/bin/env node
'use strict';

/**
 * frontier-composition.js — a repeatable read-only health report on the crawl
 * frontier (the `urls` table), and the FIRST real consumer of the wired
 * `news-crawler-url-intelligence` module (via src/intelligence/urlIntelligence.js).
 *
 * WHY (cycle 77): the plan proposed an ADDITIVE url-intelligence "veto" to drop
 * static_asset/api_endpoint URLs from frontier SELECTION. Measuring first showed
 * that was REDUNDANT — copilot's cycle-75 hardened `isArticleShapedUrl` already
 * admits ZERO non-content (media/asset/api/nav), and `selectDueFrontier` is
 * host-scoped so cross-host junk is never selected. So the module's real leverage
 * here is OBSERVABILITY, not selection: this tool institutionalises that
 * measurement so a future cycle can (a) watch frontier health (article vs hub vs
 * junk share), (b) detect junk GROWTH (cross-host social-share links that bloat
 * the table but are never crawled), and (c) re-check the veto premise if
 * isArticleShapedUrl ever changes.
 *
 * DB safety: never opens news.db in-process — shells the sample pull through the
 * WAL-safe tools/db/timed-probe.js (LIMIT-guarded + external SIGKILL watchdog).
 *
 *   node tools/crawl/frontier-composition.js [--db data/news.db] [--sample 5000]
 *        [--json <path>]
 *
 * Exit 0 always (read-only report). Reports, per url-intelligence label: total,
 * and how many copilot `isArticleShapedUrl` currently ADMITS (the size of any
 * hypothetical selection-veto win — expected ~0 for non-content post cycle 75).
 */

const path = require('path');
const { spawnSync } = require('child_process');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
const { ArticleSignalsService } = require('news-crawler-itself/signals');
const { createUrlClassifier } = require(path.join(ROOT, 'src', 'intelligence', 'urlIntelligence.js'));

const argv = process.argv.slice(2);
const getArg = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};
const DB = getArg('--db', 'data/news.db');
const SAMPLE = Math.max(100, Math.min(20000, Number(getArg('--sample', 5000))));
const JSON_OUT = getArg('--json', null);

// Cross-host social-share / tracking hosts a per-host frontier will NEVER crawl,
// but that discovery still stores as frontier rows (dead weight). Counted whole so
// junk GROWTH is visible cycle-over-cycle.
const SHARE_HOSTS = ['api.whatsapp.com', 'wa.me', 'twitter.com', 'x.com', 'www.facebook.com',
  't.co', 'www.linkedin.com', 'www.reddit.com', 'telegram.me', 't.me', 'pinterest.com'];

function probe(sql) {
  const res = spawnSync(process.execPath, [
    path.join(ROOT, 'tools', 'db', 'timed-probe.js'),
    '--db', DB, '--print-all', '--sql', sql, '--timeout-ms', '30000',
  ], { cwd: ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 128 * 1024 * 1024 });
  const rows = [];
  for (const line of (res.stdout || '').split(/\r?\n/)) {
    const m = line.match(/^row\[\d+\]:\s*(\{.*\})\s*$/);
    if (m) { try { rows.push(JSON.parse(m[1])); } catch (_) {} }
  }
  return rows;
}

async function main() {
  const urlIntel = await createUrlClassifier();

  const urlRows = probe(`SELECT u.url AS url FROM urls u WHERE u.url LIKE 'http%' ORDER BY u.id DESC LIMIT ${SAMPLE}`);
  const byLabel = {};
  let admittedTotal = 0;
  for (const { url } of urlRows) {
    if (!url) continue;
    const label = urlIntel.classifyUrl(url).label;
    const admits = ArticleSignalsService.isArticleShapedUrl(url);
    byLabel[label] = byLabel[label] || { total: 0, copilotAdmits: 0 };
    byLabel[label].total++;
    if (admits) { byLabel[label].copilotAdmits++; admittedTotal++; }
  }

  // Full-DB junk count (not just the sample) so growth is trackable.
  const inList = SHARE_HOSTS.map((h) => `'${h.replace(/'/g, "''")}'`).join(',');
  const junkRows = probe(`SELECT COUNT(*) AS n FROM urls WHERE host IN (${inList}) LIMIT 1`);
  const shareJunk = junkRows.length ? junkRows[0].n : null;

  const total = urlRows.length;
  const report = {
    generatedAt: new Date().toISOString(),
    sample: total,
    articleShapedAdmittedPct: total ? +(admittedTotal / total * 100).toFixed(1) : 0,
    byLabel,
    crossHostShareJunkRows: shareJunk,
    note: 'copilotAdmits per non-content label ≈ the size of a hypothetical selection-veto win. Post cycle-75 it is ~0 for media/asset/api/nav (veto redundant). crossHostShareJunkRows are host-scoped-unreachable dead weight (owner-gated to delete).',
  };

  console.log('=== frontier composition (url-intelligence × isArticleShapedUrl) ===');
  console.log(`sample: ${total} recent frontier URLs   article-shaped admitted: ${report.articleShapedAdmittedPct}%`);
  console.log('label              total   copilot-admits (=selection-veto win if vetoed)');
  for (const [k, v] of Object.entries(byLabel).sort((a, b) => b[1].total - a[1].total)) {
    console.log(`  ${k.padEnd(18)}${String(v.total).padStart(5)}   ${v.copilotAdmits}`);
  }
  console.log(`cross-host social-share junk rows (full DB, never crawled — host-scoped): ${shareJunk}`);
  if (JSON_OUT) { fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2)); console.log(`wrote ${JSON_OUT}`); }
  return 0;
}

main().then((c) => process.exit(c)).catch((err) => { console.error(err); process.exit(1); });
