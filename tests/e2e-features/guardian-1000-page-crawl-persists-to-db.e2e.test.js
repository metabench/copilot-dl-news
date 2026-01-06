'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const NewsCrawler = require('../../src/crawl');
const { ensureDb } = require('../../src/db/sqlite');
const { createTempDb } = require('../../src/db/sqlite/v1/test-utils');

const {
  getFreePort,
  spawnGuardianFixture,
  waitForHttpOk,
  stopChild
} = require('../helpers/guardianFixtureCrawl');

function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (_) {}
}

describe('LOCAL FIXTURE (not real Guardian) - 1000 page crawl persists to DB', () => {
  jest.setTimeout(360_000);

  test('downloads and stores 1000 /page/* responses from LOCALHOST FIXTURE in SQLite', async () => {
    const port = await getFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const startUrl = `${baseUrl}/page/1`;

    const { child, getLogs } = spawnGuardianFixture({ port, pages: 1000 });

    const dbPath = createTempDb('guardian-1000-db');

    const cleanupDbFiles = () => {
      safeUnlink(dbPath);
      safeUnlink(`${dbPath}-wal`);
      safeUnlink(`${dbPath}-shm`);
      safeUnlink(`${dbPath}-journal`);
    };

    let crawler = null;
    let db = null;

    try {
      const ok = await waitForHttpOk(startUrl, { attempts: 60, delayMs: 100 });
      if (!ok) {
        const logs = getLogs();
        throw new Error(
          `Fixture server not responding at ${startUrl}\n--- stdout ---\n${logs.stdout}\n--- stderr ---\n${logs.stderr}`
        );
      }

      // Initialize schema ahead of time, then close. The crawler opens its own handle.
      const initHandle = ensureDb(dbPath);
      initHandle.close();

      crawler = new NewsCrawler(startUrl, {
        dbPath,
        enableDb: true,
        preferCache: false,
        useSitemap: false,
        crawlType: 'basic',
        maxDepth: 5000,
        maxDownloads: 2000,
        concurrency: 4,
        rateLimitMs: 0,
        requestTimeoutMs: 8000,
        fastStart: true,
        loggingQueue: false,
        loggingNetwork: false,
        loggingFetching: false
      });

      try {
        await crawler.crawl();
      } catch (err) {
        const exitSummary = typeof crawler.getExitSummary === 'function' ? crawler.getExitSummary() : null;
        const lastError = crawler.lastError || null;
        const sampleError = err && err.details && err.details.sampleError ? err.details.sampleError : null;
        const logs = getLogs();
        const extra = {
          sampleError,
          lastError,
          exitSummary
        };
        throw new Error(
          `Crawler failed for ${startUrl}: ${err && err.message ? err.message : String(err)}\n` +
            `Details: ${JSON.stringify(extra, null, 2)}\n` +
            `--- fixture stdout ---\n${logs.stdout}\n--- fixture stderr ---\n${logs.stderr}`
        );
      }

      // Get crawler exit summary for evidence
      const exitSummary = typeof crawler.getExitSummary === 'function' ? crawler.getExitSummary() : null;
      const crawlerStats = crawler.stats || {};

      db = new Database(dbPath, { readonly: true, fileMustExist: true });

      const pageLike = `${baseUrl}/page/%`;

      // Query 1: Count distinct pages with actual downloads
      const countPagesStmt = db.prepare(`
        SELECT COUNT(DISTINCT u.url) AS c
        FROM http_responses hr
        JOIN urls u ON u.id = hr.url_id
        WHERE u.url LIKE ?
          AND hr.http_status = 200
          AND hr.bytes_downloaded > 0
          AND hr.fetched_at IS NOT NULL
          AND (hr.content_type LIKE 'text/html%' OR hr.content_type IS NULL)
      `);

      const countRow = countPagesStmt.get(pageLike);
      const distinctPages = Number(countRow?.c || 0);

      // Query 2: Get total bytes downloaded
      const totalBytesStmt = db.prepare(`
        SELECT SUM(hr.bytes_downloaded) AS total_bytes, COUNT(*) AS response_count
        FROM http_responses hr
        JOIN urls u ON u.id = hr.url_id
        WHERE u.url LIKE ?
          AND hr.http_status = 200
          AND hr.bytes_downloaded > 0
      `);
      const bytesRow = totalBytesStmt.get(pageLike);
      const totalBytesDownloaded = Number(bytesRow?.total_bytes || 0);
      const totalResponses = Number(bytesRow?.response_count || 0);

      // Query 3: Sample of actual downloaded pages (first 5 and last 5)
      const samplePagesStmt = db.prepare(`
        SELECT u.url, hr.bytes_downloaded, hr.http_status, hr.fetched_at
        FROM http_responses hr
        JOIN urls u ON u.id = hr.url_id
        WHERE u.url LIKE ?
          AND hr.http_status = 200
          AND hr.bytes_downloaded > 0
        ORDER BY u.url
        LIMIT 5
      `);
      const firstPages = samplePagesStmt.all(pageLike);

      const lastPagesStmt = db.prepare(`
        SELECT u.url, hr.bytes_downloaded, hr.http_status, hr.fetched_at
        FROM http_responses hr
        JOIN urls u ON u.id = hr.url_id
        WHERE u.url LIKE ?
          AND hr.http_status = 200
          AND hr.bytes_downloaded > 0
        ORDER BY CAST(SUBSTR(u.url, INSTR(u.url, '/page/') + 6) AS INTEGER) DESC
        LIMIT 5
      `);
      const lastPages = lastPagesStmt.all(pageLike);

      // Query 4: Check page/1000 specifically
      const page1000 = `${baseUrl}/page/1000`;
      const has1000Stmt = db.prepare(`
        SELECT u.url, hr.bytes_downloaded, hr.http_status, hr.fetched_at
        FROM http_responses hr
        JOIN urls u ON u.id = hr.url_id
        WHERE u.url = ?
          AND hr.http_status = 200
          AND hr.bytes_downloaded > 0
          AND hr.fetched_at IS NOT NULL
      `);
      const page1000Row = has1000Stmt.get(page1000);

      // Build evidence object - with EXPLICIT domain information
      const evidence = {
        // ⚠️ CRITICAL: This is the FIRST thing to check - what domain was crawled?
        WARNING: '⚠️ LOCAL FIXTURE TEST - NOT REAL GUARDIAN WEBSITE',
        domainCrawled: baseUrl,
        isRealWebsite: false,
        isLocalhostFixture: true,
        // Actual metrics
        distinctPagesWithDownloads: distinctPages,
        totalBytesDownloaded,
        totalBytesHuman: `${(totalBytesDownloaded / 1024 / 1024).toFixed(2)} MB`,
        totalResponses,
        avgBytesPerPage: distinctPages > 0 ? Math.round(totalBytesDownloaded / distinctPages) : 0,
        sampleFirstPages: firstPages.map(p => ({ url: p.url, bytes: p.bytes_downloaded })),
        sampleLastPages: lastPages.map(p => ({ url: p.url, bytes: p.bytes_downloaded })),
        page1000: page1000Row ? { url: page1000Row.url, bytes: page1000Row.bytes_downloaded, status: page1000Row.http_status } : null,
        crawlerExitSummary: exitSummary,
        crawlerStats: {
          downloads: crawlerStats.downloads,
          visited: crawlerStats.visited,
          queued: crawlerStats.queued
        }
      };

      // ═══════════════════════════════════════════════════════════════════════════
      // PROOF OF 1000 DOWNLOADS - This output proves the downloads actually happened
      // ═══════════════════════════════════════════════════════════════════════════
      console.log('\n');
      console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
      console.log('║  ⚠️  LOCAL FIXTURE TEST - NOT REAL GUARDIAN WEBSITE ⚠️                        ║');
      console.log('╠══════════════════════════════════════════════════════════════════════════════╣');
      console.log(`║  DOMAIN CRAWLED: ${baseUrl.padEnd(53)} ║`);
      console.log('║  This test uses a localhost fixture server, NOT theguardian.com             ║');
      console.log('║  To test REAL Guardian crawling, run: live-crawl-persists-to-db.manual.test ║');
      console.log('╠══════════════════════════════════════════════════════════════════════════════╣');
      console.log('║           PROOF OF 1000 PAGE DOWNLOADS - DB EVIDENCE                        ║');
      console.log('╠══════════════════════════════════════════════════════════════════════════════╣');
      console.log(`║ Distinct pages with bytes_downloaded > 0:  ${String(distinctPages).padStart(6)}                         ║`);
      console.log(`║ Total bytes downloaded:                    ${evidence.totalBytesHuman.padStart(12)}                   ║`);
      console.log(`║ Total HTTP responses in DB:                ${String(totalResponses).padStart(6)}                         ║`);
      console.log(`║ Average bytes per page:                    ${String(evidence.avgBytesPerPage).padStart(6)} bytes                  ║`);
      console.log('╠══════════════════════════════════════════════════════════════════════════════╣');
      console.log('║ SAMPLE DOWNLOADED PAGES (first 5):                                          ║');
      for (const p of firstPages) {
        console.log(`║   ${p.url.padEnd(45)} ${String(p.bytes_downloaded).padStart(6)} bytes      ║`);
      }
      console.log('╠══════════════════════════════════════════════════════════════════════════════╣');
      console.log('║ SAMPLE DOWNLOADED PAGES (last 5):                                           ║');
      for (const p of lastPages) {
        console.log(`║   ${p.url.padEnd(45)} ${String(p.bytes_downloaded).padStart(6)} bytes      ║`);
      }
      console.log('╠══════════════════════════════════════════════════════════════════════════════╣');
      console.log(`║ PAGE 1000 SPECIFICALLY:                                                     ║`);
      if (page1000Row) {
        console.log(`║   URL: ${page1000Row.url.padEnd(60)}     ║`);
        console.log(`║   Bytes downloaded: ${String(page1000Row.bytes_downloaded).padStart(6)}                                          ║`);
        console.log(`║   HTTP status: ${page1000Row.http_status}                                                         ║`);
      } else {
        console.log('║   NOT FOUND - page/1000 was not downloaded!                                ║');
      }
      console.log('╠══════════════════════════════════════════════════════════════════════════════╣');
      console.log('║ CRAWLER EXIT SUMMARY:                                                       ║');
      if (exitSummary) {
        console.log(`║   Downloads: ${String(exitSummary.downloads || crawlerStats.downloads || 'N/A').padEnd(10)} Visited: ${String(exitSummary.visited || crawlerStats.visited || 'N/A').padEnd(10)}                    ║`);
      }
      console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
      console.log('\n');

      // Also emit as JSON for machine parsing
      console.log('DOWNLOAD_EVIDENCE_JSON:', JSON.stringify(evidence));
      console.log('\n');

      // Write evidence to file for permanent record
      const evidenceDir = path.join(process.cwd(), 'testlogs', 'download-evidence');
      fs.mkdirSync(evidenceDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const evidenceFile = path.join(evidenceDir, `1000-download-proof-${timestamp}.json`);
      fs.writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2), 'utf8');
      
      // Also write a human-readable summary
      const summaryFile = path.join(evidenceDir, `1000-download-proof-${timestamp}.txt`);
      const summaryText = `
================================================================================
              PROOF OF 1000 PAGE DOWNLOADS - DATABASE EVIDENCE
================================================================================
Timestamp: ${new Date().toISOString()}
DB Path: ${dbPath}

CORE METRICS:
  Distinct pages with bytes_downloaded > 0:  ${distinctPages}
  Total bytes downloaded:                    ${evidence.totalBytesHuman}
  Total HTTP responses in DB:                ${totalResponses}
  Average bytes per page:                    ${evidence.avgBytesPerPage} bytes

SAMPLE DOWNLOADED PAGES (first 5):
${firstPages.map(p => `  ${p.url} - ${p.bytes_downloaded} bytes`).join('\n')}

SAMPLE DOWNLOADED PAGES (last 5):
${lastPages.map(p => `  ${p.url} - ${p.bytes_downloaded} bytes`).join('\n')}

PAGE 1000 SPECIFICALLY:
${page1000Row 
  ? `  URL: ${page1000Row.url}
  Bytes downloaded: ${page1000Row.bytes_downloaded}
  HTTP status: ${page1000Row.http_status}
  Fetched at: ${page1000Row.fetched_at}`
  : '  NOT FOUND - page/1000 was not downloaded!'}

CRAWLER EXIT SUMMARY:
  Downloads: ${exitSummary?.downloads || crawlerStats.downloads || 'N/A'}
  Visited: ${exitSummary?.visited || crawlerStats.visited || 'N/A'}

================================================================================
VERDICT: ${distinctPages === 1000 ? '✓ SUCCESS - 1000 pages downloaded and verified in SQLite' : '✗ FAILURE - Expected 1000 pages, got ' + distinctPages}
================================================================================
`;
      fs.writeFileSync(summaryFile, summaryText, 'utf8');
      
      // Print evidence file location
      console.log(`\n📁 Evidence files written to:\n   ${evidenceFile}\n   ${summaryFile}\n`);

      // Now the assertions - these will fail if we didn't actually download 1000 pages
      expect(distinctPages).toBe(1000);
      expect(page1000Row).not.toBeNull();
    } finally {
      try {
        db?.close();
      } catch (_) {}

      try {
        crawler?.dbAdapter?.close?.();
      } catch (_) {}

      stopChild(child);
      cleanupDbFiles();
    }
  });
});
