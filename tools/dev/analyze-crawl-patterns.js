#!/usr/bin/env node
'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const { PatternLearner } = require('../../src/services/PatternLearner');
const { CliFormatter } = require('../../src/shared/utils/CliFormatter');

const fmt = new CliFormatter();

function main() {
  const args = process.argv.slice(2);
  const domain = args[0];
  const dbPath = args[1] || 'data/news.db';

  if (!domain) {
    console.error('Usage: analyze-crawl-patterns <domain> [dbPath]');
    process.exit(1);
  }

  const db = new Database(dbPath);
  const learner = new PatternLearner(db);

  fmt.header('Crawl Pattern Analysis');
  fmt.stat('Domain', domain);
  fmt.stat('Database', dbPath);

  try {
    const patterns = learner.learnPatterns(domain);

    if (patterns.length === 0) {
      fmt.info('No patterns found.');
    } else {
      fmt.section('Discovered Patterns');
      patterns.forEach(p => {
        console.log(`  ${p.count.toString().padEnd(5)} ${p.kind.padEnd(10)} ${p.pattern}`);
      });
      
      fmt.section('Recommendation');
      const topStart = patterns[0];
      if (topStart) {
        fmt.info(`Using pattern "${topStart.pattern}" for Active Probe would likely yield more results.`);
        const activeProbeCmd = `node tools/guess-place-hubs.js --url https://${domain} --mode active-probe --pattern "${topStart.pattern.replace(`{${topStart.kind}_slug}`, '{slug}')}" --kind ${topStart.kind}`;
        console.log('\nSuggested Command:');
        console.log(activeProbeCmd);
      }
    }

  } catch (error) {
    fmt.error(error.message);
  } finally {
    db.close();
  }
}

main();

