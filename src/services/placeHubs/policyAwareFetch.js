'use strict';

/**
 * STATUS (2026-07-17): SUPERSEDED / NOT WIRED. The guess pipeline's single
 * bot-protection seam is now DomainProcessor (_resolveFetchPolicy +
 * _fetchCandidateWithPolicy + _recordProtectionObservation), which also
 * skips the HEAD probe for puppeteer hosts — something a fetch wrapper
 * cannot do. This module was a second seam that double-recorded evidence;
 * it is retained only as a standalone reference/utility (its unit test
 * still exercises the routing logic) and can be deleted. Do not re-wire it
 * into guess-place-hubs without removing DomainProcessor's policy path.
 *
 * policyAwareFetch — fetch that consults the DB's bot-protection model.
 *
 * domain_fetch_policies (news.db) records what each host does to bots and
 * the strategy that works ('direct' | 'puppeteer' | 'remote-worker' |
 * 'skip'). This factory returns a fetch-compatible function for the guess
 * pipeline that:
 *   - 'puppeteer': renders via PuppeteerFetcher (TLS-fingerprinting and
 *     JS-challenge hosts: theguardian.com ECONNRESETs node-fetch). HEAD
 *     requests are answered with a synthetic 200 — headless HEAD is
 *     meaningless and direct HEAD is exactly what the protection blocks;
 *     the follow-up GET is the real probe.
 *   - 'skip': synthetic 403 without touching the network (known-hostile
 *     hosts an operator has decided not to poke).
 *   - 'direct'/no policy: the base fetch.
 * Every ECONNRESET/402/403/429 outcome is merged back into the policy row
 * as evidence (recordProtectionEvidence), so the DB model improves from
 * ordinary crawling and AI reviewers see fresh observations.
 */

const canonicalHost = (u) => {
  try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch (_) { return null; }
};

function syntheticResponse(url, status, body = '') {
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: { get: () => null },
    text: async () => body
  };
}

function createPolicyAwareFetchFn({ db, baseFetchFn, logger = console } = {}) {
  if (typeof baseFetchFn !== 'function') throw new Error('createPolicyAwareFetchFn requires baseFetchFn');
  if (!db) return baseFetchFn;

  let ncdb = null;
  try { ncdb = require('news-crawler-db'); } catch (_) { return baseFetchFn; }

  let puppeteerFetcher = null;
  const getPuppeteer = () => {
    if (puppeteerFetcher) return puppeteerFetcher;
    const { PuppeteerFetcher } = require('../../core/crawler/PuppeteerFetcher');
    puppeteerFetcher = new PuppeteerFetcher({ logger });
    return puppeteerFetcher;
  };

  const noteEvidence = (host, observation) => {
    try { ncdb.recordProtectionEvidence(db, { host, observation }); } catch (_) { /* best-effort */ }
  };

  const policyFor = (host) => {
    try { return ncdb.getDomainFetchPolicy(db, host); } catch (_) { return null; }
  };

  const wrapped = async (url, init = {}) => {
    const host = canonicalHost(url);
    const method = (init.method || 'GET').toUpperCase();
    const policy = host ? policyFor(host) : null;
    const strategy = policy?.fetch_strategy || 'direct';

    if (strategy === 'skip') {
      return syntheticResponse(url, 403, 'skipped by domain_fetch_policies');
    }

    if (strategy === 'puppeteer') {
      if (method === 'HEAD') {
        return syntheticResponse(url, 200); // let the GET decide
      }
      try {
        const result = await getPuppeteer().fetch(url, {});
        // PuppeteerFetcher.fetch → { success, httpStatus, html, finalUrl, … }
        const status = Number.isFinite(result?.httpStatus)
          ? result.httpStatus
          : (result?.success && result?.html ? 200 : 502);
        if (status === 402 || status === 403 || status === 429) {
          noteEvidence(host, { httpStatus: status, via: 'puppeteer', context: 'guess-fetch' });
        }
        return syntheticResponse(result?.finalUrl || url, status, result?.html || '');
      } catch (err) {
        noteEvidence(host, { error: String(err?.message || err).slice(0, 200), via: 'puppeteer', context: 'guess-fetch' });
        return syntheticResponse(url, 502, '');
      }
    }

    try {
      const res = await baseFetchFn(url, init);
      if (host && (res.status === 402 || res.status === 403 || res.status === 429)) {
        noteEvidence(host, { httpStatus: res.status, via: 'direct', context: 'guess-fetch' });
      }
      return res;
    } catch (err) {
      const message = String(err?.message || err);
      if (host && /ECONNRESET|ETIMEDOUT|socket hang up/i.test(message)) {
        noteEvidence(host, { error: message.slice(0, 200), via: 'direct', context: 'guess-fetch' });
      }
      throw err;
    }
  };

  wrapped.close = async () => {
    try { if (puppeteerFetcher?.close) await puppeteerFetcher.close(); } catch (_) { /* noop */ }
  };
  return wrapped;
}

module.exports = { createPolicyAwareFetchFn };
