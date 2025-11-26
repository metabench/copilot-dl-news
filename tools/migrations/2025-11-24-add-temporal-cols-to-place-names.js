const { ensureDatabase } = require('../../src/db/sqlite');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/gazetteer.db');

function migrate() {
  console.log(`Migrating database at ${DB_PATH}...`);
  const db = ensureDatabase(DB_PATH);

  try {
    // Check if columns exist
    const tableInfo = db.pragma('table_info(place_names)');
    const hasValidFrom = tableInfo.some(c => c.name === 'valid_from');
    const hasValidTo = tableInfo.some(c => c.name === 'valid_to');

    if (!hasValidFrom) {
      console.log('Adding column: valid_from');
      db.prepare('ALTER TABLE place_names ADD COLUMN valid_from TEXT').run();
    } else {
      console.log('Column valid_from already exists.');
    }

    if (!hasValidTo) {
      console.log('Adding column: valid_to');
      db.prepare('ALTER TABLE place_names ADD COLUMN valid_to TEXT').run();
    } else {
      console.log('Column valid_to already exists.');
    }

    console.log('Migration complete.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    db.close();
  }
}

migrate();
