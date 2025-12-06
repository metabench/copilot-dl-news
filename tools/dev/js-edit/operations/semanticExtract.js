#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

/**
 * Semantic Extract: Intent-based code extraction
 * 
 * Purpose: Extract code based on semantic intent rather than exact selectors.
 * Understands patterns like "extract all validation functions" or 
 * "move database helpers to a new file".
 * 
 * Intents supported:
 * - "extract": Pull out a function and its dependencies
 * - "group": Find related functions by pattern/naming
 * - "split": Suggest how to modularize a large file
 */

/**
 * Analyze a file to understand its semantic structure
 * @param {string} source - Source code
 * @param {string} filePath - File path for context
 * @returns {Object} Semantic analysis
 */
function analyzeSemantics(source, filePath) {
  const result = {
    file: filePath,
    functions: [],
    classes: [],
    exports: [],
    patterns: {
      handlers: [],    // Functions ending in Handler, handle*, on*
      validators: [],  // Functions starting with validate*, is*, can*, has*
      transformers: [], // Functions starting with transform*, convert*, parse*, format*
      helpers: [],      // Generic utility functions
      tests: []         // Test-related functions
    },
    dependencies: new Map(), // function -> [dependencies]
    suggestions: []
  };

  let ast;
  try {
    ast = parser.parse(source, {
      sourceType: 'module',
      plugins: ['jsx', 'classProperties', 'dynamicImport']
    });
  } catch (e) {
    result.error = `Parse error: ${e.message}`;
    return result;
  }

  // Collect function definitions
  traverse(ast, {
    FunctionDeclaration(path) {
      const name = path.node.id?.name || 'anonymous';
      const info = {
        name,
        type: 'function',
        line: path.node.loc.start.line,
        start: path.node.start,
        end: path.node.end,
        async: path.node.async,
        generator: path.node.generator,
        params: path.node.params.map(p => p.name || p.type),
        exported: false
      };
      result.functions.push(info);
      categorizeFunction(name, info, result.patterns);
    },

    VariableDeclarator(path) {
      if (path.node.init && 
          (path.node.init.type === 'ArrowFunctionExpression' ||
           path.node.init.type === 'FunctionExpression')) {
        const name = path.node.id?.name || 'anonymous';
        const info = {
          name,
          type: 'arrow',
          line: path.node.loc.start.line,
          start: path.node.start,
          end: path.node.end,
          async: path.node.init.async,
          params: path.node.init.params.map(p => p.name || p.type),
          exported: false
        };
        result.functions.push(info);
        categorizeFunction(name, info, result.patterns);
      }
    },

    ClassDeclaration(path) {
      const name = path.node.id?.name || 'anonymous';
      const methods = [];
      
      path.node.body.body.forEach(member => {
        if (member.type === 'MethodDefinition' || member.type === 'ClassMethod') {
          methods.push(member.key?.name || 'anonymous');
        }
      });

      result.classes.push({
        name,
        line: path.node.loc.start.line,
        start: path.node.start,
        end: path.node.end,
        methods,
        exported: false
      });
    },

    ExportNamedDeclaration(path) {
      if (path.node.declaration) {
        // export function foo() {} or export const foo = ...
        if (path.node.declaration.type === 'FunctionDeclaration') {
          const name = path.node.declaration.id?.name;
          if (name) {
            result.exports.push({ name, type: 'function' });
            const fn = result.functions.find(f => f.name === name);
            if (fn) fn.exported = true;
          }
        } else if (path.node.declaration.type === 'VariableDeclaration') {
          path.node.declaration.declarations.forEach(d => {
            const name = d.id?.name;
            if (name) {
              result.exports.push({ name, type: 'variable' });
              const fn = result.functions.find(f => f.name === name);
              if (fn) fn.exported = true;
            }
          });
        }
      } else if (path.node.specifiers) {
        // export { foo, bar }
        path.node.specifiers.forEach(spec => {
          const name = spec.exported?.name || spec.local?.name;
          if (name) {
            result.exports.push({ name, type: 'specifier' });
            const fn = result.functions.find(f => f.name === name);
            if (fn) fn.exported = true;
          }
        });
      }
    },

    ExportDefaultDeclaration(path) {
      result.exports.push({ name: 'default', type: 'default' });
    }
  });

  // Analyze dependencies between functions
  result.functions.forEach(fn => {
    const fnSource = source.substring(fn.start, fn.end);
    const deps = [];
    
    result.functions.forEach(other => {
      if (other.name !== fn.name) {
        // Check if this function references the other
        const regex = new RegExp(`\\b${other.name}\\s*\\(`, 'g');
        if (regex.test(fnSource)) {
          deps.push(other.name);
        }
      }
    });
    
    result.dependencies.set(fn.name, deps);
  });

  // Generate suggestions
  result.suggestions = generateSuggestions(result);

  return result;
}

/**
 * Categorize a function by its naming pattern
 */
function categorizeFunction(name, info, patterns) {
  const lowerName = name.toLowerCase();
  
  // Handlers
  if (lowerName.endsWith('handler') || lowerName.startsWith('handle') || lowerName.startsWith('on')) {
    patterns.handlers.push(info);
  }
  // Validators
  else if (lowerName.startsWith('validate') || lowerName.startsWith('is') || 
           lowerName.startsWith('can') || lowerName.startsWith('has') ||
           lowerName.startsWith('check')) {
    patterns.validators.push(info);
  }
  // Transformers
  else if (lowerName.startsWith('transform') || lowerName.startsWith('convert') ||
           lowerName.startsWith('parse') || lowerName.startsWith('format') ||
           lowerName.startsWith('to')) {
    patterns.transformers.push(info);
  }
  // Tests
  else if (lowerName.startsWith('test') || lowerName.endsWith('test') ||
           lowerName.startsWith('spec') || lowerName.includes('mock')) {
    patterns.tests.push(info);
  }
  // Helpers (default)
  else {
    patterns.helpers.push(info);
  }
}

/**
 * Generate refactoring suggestions based on analysis
 */
function generateSuggestions(analysis) {
  const suggestions = [];

  // Suggest extracting validators if there are 3+
  if (analysis.patterns.validators.length >= 3) {
    suggestions.push({
      type: 'extract',
      reason: `Found ${analysis.patterns.validators.length} validation functions`,
      action: 'Consider extracting to validators.js',
      functions: analysis.patterns.validators.map(f => f.name)
    });
  }

  // Suggest extracting handlers if there are 3+
  if (analysis.patterns.handlers.length >= 3) {
    suggestions.push({
      type: 'extract',
      reason: `Found ${analysis.patterns.handlers.length} handler functions`,
      action: 'Consider extracting to handlers.js',
      functions: analysis.patterns.handlers.map(f => f.name)
    });
  }

  // Suggest extracting transformers if there are 3+
  if (analysis.patterns.transformers.length >= 3) {
    suggestions.push({
      type: 'extract',
      reason: `Found ${analysis.patterns.transformers.length} transformer functions`,
      action: 'Consider extracting to transformers.js',
      functions: analysis.patterns.transformers.map(f => f.name)
    });
  }

  // Warn about large files
  if (analysis.functions.length > 20) {
    suggestions.push({
      type: 'split',
      reason: `File has ${analysis.functions.length} functions`,
      action: 'Consider splitting into smaller modules'
    });
  }

  // Find isolated function clusters
  const isolated = findIsolatedClusters(analysis);
  isolated.forEach(cluster => {
    if (cluster.length >= 2) {
      suggestions.push({
        type: 'group',
        reason: `Found ${cluster.length} related functions with shared dependencies`,
        action: 'These functions could be extracted together',
        functions: cluster
      });
    }
  });

  return suggestions;
}

/**
 * Find clusters of functions that only depend on each other
 */
function findIsolatedClusters(analysis) {
  const clusters = [];
  const visited = new Set();

  analysis.functions.forEach(fn => {
    if (visited.has(fn.name)) return;

    const cluster = [];
    const queue = [fn.name];

    while (queue.length > 0) {
      const current = queue.shift();
      if (visited.has(current)) continue;
      
      visited.add(current);
      cluster.push(current);

      const deps = analysis.dependencies.get(current) || [];
      deps.forEach(dep => {
        if (!visited.has(dep)) {
          queue.push(dep);
        }
      });
    }

    if (cluster.length > 1) {
      clusters.push(cluster);
    }
  });

  return clusters;
}

/**
 * Extract functions matching an intent pattern
 * @param {string} source - Source code
 * @param {string} intent - Intent pattern (e.g., "validators", "handlers")
 * @returns {Object} Extraction result
 */
function extractByIntent(source, intent) {
  const analysis = analyzeSemantics(source, '');
  
  let functions = [];
  const lowerIntent = intent.toLowerCase();

  if (lowerIntent.includes('valid')) {
    functions = analysis.patterns.validators;
  } else if (lowerIntent.includes('handle') || lowerIntent.includes('handler')) {
    functions = analysis.patterns.handlers;
  } else if (lowerIntent.includes('transform') || lowerIntent.includes('format') || lowerIntent.includes('parse')) {
    functions = analysis.patterns.transformers;
  } else if (lowerIntent.includes('test')) {
    functions = analysis.patterns.tests;
  } else if (lowerIntent.includes('help') || lowerIntent.includes('util')) {
    functions = analysis.patterns.helpers;
  } else {
    // Try to match by name pattern
    const pattern = new RegExp(intent, 'i');
    functions = analysis.functions.filter(f => pattern.test(f.name));
  }

  // Extract the code for matching functions
  const extracted = functions.map(fn => ({
    name: fn.name,
    code: source.substring(fn.start, fn.end),
    line: fn.line,
    dependencies: analysis.dependencies.get(fn.name) || []
  }));

  return {
    intent,
    matched: functions.length,
    functions: extracted,
    relatedDependencies: findRelatedDependencies(extracted, analysis)
  };
}

/**
 * Find dependencies that should be included in extraction
 */
function findRelatedDependencies(extracted, analysis) {
  const extractedNames = new Set(extracted.map(e => e.name));
  const deps = new Set();

  extracted.forEach(fn => {
    (fn.dependencies || []).forEach(dep => {
      if (!extractedNames.has(dep)) {
        deps.add(dep);
      }
    });
  });

  return Array.from(deps);
}

module.exports = {
  analyzeSemantics,
  extractByIntent,
  categorizeFunction,
  generateSuggestions,
  findIsolatedClusters
};
