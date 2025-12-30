#!/usr/bin/env node
'use strict';

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
const Database = require('better-sqlite3');

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
    db = new Database(DB_PATH, { readonly: true });
    check(true, 'Database opens successfully');
  } catch (err) {
    check(false, 'Database opens successfully: ' + err.message);
    process.exit(1);
  }

  // Test recentCrawls query
  try {
    const recentCrawls = db.prepare(`
      SELECT 
        COUNT(DISTINCT task_id) as crawl_count,
        SUM(CASE WHEN event_type = 'crawl:url:batch' THEN item_count ELSE 0 END) as total_urls,
        SUM(CASE WHEN severity = 'error' THEN 1 ELSE 0 END) as error_count,
        AVG(duration_ms) as avg_duration_ms
      FROM task_events
      WHERE ts > datetime('now', '-24 hours')
        AND task_type = 'crawl'
    `).get();
    check(true, 'recentCrawls query executes');
    check(typeof recentCrawls.crawl_count === 'number', 'recentCrawls.crawl_count is number');
  } catch (err) {
    check(false, 'recentCrawls query: ' + err.message);
  }

  // Test hourlyStats query
  try {
    const hourlyStats = db.prepare(`
      SELECT 
        strftime('%Y-%m-%d %H:00', ts) as hour,
        COUNT(DISTINCT task_id) as crawl_count,
        SUM(CASE WHEN event_type = 'crawl:url:batch' THEN item_count ELSE 0 END) as urls_fetched,
        SUM(CASE WHEN severity = 'error' THEN 1 ELSE 0 END) as errors
      FROM task_events
      WHERE ts > datetime('now', '-24 hours')
        AND task_type = 'crawl'
      GROUP BY hour
      ORDER BY hour DESC
      LIMIT 24
    `).all();
    check(true, 'hourlyStats query executes');
    check(Array.isArray(hourlyStats), 'hourlyStats returns array');
  } catch (err) {
    check(false, 'hourlyStats query: ' + err.message);
  }

  // Test errorBreakdown query
  try {
    const errorBreakdown = db.prepare(`
      SELECT 
        event_type,
        COUNT(*) as count,
        MAX(ts) as last_seen
      FROM task_events
      WHERE severity = 'error'
        AND ts > datetime('now', '-7 days')
      GROUP BY event_type
      ORDER BY count DESC
      LIMIT 10
    `).all();
    check(true, 'errorBreakdown query executes');
    check(Array.isArray(errorBreakdown), 'errorBreakdown returns array');
  } catch (err) {
    check(false, 'errorBreakdown query: ' + err.message);
  }

  // Test domainStats query
  try {
    const domainStats = db.prepare(`
      SELECT 
        scope as domain,
        COUNT(*) as fetch_count,
        AVG(duration_ms) as avg_ms,
        SUM(CASE WHEN severity = 'error' THEN 1 ELSE 0 END) as errors
      FROM task_events
      WHERE event_type = 'crawl:url:batch'
        AND ts > datetime('now', '-24 hours')
        AND scope IS NOT NULL
      GROUP BY scope
      ORDER BY fetch_count DESC
      LIMIT 20
    `).all();
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
      
      server.close();
      db.close();
      
      console.log('');
      console.log('───────────────────────────────────────────────────────────────');
      if (failed === 0) {
        console.log(`✅ All ${passed} checks passed`);
      } else {
        console.log(`❌ ${failed} checks failed, ${passed} passed`);
      }
      console.log('───────────────────────────────────────────────────────────────');
      console.log('');
      
      process.exit(failed > 0 ? 1 : 0);
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
