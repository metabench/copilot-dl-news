#!/usr/bin/env node

// Analyze domains to infer categories like "news" and store analysis JSON in domains.analysis.
// Heuristics:
// - Number of article-classified fetches
// - Number of distinct sections
// - Proportion of URLs with date patterns (/yyyy/mm/dd/)
// - Presence of meta og:type=news.article (in articles table text if available)

const path = require('path');
const { evaluateDomainFromDb } = require('../is_this_a_news_website');

function computeWindowSpec(minutes) {
  // Return SQLite interval string like '-15 minutes'
  return `-${minutes} minutes`;
}

function compute429Stats(db, host, minutes) {
  const win = computeWindowSpec(minutes);
  // 429s in window
  const row429 = db.db.prepare(
    `SELECT COUNT(*) AS c FROM errors WHERE host = ? AND code = 429 AND at >= datetime('now', ?)`
  ).get(host, win);
  const count429 = row429?.c || 0;
  // Total attempts in window = successes (fetches) + errors
  const rowOk = db.db.prepare(
    `SELECT COUNT(*) AS c
     FROM fetches f
     JOIN urls u ON u.url = f.url
     WHERE u.host = ? AND COALESCE(f.fetched_at, f.request_started_at) >= datetime('now', ?)`
  ).get(host, win);
  const ok = rowOk?.c || 0;
  const rowErr = db.db.prepare(
    `SELECT COUNT(*) AS c FROM errors WHERE host = ? AND at >= datetime('now', ?)`
  ).get(host, win);
  const err = rowErr?.c || 0;
  const attempts = ok + err; // includes 429s
  const rpm = minutes > 0 ? (count429 / minutes) : 0;
  const ratio = attempts > 0 ? (count429 / attempts) : 0;
  // Last 429 timestamp
  const lastRow = db.db.prepare(`SELECT MAX(at) AS last FROM errors WHERE host = ? AND code = 429`).get(host);
  const last429At = lastRow?.last || null;
  return { count429, attempts, rpm, ratio, last429At };
}

function main(){
  const dbPathArg = process.argv.find(a => a.startsWith('--db='));
  const limitArg = process.argv.find(a => a.startsWith('--limit='));
  const dbPath = dbPathArg ? dbPathArg.split('=')[1] : path.join(process.cwd(), 'data', 'news.db');
  const LIMIT = limitArg ? Math.max(0, parseInt(limitArg.split('=')[1], 10) || 0) : 0;
  let NewsDatabase;
  try { NewsDatabase = require('../db'); } catch (e) {
    console.error('Database unavailable:', e.message); process.exit(1);
  }
  const db = new NewsDatabase(dbPath);

  // Get list of domains (optionally limited)
  const domRows = db.db.prepare(`SELECT host FROM domains ORDER BY last_seen_at DESC ${LIMIT? 'LIMIT ?' : ''}`).all(...(LIMIT? [LIMIT] : []));
  for (const d of domRows) {
    const host = d.host;
    const { analysis } = evaluateDomainFromDb(db, host);
    // Compute 429 metrics for 15m and 60m windows
    const w15 = compute429Stats(db, host, 15);
    const w60 = compute429Stats(db, host, 60);
    const extended = {
      ...analysis,
      http429: {
        last_at: w60.last429At || w15.last429At || null,
        windows: {
          m15: { rpm: w15.rpm, ratio: w15.ratio, count: w15.count429, attempts: w15.attempts },
          m60: { rpm: w60.rpm, ratio: w60.ratio, count: w60.count429, attempts: w60.attempts }
        }
      }
    };
    db.upsertDomain(host, JSON.stringify(extended));
    if (extended.kind === 'news') db.tagDomainWithCategory(host, 'news');
    process.stdout.write(`${host}\t${extended.kind}\t${extended.score.toFixed(3)}\t429rpm15=${extended.http429.windows.m15.rpm.toFixed(3)}\t429rpm60=${extended.http429.windows.m60.rpm.toFixed(3)}\n`);
  }
  db.close();
}

if (require.main === module) main();
