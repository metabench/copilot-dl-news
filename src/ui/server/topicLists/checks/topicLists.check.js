#!/usr/bin/env node
'use strict';

const path = require('path');

const { resolveBetterSqliteHandle } = require('../../utils/serverStartupCheckdashboardModule');
const { renderTopicListsHtml } = require('../server');

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'news.db');

let passed = 0;
let failed = 0;

function check(condition, name) {
  if (condition) {
    console.log(`✅ ${name}`);
    passed += 1;
  } else {
    console.log(`❌ ${name}`);
    failed += 1;
  }
}

function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Check: Topic Lists — SSR');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  const resolved = resolveBetterSqliteHandle({ dbPath: DB_PATH, readonly: true });

  try {
    check(!!resolved.dbHandle, 'Database handle resolved');

    const html = renderTopicListsHtml({
      dbHandle: resolved.dbHandle,
      basePath: '/topic-lists',
      lang: 'en',
      q: ''
    });

    check(typeof html === 'string' && html.length > 400, 'HTML rendered');
    check(html.includes('data-testid="topic-lists"'), 'Has root test id');
    check(html.includes('data-testid="topic-lists-filters"'), 'Has filters');
    check(html.includes('data-testid="topic-lists-add"'), 'Has add/upsert form');
    check(html.includes('data-testid="topic-lists-table"'), 'Has table');

    console.log('');
    console.log(`${passed}/${passed + failed} checks passed`);

    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error('\n❌ Error:', err.stack || err.message);
    process.exit(2);
  } finally {
    try {
      resolved.close();
    } catch {
      // ignore
    }
  }

  process.exit(0);
}

main();
