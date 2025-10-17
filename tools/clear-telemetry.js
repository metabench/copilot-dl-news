const path = require('path');
const Database = require('better-sqlite3');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'news.db');
let db;

try {
  console.log(`Opening database: ${dbPath}`);
  db = new Database(dbPath, { timeout: 15000 });
  
  console.log('Executing DELETE FROM query_telemetry...');
  const start = Date.now();
  const info = db.prepare('DELETE FROM query_telemetry').run();
  const duration = Date.now() - start;
  
  console.log(`\n✓ Success!`);
  console.log(`  - Rows affected: ${info.changes}`);
  console.log(`  - Duration: ${duration}ms`);
  
  console.log('\nRunning VACUUM to reclaim disk space...');
  const vacuumStart = Date.now();
  db.prepare('VACUUM').run();
  const vacuumDuration = Date.now() - vacuumStart;
  console.log(`✓ VACUUM complete in ${vacuumDuration}ms.`);

} catch (err) {
  console.error(`\n❌ Failed to clear table: ${err.message}`);
  process.exit(1);
} finally {
  if (db) {
    db.close();
    console.log('\nDatabase connection closed.');
  }
}
