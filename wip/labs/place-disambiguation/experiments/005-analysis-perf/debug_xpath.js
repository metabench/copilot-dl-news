const path = require('path');
const { performance } = require('perf_hooks');
const zlib = require('zlib');
const NewsDatabase = require('../../../../src/db');
const { ArticleXPathService } = require('../../../../src/services/ArticleXPathService');

// Setup DB
const dbPath = path.join(__dirname, '../../../../data/news.db');
const newsDb = new NewsDatabase(dbPath);
const db = newsDb.db;

// Mock logger
const logger = {
  info: console.log,
  warn: console.warn,
  error: console.error
};

async function run() {
  const xpathService = new ArticleXPathService({ 
    db: newsDb, 
    logger,
    analyzerOptions: { verbose: true }
  });

  const query = `
    SELECT 
      u.url, 
      cs.content_blob,
      ct.algorithm as compression_algorithm
    FROM content_analysis ca
    JOIN content_storage cs ON ca.content_id = cs.id
    LEFT JOIN compression_types ct ON cs.compression_type_id = ct.id
    JOIN http_responses hr ON cs.http_response_id = hr.id
    JOIN urls u ON hr.url_id = u.id
    WHERE u.url LIKE '%snow-gaza-wolf-supermoon%'
  `;
  
  const row = db.prepare(query).get();
  if (!row) {
    console.error('Item not found');
    return;
  }

  console.log(`Analyzing: ${row.url}`);

  let html = '';
  if (row.compression_algorithm === 'brotli') {
    html = zlib.brotliDecompressSync(row.content_blob).toString('utf8');
  } else if (row.compression_algorithm === 'gzip') {
    html = zlib.gunzipSync(row.content_blob).toString('utf8');
  } else {
    html = row.content_blob.toString('utf8');
  }
  
  console.log(`HTML size: ${(html.length / 1024).toFixed(1)} KB`);

  console.log('Testing extractTextWithXPath...');
  try {
    const start = performance.now();
    const text = await xpathService.extractTextWithXPath(row.url, html);
    console.log(`extractTextWithXPath took ${(performance.now() - start).toFixed(0)}ms`);
    console.log('Extracted text length:', text ? text.length : 'null');
  } catch (err) {
    console.error('extractTextWithXPath failed:', err);
  }

  console.log('Testing learnXPathFromHtml...');
  try {
    const start = performance.now();
    const pattern = await xpathService.learnXPathFromHtml(row.url, html);
    console.log(`learnXPathFromHtml took ${(performance.now() - start).toFixed(0)}ms`);
    console.log('Learned pattern:', pattern);
  } catch (err) {
    console.error('learnXPathFromHtml failed:', err);
  }
}

run();
