const path = require('path');
const { performance } = require('perf_hooks');

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

const zlib = require('zlib');
const NewsDatabase = require('../../../../src/db');
const { analyzePage } = require('../../../../src/analysis/page-analyzer');
const { buildGazetteerMatchers } = require('../../../../src/analysis/place-extraction');
const { ArticleXPathService } = require('../../../../src/services/ArticleXPathService');

// Setup DB
const dbPath = path.join(__dirname, '../../../../data/news.db');
const newsDb = new NewsDatabase(dbPath);
const db = newsDb.db; // Raw db for manual queries

// Mock logger
const logger = {
  info: console.log,
  warn: console.warn,
  error: console.error
};

async function run() {
  console.log('Setting up...');
  
  // Build gazetteer
  console.log('Building gazetteer...');
  const gazStart = performance.now();
  const gazetteer = buildGazetteerMatchers(db);
  console.log(`Gazetteer built in ${(performance.now() - gazStart).toFixed(0)}ms`);

  // Setup XPath service
  const xpathService = new ArticleXPathService({ db: newsDb, logger });

  // Fetch the item
  const query = `
    SELECT 
      u.url, 
      ca.content_id,
      ca.title,
      ca.section,
      ca.word_count,
      ca.article_xpath,
      ca.classification,
      ca.nav_links_count,
      ca.article_links_count,
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

  // Decompress
  let html = '';
  if (row.compression_algorithm === 'brotli') {
    html = zlib.brotliDecompressSync(row.content_blob).toString('utf8');
  } else if (row.compression_algorithm === 'gzip') {
    html = zlib.gunzipSync(row.content_blob).toString('utf8');
  } else {
    html = row.content_blob.toString('utf8');
  }
  
  console.log(`HTML size: ${(html.length / 1024).toFixed(1)} KB`);

  // Prepare args
  const articleRow = {
    text: null,
    word_count: row.word_count,
    article_xpath: row.article_xpath
  };

  const fetchRow = {
    classification: row.classification,
    nav_links_count: row.nav_links_count,
    article_links_count: row.article_links_count,
    word_count: row.word_count,
    http_status: 200
  };

  // Run analysis
  console.log('Starting analysis...');
  const start = performance.now();
  
  try {
    const result = await analyzePage({
      url: row.url,
      title: row.title,
      section: row.section,
      articleRow,
      fetchRow,
      html,
      gazetteer,
      db,
      targetVersion: 9999,
      xpathService,
      analysisOptions: {
        places: true,
        hubs: true,
        signals: true,
        deep: true
      }
    });
    
    const duration = performance.now() - start;
    console.log(`Analysis complete in ${duration.toFixed(0)}ms`);
    
    console.log('\nTiming Breakdown:');
    console.log(JSON.stringify(result.timings, null, 2));

    if (result.preparation && result.preparation.timings) {
        console.log('\nPreparation Timings:');
        console.log(JSON.stringify(result.preparation.timings, null, 2));
    }

    if (result.analysis.meta.articleEvaluation) {
        console.log('\nArticle Evaluation:');
        console.log(JSON.stringify(result.analysis.meta.articleEvaluation, null, 2));
    }

  } catch (err) {
    console.error('Analysis failed:', err);
  }
}

run();
