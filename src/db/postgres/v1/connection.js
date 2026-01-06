'use strict';

const { Pool } = require('pg');

/**
 * Create a PostgreSQL connection pool
 * 
 * @param {Object} options - Connection options
 * @param {string} [options.connectionString] - Connection string (e.g. postgres://user:pass@host:5432/db)
 * @param {string} [options.host] - Database host
 * @param {number} [options.port] - Database port
 * @param {string} [options.user] - Database user
 * @param {string} [options.password] - Database password
 * @param {string} [options.database] - Database name
 * @param {number} [options.max=20] - Max clients in pool
 * @returns {Pool} pg Pool instance
 */
function createPool(options = {}) {
  const poolConfig = {
    max: options.max || 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };

  if (options.connectionString) {
    poolConfig.connectionString = options.connectionString;
  } else {
    poolConfig.host = options.host || process.env.PGHOST || 'localhost';
    poolConfig.port = options.port || process.env.PGPORT || 5432;
    poolConfig.user = options.user || process.env.PGUSER || 'postgres';
    poolConfig.password = options.password || process.env.PGPASSWORD;
    poolConfig.database = options.database || process.env.PGDATABASE || 'news';
  }

  const pool = new Pool(poolConfig);

  pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
    // Don't exit process, just log
  });

  return pool;
}

module.exports = {
  createPool
};
