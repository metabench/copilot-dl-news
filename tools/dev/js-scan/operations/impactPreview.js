#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

/**
 * Impact Preview: Analyze the risk of modifying a file
 * 
 * Purpose: Before editing a file, understand:
 * - What exports are used elsewhere
 * - How many files depend on each export
 * - Risk level (LOW/MEDIUM/HIGH) based on usage count
 * 
 * Helps agents decide whether to proceed with a refactor
 */

/**
 * Analyze the impact of modifying a file
 * @param {string} filePath - Path to the file to analyze
 * @param {Object} options - Options
 * @returns {Object} Impact analysis result
 */
async function impactPreview(filePath, options = {}) {
  const result = {
    file: filePath,
    exports: [],
    summary: {
      totalExports: 0,
      highRisk: 0,
      mediumRisk: 0,
      lowRisk: 0,
      safeToModify: []
    },
    recommendations: [],
    error: null
  };

  try {
    const absolutePath = path.resolve(filePath);
    if (!fs.existsSync(absolutePath)) {
      result.error = `File not found: ${absolutePath}`;
      return result;
    }

    const source = fs.readFileSync(absolutePath, 'utf-8');
    
    // Parse with Babel
    const ast = parser.parse(source, {
      sourceType: 'unambiguous',
      plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator']
    });

    // Phase 1: Extract all exports from this file
    const exports = [];

    traverse(ast, {
      ExportNamedDeclaration(nodePath) {
        const decl = nodePath.node.declaration;
        if (decl) {
          if (decl.type === 'FunctionDeclaration' && decl.id) {
            exports.push({
              name: decl.id.name,
              type: 'function',
              line: nodePath.node.loc.start.line,
              isDefault: false
            });
          } else if (decl.type === 'ClassDeclaration' && decl.id) {
            exports.push({
              name: decl.id.name,
              type: 'class',
              line: nodePath.node.loc.start.line,
              isDefault: false
            });
          } else if (decl.type === 'VariableDeclaration') {
            for (const declarator of decl.declarations) {
              if (declarator.id && declarator.id.name) {
                const init = declarator.init;
                let type = 'variable';
                if (init && (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')) {
                  type = 'function';
                } else if (init && init.type === 'ObjectExpression') {
                  type = 'object';
                }
                exports.push({
                  name: declarator.id.name,
                  type,
                  line: nodePath.node.loc.start.line,
                  isDefault: false
                });
              }
            }
          }
        }

        // Handle export { name1, name2 }
        if (nodePath.node.specifiers) {
          for (const spec of nodePath.node.specifiers) {
            if (spec.exported && spec.exported.name) {
              exports.push({
                name: spec.exported.name,
                type: 'reexport',
                line: nodePath.node.loc.start.line,
                isDefault: false,
                localName: spec.local ? spec.local.name : spec.exported.name
              });
            }
          }
        }
      },

      ExportDefaultDeclaration(nodePath) {
        const decl = nodePath.node.declaration;
        let name = 'default';
        let type = 'unknown';

        if (decl.type === 'FunctionDeclaration' && decl.id) {
          name = decl.id.name;
          type = 'function';
        } else if (decl.type === 'ClassDeclaration' && decl.id) {
          name = decl.id.name;
          type = 'class';
        } else if (decl.type === 'Identifier') {
          name = decl.name;
          type = 'reference';
        }

        exports.push({
          name,
          type,
          line: nodePath.node.loc.start.line,
          isDefault: true
        });
      },

      // Handle module.exports = { ... }
      AssignmentExpression(nodePath) {
        const left = nodePath.node.left;
        const right = nodePath.node.right;

        if (left.type === 'MemberExpression' &&
            left.object && left.object.name === 'module' &&
            left.property && left.property.name === 'exports') {
          
          if (right.type === 'ObjectExpression') {
            for (const prop of right.properties) {
              if (prop.key && (prop.key.name || prop.key.value)) {
                const name = prop.key.name || prop.key.value;
                let type = 'property';
                if (prop.value && (prop.value.type === 'FunctionExpression' || 
                    prop.value.type === 'ArrowFunctionExpression' ||
                    prop.value.type === 'Identifier')) {
                  type = 'function';
                }
                exports.push({
                  name,
                  type,
                  line: nodePath.node.loc.start.line,
                  isDefault: false,
                  exportStyle: 'commonjs'
                });
              }
            }
          } else if (right.type === 'Identifier') {
            exports.push({
              name: right.name,
              type: 'reference',
              line: nodePath.node.loc.start.line,
              isDefault: true,
              exportStyle: 'commonjs'
            });
          }
        }
      }
    });

    result.exports = exports;
    result.summary.totalExports = exports.length;

    // Phase 2: Find all files that import from this file
    const workspaceRoot = options.workspaceRoot || findWorkspaceRoot(absolutePath);
    const allFiles = getAllJsFiles(workspaceRoot, options);
    const relativeFilePath = path.relative(workspaceRoot, absolutePath);
    
    // Track usage counts for each export
    const usageCounts = {};
    exports.forEach(exp => {
      usageCounts[exp.name] = { count: 0, files: [] };
    });

    for (const otherFile of allFiles) {
      if (otherFile === absolutePath) continue;

      try {
        const otherSource = fs.readFileSync(otherFile, 'utf-8');
        const otherAst = parser.parse(otherSource, {
          sourceType: 'unambiguous',
          plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator']
        });

        traverse(otherAst, {
          ImportDeclaration(nodePath) {
            const importSource = nodePath.node.source.value;
            if (matchesTarget(importSource, absolutePath, otherFile)) {
              for (const spec of nodePath.node.specifiers) {
                let importedName = null;
                if (spec.type === 'ImportDefaultSpecifier') {
                  // Default import - mark as 'default' usage
                  const defaultExport = exports.find(e => e.isDefault);
                  if (defaultExport && usageCounts[defaultExport.name]) {
                    usageCounts[defaultExport.name].count++;
                    usageCounts[defaultExport.name].files.push(path.relative(workspaceRoot, otherFile));
                  }
                } else if (spec.type === 'ImportSpecifier') {
                  importedName = spec.imported ? spec.imported.name : spec.local.name;
                  if (usageCounts[importedName]) {
                    usageCounts[importedName].count++;
                    usageCounts[importedName].files.push(path.relative(workspaceRoot, otherFile));
                  }
                } else if (spec.type === 'ImportNamespaceSpecifier') {
                  // import * as X - counts as using all exports
                  exports.forEach(exp => {
                    usageCounts[exp.name].count++;
                    usageCounts[exp.name].files.push(path.relative(workspaceRoot, otherFile));
                  });
                }
              }
            }
          },

          CallExpression(nodePath) {
            // Handle require()
            if (nodePath.node.callee.name === 'require' &&
                nodePath.node.arguments.length > 0 &&
                nodePath.node.arguments[0].type === 'StringLiteral') {
              const requireSource = nodePath.node.arguments[0].value;
              if (matchesTarget(requireSource, absolutePath, otherFile)) {
                // Find destructuring: const { x } = require(...)
                const parent = nodePath.parentPath;
                if (parent.isVariableDeclarator()) {
                  const id = parent.node.id;
                  if (id.type === 'ObjectPattern') {
                    for (const prop of id.properties) {
                      const name = prop.key ? prop.key.name : null;
                      if (name && usageCounts[name]) {
                        usageCounts[name].count++;
                        usageCounts[name].files.push(path.relative(workspaceRoot, otherFile));
                      }
                    }
                  } else if (id.type === 'Identifier') {
                    // const X = require(...) - assume uses default/module
                    const defaultExport = exports.find(e => e.isDefault);
                    if (defaultExport && usageCounts[defaultExport.name]) {
                      usageCounts[defaultExport.name].count++;
                      usageCounts[defaultExport.name].files.push(path.relative(workspaceRoot, otherFile));
                    }
                  }
                }
              }
            }
          }
        });
      } catch (parseErr) {
        // Skip files that can't be parsed
        continue;
      }
    }

    // Phase 3: Calculate risk levels
    for (const exp of exports) {
      const usage = usageCounts[exp.name] || { count: 0, files: [] };
      exp.usageCount = usage.count;
      exp.usedBy = [...new Set(usage.files)]; // Deduplicate
      
      // Risk thresholds
      if (usage.count === 0) {
        exp.risk = 'NONE';
        result.summary.safeToModify.push(exp.name);
      } else if (usage.count <= 2) {
        exp.risk = 'LOW';
        result.summary.lowRisk++;
      } else if (usage.count <= 10) {
        exp.risk = 'MEDIUM';
        result.summary.mediumRisk++;
      } else {
        exp.risk = 'HIGH';
        result.summary.highRisk++;
      }
    }

    // Phase 4: Generate recommendations
    if (result.summary.highRisk > 0) {
      const highRiskExports = exports.filter(e => e.risk === 'HIGH').map(e => e.name);
      result.recommendations.push({
        type: 'warning',
        message: `High-risk exports (${highRiskExports.join(', ')}) have >10 usages. Refactor carefully and update all importers.`
      });
    }

    if (result.summary.safeToModify.length > 0) {
      result.recommendations.push({
        type: 'info',
        message: `Safe to modify/remove: ${result.summary.safeToModify.join(', ')} (no external usages found)`
      });
    }

    const totalUsages = exports.reduce((sum, e) => sum + (e.usageCount || 0), 0);
    if (totalUsages === 0) {
      result.recommendations.push({
        type: 'info',
        message: 'This file has no external consumers. Safe to refactor freely.'
      });
    }

    return result;

  } catch (err) {
    result.error = `Analysis error: ${err.message}`;
    return result;
  }
}

/**
 * Find workspace root by looking for package.json or .git
 */
function findWorkspaceRoot(startDir) {
  let current = path.dirname(startDir);
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, 'package.json')) ||
        fs.existsSync(path.join(current, '.git'))) {
      return current;
    }
    current = path.dirname(current);
  }
  return path.dirname(startDir);
}

/**
 * Get all JS/TS files in workspace
 */
function getAllJsFiles(workspaceRoot, options = {}) {
  const files = [];
  const excludeDirs = ['node_modules', '.git', 'dist', 'build', 'coverage', '.next'];
  
  function walk(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!excludeDirs.includes(entry.name) && !entry.name.startsWith('.')) {
            walk(fullPath);
          }
        } else if (entry.isFile()) {
          if (/\.(js|jsx|ts|tsx|mjs|cjs)$/.test(entry.name)) {
            files.push(fullPath);
          }
        }
      }
    } catch (err) {
      // Skip directories we can't read
    }
  }
  
  walk(workspaceRoot);
  return files;
}

/**
 * Check if an import source matches the target file
 */
function matchesTarget(importSource, targetPath, currentFile) {
  // Skip package imports
  if (!importSource.startsWith('.') && !importSource.startsWith('/')) {
    return false;
  }

  const currentDir = path.dirname(currentFile);
  let resolvedImport = path.resolve(currentDir, importSource);
  
  // Try with extensions
  const extensions = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', ''];
  for (const ext of extensions) {
    const withExt = resolvedImport + ext;
    if (withExt === targetPath || path.normalize(withExt) === path.normalize(targetPath)) {
      return true;
    }
  }
  
  // Try index files
  const indexFiles = ['index.js', 'index.jsx', 'index.ts', 'index.tsx'];
  for (const indexFile of indexFiles) {
    const withIndex = path.join(resolvedImport, indexFile);
    if (withIndex === targetPath || path.normalize(withIndex) === path.normalize(targetPath)) {
      return true;
    }
  }

  return false;
}

module.exports = { impactPreview };
