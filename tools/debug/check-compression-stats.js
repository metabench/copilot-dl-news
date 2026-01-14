const { openDatabase } = require('../src/data/db/sqlite/v1/connection');

function checkCompressionStats() {
  const db = openDatabase('./data/news.db', { readonly: true });

  try {
    // Get compression statistics
    const stats = db.prepare(`
      SELECT ct.algorithm, ct.level, COUNT(*) as count
      FROM content_storage cs
      JOIN compression_types ct ON cs.compression_type_id = ct.id
      GROUP BY ct.algorithm, ct.level
      ORDER BY count DESC
    `).all();

    console.log('Compression statistics:');
    stats.forEach(s => {
      console.log(`${s.algorithm}_${s.level}: ${s.count} articles`);
    });

    // Get total articles
    const total = db.prepare('SELECT COUNT(*) as count FROM content_storage').get().count;
    console.log(`Total articles: ${total}`);

    // Get average sizes
    const sizeStats = db.prepare(`
      SELECT
        AVG(uncompressed_size) as avg_uncompressed,
        AVG(compressed_size) as avg_compressed,
        AVG(compression_ratio) as avg_ratio
      FROM content_storage
    `).get();

    console.log(`Average uncompressed size: ${(sizeStats.avg_uncompressed / 1024).toFixed(1)} KB`);
    console.log(`Average compressed size: ${(sizeStats.avg_compressed / 1024).toFixed(1)} KB`);
    console.log(`Average compression ratio: ${sizeStats.avg_ratio?.toFixed(3) || 'N/A'}`);

  } finally {
    db.close();
  }
}

checkCompressionStats();