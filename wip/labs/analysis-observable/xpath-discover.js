/**
 * Discover the correct XPath for Guardian articles
 */
'use strict';

const NewsDatabase = require('../../src/db');
const { DecompressionWorkerPool } = require('../../src/background/workers/DecompressionWorkerPool');
const { ArticleXPathAnalyzer } = require('../../src/utils/ArticleXPathAnalyzer');
const cheerio = require('cheerio');

async function discover() {
  const db = new NewsDatabase('./data/news.db');
  const decompressPool = new DecompressionWorkerPool({ poolSize: 2 });

  try {
    await decompressPool.initialize();

    // Get a Guardian page
    const row = db.db.prepare(`
      SELECT
        u.url,
        cs.content_blob,
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
      console.log('No Guardian page found');
      return;
    }

    console.log('Analyzing URL:', row.url);

    // Decompress HTML
    const buffer = Buffer.from(row.content_blob);
    const result = await decompressPool.decompress(buffer, row.algorithm || 'brotli', {});
    const html = result.buffer.toString('utf8');
    console.log('HTML size:', html.length, 'bytes\n');

    // Check for common article containers
    const $ = cheerio.load(html);

    console.log('=== Checking common article selectors ===');
    const selectors = [
      '#maincontent',
      '[data-gu-name="body"]',
      'article',
      '.article-body',
      '.content__article-body',
      '.js-article__body',
      '[itemprop="articleBody"]',
      '.dcr-1yqb2vv',  // Guardian specific class
      'main article',
      '#main-content'
    ];

    for (const sel of selectors) {
      const el = $(sel);
      if (el.length > 0) {
        const text = el.text().trim();
        console.log(`✓ ${sel}: ${text.length} chars`);
        if (text.length > 200) {
          console.log(`  Preview: ${text.substring(0, 100)}...`);
        }
      } else {
        console.log(`✗ ${sel}: not found`);
      }
    }

    // Use ArticleXPathAnalyzer to find best XPath
    console.log('\n=== Running ArticleXPathAnalyzer ===');
    const analyzer = new ArticleXPathAnalyzer({ limit: 5, verbose: true });
    const analysis = await analyzer.analyzeHtml(html);

    if (analysis && analysis.topPatterns) {
      console.log('\nTop patterns discovered:');
      for (const pattern of analysis.topPatterns.slice(0, 5)) {
        console.log(`  ${pattern.xpath}`);
        console.log(`    confidence: ${Math.round((pattern.confidence || 0) * 100)}%`);
        console.log(`    chars: ${pattern.stats?.chars || 0}, paras: ${pattern.stats?.paras || 0}`);
      }
    }

  } finally {
    await decompressPool.shutdown();
    db.close();
  }
}

discover().catch(console.error);
