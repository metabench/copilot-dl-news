'use strict';

const {
  getTableInfo,
  getTableIndexes,
  getIndexInfo,
  getTableIndexNames,
  getAllTablesAndViews,
  schemaInspectionTableExists,
  getAllIndexes,
  getForeignKeys,
  getAllTables,
  getTableRowCount
} = require('news-crawler-db');

module.exports = {
  getTableInfo,
  getTableIndexes,
  getIndexInfo,
  getTableIndexNames,
  getAllTablesAndViews,
  tableExists: schemaInspectionTableExists,
  getAllIndexes,
  getForeignKeys,
  getAllTables,
  getTableRowCount
};
