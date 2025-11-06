'use strict';

const path = require('path');
const { extractCode, createSpanKey } = require('../../lib/swcAst');

const DEFAULT_PRIORITY_EXPORT_THRESHOLD = 12;
const ENTRY_POINT_PATTERNS = [
  /^#!\/usr\/bin\/env\s+node/,
  /require\.main\s*===\s*module/,
  /module\.parent\s*===\s*null/,
  /process\.argv\s*\[/
];

function detectModuleKind(ast, source) {
  if (!ast || !Array.isArray(ast.body)) {
    return 'unknown';
  }

  const hasModuleSyntax = ast.body.some((node) => {
    if (!node || typeof node.type !== 'string') {
      return false;
    }
    if (node.type.startsWith('Import') || node.type.startsWith('Export')) {
      return true;
    }
    return false;
  });

  if (hasModuleSyntax) {
    return 'esm';
  }

  if (typeof source === 'string' && /module\.exports|exports\./.test(source)) {
    return 'commonjs';
  }

  return 'unknown';
}

function detectEntryPoint(source, filePath) {
  if (typeof source !== 'string') {
    return false;
  }

  if (ENTRY_POINT_PATTERNS.some((pattern) => pattern.test(source))) {
    return true;
  }

  if (filePath && filePath.endsWith('.cmd')) {
    return true;
  }

  return false;
}

function detectPriority(stats, entryPoint) {
  if (!stats || typeof stats !== 'object') {
    return false;
  }

  if (entryPoint) {
    return true;
  }

  if (typeof stats.exports === 'number' && stats.exports >= DEFAULT_PRIORITY_EXPORT_THRESHOLD) {
    return true;
  }

  if (typeof stats.functions === 'number' && stats.functions >= DEFAULT_PRIORITY_EXPORT_THRESHOLD * 2) {
    return true;
  }

  return false;
}

function detectAsync(snippet) {
  if (typeof snippet !== 'string') {
    return false;
  }
  const trimmed = snippet.trimStart();
  if (trimmed.startsWith('async ')) {
    return true;
  }
  if (/^function\s*\*/.test(trimmed)) {
    return false;
  }
  if (/^async\s+function\b/.test(trimmed)) {
    return true;
  }
  const arrowIndex = trimmed.indexOf('=>');
  if (arrowIndex !== -1) {
    const prefix = trimmed.slice(0, arrowIndex);
    if (/\basync\b/.test(prefix)) {
      return true;
    }
  }
  return false;
}

function detectGenerator(snippet) {
  if (typeof snippet !== 'string') {
    return false;
  }
  const trimmed = snippet.trimStart();
  if (/^function\s*\*/.test(trimmed)) {
    return true;
  }
  if (/\bfunction\s*\*/.test(trimmed)) {
    return true;
  }
  return false;
}

function createSnippetPreview(snippet, maxLength = 160) {
  if (typeof snippet !== 'string' || snippet.length === 0) {
    return '';
  }
  const compact = snippet.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength - 3)}...`;
}

function collectDependencies(ast, source) {
  const result = {
    imports: [],
    requires: []
  };

  if (ast && Array.isArray(ast.body)) {
    ast.body.forEach((node) => {
      if (!node || typeof node !== 'object') {
        return;
      }
      if (node.type === 'ImportDeclaration' && node.source && typeof node.source.value === 'string') {
        result.imports.push(node.source.value);
      }
      if (node.type === 'ExportAllDeclaration' && node.source && typeof node.source.value === 'string') {
        result.imports.push(node.source.value);
      }
    });
  }

  if (typeof source === 'string') {
    const requirePattern = /require\((['"])([^'"\)]+)\1\)/g;
    let match = requirePattern.exec(source);
    while (match) {
      result.requires.push(match[2]);
      match = requirePattern.exec(source);
    }
  }

  if (result.imports.length > 0) {
    result.imports = Array.from(new Set(result.imports)).sort();
  }
  if (result.requires.length > 0) {
    result.requires = Array.from(new Set(result.requires)).sort();
  }

  return result;
}

function buildFunctionRecord(fn, context) {
  const { source, mapper, filePath, relativePath } = context;
  const snippet = extractCode(source, fn.span, mapper);
  return {
    ...fn,
    filePath,
    relativePath,
    exported: Boolean(fn.exportKind),
    isAsync: detectAsync(snippet),
    isGenerator: detectGenerator(snippet),
    snippet,
    snippetPreview: createSnippetPreview(snippet),
    spanKey: createSpanKey(fn.span)
  };
}

function createFileRecord({ filePath, rootDir, source, ast, functions, mapper }) {
  const normalizedRelative = path.relative(rootDir, filePath).replace(/\\/g, '/');
  const totalLines = typeof source === 'string' ? source.split(/\r?\n/).length : 0;
  const records = Array.isArray(functions) ? functions.map((fn) => buildFunctionRecord(fn, {
    source,
    mapper,
    filePath,
    relativePath: normalizedRelative
  })) : [];

  const exportCount = records.filter((item) => item.exported).length;
  const classCount = records.filter((item) => item.kind === 'class').length;
  const functionCount = records.length - classCount;

  const moduleKind = detectModuleKind(ast, source);
  const entryPoint = detectEntryPoint(source, filePath);
  const priority = detectPriority({ exports: exportCount, functions: functionCount }, entryPoint);
  const dependencies = collectDependencies(ast, source);

  return {
    filePath,
    relativePath: normalizedRelative,
    moduleKind,
    entryPoint,
    priority,
    stats: {
      lines: totalLines,
      functions: functionCount,
      classes: classCount,
      exports: exportCount
    },
    dependencies,
    source,
    mapper,
    functions: records
  };
}

module.exports = {
  createFileRecord,
  detectModuleKind,
  detectEntryPoint,
  detectPriority
};
