'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_THRESHOLDS = Object.freeze({
  maxLines: 120,
  maxPublicMethods: 8
});

const RESERVED_TOKENS = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'do',
  'return',
  'try'
]);

const isMethodDefinition = (line) => {
  const trimmed = line.trim();
  if (!trimmed.endsWith('{')) {
    return false;
  }
  // Ignore private helpers prefixed with _ and getters/setters
  if (trimmed.startsWith('_') || trimmed.startsWith('get ') || trimmed.startsWith('set ')) {
    return false;
  }
  const methodPattern = /^(async\s+)?([a-zA-Z][a-zA-Z0-9_]*)\s*\(/;
  const match = trimmed.match(methodPattern);
  if (!match) {
    return false;
  }
  const methodName = match[2];
  // Filter constructor and helper methods defined outside class body scope
  if (methodName === 'constructor') {
    return false;
  }
  if (RESERVED_TOKENS.has(methodName)) {
    return false;
  }
  return true;
};

const analyzeCrawlOperationsConciseness = ({
  filePath = path.join(__dirname, '..', 'CrawlOperations.js'),
  thresholds = DEFAULT_THRESHOLDS
} = {}) => {
  const source = fs.readFileSync(filePath, 'utf8');
  const lines = source.split(/\r?\n/);

  const codeLines = lines.filter((line) => line.trim().length > 0);
  const methodNames = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const methodPattern = /^(async\s+)?([a-zA-Z][a-zA-Z0-9_]*)\s*\(/;
    const match = trimmed.match(methodPattern);
    if (match && isMethodDefinition(line)) {
      methodNames.push(match[2]);
    }
  }

  const methodCount = methodNames.length;

  const exceedsLineThreshold = codeLines.length > thresholds.maxLines;
  const exceedsMethodThreshold = methodCount > thresholds.maxPublicMethods;

  return {
    filePath,
    totalLines: codeLines.length,
    publicMethodCount: methodCount,
    thresholds,
    exceedsLineThreshold,
    exceedsMethodThreshold,
    isConcise: !exceedsLineThreshold && !exceedsMethodThreshold,
    methodNames
  };
};

module.exports = {
  analyzeCrawlOperationsConciseness,
  DEFAULT_THRESHOLDS
};
