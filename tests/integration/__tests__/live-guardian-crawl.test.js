"use strict";

/**
 * Live Guardian Crawl Test
 * 
 * DOMAIN: theguardian.com (REAL Guardian website)
 * 
 * This test crawls the actual Guardian website to verify:
 * 1. Link extraction works for real Guardian HTML
 * 2. URL eligibility correctly allows Guardian links
 * 3. Crawler follows links beyond the seed page
 * 4. Articles are discovered and saved to DB
 */

const path = require("path");
const fs = require("fs");
const NewsCrawler = require("../../../src/crawl");
const { createTempDb } = require("../../../src/db/sqlite/v1/test-utils");
const { ensureDb } = require("../../../src/db/sqlite");

const GUARDIAN_URL = "https://www.theguardian.com/international";
const MAX_PAGES = 10;  // Small for test speed, but enough to verify link following
const TIMEOUT_MS = 120000;

describe("Live Guardian Crawl", () => {
  let dbPath;
  let dbHandle;
  let crawler;

  beforeEach(() => {
    dbPath = createTempDb("live-guardian-crawl");
    dbHandle = ensureDb(dbPath);
    dbHandle.close();
  });

  afterEach(async () => {
    try {
      if (crawler?.dbAdapter) {
        crawler.dbAdapter.close();
      }
    } catch {}
    try {
      if (dbPath && fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
      }
    } catch {}
  });

  test(
    "downloads pages from theguardian.com and follows links",
    async () => {
      crawler = new NewsCrawler(GUARDIAN_URL, {
        dbPath,
        enableDb: true,
        preferCache: false,
        rateLimitMs: 500,
        concurrency: 1,
        useSitemap: false,
        crawlType: "basic",
        maxDepth: 3,
        maxDownloads: MAX_PAGES,
        requestTimeoutMs: 15000,
        fastStart: true,
        loggingQueue: false,
        loggingNetwork: false,
        loggingFetching: false
      });

      await crawler.crawl();

      const stats = crawler.stats || {};
      const exitSummary = crawler.getExitSummary?.() || {};

      // Generate evidence
      const evidence = {
        testFile: __filename,
        runAt: new Date().toISOString(),
        domain: "theguardian.com",
        seedUrl: GUARDIAN_URL,
        config: {
          maxDownloads: MAX_PAGES,
          maxDepth: 3,
          crawlType: "basic",
          useSitemap: false
        },
        results: {
          pagesDownloaded: stats.pagesDownloaded || 0,
          pagesVisited: stats.pagesVisited || 0,
          articlesFound: stats.articlesFound || 0,
          articlesSaved: stats.articlesSaved || 0,
          queueSizeRemaining: crawler.queue?.size?.() || 0,
          exitReason: exitSummary.reason
        }
      };

      // Write evidence
      const evidenceDir = path.join(__dirname, "__evidence__");
      if (!fs.existsSync(evidenceDir)) {
        fs.mkdirSync(evidenceDir, { recursive: true });
      }
      const evidenceFile = path.join(evidenceDir, "live-guardian-crawl-evidence.json");
      fs.writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2));

      console.log("\n=== LIVE GUARDIAN CRAWL EVIDENCE ===");
      console.log(`Domain: ${evidence.domain} (REAL Guardian)`);
      console.log(`Pages Downloaded: ${evidence.results.pagesDownloaded}`);
      console.log(`Articles Found: ${evidence.results.articlesFound}`);
      console.log(`Queue Remaining: ${evidence.results.queueSizeRemaining}`);
      console.log(`Exit Reason: ${evidence.results.exitReason}`);
      console.log(`Evidence saved to: ${evidenceFile}\n`);

      // Assertions
      expect(evidence.results.pagesDownloaded).toBeGreaterThanOrEqual(MAX_PAGES);
      expect(evidence.results.exitReason).toBe("max-downloads-reached");
      
      // Key assertion: queue should have items, proving links were discovered
      expect(evidence.results.queueSizeRemaining).toBeGreaterThan(50);
    },
    TIMEOUT_MS
  );

  test(
    "extracts and enqueues guardian article links",
    async () => {
      crawler = new NewsCrawler(GUARDIAN_URL, {
        dbPath,
        enableDb: true,
        preferCache: false,
        rateLimitMs: 500,
        concurrency: 1,
        useSitemap: false,
        crawlType: "basic",
        maxDepth: 2,
        maxDownloads: 3,  // Very small - just test link discovery
        requestTimeoutMs: 15000,
        fastStart: true,
        loggingQueue: false,
        loggingNetwork: false,
        loggingFetching: false
      });

      await crawler.crawl();

      const queueSize = crawler.queue?.size?.() || 0;
      
      console.log(`\n=== LINK DISCOVERY TEST ===`);
      console.log(`Domain: theguardian.com (REAL)`);
      console.log(`Queue size after 3 downloads: ${queueSize}`);
      
      // After just 3 downloads from Guardian, we should have many links queued
      expect(queueSize).toBeGreaterThan(100);
    },
    60000
  );
});
