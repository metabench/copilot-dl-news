#!/usr/bin/env node
'use strict';

const path = require('path');

const { resolveBetterSqliteHandle } = require('../../utils/dashboardModule');
const { createTopicHubGuessingRouter } = require('../server');

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'news.db');

let passed = 0;
let failed = 0;

function check(condition, name) {
  if (condition) {
    console.log(`✅ ${name}`);
    passed++;
  } else {
    console.log(`❌ ${name}`);
    failed++;
  }
}

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Check: Topic Hub Guessing — Cell SSR');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  const resolved = resolveBetterSqliteHandle({ dbPath: DB_PATH, readonly: true });
  const { dbHandle } = resolved;

  try {
    check(!!dbHandle, 'Database handle resolved');

    // Find a real (topic_slug, host) pair from the view so the check is resilient to dataset.
    const sample = dbHandle
      .prepare(
        `
        SELECT topic_slug AS topicSlug, host
        FROM place_hubs_with_urls
        WHERE topic_slug IS NOT NULL AND topic_slug <> ''
          AND host IS NOT NULL AND host <> ''
        LIMIT 1
        `
      )
      .get();

    if (!sample) {
      console.log('ℹ️  No topic_slug rows found in DB; skipping cell rendering check');
      console.log('');
      console.log(`${passed}/${passed + failed} checks passed (skipped)`);
      process.exit(0);
    }

    const result = await createTopicHubGuessingRouter({
      getDbHandle: () => dbHandle,
      includeRootRoute: true
    });

    const router = result && result.router;

    check(!!router, 'Router created');
    if (!router) {
      throw new Error('Router was not created');
    }

    // Call the internal render path indirectly by invoking /cell handler with a mock req/res.
    const layer = router.stack.find((l) => l.route && l.route.path === '/cell');
    check(!!layer, 'Has /cell route');

    const handler = layer.route.stack[0].handle;

    let sentHtml = null;
    const req = {
      baseUrl: '/topic-hubs',
      query: {
        host: sample.host,
        topicSlug: sample.topicSlug,
        lang: 'en',
        topicLimit: '25',
        hostLimit: '25'
      }
    };

    const res = {
      _status: 200,
      status(code) {
        this._status = code;
        return this;
      },
      type() {
        return this;
      },
      send(html) {
        sentHtml = html;
        return this;
      }
    };

    handler(req, res);

    check(res._status === 200, 'Cell handler status 200');
    check(typeof sentHtml === 'string' && sentHtml.length > 400, 'Cell HTML rendered');
    check(sentHtml.includes('data-testid="topic-hub-guessing-cell"'), 'Has cell root test id');
    check(sentHtml.includes('← Back'), 'Has Back link');

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

main().catch((err) => {
  console.error('\n❌ Unhandled error:', err.stack || err.message);
  process.exit(2);
});
