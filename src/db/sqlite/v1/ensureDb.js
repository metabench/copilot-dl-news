const path = require('path');
const fs = require('fs');
const { findProjectRoot } = require('../../../utils/project-root');
const { ensureDatabase } = require('./connection');
const { seedData } = require('./seed-utils');

// Open (and create if needed) a SQLite DB file and ensure all schemas exist.
function ensureDb(dbFilePath, options = {}) {
  const projectRoot = findProjectRoot(__dirname);
  const filePath = dbFilePath || path.join(projectRoot, 'data', 'news.db');
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const db = ensureDatabase(filePath, {
    verbose: options.verbose,
    logger: options.logger,
    readonly: options.readonly,
    fileMustExist: options.fileMustExist,
    skipSchema: options.skipSchema
  });

  return db;
}

module.exports = {
  ensureDb
};
