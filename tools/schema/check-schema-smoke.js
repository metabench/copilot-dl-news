'use strict';

// Smoke test: create a temporary DB with ensureDatabase and list tables/views.
const fs = require('fs');
const os = require('os');
const path = require('path');

const { ensureDatabase } = require('../../src/data/db/sqlite/v1/connection');

async function runSchemaSmoke() {
  const tmp = path.join(os.tmpdir(), `nc-smoke-${Date.now()}.db`);
  console.log('Creating temp DB:', tmp);

  let db;
  try {
    db = ensureDatabase(tmp, { verbose: false });
    const rows = await db.maintenance.listSchemaObjectDefinitions({ types: ['table', 'view'] });
    console.log('FOUND_ROWS_COUNT=' + rows.length);
    for (const row of rows) {
      console.log(`${row.type}\t${row.name}`);
    }
  } catch (error) {
    console.error('SMOKE_ERROR:', error && error.stack ? error.stack : error);
    process.exitCode = 2;
  } finally {
    if (db) {
      try {
        await db.close();
      } catch (_) {}
    }
    try {
      fs.unlinkSync(tmp);
    } catch (_) {}
  }
}

if (require.main === module) {
  runSchemaSmoke();
}

module.exports = {
  runSchemaSmoke
};
