#!/usr/bin/env node
'use strict';

/**
 * js-scan formatters module
 * 格式化模块 — Terse match formatting, view mode normalization
 */

const path = require('path');

const {
  VIEW_KEYWORD_MAP,
  VIEW_MODES,
  TERSE_FIELD_ALIASES,
  SUPPORTED_TERSE_FIELDS,
  DEFAULT_TERSE_FIELDS
} = require('./constants');

/**
 * Normalize a boolean option value to actual boolean
 * 标准化布尔选项
 */
function normalizeBooleanOption(value) {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized.length === 0) return false;
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y';
  }
  if (typeof value === 'number') return value !== 0;
  return Boolean(value);
}

/**
 * Normalize view mode to one of: detailed, terse, summary
 * 标准化视图模式
 */
function normalizeViewMode(raw) {
  if (raw === undefined || raw === null) return 'detailed';
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = String(candidate).trim();
  if (trimmed.length === 0) return 'detailed';
  
  const lower = trimmed.toLowerCase();
  if (VIEW_KEYWORD_MAP.has(lower)) return VIEW_KEYWORD_MAP.get(lower);
  if (VIEW_KEYWORD_MAP.has(trimmed)) return VIEW_KEYWORD_MAP.get(trimmed);
  if (VIEW_MODES.includes(lower)) return lower;
  return null;
}

/**
 * Format limit value for display
 * 格式化限制值
 */
function formatLimitValue(limit, isChinese) {
  if (limit === 0) return isChinese ? '∞' : 'unlimited';
  return limit;
}

/**
 * Parse terse fields specification
 * 解析简洁字段规格
 */
function parseTerseFields(raw) {
  if (raw === undefined || raw === null) {
    return Array.from(DEFAULT_TERSE_FIELDS);
  }

  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = String(value).trim();
  if (trimmed.length === 0) return Array.from(DEFAULT_TERSE_FIELDS);

  const lowerTrimmed = trimmed.toLowerCase();
  if (TERSE_FIELD_ALIASES[lowerTrimmed] === 'default') {
    return Array.from(DEFAULT_TERSE_FIELDS);
  }

  const tokens = trimmed.split(/[\s,|]+/);
  const resolved = [];
  tokens.forEach((token) => {
    if (!token) return;
    const normalized = token.trim().toLowerCase();
    if (!normalized) return;
    const mapped = TERSE_FIELD_ALIASES[normalized] || normalized;
    if (SUPPORTED_TERSE_FIELDS.includes(mapped) && !resolved.includes(mapped)) {
      resolved.push(mapped);
    }
  });

  return resolved.length === 0 ? Array.from(DEFAULT_TERSE_FIELDS) : resolved;
}

/**
 * Format a single match in terse mode
 * 格式化简洁匹配项
 * 
 * @param {Object} match - The match object with file and function properties
 * @param {string[]} fields - Fields to include in output
 * @param {Object} language - Language context {isChinese, isEnglish, isBilingual}
 * @param {CliFormatter} formatter - CliFormatter instance for colors
 * @returns {string[]} Array of formatted segments
 */
function formatTerseMatch(match, fields, language, formatter) {
  const isChinese = language && language.isChinese;
  const resolvedFields = Array.isArray(fields) && fields.length > 0
    ? [...fields]
    : Array.from(DEFAULT_TERSE_FIELDS);
  
  // Ensure location and hash are included
  const hasLocation = resolvedFields.some((f) => 
    f === 'location' || f === 'file' || f === 'line' || f === 'column'
  );
  if (!hasLocation) resolvedFields.unshift('location');
  if (!resolvedFields.includes('hash')) resolvedFields.push('hash');
  
  const segments = [];
  let pendingLocation = null;

  const flushPendingLocation = () => {
    if (!pendingLocation) return;
    const parts = [];
    if (pendingLocation.file) {
      parts.push(formatter.COLORS.cyan(pendingLocation.file));
    }
    if (pendingLocation.line !== undefined && pendingLocation.line !== null) {
      parts.push(formatter.COLORS.muted(String(pendingLocation.line)));
    }
    if (pendingLocation.column !== undefined && pendingLocation.column !== null) {
      parts.push(formatter.COLORS.muted(String(pendingLocation.column)));
    }
    if (parts.length > 0) segments.push(parts.join(':'));
    pendingLocation = null;
  };

  const queueLocationPart = (part, value) => {
    if (value === undefined || value === null || value === '') return;
    if (!pendingLocation) pendingLocation = { file: null, line: null, column: null };
    pendingLocation[part] = value;
  };

  const directLocationString = () => {
    const parts = [];
    parts.push(formatter.COLORS.cyan(match.file));
    if (match.function.line !== undefined && match.function.line !== null) {
      parts.push(formatter.COLORS.muted(String(match.function.line)));
    }
    if (match.function.column !== undefined && match.function.column !== null) {
      parts.push(formatter.COLORS.muted(String(match.function.column)));
    }
    return parts.join(':');
  };

  resolvedFields.forEach((field) => {
    switch (field) {
      case 'location':
        flushPendingLocation();
        segments.push(directLocationString());
        break;
      case 'file':
        queueLocationPart('file', match.file);
        break;
      case 'line':
        queueLocationPart('line', match.function.line);
        break;
      case 'column':
        queueLocationPart('column', match.function.column);
        break;
      case 'name':
        flushPendingLocation();
        segments.push(formatter.COLORS.bold(match.function.name || '(anonymous)'));
        break;
      case 'canonical':
        flushPendingLocation();
        if (match.function.canonicalName) {
          segments.push(formatter.COLORS.muted(match.function.canonicalName));
        }
        break;
      case 'selector':
        flushPendingLocation();
        {
          const selectorValue = match.function.canonicalName
            || match.function.pathSignature
            || match.function.name
            || '(anonymous)';
          segments.push(formatter.COLORS.muted(selectorValue));
        }
        break;
      case 'kind':
        flushPendingLocation();
        if (match.function.kind) {
          segments.push(formatter.COLORS.muted(match.function.kind));
        }
        break;
      case 'hash':
        flushPendingLocation();
        if (match.function.hash) {
          segments.push(formatter.COLORS.accent(`#${match.function.hash}`));
        }
        break;
      case 'rank':
        flushPendingLocation();
        {
          const stars = match.rank > 0 ? '★'.repeat(match.rank) : '·';
          segments.push(formatter.COLORS.accent(stars));
        }
        break;
      case 'score':
        flushPendingLocation();
        if (typeof match.score === 'number') {
          segments.push(formatter.COLORS.accent(match.score.toFixed(2)));
        }
        break;
      case 'exported':
        flushPendingLocation();
        {
          const label = match.function.exported
            ? (isChinese ? '出' : 'exp')
            : (isChinese ? '内' : 'int');
          const color = match.function.exported ? formatter.COLORS.success : formatter.COLORS.muted;
          segments.push(color(label));
        }
        break;
      case 'async':
        flushPendingLocation();
        {
          const isAsync = Boolean(match.function.isAsync);
          const label = isAsync ? (isChinese ? '异' : 'async') : (isChinese ? '常' : 'sync');
          const color = isAsync ? formatter.COLORS.cyan : formatter.COLORS.muted;
          segments.push(color(label));
        }
        break;
      case 'generator':
        flushPendingLocation();
        if (match.function.isGenerator) {
          segments.push(formatter.COLORS.cyan(isChinese ? '生' : 'gen'));
        }
        break;
      case 'terms':
        flushPendingLocation();
        {
          const terms = Array.isArray(match.context.matchTerms) ? match.context.matchTerms : [];
          const rendered = terms.length > 0 ? terms.join('/') : '-';
          segments.push(formatter.COLORS.muted(`~${rendered}`));
        }
        break;
      default:
        break;
    }
  });

  flushPendingLocation();
  return segments;
}

/**
 * Format dependency rows for output
 * 格式化依赖行
 */
function formatDependencyRows(rows) {
  return rows.map((row) => {
    const parts = [];
    if (row.path) parts.push(row.path);
    if (row.type) parts.push(`[${row.type}]`);
    if (row.exports && row.exports.length > 0) {
      parts.push(`(${row.exports.join(', ')})`);
    }
    return parts.join(' ');
  });
}

/**
 * Format traversal rows for output
 * 格式化遍历行
 */
function formatTraversalRows(rows) {
  return rows.map((row) => {
    const parts = [];
    const indent = '  '.repeat(row.depth || 0);
    parts.push(indent);
    parts.push(row.path);
    if (row.type) parts.push(`[${row.type}]`);
    if (row.isCircular) parts.push('(circular)');
    return parts.join(' ');
  });
}

/**
 * Utility to convert value to array
 * 转换为数组
 */
function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

/**
 * Find the repository root by walking up the directory tree
 * looking for package.json or .git
 * 查找仓库根目录
 * @param {string} startDir - Starting directory
 * @returns {string} Repository root path
 */
function findRepositoryRoot(startDir) {
  const fs = require('fs');
  let currentDir = path.resolve(startDir);

  while (currentDir !== path.dirname(currentDir)) {
    if (fs.existsSync(path.join(currentDir, 'package.json')) ||
        fs.existsSync(path.join(currentDir, '.git'))) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }
  return startDir;
}

module.exports = {
  normalizeBooleanOption,
  normalizeViewMode,
  formatLimitValue,
  parseTerseFields,
  formatTerseMatch,
  formatDependencyRows,
  formatTraversalRows,
  toArray,
  findRepositoryRoot
};
