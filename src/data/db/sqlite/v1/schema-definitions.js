'use strict';

const {
  SQLITE_V1_SCHEMA_TABLE_STATEMENTS,
  SQLITE_V1_SCHEMA_INDEX_STATEMENTS,
  SQLITE_V1_SCHEMA_TRIGGER_STATEMENTS,
  SQLITE_V1_SCHEMA_VIEW_STATEMENTS,
  getSqliteV1SchemaTableNames,
  getSqliteV1SchemaStatements,
  applySqliteV1Schema
} = require('news-crawler-db');

module.exports = {
  TABLE_STATEMENTS: SQLITE_V1_SCHEMA_TABLE_STATEMENTS,
  INDEX_STATEMENTS: SQLITE_V1_SCHEMA_INDEX_STATEMENTS,
  TRIGGER_STATEMENTS: SQLITE_V1_SCHEMA_TRIGGER_STATEMENTS,
  VIEW_STATEMENTS: SQLITE_V1_SCHEMA_VIEW_STATEMENTS,
  getTableNames: getSqliteV1SchemaTableNames,
  getAllStatements: getSqliteV1SchemaStatements,
  applySchema: applySqliteV1Schema
};
