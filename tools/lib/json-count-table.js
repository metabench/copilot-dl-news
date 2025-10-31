'use strict';

/**
 * Sort directories by JSON file count (desc) then relative path (asc).
 * @param {Array<{relativePath: string, absolutePath: string, jsonFiles: number}>} directories
 * @returns {Array}
 */
function getCountValue(entry) {
  if (!entry) {
    return 0;
  }
  if (typeof entry.directJsonFiles === 'number') {
    return entry.directJsonFiles;
  }
  return 0;
}

function sortDirectoriesByCount(directories) {
  return (directories || []).slice().sort((a, b) => {
    const countA = getCountValue(a);
    const countB = getCountValue(b);

    if (countB !== countA) {
      return countB - countA;
    }

    const pathA = (a && a.relativePath) || '';
    const pathB = (b && b.relativePath) || '';
    return pathA.localeCompare(pathB, undefined, { sensitivity: 'base' });
  });
}

/**
 * Build table rows for formatter-friendly rendering.
 * @param {Array<{relativePath: string, absolutePath: string, jsonFiles: number}>} directories
 * @param {{
 *   useAbsolutePaths?: boolean,
 *   directoryLabel?: string,
 *   limit?: number,
 *   includeDirectCounts?: boolean,
 *   totalLabel?: string,
 *   directLabel?: string,
 *   includeSize?: boolean,
 *   sizeLabel?: string,
 *   formatter?: object
 * }} [options]
 * @returns {{
 *   rows: Array<object>,
 *   columns: Array<string>,
 *   directoryLabel: string,
 *   sorted: Array,
 *   totalDirectories: number,
 *   displayedDirectories: number,
 *   limitApplied: boolean,
 *   limit?: number
 * }}
 */
function buildDirectoryTable(directories, options = {}) {
  const sorted = sortDirectoriesByCount(directories);
  const hasLimit = Number.isInteger(options.limit) && options.limit > 0;
  const limit = hasLimit ? options.limit : undefined;
  const limited = limit ? sorted.slice(0, limit) : sorted;
  const useAbsolutePaths = Boolean(options.useAbsolutePaths);
  const directoryLabel = options.directoryLabel || (useAbsolutePaths ? 'Absolute Directory' : 'Directory');
  const includeDirectCounts = options.includeDirectCounts !== false;
  const includeSize = Boolean(options.includeSize);
  const totalLabel = options.totalLabel || 'JSON Files (total)';
  const directLabel = options.directLabel || 'Direct JSON Files';
  const sizeLabel = options.sizeLabel || 'Size';
  const formatter = options.formatter;

  const rows = limited.map((dir, index) => {
    const row = {
      Rank: index + 1,
      [directoryLabel]: useAbsolutePaths ? dir.absolutePath : dir.relativePath,
      [totalLabel]: getCountValue(dir),
      ...(includeDirectCounts ? { [directLabel]: typeof dir.directJsonFiles === 'number' ? dir.directJsonFiles : getCountValue(dir) } : {}),
      ...(includeSize ? { [sizeLabel]: formatter && formatter.bytes ? formatter.bytes(dir.totalBytes || 0) : (dir.totalBytes || 0) } : {})
    };
    return row;
  });

  const defaultColumns = [
    'Rank',
    directoryLabel,
    totalLabel,
    ...(includeDirectCounts ? [directLabel] : []),
    ...(includeSize ? [sizeLabel] : [])
  ];

  const columns = options.columns || defaultColumns;

  return {
    rows,
    columns,
    directoryLabel,
    sorted,
    totalDirectories: sorted.length,
    displayedDirectories: rows.length,
    limitApplied: Boolean(limit) && rows.length < sorted.length,
    limit
  };
}

/**
 * Render the directory table using CliFormatter.
 * @param {CliFormatter} formatter
 * @param {Array<{relativePath: string, absolutePath: string, jsonFiles: number}>} directories
 * @param {{
 *   useAbsolutePaths?: boolean,
 *   directoryLabel?: string,
 *   columns?: Array<string>,
 *   limit?: number,
 *   includeDirectCounts?: boolean,
 *   totalLabel?: string,
 *   directLabel?: string,
 *   includeSize?: boolean,
 *   sizeLabel?: string
 * }} [options]
 * @returns {{
 *   rows: Array<object>,
 *   columns: Array<string>,
 *   directoryLabel: string,
 *   sorted: Array,
 *   totalDirectories: number,
 *   displayedDirectories: number,
 *   limitApplied: boolean,
 *   limit?: number
 * }}
 */
function renderDirectoryTable(formatter, directories, options = {}) {
  const table = buildDirectoryTable(directories, { ...options, formatter });

  if (table.rows.length === 0) {
    return table;
  }

  const tableOptions = { columns: table.columns };
  if (options.format) {
    tableOptions.format = options.format;
  }

  formatter.table(table.rows, tableOptions);
  return table;
}

module.exports = {
  sortDirectoriesByCount,
  buildDirectoryTable,
  renderDirectoryTable
};
