const { createPool } = require('./v1/connection');
const PostgresNewsDatabase = require('./v1/PostgresNewsDatabase');

function createPostgresDatabase(options) {
  const pool = createPool(options);
  return new PostgresNewsDatabase(pool, options);
}

module.exports = {
  createPostgresDatabase
};
