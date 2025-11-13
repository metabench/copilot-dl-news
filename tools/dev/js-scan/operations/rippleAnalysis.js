/**
 * rippleAnalysis.js — Dependency graph analysis for safe refactoring
 * 
 * Provides:
 * - DependencyGraphBuilder: Multi-layer import + call graph construction
 * - RiskScorer: Risk calculation with 0-100 scale (GREEN/YELLOW/RED)
 * - CircularDependencyDetector: Cycle detection in dependency chains
 * - Safety assertions: canRename, canDelete, canModifySignature
 * 
 * @module tools/dev/js-scan/operations/rippleAnalysis
 */

const fs = require('fs');
const path = require('path');

/**
 * DependencyGraphBuilder — Constructs multi-layer dependency graph
 * 
 * Layers:
 * - Layer 0: Direct imports (what this module imports)
 * - Layer 1+: Transitive dependencies (what imports this module)
 */
class DependencyGraphBuilder {
  constructor(options = {}) {
    this.graph = new Map(); // file -> { imports: [], importedBy: [], calls: {} }
    this.visited = new Set();
    this.maxDepth = options.maxDepth || 4;
    this.logger = options.logger || (() => {});
  }

  /**
   * Build dependency graph starting from a file
   * @param {string} startFile - File to analyze
   * @param {string} workspaceRoot - Root directory to search
   * @returns {Object} Graph metadata with stats
   */
  build(startFile, workspaceRoot = process.cwd()) {
    this.graph.clear();
    this.visited.clear();
    this.workspaceRoot = workspaceRoot;

    // Layer 0: Direct imports
    this._buildLayer0(startFile, workspaceRoot);

    // Layer 1+: Transitive imports (what imports this file)
    this._buildLayers(startFile, workspaceRoot);

    return {
      targetFile: startFile,
      nodeCount: this.graph.size,
      edgeCount: this._countEdges(),
      depth: this._calculateDepth(),
      hasCycles: this.hasCycles(),
      nodes: Array.from(this.graph.entries()).map(([file, data]) => ({
        file,
        depth: data.depth || 0,
        importCount: data.imports?.length || 0,
        importedByCount: data.importedBy?.length || 0,
        callSites: Object.keys(data.calls || {}).length
      }))
    };
  }

  /**
   * Build Layer 0: Direct imports from target file
   */
  _buildLayer0(file, workspaceRoot) {
    if (!fs.existsSync(file)) return;

    const content = fs.readFileSync(file, 'utf-8');
    const imports = this._parseImports(content, file, workspaceRoot);

    if (!this.graph.has(file)) {
      this.graph.set(file, { imports: [], importedBy: [], calls: {}, depth: 0 });
    }

    this.graph.get(file).imports = imports;

    for (const imported of imports) {
      if (!this.graph.has(imported)) {
        this.graph.set(imported, { imports: [], importedBy: [], calls: {}, depth: 1 });
      }
      const importedNode = this.graph.get(imported);
      if (!importedNode.importedBy.includes(file)) {
        importedNode.importedBy.push(file);
      }
    }
  }

  /**
   * Build Layers 1+: Reverse dependency chain
   */
  _buildLayers(targetFile, workspaceRoot, currentDepth = 1) {
    if (currentDepth >= this.maxDepth) return;

    // Find all files that import the target
    const jsFiles = this._findJsFiles(workspaceRoot);

    for (const file of jsFiles) {
      if (this.visited.has(file)) continue;
      this.visited.add(file);

      const content = fs.readFileSync(file, 'utf-8');
      const imports = this._parseImports(content, file, workspaceRoot);

      if (imports.includes(targetFile)) {
        if (!this.graph.has(file)) {
          this.graph.set(file, { imports: [], importedBy: [], calls: {}, depth: currentDepth });
        }

        const fileNode = this.graph.get(file);
        if (!fileNode.imports.includes(targetFile)) {
          fileNode.imports.push(targetFile);
        }

        // Recursively build next layer
        this._buildLayers(file, workspaceRoot, currentDepth + 1);
      }
    }
  }

  /**
   * Parse import/require statements from content
   */
  _parseImports(content, sourceFile, workspaceRoot) {
    const imports = [];
    const importPatterns = [
      /import\s+(?:.*?)\s+from\s+['"]([^'"]+)['"]/g,
      /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
    ];

    for (const pattern of importPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const importPath = match[1];
        if (!importPath.startsWith('.')) continue; // Skip node_modules

        const resolved = this._resolveImportPath(importPath, sourceFile, workspaceRoot);
        if (resolved && fs.existsSync(resolved)) {
          imports.push(resolved);
        }
      }
    }

    return imports;
  }

  /**
   * Resolve relative import to absolute path
   */
  _resolveImportPath(importPath, sourceFile, workspaceRoot) {
    if (importPath.startsWith('.')) {
      const dir = path.dirname(sourceFile);
      let resolved = path.resolve(dir, importPath);

      // Try with extensions if no extension provided
      if (!path.extname(resolved)) {
        for (const ext of ['.js', '.ts', '/index.js', '/index.ts']) {
          const candidate = resolved + ext;
          if (fs.existsSync(candidate)) return candidate;
        }
      }
      return resolved;
    }
    return null;
  }

  /**
   * Find all JavaScript files in workspace
   */
  _findJsFiles(directory, maxFiles = 500) {
    const files = [];
    const _walk = (dir, depth = 0) => {
      if (depth > 5 || files.length >= maxFiles) return;
      if (!fs.existsSync(dir)) return;

      try {
        const entries = fs.readdirSync(dir);
        for (const entry of entries) {
          if (files.length >= maxFiles) break;
          if (entry.startsWith('.')) continue;

          const fullPath = path.join(dir, entry);
          const stat = fs.statSync(fullPath);

          if (stat.isDirectory()) {
            _walk(fullPath, depth + 1);
          } else if (entry.endsWith('.js') || entry.endsWith('.ts')) {
            files.push(fullPath);
          }
        }
      } catch (e) {
        // Skip permission errors
      }
    };

    _walk(directory);
    return files;
  }

  /**
   * Check if graph has circular dependencies
   */
  hasCycles() {
    for (const node of this.graph.keys()) {
      if (this._hasCycleDFS(node, new Set())) return true;
    }
    return false;
  }

  /**
   * DFS cycle detection
   */
  _hasCycleDFS(node, visiting) {
    if (visiting.has(node)) return true;
    visiting.add(node);

    const graphNode = this.graph.get(node);
    if (graphNode && graphNode.imports) {
      for (const imported of graphNode.imports) {
        if (this._hasCycleDFS(imported, new Set(visiting))) return true;
      }
    }

    return false;
  }

  /**
   * Count total edges in graph
   */
  _countEdges() {
    let count = 0;
    for (const node of this.graph.values()) {
      count += (node.imports?.length || 0) + (node.importedBy?.length || 0);
    }
    return Math.floor(count / 2); // Each edge counted twice
  }

  /**
   * Calculate maximum depth in graph
   */
  _calculateDepth() {
    let maxDepth = 0;
    for (const node of this.graph.values()) {
      maxDepth = Math.max(maxDepth, node.depth || 0);
    }
    return maxDepth;
  }
}

/**
 * RiskScorer — Calculates refactoring risk (0-100 scale)
 * 
 * Risk factors:
 * - Importers count (high = risky)
 * - Circular dependencies (critical)
 * - Public interface changes (high)
 * - Usage patterns (widespread = risky)
 */
class RiskScorer {
  constructor(options = {}) {
    this.weights = {
      importerCount: 0.4,
      circularDeps: 0.3,
      publicInterface: 0.2,
      usagePatterns: 0.1
    };
    Object.assign(this.weights, options.weights || {});
  }

  /**
   * Calculate risk score (0-100)
   * @returns {Object} { score, level (GREEN/YELLOW/RED), factors }
   */
  score(graphMetadata, targetFile) {
    const factors = {
      importerCount: this._scoreImporters(graphMetadata),
      circularDeps: graphMetadata.hasCycles ? 100 : 0,
      publicInterface: this._scorePublicInterface(targetFile),
      usagePatterns: this._scoreUsagePatterns(graphMetadata)
    };

    // Weighted score
    let totalScore = 0;
    for (const [key, weight] of Object.entries(this.weights)) {
      totalScore += factors[key] * weight;
    }

    const level = totalScore < 30 ? 'GREEN' : totalScore < 70 ? 'YELLOW' : 'RED';

    return {
      score: Math.round(totalScore),
      level,
      factors,
      recommendations: this._getRecommendations(totalScore, level, graphMetadata)
    };
  }

  /**
   * Score based on number of importers
   */
  _scoreImporters(graphMetadata) {
    const maxImporters = 20;
    const importerNodes = graphMetadata.nodes.filter(n => n.importedByCount > 0);
    const avgImporters = importerNodes.length > 0
      ? importerNodes.reduce((sum, n) => sum + n.importedByCount, 0) / importerNodes.length
      : 0;

    return Math.min(100, (avgImporters / maxImporters) * 100);
  }

  /**
   * Score based on public interface
   */
  _scorePublicInterface(targetFile) {
    if (!fs.existsSync(targetFile)) return 0;

    const content = fs.readFileSync(targetFile, 'utf-8');
    const exportCount = (content.match(/export\s+(const|function|class)/g) || []).length;

    // More exports = higher risk
    return Math.min(100, exportCount * 10);
  }

  /**
   * Score based on usage patterns
   */
  _scoreUsagePatterns(graphMetadata) {
    if (graphMetadata.nodeCount === 0) return 0;

    // Widespread usage = higher risk
    const usageSpread = (graphMetadata.nodeCount / 50) * 100;
    return Math.min(100, usageSpread);
  }

  /**
   * Generate recommendations based on risk
   */
  _getRecommendations(score, level, graphMetadata) {
    const recommendations = [];

    if (level === 'RED') {
      recommendations.push('⚠️  HIGH RISK: Consider breaking changes into smaller refactors');
      recommendations.push('⚠️  Review all importers before proceeding');
      if (graphMetadata.hasCycles) {
        recommendations.push('⚠️  CRITICAL: Circular dependencies detected. Resolve these first.');
      }
    } else if (level === 'YELLOW') {
      recommendations.push('✓ MODERATE RISK: Proceed with caution');
      recommendations.push('✓ Update import statements carefully');
      recommendations.push('✓ Run full test suite after changes');
    } else {
      recommendations.push('✓ LOW RISK: Safe to refactor');
      recommendations.push('✓ Limited impact on codebase');
    }

    return recommendations;
  }
}

/**
 * CircularDependencyDetector — Finds circular import chains
 */
class CircularDependencyDetector {
  constructor(options = {}) {
    this.logger = options.logger || (() => {});
  }

  /**
   * Detect all circular dependencies in graph
   */
  detect(graphMetadata) {
    const cycles = [];

    // Build adjacency list from metadata
    const adjList = new Map();
    for (const node of graphMetadata.nodes) {
      adjList.set(node.file, node.imports || []);
    }

    // DFS from each node
    for (const startNode of adjList.keys()) {
      const cycle = this._findCycleDFS(startNode, startNode, adjList, new Set(), []);
      if (cycle) {
        cycles.push(cycle);
      }
    }

    return {
      hasCycles: cycles.length > 0,
      cycleCount: cycles.length,
      cycles: cycles.slice(0, 10) // Limit to 10 cycles
    };
  }

  /**
   * DFS to find cycle starting from a node
   */
  _findCycleDFS(current, target, adjList, visiting, path) {
    if (visiting.has(current)) {
      if (current === target && path.length > 1) {
        return [...path, current]; // Found cycle back to start
      }
      return null;
    }

    visiting.add(current);
    path.push(current);

    const neighbors = adjList.get(current) || [];
    for (const neighbor of neighbors) {
      const cycle = this._findCycleDFS(neighbor, target, adjList, new Set(visiting), [...path]);
      if (cycle) return cycle;
    }

    return null;
  }
}

/**
 * Safety assertions — Can this target be safely refactored?
 */
class SafetyAssertions {
  static canRename(graphMetadata, riskScore) {
    return riskScore.level !== 'RED' && !graphMetadata.hasCycles;
  }

  static canDelete(graphMetadata, riskScore) {
    // Much riskier than rename
    return riskScore.level === 'GREEN' && graphMetadata.nodes.every(n => n.importedByCount <= 1);
  }

  static canModifySignature(graphMetadata, riskScore) {
    return riskScore.level !== 'RED' && graphMetadata.nodeCount < 20;
  }

  static canExtract(graphMetadata, riskScore) {
    return riskScore.level !== 'RED' && !graphMetadata.hasCycles;
  }
}

/**
 * Main ripple analysis function
 */
async function analyzeRipple(targetFile, options = {}) {
  const workspaceRoot = options.workspaceRoot || process.cwd();
  const logger = options.logger || (() => {});

  try {
    // Build graph
    const builder = new DependencyGraphBuilder({ maxDepth: options.depth || 3, logger });
    const graphMetadata = builder.build(targetFile, workspaceRoot);

    // Score risk
    const scorer = new RiskScorer();
    const riskScore = scorer.score(graphMetadata, targetFile);

    // Detect cycles
    const cycleDetector = new CircularDependencyDetector({ logger });
    const cycleAnalysis = cycleDetector.detect(graphMetadata);

    // Safety assertions
    const assertions = {
      canRename: SafetyAssertions.canRename(graphMetadata, riskScore),
      canDelete: SafetyAssertions.canDelete(graphMetadata, riskScore),
      canModifySignature: SafetyAssertions.canModifySignature(graphMetadata, riskScore),
      canExtract: SafetyAssertions.canExtract(graphMetadata, riskScore)
    };

    return {
      targetFile,
      success: true,
      graph: graphMetadata,
      risk: riskScore,
      cycles: cycleAnalysis,
      safetyAssertions: assertions,
      summary: {
        message: `Ripple analysis for ${path.basename(targetFile)}: ${riskScore.level} risk`,
        nodeCount: graphMetadata.nodeCount,
        riskScore: riskScore.score,
        riskLevel: riskScore.level,
        hasCycles: cycleAnalysis.hasCycles
      }
    };
  } catch (error) {
    return {
      targetFile,
      success: false,
      error: error.message,
      safetyAssertions: {
        canRename: false,
        canDelete: false,
        canModifySignature: false,
        canExtract: false
      }
    };
  }
}

module.exports = {
  analyzeRipple,
  DependencyGraphBuilder,
  RiskScorer,
  CircularDependencyDetector,
  SafetyAssertions
};
