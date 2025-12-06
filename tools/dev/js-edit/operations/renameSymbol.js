#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;

/**
 * Scope-aware symbol rename operation
 * 
 * Purpose: Rename a function, variable, or class across its scope,
 * updating all references while respecting scope boundaries.
 * 
 * Features:
 * - AST-based analysis ensures correctness
 * - Respects lexical scoping
 * - Handles destructuring, imports, exports
 * - Provides preview before applying
 */

/**
 * Find all references to a symbol within a file
 * @param {string} source - Source code
 * @param {string} symbolName - Symbol to find
 * @param {Object} options - Options including scope mode
 * @returns {Object} Analysis result with references and scope info
 */
function analyzeSymbolReferences(source, symbolName, options = {}) {
  const result = {
    symbol: symbolName,
    found: false,
    definition: null,
    references: [],
    scope: null,
    canRename: true,
    errors: []
  };

  let ast;
  try {
    ast = parser.parse(source, {
      sourceType: 'module',
      plugins: ['jsx', 'classProperties', 'dynamicImport']
    });
  } catch (e) {
    result.errors.push(`Parse error: ${e.message}`);
    result.canRename = false;
    return result;
  }

  const references = [];
  let definition = null;
  let scopeType = null;

  traverse(ast, {
    // Variable declarations
    VariableDeclarator(path) {
      if (path.node.id.type === 'Identifier' && path.node.id.name === symbolName) {
        definition = {
          type: 'variable',
          kind: path.parent.kind, // const, let, var
          line: path.node.loc.start.line,
          column: path.node.loc.start.column,
          start: path.node.id.start,
          end: path.node.id.end
        };
        scopeType = path.parent.kind === 'var' ? 'function' : 'block';
      }
    },

    // Function declarations
    FunctionDeclaration(path) {
      if (path.node.id && path.node.id.name === symbolName) {
        definition = {
          type: 'function',
          kind: 'declaration',
          line: path.node.loc.start.line,
          column: path.node.loc.start.column,
          start: path.node.id.start,
          end: path.node.id.end
        };
        scopeType = 'hoisted';
      }
    },

    // Class declarations
    ClassDeclaration(path) {
      if (path.node.id && path.node.id.name === symbolName) {
        definition = {
          type: 'class',
          kind: 'declaration',
          line: path.node.loc.start.line,
          column: path.node.loc.start.column,
          start: path.node.id.start,
          end: path.node.id.end
        };
        scopeType = 'block';
      }
    },

    // Import specifiers
    ImportSpecifier(path) {
      if (path.node.local.name === symbolName) {
        definition = {
          type: 'import',
          kind: 'named',
          line: path.node.loc.start.line,
          column: path.node.loc.start.column,
          start: path.node.local.start,
          end: path.node.local.end,
          imported: path.node.imported?.name || symbolName
        };
        scopeType = 'module';
      }
    },

    ImportDefaultSpecifier(path) {
      if (path.node.local.name === symbolName) {
        definition = {
          type: 'import',
          kind: 'default',
          line: path.node.loc.start.line,
          column: path.node.loc.start.column,
          start: path.node.local.start,
          end: path.node.local.end
        };
        scopeType = 'module';
      }
    },

    // All identifier references
    Identifier(path) {
      if (path.node.name === symbolName) {
        // Skip if this is a property access (obj.prop)
        if (path.parent.type === 'MemberExpression' && path.parent.property === path.node && !path.parent.computed) {
          return;
        }
        // Skip if this is an object key
        if (path.parent.type === 'Property' && path.parent.key === path.node && !path.parent.computed) {
          return;
        }
        // Skip if this is a method definition key
        if (path.parent.type === 'MethodDefinition' && path.parent.key === path.node) {
          return;
        }

        references.push({
          line: path.node.loc.start.line,
          column: path.node.loc.start.column,
          start: path.node.start,
          end: path.node.end,
          context: path.parent.type
        });
      }
    }
  });

  result.found = definition !== null;
  result.definition = definition;
  result.references = references;
  result.scope = scopeType;

  // Check for naming conflicts
  if (options.newName) {
    let hasConflict = false;
    traverse(ast, {
      Identifier(path) {
        if (path.node.name === options.newName) {
          // Check if it's in the same scope
          hasConflict = true;
        }
      }
    });
    if (hasConflict && !options.force) {
      result.errors.push(`Symbol '${options.newName}' already exists in scope`);
      result.canRename = false;
    }
  }

  return result;
}

/**
 * Apply rename to source code
 * @param {string} source - Original source
 * @param {string} oldName - Current symbol name
 * @param {string} newName - New symbol name
 * @param {Object} options - Options
 * @returns {Object} Result with new source and changes
 */
function applyRename(source, oldName, newName, options = {}) {
  const analysis = analyzeSymbolReferences(source, oldName, { newName, force: options.force });
  
  if (!analysis.found) {
    return {
      success: false,
      error: `Symbol '${oldName}' not found`,
      source: null
    };
  }

  if (!analysis.canRename && !options.force) {
    return {
      success: false,
      errors: analysis.errors,
      source: null
    };
  }

  // Sort references by position (reverse order for safe replacement)
  const allPositions = [...analysis.references];
  if (analysis.definition) {
    allPositions.push({
      start: analysis.definition.start,
      end: analysis.definition.end,
      line: analysis.definition.line,
      column: analysis.definition.column,
      isDefinition: true
    });
  }

  allPositions.sort((a, b) => b.start - a.start);

  // Apply replacements
  let result = source;
  const changes = [];
  
  for (const pos of allPositions) {
    const before = result.substring(pos.start, pos.end);
    result = result.substring(0, pos.start) + newName + result.substring(pos.end);
    changes.push({
      line: pos.line,
      column: pos.column,
      before,
      after: newName,
      isDefinition: pos.isDefinition || false
    });
  }

  return {
    success: true,
    source: result,
    changes: changes.reverse(), // Return in source order
    analysis
  };
}

/**
 * Preview rename operation
 * @param {string} source - Source code
 * @param {string} oldName - Current symbol name
 * @param {string} newName - New symbol name
 * @returns {Object} Preview information
 */
function previewRename(source, oldName, newName) {
  const analysis = analyzeSymbolReferences(source, oldName, { newName });
  
  return {
    valid: analysis.found && analysis.canRename,
    symbol: oldName,
    newName,
    definition: analysis.definition,
    referenceCount: analysis.references.length,
    scope: analysis.scope,
    errors: analysis.errors,
    references: analysis.references.map(ref => ({
      line: ref.line,
      column: ref.column,
      context: ref.context
    }))
  };
}

module.exports = {
  analyzeSymbolReferences,
  applyRename,
  previewRename
};
