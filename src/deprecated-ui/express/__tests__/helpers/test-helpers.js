const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs');

function createTestDb() {
  const dbDir = path.join(__dirname, `../../../../../data/cache`);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  const dbPath = path.join(dbDir, `test-db-${Date.now()}-${Math.random()}.db`);
  const db = new Database(dbPath);
  return {
    db,
    dbPath,
    close: () => {
      db.close();
      try {
        fs.unlinkSync(dbPath);
        fs.unlinkSync(`${dbPath}-shm`);
        fs.unlinkSync(`${dbPath}-wal`);
      } catch (e) {
        // ignore
      }
    }
  };
}

module.exports = { createTestDb };

if (typeof describe === 'function' && typeof test === 'function') {
  describe('helpers/test-helpers', () => {
    test('exports createTestDb helper', () => {
      expect(typeof createTestDb).toBe('function');
    });
  });
}
