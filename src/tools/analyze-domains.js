#!/usr/bin/env node

// Analyze domains to infer categories like "news" and store analysis JSON in domains.analysis.
// Heuristics:
// - Number of article-classified fetches
// - Number of distinct sections
// - Proportion of URLs with date patterns (/yyyy/mm/dd/)
// - Presence of meta og:type=news.article (in articles table text if available)

const path = require('path');
const { evaluateDomainFromDb } = require('../is_this_a_news_website');

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
    db.upsertDomain(host, JSON.stringify(analysis));
    if (analysis.kind === 'news') db.tagDomainWithCategory(host, 'news');
    process.stdout.write(`${host}\t${analysis.kind}\t${analysis.score.toFixed(3)}\n`);
  }
  db.close();
}

if (require.main === module) main();
