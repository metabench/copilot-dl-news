const Database = require('better-sqlite3');
const db = Database('full-export-brotli-24threads.db', { readonly: true });

// Check schema
console.log('=== SCHEMA ===');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name));

// Check articles table structure
console.log('\n=== ARTICLES TABLE STRUCTURE ===');
const columns = db.prepare("PRAGMA table_info(articles)").all();
console.log('Columns:', columns.map(c => `${c.name} (${c.type})`));

// Check sample data
console.log('\n=== SAMPLE ARTICLE ===');
const sample = db.prepare('SELECT id, url, length(html) as html_len, length(compressed_html) as comp_len, compression_ratio FROM articles LIMIT 1').get();
console.log('Sample:', sample);

// Check total sizes
console.log('\n=== TOTAL SIZES ===');
const stats = db.prepare(`
  SELECT
    COUNT(*) as count,
    SUM(length(html)) as total_html,
    SUM(length(compressed_html)) as total_compressed,
    AVG(compression_ratio) as avg_ratio
  FROM articles
  WHERE compressed_html IS NOT NULL
`).get();
console.log('Stats:', {
  count: stats.count,
  total_html_mb: (stats.total_html / 1024 / 1024).toFixed(2),
  total_compressed_mb: (stats.total_compressed / 1024 / 1024).toFixed(2),
  avg_ratio: stats.avg_ratio?.toFixed(2)
});

db.close();