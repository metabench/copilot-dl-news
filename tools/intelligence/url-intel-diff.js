#!/usr/bin/env node
'use strict';

/**
 * url-intel-diff.js — differential-equivalence harness (cycle 74).
 *
 * Compares copilot-dl-news's home-grown URL classifier
 * (`ArticleSignalsService.isArticleShapedUrl`, a boolean "is this
 * article-shaped for frontier selection") against the sibling
 * `news-crawler-url-intelligence` module (`analyze_url`, mapped via
 * `moduleLabelIsArticleShaped`: only `article_candidate` => article-shaped).
 *
 * This is the delegation≠repoint PROOF instrument: it quantifies how far the
 * module diverges from the copilot function on REAL news.db URLs, so a
 * delegation is never shipped blind. It is reusable for future intelligence
 * delegations (document/places) by swapping the two classifiers.
 *
 * DB SAFETY: never opens news.db in-process. It shells the URL pull through
 * tools/db/timed-probe.js (LIMIT-guarded + external SIGKILL watchdog + WAL-pin
 * release) — see memory [[live-db-probe-gotcha]].
 *
 *   node tools/intelligence/url-intel-diff.js [--db data/news.db]
 *        [--per-host 150] [--hosts h1,h2,...] [--limit 2000] [--examples 15]
 *        [--json <path>]
 *
 * Default sample: 150 URLs from each of 12 representative news hosts (stratified
 * so dated-article URLs don't drown out the shallow-path/media cases where
 * divergence actually lives).
 */

const path = require('path');
const { spawnSync } = require('child_process');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
const ArticleSignalsService = require(path.join(ROOT, 'src', 'core', 'crawler', 'ArticleSignalsService.js'));
const { createUrlClassifier, moduleLabelIsArticleShaped, classifyUrl } = require(path.join(ROOT, 'src', 'intelligence', 'urlIntelligence.js'));

const argv = process.argv.slice(2);
const getArg = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};
const DB = getArg('--db', 'data/news.db');
const PER_HOST = Number(getArg('--per-host', 150));
const EXAMPLES = Number(getArg('--examples', 15));
const JSON_OUT = getArg('--json', null);
const DEFAULT_HOSTS = [
  'www.theguardian.com', 'www.bbc.com', 'apnews.com', 'www.nytimes.com',
  'www.aljazeera.com', 'www.dw.com', 'www.france24.com', 'www.npr.org',
  'www.irishtimes.com', 'www.cnn.com', 'www.abc.net.au', 'www.straitstimes.com',
];
const HOSTS = (getArg('--hosts', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const HOST_LIST = HOSTS.length ? HOSTS : DEFAULT_HOSTS;

/** Pull URLs for one host through the WAL-safe timed-probe child process. */
function pullHostUrls(host, limit) {
  const sql = `SELECT u.url AS url FROM urls u WHERE u.host='${host.replace(/'/g, "''")}' AND u.url LIKE 'http%' ORDER BY u.id DESC LIMIT ${limit}`;
  const res = spawnSync(process.execPath, [
    path.join(ROOT, 'tools', 'db', 'timed-probe.js'),
    '--db', DB, '--print-all', '--sql', sql, '--timeout-ms', '30000',
  ], { cwd: ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const out = res.stdout || '';
  const urls = [];
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^row\[\d+\]:\s*(\{.*\})\s*$/);
    if (m) { try { const u = JSON.parse(m[1]).url; if (u) urls.push(u); } catch (_) {} }
  }
  return urls;
}

/**
 * Bucket a divergent URL by the cause the workflow's mapping predicted, so the
 * report is analytical, not just a rate. Direction is one of:
 *   'module-only' (module true, copilot false) or 'copilot-only' (copilot true, module false).
 */
function bucketOf(url, direction, moduleLabel) {
  let pathname = '/';
  try { pathname = new URL(url).pathname; } catch (_) {}
  const segs = pathname.split('/').filter(Boolean);
  const last = segs.length ? segs[segs.length - 1] : '';
  const hyphenParts = last.split('-').filter(Boolean).length;
  const hasLongId = /[a-f0-9]{12,}|\d{6,}/i.test(last);
  const hasDatePath = /\/(19|20)\d{2}\/\d{1,2}\/\d{1,2}\//.test(pathname);
  // "substantial" terminal slug = a real article-title slug or a long story id,
  // exactly the copilot isArticleShapedUrl article signal. A deep dated/slugged
  // URL that copilot rejects ONLY because of its trailing-slash rule is NOT a
  // section-hub over-call — it is copilot under-selecting a real article.
  const substantialArticleSignal = hasDatePath || hasLongId || hyphenParts >= 4;
  if (direction === 'module-only') {
    // module flags article, copilot rejects
    if (substantialArticleSignal) {
      return 'copilot-misses-deep-article (copilot likely WRONG — trailing-slash or short-id rejection; e.g. nytimes /athletic/.../<slug>/, bbc /sport/.../articles/<shortid>)';
    }
    return 'module-overcalls-shallow-section (module likely WRONG — task#48 regression risk: promotes a weak word signal with no date/slug, e.g. /athletic/rss/news/, /news/2026/1/)';
  }
  // copilot-only: copilot flags article, module rejects
  if (moduleLabel === 'media_page') return 'module-media_page (module: video/gallery — arguably not a text article)';
  if (moduleLabel === 'listing_page') return 'module-listing_page (module: live-blog/pagination/feed — arguably not a standalone article)';
  if (moduleLabel === 'unknown') return 'module-unknown (module BLIND — deep slug/section vocab it does not recognize; copilot likely right)';
  return `module-${moduleLabel} (copilot article-shaped, module ${moduleLabel})`;
}

async function main() {
  const urlIntel = await createUrlClassifier();

  const urls = [];
  for (const host of HOST_LIST) {
    const got = pullHostUrls(host, PER_HOST);
    for (const u of got) urls.push(u);
    process.stderr.write(`  pulled ${got.length} from ${host}\n`);
  }

  let agree = 0, bothTrue = 0, bothFalse = 0, copilotOnly = 0, moduleOnly = 0, errors = 0;
  const buckets = {};
  const examples = {};
  const byHost = {};

  for (const url of urls) {
    let host = ''; try { host = new URL(url).hostname; } catch (_) {}
    let cop, cls;
    try { cop = ArticleSignalsService.isArticleShapedUrl(url); } catch (_) { errors++; continue; }
    try { cls = urlIntel.classifyUrl(url); } catch (_) { errors++; continue; }
    const mod = moduleLabelIsArticleShaped(cls.label);
    if (cop === mod) { agree++; if (cop) bothTrue++; else bothFalse++; continue; }
    const direction = (mod && !cop) ? 'module-only' : 'copilot-only';
    if (direction === 'module-only') moduleOnly++; else copilotOnly++;
    byHost[host] = (byHost[host] || 0) + 1;
    const bucket = bucketOf(url, direction, cls.label);
    buckets[bucket] = (buckets[bucket] || 0) + 1;
    (examples[bucket] = examples[bucket] || []);
    if (examples[bucket].length < EXAMPLES) examples[bucket].push(`[mod:${cls.label} conf${cls.confidence}] ${url}`);
  }

  const total = agree + copilotOnly + moduleOnly;
  const divergePct = total ? ((copilotOnly + moduleOnly) / total * 100) : 0;

  // MAPPING-SENSITIVITY BAND (adversarial-verify fix, cycle 74): the strict
  // "article_candidate only => true" adapter counts module ABSTENTION (label
  // 'unknown') and content-type refinements (media_page/listing_page of URLs
  // that do have article shape) as "disagreement". Those are defensible mapping
  // choices, not classifier contradictions, so a single scalar overstates the
  // real gap. Report the band across the mapping space instead. `unknown` is
  // ABSTENTION (the module declining to classify), reported separately.
  const bucketVal = (needle) => {
    for (const [k, v] of Object.entries(buckets)) if (k.startsWith(needle)) return v;
    return 0;
  };
  const abstain = bucketVal('module-unknown');          // module declines — not a contradiction
  const media = bucketVal('module-media_page');          // content-type refinement of an article-shaped URL
  const listing = bucketVal('module-listing_page');      // live-blog/pagination refinement
  const shallowRegression = bucketVal('module-overcalls-shallow-section');
  const strict = copilotOnly + moduleOnly;               // strict adapter (article_candidate only)
  const bandUnknownAbstain = strict - abstain;           // treat unknown as abstention
  const bandPlusContentType = strict - abstain - media - listing; // + accept media/listing as article-shaped
  const pct = (n) => total ? +(n / total * 100).toFixed(1) : 0;

  // Per-host systematic-gap collapse: a host whose divergence is ~its whole
  // sample is ONE systematic module gap pseudo-replicated N times (e.g. dw.com
  // /a-<digits>), not N independent observations.
  const systematicHosts = Object.entries(byHost)
    .filter(([h, c]) => c >= 0.9 * PER_HOST)
    .map(([h, c]) => `${h} (${c}/${PER_HOST} — one systematic gap counted ${c}×)`);

  const report = {
    generatedAt: new Date().toISOString(),
    sample: total, errors,
    agree, agreePct: pct(agree),
    bothArticle: bothTrue, bothNot: bothFalse,
    diverge: strict, divergePct: +divergePct.toFixed(1),
    copilotOnlyTrue: copilotOnly, moduleOnlyTrue: moduleOnly,
    abstentions: abstain,
    divergenceBand: {
      strictAdapter: pct(strict),
      unknownAsAbstention: pct(bandUnknownAbstain),
      plusContentTypeAsArticle: pct(bandPlusContentType),
      note: 'strict is an upper bound; the honest gap is a band, not one scalar (adversarial-verify A)',
    },
    sampleKind: 'divergence-enriched STRESS sample (newest-first, equal-weight per host) — NOT a frequency-representative population estimate',
    systematicHosts,
    buckets, byHost,
  };

  console.log('=== url-intel-diff: isArticleShapedUrl vs analyze_url(article_candidate) ===');
  console.log(`sample: ${total} urls   errors: ${errors}   [${report.sampleKind}]`);
  console.log(`AGREE: ${agree} (${report.agreePct}%)  [both-article ${bothTrue}, both-not ${bothFalse}]`);
  console.log('DIVERGENCE BAND (not one scalar — see adversarial-verify A):');
  console.log(`  strict adapter (article_candidate only)        : ${report.divergenceBand.strictAdapter}%  (${strict})  <- upper bound`);
  console.log(`  treating module 'unknown' as ABSTENTION         : ${report.divergenceBand.unknownAsAbstention}%  (${bandUnknownAbstain})   [abstentions: ${abstain}]`);
  console.log(`  + media_page/listing_page counted article-shaped: ${report.divergenceBand.plusContentTypeAsArticle}%  (${bandPlusContentType})   <- lower bound`);
  console.log(`  copilot-only-true ${copilotOnly} | module-only-true ${moduleOnly}`);
  if (systematicHosts.length) {
    console.log('--- per-host SYSTEMATIC gaps (pseudo-replication — one module gap counted per-URL) ---');
    for (const s of systematicHosts) console.log(`  ${s}`);
  }
  console.log('--- divergence by cause bucket ---');
  for (const [b, c] of Object.entries(buckets).sort((a, b2) => b2[1] - a[1])) console.log(`  ${String(c).padStart(4)}  ${b}`);
  console.log('--- divergence by host ---');
  for (const [h, c] of Object.entries(byHost).sort((a, b2) => b2[1] - a[1])) console.log(`  ${String(c).padStart(4)}  ${h}`);
  console.log('--- examples per bucket ---');
  for (const [b, ex] of Object.entries(examples)) {
    console.log(`  # ${b}`);
    ex.forEach((e) => console.log(`      ${e}`));
  }

  // GATE: green = the LOWER-bound divergence <=2% AND zero section-hub
  // regressions. The section-hub hard-zero is mapping-INDEPENDENT (these are
  // genuine module-says-article / copilot-says-no on a weak word signal — not
  // abstentions), so it is the decisive, robust signal — it fails RED even at
  // the most generous mapping.
  const lowerBoundPct = report.divergenceBand.plusContentTypeAsArticle;
  const green = lowerBoundPct <= 2 && shallowRegression === 0;
  console.log('--- GATE ---');
  console.log(`  lower-bound divergence ${lowerBoundPct}% (need <=2%) | section-hub regressions ${shallowRegression} (need 0, mapping-independent)`);
  console.log(`  VERDICT: ${green ? 'GREEN — a thin-call-through delegation is safe' : 'RED — delegation blocked pending reconciliation (see docs/plans/2026-07-22-intelligence-extraction.md)'}`);
  report.gate = { green, shallowRegression, lowerBoundPct };

  if (JSON_OUT) { fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2)); console.log(`  wrote ${JSON_OUT}`); }
  return green ? 0 : 0; // both outcomes are a successful run; RED is a valid, expected result
}

main().then((code) => process.exit(code)).catch((err) => { console.error(err); process.exit(1); });
