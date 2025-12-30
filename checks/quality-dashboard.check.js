#!/usr/bin/env node
'use strict';

/**
 * Check script for Quality Dashboard
 * 
 * Verifies:
 * - QualityMetricsService queries work
 * - API endpoints return valid JSON
 * - Dashboard page renders SSR output
 * - Controls render correctly
 * 
 * Usage:
 *   node checks/quality-dashboard.check.js
 */

const path = require('path');
const Database = require('better-sqlite3');

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
  console.log('Check: Quality Dashboard');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // ─────────────────────────────────────────────────────────────
  // Database connection
  // ─────────────────────────────────────────────────────────────
  console.log('📁 Database Connection');
  console.log('───────────────────────────────────────────────────────────────');

  let db;
  try {
    db = new Database(DB_PATH, { readonly: true });
    check(true, 'Database opens successfully');
  } catch (err) {
    check(false, `Database opens: ${err.message}`);
    console.log('\n⚠️  Cannot proceed without database. Exiting.\n');
    process.exit(1);
  }

  // ─────────────────────────────────────────────────────────────
  // Service queries
  // ─────────────────────────────────────────────────────────────
  console.log('\n📊 QualityMetricsService Queries');
  console.log('───────────────────────────────────────────────────────────────');

  let service;
  try {
    const { QualityMetricsService } = require('../src/ui/server/qualityDashboard/QualityMetricsService');
    service = new QualityMetricsService(db);
    check(true, 'QualityMetricsService instantiates');
  } catch (err) {
    check(false, `QualityMetricsService instantiates: ${err.message}`);
    db.close();
    process.exit(1);
  }

  // Test getSummary
  try {
    const summary = service.getSummary();
    check(typeof summary.avgConfidence === 'number', 'getSummary returns avgConfidence');
    check(typeof summary.totalArticles === 'number', 'getSummary returns totalArticles');
    check(typeof summary.qualityTiers === 'object', 'getSummary returns qualityTiers');
    console.log(`   📈 Total articles: ${summary.totalArticles}, Avg confidence: ${(summary.avgConfidence * 100).toFixed(1)}%`);
  } catch (err) {
    check(false, `getSummary: ${err.message}`);
  }

  // Test getDomains
  try {
    const domains = service.getDomains({ minArticles: 1, limit: 10 });
    check(Array.isArray(domains), 'getDomains returns array');
    check(domains.length >= 0, `getDomains returns ${domains.length} domains`);
    if (domains.length > 0) {
      check(domains[0].host !== undefined, 'Domain has host property');
      check(domains[0].avgConfidence !== undefined, 'Domain has avgConfidence property');
      console.log(`   🌐 Top domain: ${domains[0].host} (${(domains[0].avgConfidence * 100).toFixed(1)}%)`);
    }
  } catch (err) {
    check(false, `getDomains: ${err.message}`);
  }

  // Test getConfidenceDistribution
  try {
    const distribution = service.getConfidenceDistribution();
    check(Array.isArray(distribution), 'getConfidenceDistribution returns array');
    check(distribution.length === 10, 'Distribution has 10 buckets');
    const totalCount = distribution.reduce((sum, b) => sum + b.count, 0);
    console.log(`   📊 Distribution total: ${totalCount} articles across ${distribution.length} buckets`);
  } catch (err) {
    check(false, `getConfidenceDistribution: ${err.message}`);
  }

  // Test getRegressions
  try {
    const regressions = service.getRegressions();
    check(Array.isArray(regressions), 'getRegressions returns array');
    console.log(`   📉 Active regressions: ${regressions.length}`);
  } catch (err) {
    check(false, `getRegressions: ${err.message}`);
  }

  // ─────────────────────────────────────────────────────────────
  // Control rendering
  // ─────────────────────────────────────────────────────────────
  console.log('\n🎨 Control Rendering');
  console.log('───────────────────────────────────────────────────────────────');

  const jsgui = require('jsgui3-html');
  const ctx = new jsgui.Page_Context();

  try {
    const { DomainQualityTable } = require('../src/ui/server/qualityDashboard/controls/DomainQualityTable');
    const table = new DomainQualityTable({
      context: ctx,
      domains: [
        { host: 'example.com', articleCount: 100, avgConfidence: 0.85, minConfidence: 0.7, maxConfidence: 0.95, qualityRate: '95', lastAnalyzedAt: new Date().toISOString() }
      ]
    });
    const html = table.render();
    check(html.includes('example.com'), 'DomainQualityTable renders domain name');
    check(html.includes('quality-table'), 'DomainQualityTable has correct CSS class');
  } catch (err) {
    check(false, `DomainQualityTable render: ${err.message}`);
  }

  try {
    const { ConfidenceHistogram } = require('../src/ui/server/qualityDashboard/controls/ConfidenceHistogram');
    const histogram = new ConfidenceHistogram({
      context: ctx,
      buckets: [
        { min: 0.9, max: 1.0, label: '0.9-1.0 (Excellent)', count: 50, percent: 50 },
        { min: 0.8, max: 0.9, label: '0.8-0.9 (Good)', count: 30, percent: 30 }
      ]
    });
    const html = histogram.render();
    check(html.includes('confidence-histogram'), 'ConfidenceHistogram has correct CSS class');
    check(html.includes('Confidence Distribution'), 'ConfidenceHistogram has title');
  } catch (err) {
    check(false, `ConfidenceHistogram render: ${err.message}`);
  }

  try {
    const { RegressionAlerts } = require('../src/ui/server/qualityDashboard/controls/RegressionAlerts');
    const alerts = new RegressionAlerts({
      context: ctx,
      regressions: [
        { host: 'failing.com', previousAvg: 0.8, currentAvg: 0.5, dropPercent: 37.5, articleCount: 10 }
      ]
    });
    const html = alerts.render();
    check(html.includes('regression-alerts'), 'RegressionAlerts has correct CSS class');
    check(html.includes('failing.com'), 'RegressionAlerts renders domain');
  } catch (err) {
    check(false, `RegressionAlerts render: ${err.message}`);
  }

  // ─────────────────────────────────────────────────────────────
  // Express app and endpoints
  // ─────────────────────────────────────────────────────────────
  console.log('\n🌐 Express App & Endpoints');
  console.log('───────────────────────────────────────────────────────────────');

  try {
    const { createApp } = require('../src/ui/server/qualityDashboard/server');
    const app = createApp(service);
    check(typeof app === 'function', 'Express app exports correctly');

    // Start server on random port
    const server = app.listen(0, async () => {
      const port = server.address().port;
      console.log(`   🚀 Test server running on port ${port}`);

      try {
        // Test API endpoints
        const summaryRes = await fetch(`http://localhost:${port}/api/quality/summary`);
        check(summaryRes.ok, '/api/quality/summary returns 200');
        const summaryData = await summaryRes.json();
        check(summaryData.success === true, 'Summary API returns success');

        const domainsRes = await fetch(`http://localhost:${port}/api/quality/domains`);
        check(domainsRes.ok, '/api/quality/domains returns 200');
        const domainsData = await domainsRes.json();
        check(Array.isArray(domainsData.data), 'Domains API returns array');

        const distRes = await fetch(`http://localhost:${port}/api/quality/distribution`);
        check(distRes.ok, '/api/quality/distribution returns 200');

        const regRes = await fetch(`http://localhost:${port}/api/quality/regressions`);
        check(regRes.ok, '/api/quality/regressions returns 200');

        // Test SSR pages
        const dashboardRes = await fetch(`http://localhost:${port}/`);
        check(dashboardRes.ok, 'GET / returns 200');
        const dashboardHtml = await dashboardRes.text();
        check(dashboardHtml.includes('Quality Dashboard'), 'Dashboard contains title');
        check(dashboardHtml.includes('Average Confidence'), 'Dashboard contains summary cards');

        const domainsPageRes = await fetch(`http://localhost:${port}/domains`);
        check(domainsPageRes.ok, 'GET /domains returns 200');
        const domainsPageHtml = await domainsPageRes.text();
        check(domainsPageHtml.includes('Domain Quality Breakdown'), 'Domains page contains title');

        const regPageRes = await fetch(`http://localhost:${port}/regressions`);
        check(regPageRes.ok, 'GET /regressions returns 200');

      } catch (err) {
        check(false, `HTTP requests: ${err.message}`);
      } finally {
        server.close();
        db.close();
        printSummary();
      }
    });
  } catch (err) {
    check(false, `Express app creation: ${err.message}`);
    db.close();
    printSummary();
  }
}

function printSummary() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  if (failed === 0) {
    console.log(`✅ All ${passed} checks passed`);
  } else {
    console.log(`❌ ${failed} checks failed, ${passed} passed`);
  }
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  
  // Output sample SSR HTML for inspection
  console.log('📄 Sample SSR Output (first 1000 chars):');
  console.log('───────────────────────────────────────────────────────────────');
  try {
    const jsgui = require('jsgui3-html');
    const { ConfidenceHistogram } = require('../src/ui/server/qualityDashboard/controls/ConfidenceHistogram');
    const ctx = new jsgui.Page_Context();
    const histogram = new ConfidenceHistogram({
      context: ctx,
      buckets: [
        { min: 0.9, max: 1.0, label: '0.9-1.0', count: 120, percent: 40 },
        { min: 0.8, max: 0.9, label: '0.8-0.9', count: 90, percent: 30 },
        { min: 0.7, max: 0.8, label: '0.7-0.8', count: 60, percent: 20 },
        { min: 0.6, max: 0.7, label: '0.6-0.7', count: 30, percent: 10 }
      ]
    });
    console.log(histogram.render().slice(0, 1000));
  } catch (err) {
    console.log(`Error generating sample: ${err.message}`);
  }
  console.log('');
  
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Check failed:', err);
  process.exit(1);
});
