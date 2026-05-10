#!/usr/bin/env node
'use strict';

const { openNewsCrawlerDb } = require('../src/db/openNewsCrawlerDb');
/**
 * Check script for Crawl Telemetry Dashboard
 * 
 * Verifies:
 * - Telemetry stats query works
 * - API endpoint returns valid JSON
 * - Dashboard page renders
 */

const http = require('http');
const path = require('path');
const DB_PATH = path.join(process.cwd(), 'data', 'news.db');

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
  console.log('Check: Crawl Telemetry Dashboard');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // Test database queries directly
  let db;
  try {
    db = openNewsCrawlerDb(DB_PATH, { readonly: true });
    check(true, 'Database opens successfully');
  } catch (err) {
    check(false, 'Database opens successfully: ' + err.message);
    process.exit(1);
  }

  // Test recentCrawls query
  try {
    const recentCrawls = db.taskEvents.getRecentCrawlTelemetrySummary({ lookbackHours: 24 });
    check(true, 'recentCrawls query executes');
    check(typeof recentCrawls.crawl_count === 'number', 'recentCrawls.crawl_count is number');
  } catch (err) {
    check(false, 'recentCrawls query: ' + err.message);
  }

  // Test hourlyStats query
  try {
    const hourlyStats = db.taskEvents.getHourlyCrawlTelemetryStats({ lookbackHours: 24, limit: 24 });
    check(true, 'hourlyStats query executes');
    check(Array.isArray(hourlyStats), 'hourlyStats returns array');
  } catch (err) {
    check(false, 'hourlyStats query: ' + err.message);
  }

  // Test errorBreakdown query
  try {
    const errorBreakdown = db.taskEvents.getTaskEventErrorBreakdown({ lookbackDays: 7, limit: 10 });
    check(true, 'errorBreakdown query executes');
    check(Array.isArray(errorBreakdown), 'errorBreakdown returns array');
  } catch (err) {
    check(false, 'errorBreakdown query: ' + err.message);
  }

  // Test domainStats query
  try {
    const domainStats = db.taskEvents.getCrawlDomainTelemetryStats({ lookbackHours: 24, limit: 20 });
    check(true, 'domainStats query executes');
    check(Array.isArray(domainStats), 'domainStats returns array');
  } catch (err) {
    check(false, 'domainStats query: ' + err.message);
  }

  // Test app creation
  try {
    const { app, initDb } = require('../src/ui/server/crawlObserver/server');
    check(typeof app === 'function', 'Express app exports correctly');
    
    // Initialize and test endpoint
    initDb();
    
    // Quick HTTP test
    const server = app.listen(0, async () => {
      try {
        const port = server.address().port;
        
        // Test telemetry API
        const apiRes = await fetch(`http://localhost:${port}/api/telemetry`);
        check(apiRes.ok, '/api/telemetry returns 200');
        
        const data = await apiRes.json();
        check(data.recentCrawls !== undefined, 'API returns recentCrawls');
        check(data.hourlyStats !== undefined, 'API returns hourlyStats');
        check(data.errorBreakdown !== undefined, 'API returns errorBreakdown');
        check(data.domainStats !== undefined, 'API returns domainStats');
        
        // Test telemetry page
        const pageRes = await fetch(`http://localhost:${port}/telemetry`);
        check(pageRes.ok, '/telemetry page returns 200');
        
        const html = await pageRes.text();
        check(html.includes('Telemetry Dashboard'), 'Page contains title');
        check(html.includes('Crawls (24h)'), 'Page contains stats cards');
      } catch (err) {
        check(false, 'HTTP checks: ' + err.message);
      } finally {
        await new Promise(resolve => server.close(resolve));
        db.close();
      }

      console.log('');
      console.log('───────────────────────────────────────────────────────────────');
      if (failed === 0) {
        console.log(`✅ All ${passed} checks passed`);
      } else {
        console.log(`❌ ${failed} checks failed, ${passed} passed`);
      }
      console.log('───────────────────────────────────────────────────────────────');
      console.log('');

      process.exitCode = failed > 0 ? 1 : 0;
    });
  } catch (err) {
    check(false, 'App creation: ' + err.message);
    db.close();
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Check failed:', err);
  process.exit(1);
});
