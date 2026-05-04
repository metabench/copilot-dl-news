/**
 * Quick benchmark: Test XPath extraction vs JSDOM fallback
 */
'use strict';

const NewsDatabase = require('../../src/db');
const { ArticleXPathService } = require('../../src/services/ArticleXPathService');
const { DecompressionWorkerPool } = require('../../src/background/workers/DecompressionWorkerPool');
const { performance } = require('perf_hooks');

async function test() {
  const db = new NewsDatabase('./data/news.db');
  const xpathService = new ArticleXPathService({ db: db.db, logger: console });
  const decompressPool = new DecompressionWorkerPool({ poolSize: 2 });

  try {
    await decompressPool.initialize();

    // Get a Guardian page from DB with inline content
    const row = db.db.prepare(`
      SELECT
        u.url,
        cs.content_blob,
        cs.compression_bucket_id,
        cs.bucket_entry_key,
        ct.algorithm
      FROM content_analysis ca
      JOIN content_storage cs ON ca.content_id = cs.id
      JOIN http_responses hr ON cs.http_response_id = hr.id
      JOIN urls u ON hr.url_id = u.id
      LEFT JOIN compression_types ct ON cs.compression_type_id = ct.id
      WHERE u.host = 'www.theguardian.com'
      AND cs.content_blob IS NOT NULL
      LIMIT 1
    `).get();

    if (!row) {
      console.log('No Guardian page found with inline content');

      // Try to find any page with content
      const anyRow = db.db.prepare(`
        SELECT
          u.url, u.host,
          cs.content_blob,
          ct.algorithm
        FROM content_analysis ca
        JOIN content_storage cs ON ca.content_id = cs.id
        JOIN http_responses hr ON cs.http_response_id = hr.id
        JOIN urls u ON hr.url_id = u.id
        LEFT JOIN compression_types ct ON cs.compression_type_id = ct.id
        WHERE cs.content_blob IS NOT NULL
        LIMIT 1
      `).get();

      if (anyRow) {
        console.log('Found page with content:', anyRow.url);
        console.log('Host:', anyRow.host);
        console.log('Algorithm:', anyRow.algorithm);
      } else {
        console.log('No pages with content_blob found');
      }
      return;
    }

    console.log('Testing URL:', row.url);
    console.log('Algorithm:', row.algorithm);

    // Decompress HTML
    const decompressStart = performance.now();
    const buffer = Buffer.from(row.content_blob);
    const result = await decompressPool.decompress(buffer, row.algorithm || 'brotli', {});
    const html = result.buffer.toString('utf8');
    const decompressMs = performance.now() - decompressStart;
    console.log('HTML size:', html.length, 'bytes');
    console.log('Decompression:', Math.round(decompressMs), 'ms');

    // Test XPath extraction
    const xpathStart = performance.now();
    const extracted = await xpathService.extractTextWithXPath(row.url, html);
    const xpathMs = performance.now() - xpathStart;

    if (extracted) {
      console.log('\n=== XPath Extraction SUCCESS ===');
      console.log('Time:', Math.round(xpathMs), 'ms');
      console.log('Extracted text length:', extracted.length);
      console.log('Preview:', extracted.substring(0, 200) + '...');
    } else {
      console.log('\n=== XPath Extraction FAILED ===');
      console.log('Time:', Math.round(xpathMs), 'ms');
      console.log('Will fall back to JSDOM');

      // Test JSDOM for comparison
      console.log('\n=== Testing JSDOM fallback ===');
      const { createJsdom } = require('../../src/utils/jsdomUtils');
      const { Readability } = require('@mozilla/readability');

      const jsdomStart = performance.now();
      const { dom } = createJsdom(html, { url: row.url });
      const jsdomMs = performance.now() - jsdomStart;

      const readabilityStart = performance.now();
      const readable = new Readability(dom.window.document).parse();
      const readabilityMs = performance.now() - readabilityStart;

      dom.window.close();

      console.log('JSDOM parse:', Math.round(jsdomMs), 'ms');
      console.log('Readability:', Math.round(readabilityMs), 'ms');
      console.log('Total:', Math.round(jsdomMs + readabilityMs), 'ms');

      if (readable && readable.textContent) {
        console.log('Extracted length:', readable.textContent.length);
      }
    }

  } finally {
    await decompressPool.shutdown();
    db.close();
  }
}

test().catch(console.error);
