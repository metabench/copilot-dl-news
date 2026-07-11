#!/usr/bin/env node
'use strict';
/**
 * tools/crawl/domain-preflight.js — READ-ONLY, politeness-safe host check
 * before spending a crawl slot. Two requests per host maximum:
 *   1. GET /robots.txt
 *   2. GET the given path (or /) — classified, body discarded.
 * Classifies: ok | bot-challenge | blocked | unreachable.
 *
 * Usage: node tools/crawl/domain-preflight.js https://host/path [more...]
 * Prints JSON array. Exit 0 always (classification is the product).
 */

const CHALLENGE_MARKERS = [
  'captcha', 'cf-challenge', 'attention required', 'are you a robot',
  'unusual traffic', 'access denied', 'perimeterx', 'px-captcha', 'datadome',
  'please enable javascript to view', 'human verification'
];

async function probe(url) {
  const u = new URL(url);
  const out = { target: url, host: u.hostname };
  const get = async (target) => {
    const res = await fetch(target, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000)
    });
    const text = await res.text();
    return { status: res.status, text, finalUrl: res.url };
  };

  try {
    const robots = await get(`${u.protocol}//${u.host}/robots.txt`);
    out.robots = { status: robots.status, bytes: robots.text.length, disallowAll: /^\s*User-agent:\s*\*\s*[\r\n]+\s*Disallow:\s*\/\s*$/mi.test(robots.text) };
  } catch (err) {
    out.robots = { error: err.message };
  }

  try {
    const page = await get(url);
    const lower = page.text.slice(0, 20000).toLowerCase();
    const marker = CHALLENGE_MARKERS.find((m) => lower.includes(m));
    out.page = { status: page.status, bytes: page.text.length, finalUrl: page.finalUrl, challengeMarker: marker || null };
    if (page.status === 403 || page.status === 429) out.verdict = 'blocked';
    else if (marker && page.status !== 200) out.verdict = 'bot-challenge';
    else if (marker && page.text.length < 20000) out.verdict = 'bot-challenge'; // challenge pages are small
    else if (out.robots.disallowAll) out.verdict = 'blocked';
    else if (page.status >= 200 && page.status < 300) out.verdict = 'ok';
    else out.verdict = 'blocked';
  } catch (err) {
    out.page = { error: err.message };
    out.verdict = 'unreachable';
  }
  return out;
}

(async () => {
  const targets = process.argv.slice(2).filter((a) => a.startsWith('http'));
  const results = [];
  for (const t of targets) results.push(await probe(t));
  console.log(JSON.stringify(results, null, 1));
})();
