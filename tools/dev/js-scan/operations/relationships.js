#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

/**
 * RelationshipAnalyzer: Semantic relationship queries for JavaScript code
 * 
 * Purpose: Answer three critical agent questions:
 * 1. What imports this function/module?
 * 2. What does this function call?
 * 3. Who uses this export?
 * 
 * Uses SWC AST analysis to build bidirectional import/call graphs
 */
class RelationshipAnalyzer {
  constructor(workspaceRoot, options = {}) {
    this.root = workspaceRoot;
    this.verbose = options.verbose || false;
    this.maxDepth = options.maxDepth || 3;
    this.includeTests = options.includeTests !== false;
    
    // Cache for imports/exports per file
    this.importCache = new Map();
    this.exportCache = new Map();
    this.callCache = new Map();
    
    // Graphs built on demand
    this.importGraph = null;
    this.callGraph = null;
  }

  /**
   * Query 1: What imports this function/module?
   * Returns all files that import the target
   */
  async whatImports(target, options = {}) {
    const results = {
      target,
      importers: [],
      importSummary: {},
      warning: null
    };

    try {
      // Normalize target path
      const targetPath = this._normalizePath(target);
      if (!fs.existsSync(targetPath)) {
        results.warning = `Target not found: ${target}`;
        return results;
      }

      // Get all JS files in workspace
      const allFiles = this._getAllJsFiles();

      // For each file, check if it imports the target
      for (const file of allFiles) {
        const imports = await this._extractImports(file);
        const fileImporters = imports.filter(imp => this._matchesTarget(imp.source, targetPath));
        
        if (fileImporters.length > 0) {
          results.importers.push({
            file,
            imports: fileImporters,
            count: fileImporters.length
          });
          
          // Summary statistics
          fileImporters.forEach(imp => {
            results.importSummary[imp.specifier] = (results.importSummary[imp.specifier] || 0) + 1;
          });
        }
      }

      results.importerCount = results.importers.length;
      results.totalImportCount = Object.values(results.importSummary).reduce((a, b) => a + b, 0);
      
      return results;
    } catch (err) {
      results.error = err.message;
      return results;
    }
  }

  /**
   * Query 2: What does this function call?
   * Returns all functions/imports this target function invokes
   */
  async whatCalls(targetFunction, options = {}) {
    const results = {
      targetFunction,
      callees: [],
      internalCalls: [],
      externalCalls: [],
      warning: null
    };

    try {
      // Find target function location
      const location = await this._findFunction(targetFunction);
      if (!location) {
        results.warning = `Function not found: ${targetFunction}`;
        return results;
      }

      // Extract calls from target function
      const calls = await this._extractCalls(location.file, location.functionName);
      
      results.callees = calls;
      results.internalCalls = calls.filter(c => !c.isExternal);
      results.externalCalls = calls.filter(c => c.isExternal);
      
      results.callCount = calls.length;
      results.internalCallCount = results.internalCalls.length;
      results.externalCallCount = results.externalCalls.length;

      return results;
    } catch (err) {
      results.error = err.message;
      return results;
    }
  }

  /**
   * Query 3: Who uses this export?
   * Combination of whatImports + whatCalls
   * Returns both importers and callers
   */
  async exportUsage(target, options = {}) {
    const results = {
      target,
      usage: {
        directImports: [],
        functionCalls: [],
        reexports: []
      },
      totalUsageCount: 0,
      riskLevel: 'LOW',
      recommendation: ''
    };

    try {
      // Get direct importers
      const importResults = await this.whatImports(target, options);
      results.usage.directImports = importResults.importers;

      // For each importer, check if they call the export
      const callData = [];
      for (const importer of importResults.importers) {
        const calls = await this._findCallsInFile(importer.file, target);
        if (calls.length > 0) {
          callData.push({
            file: importer.file,
            calls,
            count: calls.length
          });
        }
      }
      results.usage.functionCalls = callData;

      // Check for re-exports
      const reexports = await this._findReexports(target);
      results.usage.reexports = reexports;

      // Calculate total usage
      results.totalUsageCount = 
        results.usage.directImports.length +
        results.usage.functionCalls.reduce((sum, c) => sum + c.count, 0) +
        results.usage.reexports.length;

      // Risk assessment
      if (results.totalUsageCount > 20) {
        results.riskLevel = 'HIGH';
        results.recommendation = 'High usage - refactor carefully, update all importers';
      } else if (results.totalUsageCount > 5) {
        results.riskLevel = 'MEDIUM';
        results.recommendation = 'Moderate usage - run full test suite after changes';
      } else {
        results.riskLevel = 'LOW';
        results.recommendation = 'Safe to refactor - limited usage';
      }

      return results;
    } catch (err) {
      results.error = err.message;
      return results;
    }
  }

  /**
   * Transitive closure: What does target transitively depend on?
   * Follows import chain to depth N
   */
  async transitiveDependencies(target, maxDepth = 2) {
    const results = {
      target,
      dependencies: [],
      depth: 0,
      chain: []
    };

    const visited = new Set();
    const queue = [{ file: target, depth: 0, chain: [target] }];

    while (queue.length > 0 && results.depth < maxDepth) {
      const { file, depth, chain } = queue.shift();
      
      if (visited.has(file) || depth >= maxDepth) continue;
      visited.add(file);

      const imports = await this._extractImports(file);
      for (const imp of imports) {
        const resolved = this._resolveImportPath(imp.source, file);
        if (!visited.has(resolved)) {
          results.dependencies.push({
            file: resolved,
            depth,
            chain: [...chain, imp.source]
          });
          queue.push({ file: resolved, depth: depth + 1, chain: [...chain, resolved] });
        }
      }

      results.depth = Math.max(results.depth, depth + 1);
    }

    return results;
  }

  // ============ Private Helpers ============

  /**
   * Extract all import statements from a file
   */
  async _extractImports(filePath) {
    if (this.importCache.has(filePath)) {
      return this.importCache.get(filePath);
    }

    const imports = [];
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      
      // Simple regex-based import extraction (can upgrade to AST if needed)
      // Matches: import X from 'path', require('path'), etc.
      const patterns = [
        /import\s+(?:{[^}]*}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g,
        /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
        /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
      ];

      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const source = match[1];
          const specifier = match[0].split(/\s+/)[1] || source;
          imports.push({ source, specifier, line: this._getLineNumber(content, match.index) });
        }
      }

      this.importCache.set(filePath, imports);
      return imports;
    } catch (err) {
      this.verbose && console.error(`Error extracting imports from ${filePath}:`, err.message);
      return [];
    }
  }

  /**
   * Extract all export statements from a file
   */
  async _extractExports(filePath) {
    if (this.exportCache.has(filePath)) {
      return this.exportCache.get(filePath);
    }

    const exports = [];
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      
      // Match: export X, export { X }, export default, etc.
      const patterns = [
        /export\s+(?:async\s+)?(?:function|class)\s+(\w+)/g,
        /export\s+(?:const|let|var)\s+(\w+)/g,
        /export\s+{\s*([^}]+)\s*}/g,
        /export\s+default\s+/g
      ];

      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const name = match[1] || 'default';
          exports.push({ name, line: this._getLineNumber(content, match.index) });
        }
      }

      this.exportCache.set(filePath, exports);
      return exports;
    } catch (err) {
      this.verbose && console.error(`Error extracting exports from ${filePath}:`, err.message);
      return [];
    }
  }

  /**
   * Extract function calls within a target function
   */
  async _extractCalls(filePath, functionName) {
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Find function body using simple regex (improvement: use AST)
    const funcPattern = new RegExp(
      `(?:function|const|let|var)\\s+${functionName}\\s*(?:\\(|=)`,
      'g'
    );
    
    const match = funcPattern.exec(content);
    if (!match) return [];

    // Extract function body
    const start = match.index;
    const bodyStart = content.indexOf('{', start);
    const bodyEnd = this._findMatchingBrace(content, bodyStart);
    const functionBody = content.substring(bodyStart, bodyEnd);

    // Find all function calls (simple pattern: word followed by parenthesis)
    const callPattern = /(\w+)\s*\(/g;
    const calls = [];
    let callMatch;

    while ((callMatch = callPattern.exec(functionBody)) !== null) {
      const callee = callMatch[1];
      // Filter out keywords and common patterns
      if (!this._isKeyword(callee) && callee.length > 2) {
        calls.push({
          name: callee,
          isExternal: this._isLikelyImport(callee, content),
          line: this._getLineNumber(functionBody, callMatch.index)
        });
      }
    }

    return calls;
  }

  /**
   * Find calls to a specific function in a file
   */
  async _findCallsInFile(filePath, functionName) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const pattern = new RegExp(`\\b${functionName}\\s*\\(`, 'g');
    const calls = [];
    let match;

    while ((match = pattern.exec(content)) !== null) {
      calls.push({
        name: functionName,
        line: this._getLineNumber(content, match.index),
        context: content.substring(
          Math.max(0, match.index - 30),
          Math.min(content.length, match.index + 50)
        )
      });
    }

    return calls;
  }

  /**
   * Find re-exports of a target
   */
  async _findReexports(target) {
    const reexports = [];
    const allFiles = this._getAllJsFiles();

    for (const file of allFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      if (content.includes(`export`) && content.includes(target)) {
        reexports.push(file);
      }
    }

    return reexports;
  }

  /**
   * Find function location (file + line)
   */
  async _findFunction(functionName) {
    const allFiles = this._getAllJsFiles();

    for (const file of allFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const pattern = new RegExp(
        `(?:export\\s+)?(?:async\\s+)?(?:function|const|let|var)\\s+${functionName}\\b`,
        'g'
      );

      if (pattern.test(content)) {
        return {
          file,
          functionName,
          line: this._getLineNumber(content, pattern.lastIndex)
        };
      }
    }

    return null;
  }

  // ============ Utility Methods ============

  _normalizePath(filePath) {
    if (path.isAbsolute(filePath)) return filePath;
    return path.join(this.root, filePath);
  }

  _matchesTarget(importSource, targetPath) {
    // Normalize both paths for comparison
    const normalized = this._resolveImportPath(importSource);
    return normalized === targetPath || 
           normalized.endsWith(targetPath) ||
           targetPath.endsWith(normalized);
  }

  _resolveImportPath(importPath, fromFile = null) {
    if (path.isAbsolute(importPath)) return importPath;
    if (!importPath.startsWith('.')) {
      // npm module
      return path.join(this.root, 'node_modules', importPath);
    }
    if (fromFile) {
      return path.resolve(path.dirname(fromFile), importPath);
    }
    return path.join(this.root, importPath);
  }

  _getAllJsFiles() {
    const files = [];
    const walk = (dir) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(full);
          } else if (entry.name.endsWith('.js')) {
            files.push(full);
          }
        }
      } catch (err) {
        // Skip unreadable directories
      }
    };
    walk(this.root);
    return files;
  }

  _findMatchingBrace(content, start) {
    let depth = 0;
    for (let i = start; i < content.length; i++) {
      if (content[i] === '{') depth++;
      if (content[i] === '}') {
        depth--;
        if (depth === 0) return i + 1;
      }
    }
    return content.length;
  }

  _getLineNumber(content, index) {
    return content.substring(0, index).split('\n').length;
  }

  _isKeyword(word) {
    const keywords = ['if', 'for', 'while', 'switch', 'catch', 'return', 'throw', 'new'];
    return keywords.includes(word);
  }

  _isLikelyImport(word, content) {
    // Check if word appears in import statements
    return /import\s+.*\b{word}\b|require\s*\(.*{word}/.test(content.substring(0, content.indexOf(word)));
  }
}

module.exports = RelationshipAnalyzer;
