#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

/**
 * Context Slice: Extract minimal context for a function
 * 
 * Purpose: Get just the code needed to understand a function,
 * without reading the entire file. Returns:
 * - The function itself
 * - Its local dependencies (called functions, used constants)
 * - Relevant imports
 * 
 * This reduces context from 2000 lines → ~100 lines
 */

/**
 * Extract a context slice for a specific function
 * @param {string} filePath - Path to the file
 * @param {string} functionName - Name of the function to slice
 * @param {Object} options - Options
 * @returns {Object} Context slice result
 */
async function contextSlice(filePath, functionName, options = {}) {
  const result = {
    target: functionName,
    file: filePath,
    slice: {
      imports: [],
      constants: [],
      functions: [],
      targetFunction: null,
      totalLines: 0,
      sliceLines: 0,
      reduction: '0%'
    },
    dependencies: {
      calls: [],
      uses: [],
      externalImports: []
    },
    code: null,
    error: null
  };

  try {
    const absolutePath = path.resolve(filePath);
    if (!fs.existsSync(absolutePath)) {
      result.error = `File not found: ${absolutePath}`;
      return result;
    }

    const source = fs.readFileSync(absolutePath, 'utf-8');
    const lines = source.split('\n');
    result.slice.totalLines = lines.length;

    // Parse with Babel
    const ast = parser.parse(source, {
      sourceType: 'unambiguous',
      plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator']
    });

    // Phase 1: Find the target function
    let targetNode = null;
    let targetStart = null;
    let targetEnd = null;

    traverse(ast, {
      FunctionDeclaration(nodePath) {
        if (nodePath.node.id && nodePath.node.id.name === functionName) {
          targetNode = nodePath.node;
          targetStart = nodePath.node.loc.start.line;
          targetEnd = nodePath.node.loc.end.line;
          nodePath.stop();
        }
      },
      VariableDeclarator(nodePath) {
        if (nodePath.node.id && nodePath.node.id.name === functionName) {
          const init = nodePath.node.init;
          if (init && (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')) {
            targetNode = nodePath.parentPath.node;
            targetStart = nodePath.parentPath.node.loc.start.line;
            targetEnd = nodePath.parentPath.node.loc.end.line;
            nodePath.stop();
          }
        }
      },
      ClassMethod(nodePath) {
        if (nodePath.node.key && nodePath.node.key.name === functionName) {
          targetNode = nodePath.node;
          targetStart = nodePath.node.loc.start.line;
          targetEnd = nodePath.node.loc.end.line;
          nodePath.stop();
        }
      }
    });

    if (!targetNode) {
      result.error = `Function not found: ${functionName}`;
      return result;
    }

    result.slice.targetFunction = {
      name: functionName,
      startLine: targetStart,
      endLine: targetEnd,
      lines: targetEnd - targetStart + 1
    };

    // Phase 2: Collect all identifiers used in the target function
    const usedIdentifiers = new Set();
    const calledFunctions = new Set();

    traverse(ast, {
      enter(nodePath) {
        // Only process nodes within the target function's range
        if (!nodePath.node.loc) return;
        const line = nodePath.node.loc.start.line;
        if (line < targetStart || line > targetEnd) return;

        if (nodePath.isIdentifier()) {
          usedIdentifiers.add(nodePath.node.name);
        }
        if (nodePath.isCallExpression()) {
          const callee = nodePath.node.callee;
          if (callee.type === 'Identifier') {
            calledFunctions.add(callee.name);
          } else if (callee.type === 'MemberExpression' && callee.object.type === 'Identifier') {
            usedIdentifiers.add(callee.object.name);
          }
        }
      }
    });

    // Phase 3: Find definitions of used identifiers
    const relevantImports = [];
    const relevantConstants = [];
    const relevantFunctions = [];

    traverse(ast, {
      ImportDeclaration(nodePath) {
        const specifiers = nodePath.node.specifiers;
        const relevantSpecs = specifiers.filter(spec => {
          const localName = spec.local ? spec.local.name : null;
          return localName && usedIdentifiers.has(localName);
        });

        if (relevantSpecs.length > 0) {
          relevantImports.push({
            source: nodePath.node.source.value,
            specifiers: relevantSpecs.map(s => ({
              type: s.type,
              local: s.local ? s.local.name : null,
              imported: s.imported ? s.imported.name : (s.local ? s.local.name : null)
            })),
            startLine: nodePath.node.loc.start.line,
            endLine: nodePath.node.loc.end.line,
            code: lines.slice(nodePath.node.loc.start.line - 1, nodePath.node.loc.end.line).join('\n')
          });
          result.dependencies.externalImports.push(nodePath.node.source.value);
        }
      },

      VariableDeclaration(nodePath) {
        // Skip if this is the target function itself
        const nodeStart = nodePath.node.loc.start.line;
        const nodeEnd = nodePath.node.loc.end.line;
        if (nodeStart >= targetStart && nodeEnd <= targetEnd) return;

        const declarations = nodePath.node.declarations;
        for (const decl of declarations) {
          if (decl.id && decl.id.name && usedIdentifiers.has(decl.id.name)) {
            // Check if it's a function or a constant
            const init = decl.init;
            if (init && (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')) {
              // It's a function the target calls
              if (calledFunctions.has(decl.id.name)) {
                relevantFunctions.push({
                  name: decl.id.name,
                  startLine: nodePath.node.loc.start.line,
                  endLine: nodePath.node.loc.end.line,
                  code: lines.slice(nodePath.node.loc.start.line - 1, nodePath.node.loc.end.line).join('\n')
                });
                result.dependencies.calls.push(decl.id.name);
              }
            } else {
              // It's a constant/variable
              relevantConstants.push({
                name: decl.id.name,
                startLine: nodePath.node.loc.start.line,
                endLine: nodePath.node.loc.end.line,
                code: lines.slice(nodePath.node.loc.start.line - 1, nodePath.node.loc.end.line).join('\n')
              });
              result.dependencies.uses.push(decl.id.name);
            }
          }
        }
      },

      FunctionDeclaration(nodePath) {
        // Skip if this is the target function itself
        if (nodePath.node.id && nodePath.node.id.name === functionName) return;

        const fnName = nodePath.node.id ? nodePath.node.id.name : null;
        if (fnName && calledFunctions.has(fnName)) {
          relevantFunctions.push({
            name: fnName,
            startLine: nodePath.node.loc.start.line,
            endLine: nodePath.node.loc.end.line,
            code: lines.slice(nodePath.node.loc.start.line - 1, nodePath.node.loc.end.line).join('\n')
          });
          result.dependencies.calls.push(fnName);
        }
      }
    });

    result.slice.imports = relevantImports;
    result.slice.constants = relevantConstants;
    result.slice.functions = relevantFunctions;

    // Phase 4: Calculate total slice lines
    let sliceLines = result.slice.targetFunction.lines;
    for (const imp of relevantImports) {
      sliceLines += (imp.endLine - imp.startLine + 1);
    }
    for (const c of relevantConstants) {
      sliceLines += (c.endLine - c.startLine + 1);
    }
    for (const fn of relevantFunctions) {
      sliceLines += (fn.endLine - fn.startLine + 1);
    }
    result.slice.sliceLines = sliceLines;
    
    const reduction = ((1 - sliceLines / result.slice.totalLines) * 100).toFixed(1);
    result.slice.reduction = `${reduction}%`;

    // Phase 5: Optionally include assembled code
    if (options.includeCode !== false) {
      const codeBlocks = [];
      
      // Imports first
      for (const imp of relevantImports) {
        codeBlocks.push(`// Import from ${imp.source}`);
        codeBlocks.push(imp.code);
      }
      
      // Constants
      if (relevantConstants.length > 0) {
        codeBlocks.push('\n// Used constants');
        for (const c of relevantConstants) {
          codeBlocks.push(c.code);
        }
      }
      
      // Helper functions
      if (relevantFunctions.length > 0) {
        codeBlocks.push('\n// Called functions');
        for (const fn of relevantFunctions) {
          codeBlocks.push(fn.code);
        }
      }
      
      // Target function
      codeBlocks.push(`\n// Target: ${functionName}`);
      codeBlocks.push(lines.slice(targetStart - 1, targetEnd).join('\n'));
      
      result.code = codeBlocks.join('\n');
    }

    return result;

  } catch (err) {
    result.error = `Parse error: ${err.message}`;
    return result;
  }
}

module.exports = { contextSlice };
