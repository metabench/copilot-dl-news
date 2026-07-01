'use strict';

/**
 * tools/crawl/lib/quality-scorecard.js
 *
 * PURE crawl-quality scorecard. Given a bag of already-measured signals and a
 * set of quality targets, decide PASS/FAIL and produce a human-readable
 * scorecard. No I/O — every input is a plain number/string/object so the whole
 * module is unit-testable without a DB, network, or crawl.
 *
 * This is the "REVIEW brain" of the one-command usable sample crawl: the
 * orchestrator (tools/crawl/sample.js) measures signals from the writer/sample
 * DB, this module turns them into a verdict, and the CLI prints it.
 *
 * Signal shape (all optional; missing signals become skipped checks):
 *   {
 *     downloads,           // successful (2xx) responses this run
 *     responses,           // total responses this run (success + failed)
 *     failedResponses,     // non-2xx responses
 *     successRate,         // downloads / responses (0..1); derived if omitted
 *     statusTaxonomy,      // { '200': 54, '500': 2, ... }
 *     rateLimitedCount,    // count of 429 responses (politeness proxy)
 *     serverErrorCount,    // count of 5xx responses
 *     distinctHostsFetched,// hosts with >=1 response
 *     requestedHosts,      // seed hosts we asked to crawl (array or count)
 *     stalled,             // crawl watcher observed a stall (bool)
 *     freshness,           // { etag, lastModified, notModified, conditional }
 *     dedup,               // { totalResponses, distinctUrls, duplicateResponses }
 *     bytesDownloaded,
 *     throughput,          // { docsPerSec, bytesPerSec }
 *     elapsedSec,
 *     launchExitCode,      // run.js exit code (secondary signal)
 *   }
 *
 * Target shape (defaults applied):
 *   { success_rate: 0.95, politeness_breaches: 0, stall: false,
 *     min_downloads: 1, min_hosts: 0 }
 */

const DEFAULT_TARGETS = Object.freeze({
  success_rate: 0.95,
  politeness_breaches: 0,
  stall: false,
  min_downloads: 1,
  min_hosts: 0,
});

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 3) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function hostCount(requestedHosts) {
  if (Array.isArray(requestedHosts)) return requestedHosts.length;
  return Math.max(0, num(requestedHosts, 0));
}

function deriveSuccessRate(signals) {
  if (Number.isFinite(Number(signals.successRate))) return Number(signals.successRate);
  const responses = num(signals.responses, 0);
  if (responses <= 0) return null;
  return num(signals.downloads, 0) / responses;
}

/**
 * Build the scorecard. PURE.
 *
 * @param {object} params
 * @param {object} params.signals  Measured signals (see file header).
 * @param {object} [params.targets] Quality targets (merged over DEFAULT_TARGETS).
 * @param {object} [params.context] Free-form run context echoed into the card
 *                                  (rung, url, dbPath, ...).
 * @returns {object} scorecard
 */
function buildQualityScorecard({ signals = {}, targets = {}, context = {} } = {}) {
  const t = Object.assign({}, DEFAULT_TARGETS, targets || {});
  const checks = [];

  const downloads = num(signals.downloads, 0);
  const responses = num(signals.responses, 0);
  const failedResponses = num(signals.failedResponses, Math.max(0, responses - downloads));
  const successRate = deriveSuccessRate(signals);
  const rateLimited = num(signals.rateLimitedCount, 0);
  const serverErrors = num(signals.serverErrorCount, 0);
  const distinctHostsFetched = num(signals.distinctHostsFetched, 0);
  const requestedHostCount = hostCount(signals.requestedHosts);

  // 1. Fundamental usability proof: the crawl actually produced fetch evidence.
  checks.push({
    id: 'crawl-produced-evidence',
    label: 'Crawl produced fetch evidence',
    status: downloads >= num(t.min_downloads, 1) ? 'pass' : 'fail',
    actual: `${downloads} download(s), ${responses} response(s)`,
    target: `>= ${num(t.min_downloads, 1)} download(s)`,
    detail: downloads >= num(t.min_downloads, 1)
      ? null
      : 'No successful downloads landed in the sample DB — the crawl did not run, was blocked, or wrote nowhere. Check the seed URL, robots access, and that the writer DB path is the one being scored.',
  });

  // 2. Success rate.
  if (responses > 0 && successRate != null) {
    const pass = successRate >= num(t.success_rate, 0.95);
    checks.push({
      id: 'success-rate',
      label: 'HTTP success rate',
      status: pass ? 'pass' : 'fail',
      actual: `${round(successRate * 100, 1)}% (${downloads}/${responses})`,
      target: `>= ${round(num(t.success_rate, 0.95) * 100, 1)}%`,
      detail: pass ? null
        : `${failedResponses} response(s) failed. Inspect the error taxonomy below; retry/backoff tuning or a bad seed path are the usual causes.`,
    });
  } else {
    checks.push({
      id: 'success-rate',
      label: 'HTTP success rate',
      status: 'skip',
      actual: 'no responses recorded',
      target: `>= ${round(num(t.success_rate, 0.95) * 100, 1)}%`,
      detail: null,
    });
  }

  // 3. Politeness: treat 429s (and, softly, 5xx storms) as breach proxies. We
  //    cannot re-derive robots/Crawl-delay adherence from the DB post-hoc, but a
  //    rate-limit storm is the observable symptom of impoliteness.
  {
    const breaches = rateLimited;
    const pass = breaches <= num(t.politeness_breaches, 0);
    checks.push({
      id: 'politeness',
      label: 'Politeness (no rate-limit storm)',
      status: pass ? 'pass' : 'fail',
      actual: `${rateLimited}×429, ${serverErrors}×5xx`,
      target: `<= ${num(t.politeness_breaches, 0)}×429`,
      detail: pass ? null
        : `Received ${rateLimited} HTTP 429 response(s): the crawl was throttled by the target. Raise --per-domain-interval-ms / use --profile gentle and lower concurrency.`,
    });
  }

  // 4. No stall.
  if (t.stall === false) {
    const stalled = signals.stalled === true;
    checks.push({
      id: 'no-stall',
      label: 'No stall',
      status: stalled ? 'fail' : 'pass',
      actual: stalled ? 'watcher observed a stall' : 'progressed to completion',
      target: 'no stall',
      detail: stalled
        ? 'The crawl stopped making progress before finishing. Check for a politeness backoff loop, a hung request, or an exhausted queue.'
        : null,
    });
  }

  // 5. Host coverage (only a hard check when we know how many hosts we seeded).
  if (requestedHostCount > 0) {
    const minHosts = Math.max(num(t.min_hosts, 0), requestedHostCount);
    const pass = distinctHostsFetched >= minHosts;
    checks.push({
      id: 'host-coverage',
      label: 'Host coverage',
      status: pass ? 'pass' : 'fail',
      actual: `${distinctHostsFetched}/${requestedHostCount} seed host(s) fetched`,
      target: `>= ${minHosts} host(s)`,
      detail: pass ? null
        : 'One or more seed hosts produced no fetches. Confirm each host is reachable and not fully robots-blocked.',
    });
  } else {
    checks.push({
      id: 'host-coverage',
      label: 'Host coverage',
      status: 'info',
      actual: `${distinctHostsFetched} host(s) fetched`,
      target: 'informational',
      detail: null,
    });
  }

  // 6. Freshness (informational: first crawls have no stored validators to reuse).
  if (signals.freshness && typeof signals.freshness === 'object') {
    const f = signals.freshness;
    checks.push({
      id: 'freshness',
      label: 'Freshness signals captured',
      status: 'info',
      actual: `etag=${num(f.etag, 0)} last-modified=${num(f.lastModified, 0)} 304=${num(f.notModified, 0)}`,
      target: 'informational (reuse on re-crawl)',
      detail: null,
    });
  }

  // 7. Dedup (informational).
  if (signals.dedup && typeof signals.dedup === 'object') {
    const d = signals.dedup;
    const total = num(d.totalResponses, responses);
    const distinct = num(d.distinctUrls, total);
    const dupes = num(d.duplicateResponses, Math.max(0, total - distinct));
    checks.push({
      id: 'dedup',
      label: 'Duplicate fetches',
      status: 'info',
      actual: `${dupes} duplicate response(s) of ${total}`,
      target: 'informational',
      detail: null,
    });
  }

  const failures = checks.filter((c) => c.status === 'fail');
  const verdict = failures.length === 0 ? 'PASS' : 'FAIL';

  return {
    mode: 'crawl-quality-scorecard',
    schemaVersion: 1,
    generatedAt: context.generatedAt || new Date().toISOString(),
    verdict,
    context: {
      rung: context.rung || null,
      url: context.url || null,
      dbPath: context.dbPath || null,
      profile: context.profile || null,
      elapsedSec: signals.elapsedSec != null ? num(signals.elapsedSec) : null,
      launchExitCode: signals.launchExitCode != null ? num(signals.launchExitCode) : null,
    },
    targets: t,
    summary: {
      downloads,
      responses,
      failedResponses,
      successRate: successRate != null ? round(successRate, 4) : null,
      distinctHostsFetched,
      rateLimited,
      serverErrors,
      bytesDownloaded: num(signals.bytesDownloaded, 0),
      throughput: signals.throughput || null,
      statusTaxonomy: signals.statusTaxonomy || null,
    },
    checks,
    failures: failures.map((c) => ({ id: c.id, label: c.label, actual: c.actual, target: c.target, detail: c.detail })),
    exitCode: verdict === 'PASS' ? 0 : 2,
  };
}

const STATUS_GLYPH = { pass: '✓', fail: '✗', skip: '–', info: '·' };

/**
 * Render the scorecard as compact operator text. PURE.
 * @param {object} scorecard Output of buildQualityScorecard.
 * @returns {string}
 */
function renderScorecardText(scorecard) {
  const lines = [];
  const ctx = scorecard.context || {};
  lines.push('══ Crawl Quality Scorecard ══');
  const target = [ctx.url, ctx.rung ? `rung=${ctx.rung}` : null].filter(Boolean).join('  ');
  if (target) lines.push(target);
  if (ctx.dbPath) lines.push(`db: ${ctx.dbPath}`);
  lines.push('');
  for (const c of scorecard.checks) {
    const glyph = STATUS_GLYPH[c.status] || '?';
    lines.push(`  ${glyph} ${c.label}: ${c.actual}${c.status === 'pass' || c.status === 'info' ? '' : `  (want ${c.target})`}`);
  }
  const tax = scorecard.summary.statusTaxonomy;
  if (tax && Object.keys(tax).length) {
    const parts = Object.keys(tax).sort().map((k) => `${k}×${tax[k]}`);
    lines.push('');
    lines.push(`  status taxonomy: ${parts.join('  ')}`);
  }
  lines.push('');
  lines.push(`  VERDICT: ${scorecard.verdict}`);
  if (scorecard.failures.length) {
    lines.push('');
    lines.push('  Why it failed / what to do:');
    for (const f of scorecard.failures) {
      lines.push(`   ✗ ${f.label} — ${f.detail || `expected ${f.target}, got ${f.actual}`}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

module.exports = {
  DEFAULT_TARGETS,
  buildQualityScorecard,
  renderScorecardText,
};
