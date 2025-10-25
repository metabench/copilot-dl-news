#!/usr/bin/env node

/**
 * review-non-db-data - Discover and analyze data stored outside the database
 *
 * This tool helps intelligent agents identify data files that should potentially be moved
 * to the database for better consistency, performance, and maintainability.
 *
 * IMPORTANT: Some JSON files are intentionally kept outside the DB:
 * - bootstrap-db.json: Essential bootstrap configuration, small and rarely changes
 * - Configuration files: Need to be editable and version controlled
 * - Small reference data: May be more convenient to keep as JSON
 *
 * PROCESS OVERVIEW:
 * 1. Scan directories for data files (JSON, NDJSON, config files)
 * 2. Analyze file contents and data structures
 * 3. Calculate data system sizes by category/directory
 * 4. Find code references to understand usage patterns
 * 5. Suggest database migration strategies
 * 6. Provide refactoring guidance for moving data to DB
 *
 * REFACTORING APPROACH:
 * - Start with read-only analysis (this tool)
 * - EXAMINE EXISTING DATABASE STRUCTURES FIRST
 * - Plan new structures that integrate well with normalized DB design
 * - Use foreign keys and proper relationships
 * - Create DB schema for the data
 * - Write migration scripts to import data
 * - Update code to use DB instead of files
 * - Test thoroughly before removing old files
 * - Update DSPL loading and other data access patterns
 */

const fs = require('fs');
const path = require('path');
// const { ensureDatabase } = require('../src/db/sqlite'); // Moved to initialize() to avoid import errors during help

// Check for help flag first, before any imports that might fail
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Review Non-DB Data Tool

Discover and analyze data stored outside the database to guide refactoring efforts.

USAGE:
  node review-non-db-data.js discover [options]
  node review-non-db-data.js analyze <file>
  node review-non-db-data.js search <system> [options]

COMMANDS:
  discover              Discover and analyze non-DB data files
  analyze <file>        Analyze a specific data file in detail
  search <system>       Search for implementation of a data storage system

DISCOVER OPTIONS:
  --dirs <dirs...>      Directories to scan (default: data, config, src/data, src/config)
  --extensions <exts>   File extensions to scan (default: .json, .ndjson, .yaml, .yml)
  --detailed            Show detailed analysis for each file
  --usage               Search for code usage of discovered files
  --no-migrations       Skip migration suggestions
  --json                Output results as JSON

SEARCH OPTIONS:
  --system <name>       Data system to search for (gazetteer, dspl-patterns, bootstrap, etc.)
  --terms <terms...>    Additional search terms to include
  --files-only          Show only file locations, not code snippets
  --context <lines>     Lines of context around matches (default: 2)

EXAMPLES:
  node review-non-db-data.js discover
  node review-non-db-data.js discover --detailed --usage
  node review-non-db-data.js discover --dirs data/dspls
  node review-non-db-data.js analyze data/dspls/theguardian.com.json
  node review-non-db-data.js search gazetteer
  node review-non-db-data.js search dspl-patterns --terms "news" "article"
  node review-non-db-data.js search bootstrap --files-only

PROCESS OVERVIEW:
  This tool helps agents refactor the codebase to move data from disk files to the database.

  1. DISCOVERY: Scans directories for JSON, NDJSON, and other data files
  2. ANALYSIS: Examines file contents, structure, and usage patterns
  3. SIZE CALCULATION: Shows total sizes of data systems by category/directory
  4. CODE SEARCH: Identifies where storage systems are implemented in the codebase
  5. ASSESSMENT: Evaluates migration complexity and suggests strategies
  6. GUIDANCE: Provides refactoring steps for moving data to DB

ACCEPTABLE FILES OUTSIDE DB:
  • bootstrap-db.json: Essential bootstrap config (small, rarely changes)
  • Configuration files: Need to be editable and version controlled
  • Small reference data: May be more convenient to keep as JSON
  • Runtime config: Environment-specific settings

REFACTORING WORKFLOW:
  • Run this tool first to understand what data exists outside DB
  • EXAMINE EXISTING DATABASE STRUCTURES before planning changes
  • Plan new structures that INTEGRATE WELL with normalized DB design
  • Use FOREIGN KEYS and proper relationships between tables
  • Create DB schema for the discovered data structures
  • Write migration scripts to import data from files to DB
  • Update code to query DB instead of reading files
  • Test thoroughly before removing old files
  • Update DSPL loading and other data access patterns

DATABASE INTEGRATION GUIDANCE:
  • Always examine existing tables and their relationships first
  • Design normalized structures (avoid duplication, use foreign keys)
  • Consider how new data relates to existing entities
  • Plan for referential integrity and cascading updates/deletes
  • Ensure new tables fit the existing database architecture

CODE SEARCH FEATURES:
  • Search for data system implementation across the entire codebase
  • Find database queries, file I/O operations, and data processing logic
  • Identify services, modules, and functions that handle specific data systems
  • Locate configuration loading, data validation, and transformation code
  • Discover API endpoints and UI components that interact with the data
`);
  process.exit(0);
}

class ReviewNonDbData {
  constructor() {
    this.db = null;
    this.logger = console;
    this.scanDirectories = [
      'data',
      'config',
      'src/data',
      'src/config'
    ];
    this.fileExtensions = ['.json', '.ndjson', '.yaml', '.yml', '.txt', '.csv'];
  }

  async initialize() {
    const { ensureDatabase } = require('./src/db/sqlite');
    this.db = ensureDatabase();
  }

  /**
   * Main discovery workflow
   */
  async discoverData(options = {}) {
    const {
      directories = this.scanDirectories,
      extensions = this.fileExtensions,
      analyzeUsage = true,
      suggestMigrations = true
    } = options;

    this.logger.log('🔍 Starting non-DB data discovery...\n');

    const findings = [];

    // Phase 1: Scan directories for data files
    for (const dir of directories) {
      if (fs.existsSync(dir)) {
        const files = this.scanDirectory(dir, extensions);
        findings.push(...files);
      }
    }

    // Phase 2: Analyze each file
    const analyzed = [];
    for (const file of findings) {
      const analysis = await this.analyzeFile(file);
      analyzed.push(analysis);
    }

    // Phase 3: Find code usage (optional)
    if (analyzeUsage) {
      for (const analysis of analyzed) {
        analysis.usage = await this.findCodeUsage(analysis.path);
      }
    }

    // Phase 4: Suggest migrations
    if (suggestMigrations) {
      for (const analysis of analyzed) {
        analysis.migration = this.suggestMigration(analysis);
      }
    }

    return analyzed;
  }

  /**
   * Scan directory for data files
   */
  scanDirectory(dir, extensions) {
    const files = [];

    function scan(currentDir) {
      try {
        const items = fs.readdirSync(currentDir);

        for (const item of items) {
          const fullPath = path.join(currentDir, item);
          const stat = fs.statSync(fullPath);

          if (stat.isDirectory()) {
            // Skip common non-data directories
            if (!['node_modules', '.git', 'backups', 'cache'].includes(item)) {
              scan(fullPath);
            }
          } else if (stat.isFile()) {
            const ext = path.extname(item);
            if (extensions.includes(ext) || this.isLikelyDataFile(fullPath)) {
              files.push({
                path: fullPath,
                relativePath: path.relative(process.cwd(), fullPath),
                size: stat.size,
                modified: stat.mtime.toISOString()
              });
            }
          }
        }
      } catch (error) {
        this.logger.warn(`Failed to scan ${currentDir}: ${error.message}`);
      }
    }

    scan.call(this, dir);
    return files;
  }

  /**
   * Check if file is likely to contain data (even without expected extension)
   */
  isLikelyDataFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8').trim();

      // Check for JSON-like structure
      if (content.startsWith('{') || content.startsWith('[')) {
        try {
          JSON.parse(content);
          return true;
        } catch (e) {
          // Not valid JSON
        }
      }

      // Check for NDJSON (one JSON object per line)
      const lines = content.split('\n').slice(0, 3);
      if (lines.length > 1) {
        const validLines = lines.filter(line => {
          const trimmed = line.trim();
          if (!trimmed) return true; // Empty lines are ok
          try {
            JSON.parse(trimmed);
            return true;
          } catch (e) {
            return false;
          }
        });
        if (validLines.length === lines.length) {
          return true;
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Analyze file contents and structure
   */
  async analyzeFile(fileInfo) {
    const analysis = {
      ...fileInfo,
      type: 'unknown',
      structure: {},
      records: 0,
      schema: null,
      issues: []
    };

    try {
      const content = fs.readFileSync(fileInfo.path, 'utf8');

      if (path.extname(fileInfo.path) === '.ndjson') {
        analysis.type = 'ndjson';
        analysis.structure = this.analyzeNdjson(content);
      } else if (path.extname(fileInfo.path) === '.json') {
        analysis.type = 'json';
        analysis.structure = this.analyzeJson(content);
      } else {
        // Try to detect format
        analysis.structure = this.analyzeGeneric(content);
        if (analysis.structure.type) {
          analysis.type = analysis.structure.type;
        }
      }

      analysis.records = analysis.structure.records || 0;
      analysis.schema = analysis.structure.schema;

      // Identify potential issues
      analysis.issues = this.identifyIssues(analysis);

    } catch (error) {
      analysis.issues.push(`Failed to analyze: ${error.message}`);
    }

    return analysis;
  }

  /**
   * Analyze NDJSON file structure
   */
  analyzeNdjson(content) {
    const lines = content.trim().split('\n').filter(line => line.trim());
    const records = [];

    for (const line of lines.slice(0, 10)) { // Sample first 10 records
      try {
        records.push(JSON.parse(line.trim()));
      } catch (e) {
        // Skip invalid lines
      }
    }

    const schema = this.inferSchema(records);

    return {
      records: lines.length,
      sampleRecords: records.slice(0, 3),
      schema,
      estimatedSize: lines.length
    };
  }

  /**
   * Analyze JSON file structure
   */
  analyzeJson(content) {
    const data = JSON.parse(content);

    if (Array.isArray(data)) {
      return {
        type: 'json-array',
        records: data.length,
        sampleRecords: data.slice(0, 3),
        schema: this.inferSchema(data.slice(0, 10)),
        structure: 'array'
      };
    } else if (typeof data === 'object') {
      return {
        type: 'json-object',
        records: 1,
        structure: 'object',
        schema: this.inferSchema([data]),
        keys: Object.keys(data)
      };
    }

    return { type: 'json-primitive', records: 1 };
  }

  /**
   * Analyze generic file content
   */
  analyzeGeneric(content) {
    const lines = content.split('\n');

    // Try JSON parsing
    try {
      const data = JSON.parse(content);
      return this.analyzeJson(content);
    } catch (e) {
      // Not JSON
    }

    // Check for NDJSON
    const sampleLines = lines.slice(0, 5);
    const jsonLines = sampleLines.filter(line => {
      try {
        JSON.parse(line.trim());
        return true;
      } catch (e) {
        return false;
      }
    });

    if (jsonLines.length >= sampleLines.length * 0.8) {
      return this.analyzeNdjson(content);
    }

    return {
      type: 'text',
      lines: lines.length,
      estimatedRecords: lines.length
    };
  }

  /**
   * Infer schema from sample records
   */
  inferSchema(records) {
    if (!records.length) return null;

    const schema = {};

    for (const record of records) {
      if (typeof record === 'object' && record !== null) {
        for (const [key, value] of Object.entries(record)) {
          if (!schema[key]) {
            schema[key] = {
              types: new Set(),
              nullable: false,
              examples: []
            };
          }

          schema[key].types.add(typeof value);
          if (value === null) schema[key].nullable = true;
          if (schema[key].examples.length < 3) {
            schema[key].examples.push(value);
          }
        }
      }
    }

    // Convert Sets to arrays for JSON serialization
    for (const key of Object.keys(schema)) {
      schema[key].types = Array.from(schema[key].types);
    }

    return schema;
  }

  /**
   * Find code usage of this file
   */
  async findCodeUsage(filePath) {
    const relativePath = path.relative(process.cwd(), filePath);
    const fileName = path.basename(filePath);

    // Search for references to this file
    const searches = [
      fileName,
      relativePath.replace(/\\/g, '/'), // Normalize path separators
      relativePath.replace(/\\/g, '\\\\'), // Escaped backslashes
    ];

    const usage = {
      references: [],
      imports: [],
      requires: []
    };

    for (const searchTerm of searches) {
      try {
        // Use grep search for file references
        const grepResults = await this.grepSearch(searchTerm, ['.js', '.mjs', '.ts']);
        usage.references.push(...grepResults);
      } catch (error) {
        // Grep search not available, skip
      }
    }

    return usage;
  }

  /**
   * Simple grep search (fallback implementation)
   */
  async grepSearch(pattern, extensions) {
    const results = [];
    const srcDir = path.join(process.cwd(), 'src');

    function searchDir(dir) {
      try {
        const items = fs.readdirSync(dir);

        for (const item of items) {
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);

          if (stat.isDirectory() && !['node_modules', '.git'].includes(item)) {
            searchDir(fullPath);
          } else if (stat.isFile() && extensions.some(ext => item.endsWith(ext))) {
            try {
              const content = fs.readFileSync(fullPath, 'utf8');
              const lines = content.split('\n');

              for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes(pattern)) {
                  results.push({
                    file: path.relative(process.cwd(), fullPath),
                    line: i + 1,
                    content: lines[i].trim()
                  });
                }
              }
            } catch (error) {
              // Skip unreadable files
            }
          }
        }
      } catch (error) {
        // Skip inaccessible directories
      }
    }

    searchDir(srcDir);
    return results;
  }

  /**
   * Suggest migration strategy for this data
   */
  suggestMigration(analysis) {
    const suggestions = {
      complexity: 'low',
      strategy: 'direct-import',
      steps: [],
      dbTable: null,
      concerns: []
    };

    // Determine table name
    const fileName = path.basename(analysis.path, path.extname(analysis.path));
    suggestions.dbTable = this.suggestTableName(fileName, analysis);

    // Assess complexity based on structure
    if (analysis.type === 'ndjson' && analysis.records > 10000) {
      suggestions.complexity = 'high';
      suggestions.strategy = 'chunked-import';
    } else if (analysis.structure?.schema && Object.keys(analysis.structure.schema).length > 10) {
      suggestions.complexity = 'medium';
      suggestions.strategy = 'normalized-tables';
    }

    // Generate migration steps
    suggestions.steps = this.generateMigrationSteps(analysis, suggestions);

    // Identify concerns
    suggestions.concerns = this.identifyMigrationConcerns(analysis);

    return suggestions;
  }

  /**
   * Suggest appropriate table name
   */
  suggestTableName(fileName, analysis) {
    // Convert filename to table name
    let tableName = fileName
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .toLowerCase();

    // Add type suffix if helpful
    if (analysis.type === 'ndjson') {
      tableName += '_data';
    } else if (analysis.type === 'json' && analysis.structure?.structure === 'array') {
      tableName += '_items';
    }

    return tableName;
  }

  /**
   * Generate migration steps
   */
  generateMigrationSteps(analysis, suggestions) {
    const steps = [
      `Create table: ${suggestions.dbTable}`,
      `Write import script for ${analysis.type} data`,
      `Update ${analysis.usage?.references?.length || 0} code references`,
      'Test data integrity',
      'Remove old file after verification'
    ];

    if (suggestions.complexity === 'high') {
      steps.splice(1, 0, 'Implement chunked/batched import for large dataset');
    }

    if (suggestions.strategy === 'normalized-tables') {
      steps.splice(1, 0, 'Design normalized table structure');
    }

    return steps;
  }

  /**
   * Identify migration concerns
   */
  identifyMigrationConcerns(analysis) {
    const concerns = [];

    if (analysis.records > 100000) {
      concerns.push('Large dataset - consider performance impact');
    }

    if (analysis.usage?.references?.length > 10) {
      concerns.push('Many code references - careful refactoring needed');
    }

    if (analysis.type === 'ndjson') {
      concerns.push('NDJSON format - ensure proper parsing during import');
    }

    if (analysis.issues.length > 0) {
      concerns.push(`Data quality issues: ${analysis.issues.join(', ')}`);
    }

    return concerns;
  }

  /**
   * Identify potential issues with the data
   */
  identifyIssues(analysis) {
    const issues = [];

    if (analysis.size > 100 * 1024 * 1024) { // 100MB
      issues.push('Very large file (>100MB)');
    }

    if (analysis.records === 0) {
      issues.push('No records found');
    }

    if (analysis.type === 'unknown') {
      issues.push('Unrecognized file format');
    }

    return issues;
  }

  /**
   * Generate refactoring report
   */
  generateReport(findings) {
    const report = {
      summary: {
        totalFiles: findings.length,
        totalRecords: findings.reduce((sum, f) => sum + (f.records || 0), 0),
        totalSize: findings.reduce((sum, f) => sum + (f.size || 0), 0),
        dataTypes: {},
        migrationComplexity: { low: 0, medium: 0, high: 0 },
        directorySummaries: {},
        dataSystemSummaries: {}
      },
      files: findings,
      recommendations: []
    };

    // Calculate summary stats
    for (const finding of findings) {
      report.summary.dataTypes[finding.type] = (report.summary.dataTypes[finding.type] || 0) + 1;
      report.summary.migrationComplexity[finding.migration.complexity]++;

      // Group by directory
      const dir = path.dirname(finding.relativePath);
      if (!report.summary.directorySummaries[dir]) {
        report.summary.directorySummaries[dir] = {
          files: 0,
          totalSize: 0,
          totalRecords: 0,
          types: {}
        };
      }
      report.summary.directorySummaries[dir].files++;
      report.summary.directorySummaries[dir].totalSize += finding.size || 0;
      report.summary.directorySummaries[dir].totalRecords += finding.records || 0;
      report.summary.directorySummaries[dir].types[finding.type] = (report.summary.directorySummaries[dir].types[finding.type] || 0) + 1;
    }

    // Create data system summaries (logical groupings)
    report.summary.dataSystemSummaries = this.createDataSystemSummaries(findings);

    // Generate recommendations
    report.recommendations = this.generateRecommendations(findings);

    return report;
  }

  /**
   * Create data system summaries (logical groupings of related data)
   */
  createDataSystemSummaries(findings) {
    const systems = {};

    for (const finding of findings) {
      let systemName = 'other';

      // Categorize files into logical data systems
      if (finding.relativePath.includes('bootstrap')) {
        systemName = 'bootstrap';
      } else if (finding.relativePath.includes('dspls')) {
        systemName = 'dspl-patterns';
      } else if (finding.relativePath.includes('gazetteer')) {
        systemName = 'gazetteer';
      } else if (finding.relativePath.includes('config')) {
        systemName = 'configuration';
      } else if (finding.relativePath.includes('data/')) {
        systemName = 'data-files';
      }

      if (!systems[systemName]) {
        systems[systemName] = {
          files: 0,
          totalSize: 0,
          totalRecords: 0,
          types: {},
          paths: []
        };
      }

      systems[systemName].files++;
      systems[systemName].totalSize += finding.size || 0;
      systems[systemName].totalRecords += finding.records || 0;
      systems[systemName].types[finding.type] = (systems[systemName].types[finding.type] || 0) + 1;
      systems[systemName].paths.push(finding.relativePath);
    }

    return systems;
  }

  /**
   * Generate refactoring recommendations
   */
  generateRecommendations(findings) {
    const recommendations = [];

    const highComplexity = findings.filter(f => f.migration.complexity === 'high');
    if (highComplexity.length > 0) {
      recommendations.push({
        priority: 'high',
        action: 'Start with high-complexity migrations first',
        files: highComplexity.map(f => f.relativePath),
        reason: 'Large datasets and complex structures need careful planning'
      });
    }

    const manyReferences = findings.filter(f => (f.usage?.references?.length || 0) > 5);
    if (manyReferences.length > 0) {
      recommendations.push({
        priority: 'medium',
        action: 'Prioritize files with many code references',
        files: manyReferences.map(f => f.relativePath),
        reason: 'Reduces risk of breaking changes during refactoring'
      });
    }

    const configFiles = findings.filter(f => f.relativePath.includes('config'));
    if (configFiles.length > 0) {
      recommendations.push({
        priority: 'low',
        action: 'Consider keeping configuration files on disk',
        files: configFiles.map(f => f.relativePath),
        reason: 'Config files often need to be editable and version controlled'
      });
    }

    const bootstrapFiles = findings.filter(f => f.relativePath.includes('bootstrap-db.json'));
    if (bootstrapFiles.length > 0) {
      recommendations.push({
        priority: 'info',
        action: 'bootstrap-db.json is intentionally kept outside DB',
        files: bootstrapFiles.map(f => f.relativePath),
        reason: 'Essential bootstrap configuration - small, rarely changes, needed for DB initialization'
      });
    }

    // Database structure examination guidance
    recommendations.push({
      priority: 'critical',
      action: 'Examine existing database structures before planning migrations',
      files: [],
      reason: 'Understand current schema, relationships, and normalization patterns'
    });

    recommendations.push({
      priority: 'critical',
      action: 'Design new structures with normalized DB design and foreign keys',
      files: [],
      reason: 'Ensure new tables integrate well with existing architecture'
    });

    return recommendations;
  }

  /**
   * Display findings in a readable format
   */
  displayFindings(findings, options = {}) {
    const { showDetails = true, showUsage = true } = options;

    this.logger.log('\n📊 NON-DB DATA DISCOVERY RESULTS');
    this.logger.log('=' .repeat(50));

    for (const finding of findings) {
      this.logger.log(`\n📁 ${finding.relativePath}`);
      this.logger.log(`   Type: ${finding.type} | Records: ${finding.records} | Size: ${this.formatSize(finding.size)}`);

      if (showDetails && finding.schema) {
        this.logger.log(`   Schema: ${Object.keys(finding.schema).length} fields`);
      }

      if (finding.issues.length > 0) {
        this.logger.log(`   ⚠️  Issues: ${finding.issues.join(', ')}`);
      }

      if (showUsage && finding.usage) {
        const refs = finding.usage.references?.length || 0;
        this.logger.log(`   🔗 Code references: ${refs}`);
      }

      if (finding.migration) {
        this.logger.log(`   🔄 Migration: ${finding.migration.complexity} complexity (${finding.migration.strategy})`);
        if (finding.migration.concerns.length > 0) {
          this.logger.log(`   ⚠️  Concerns: ${finding.migration.concerns.join('; ')}`);
        }
      }
    }

    // Summary
    const report = this.generateReport(findings);
    this.logger.log('\n📈 SUMMARY');
    this.logger.log(`   Total files: ${report.summary.totalFiles}`);
    this.logger.log(`   Total records: ${report.summary.totalRecords}`);
    this.logger.log(`   Total size: ${this.formatSize(report.summary.totalSize)}`);
    this.logger.log(`   Migration complexity: ${JSON.stringify(report.summary.migrationComplexity)}`);

    // Data system summaries
    this.logger.log('\n📊 DATA SYSTEMS BY CATEGORY');
    this.logger.log('=' .repeat(40));
    for (const [system, data] of Object.entries(report.summary.dataSystemSummaries)) {
      this.logger.log(`\n${system.toUpperCase()}:`);
      this.logger.log(`   Files: ${data.files} | Size: ${this.formatSize(data.totalSize)} | Records: ${data.totalRecords}`);
      this.logger.log(`   Types: ${JSON.stringify(data.types)}`);
      if (data.paths.length <= 3) {
        this.logger.log(`   Paths: ${data.paths.join(', ')}`);
      } else {
        this.logger.log(`   Paths: ${data.paths.slice(0, 3).join(', ')} (+${data.paths.length - 3} more)`);
      }
    }

    if (report.recommendations.length > 0) {
      this.logger.log('\n💡 RECOMMENDATIONS');
      for (const rec of report.recommendations) {
        this.logger.log(`   ${rec.priority.toUpperCase()}: ${rec.action}`);
        this.logger.log(`      Files: ${rec.files.join(', ')}`);
        if (rec.reason) {
          this.logger.log(`      Reason: ${rec.reason}`);
        }
      }
    }

    // Database integration guidance
    this.logger.log('\n🗄️  DATABASE INTEGRATION GUIDANCE');
    this.logger.log('   • Always examine existing database structures before planning changes');
    this.logger.log('   • Design normalized tables with proper foreign key relationships');
    this.logger.log('   • Consider how new data relates to existing entities');
    this.logger.log('   • Plan for referential integrity and data consistency');
    this.logger.log('   • Ensure new tables integrate well with existing architecture');
    this.logger.log('   • Use foreign keys to maintain relationships between tables');
  }
  async searchDataSystem(systemName, options = {}) {
    const { additionalTerms = [], filesOnly = false, contextLines = 2 } = options;

    this.logger.log(`🔍 Searching for ${systemName} data system implementation...\n`);

    // Define search patterns for different data systems
    const searchPatterns = this.getSearchPatterns(systemName, additionalTerms);

    const results = {
      system: systemName,
      patterns: searchPatterns,
      matches: [],
      files: new Set(),
      categories: {}
    };

    // Search for each pattern
    for (const pattern of searchPatterns) {
      const matches = await this.grepSearchAdvanced(pattern, {
        extensions: ['.js', '.mjs', '.ts', '.json', '.sql'],
        contextLines,
        caseInsensitive: true
      });

      results.matches.push(...matches);
      matches.forEach(match => {
        results.files.add(match.file);
        // Categorize each match
        const category = this.categorizeMatch(match, pattern);
        if (!results.categories[category]) {
          results.categories[category] = [];
        }
        results.categories[category].push(match);
      });
    }

    // Remove duplicates and sort
    results.matches = this.deduplicateMatches(results.matches);
    results.files = Array.from(results.files).sort();

    return results;
  }

  /**
   * Get search patterns for a data system
   */
  getSearchPatterns(systemName, additionalTerms) {
    const basePatterns = {
      gazetteer: [
        'gazetteer',
        'places',
        'countries',
        'cities',
        'geography',
        'wikidata',
        'place.*match',
        'country.*hub'
      ],
      'dspl-patterns': [
        'dspl',
        'news.*pattern',
        'article.*pattern',
        'content.*extraction',
        'scraping.*pattern'
      ],
      bootstrap: [
        'bootstrap',
        'initial.*data',
        'seed.*data',
        'setup.*data'
      ],
      configuration: [
        'config',
        'configuration',
        'settings'
      ],
      'data-files': [
        'data/',
        'loadData',
        'readData',
        'parseData'
      ]
    };

    const patterns = basePatterns[systemName] || [systemName];
    patterns.push(...additionalTerms);

    return patterns;
  }

  /**
   * Advanced grep search with context
   */
  async grepSearchAdvanced(pattern, options = {}) {
    const { extensions = ['.js'], contextLines = 2, caseInsensitive = false } = options;
    const results = [];
    const searchDirs = ['src', 'data', 'config', 'tools', 'scripts'];

    function searchDir(dir) {
      try {
        const items = fs.readdirSync(dir);

        for (const item of items) {
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);

          if (stat.isDirectory() && !['node_modules', '.git', 'backups', 'cache'].includes(item)) {
            searchDir(fullPath);
          } else if (stat.isFile() && extensions.some(ext => item.endsWith(ext))) {
            try {
              const content = fs.readFileSync(fullPath, 'utf8');
              const lines = content.split('\n');

              for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const searchLine = caseInsensitive ? line.toLowerCase() : line;
                const searchPattern = caseInsensitive ? pattern.toLowerCase() : pattern;

                if (searchLine.includes(searchPattern)) {
                  // Get context lines
                  const startLine = Math.max(0, i - contextLines);
                  const endLine = Math.min(lines.length - 1, i + contextLines);
                  const context = lines.slice(startLine, endLine + 1).map((l, idx) => ({
                    lineNumber: startLine + idx + 1,
                    content: l,
                    isMatch: (startLine + idx) === i
                  }));

                  results.push({
                    file: path.relative(process.cwd(), fullPath),
                    line: i + 1,
                    content: line.trim(),
                    context,
                    pattern
                  });
                }
              }
            } catch (error) {
              // Skip unreadable files
            }
          }
        }
      } catch (error) {
        // Skip inaccessible directories
      }
    }

    for (const dir of searchDirs) {
      if (fs.existsSync(dir)) {
        searchDir(dir);
      }
    }

    return results;
  }

  /**
   * Categorize a match by type
   */
  categorizeMatch(match, pattern) {
    const content = match.content.toLowerCase();

    if (content.includes('import') || content.includes('require')) {
      return 'imports';
    } else if (content.includes('select') || content.includes('insert') || content.includes('update') || content.includes('delete')) {
      return 'database-queries';
    } else if (content.includes('fs.') || content.includes('readfile') || content.includes('writefile')) {
      return 'file-operations';
    } else if (content.includes('function') || content.includes('class') || content.includes('=>')) {
      return 'functions-methods';
    } else if (content.includes('api') || content.includes('route') || content.includes('endpoint')) {
      return 'api-endpoints';
    } else if (content.includes('config') || content.includes('setting')) {
      return 'configuration';
    } else {
      return 'other';
    }
  }

  /**
   * Remove duplicate matches
   */
  deduplicateMatches(matches) {
    const seen = new Set();
    return matches.filter(match => {
      const key = `${match.file}:${match.line}:${match.content}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Display search results
   */
  displaySearchResults(results, options = {}) {
    const { filesOnly = false } = options;

    this.logger.log(`\n🔍 ${results.system.toUpperCase()} DATA SYSTEM SEARCH RESULTS`);
    this.logger.log('='.repeat(60));

    this.logger.log(`\n📊 SUMMARY`);
    this.logger.log(`   Patterns searched: ${results.patterns.join(', ')}`);
    this.logger.log(`   Total matches: ${results.matches.length}`);
    this.logger.log(`   Files affected: ${results.files.length}`);

    if (results.files.length > 0) {
      this.logger.log(`\n📁 FILES CONTAINING ${results.system.toUpperCase()}:`);
      results.files.forEach(file => {
        this.logger.log(`   • ${file}`);
      });
    }

    if (!filesOnly && results.categories) {
      this.logger.log(`\n📋 MATCHES BY CATEGORY:`);
      for (const [category, matches] of Object.entries(results.categories)) {
        if (matches.length > 0) {
          this.logger.log(`\n${category.toUpperCase()}:`);
          matches.slice(0, 10).forEach(match => {
            this.logger.log(`   ${match.file}:${match.line} - ${match.content}`);
            if (match.context) {
              match.context.filter(ctx => !ctx.isMatch).slice(0, 2).forEach(ctx => {
                this.logger.log(`     ${ctx.lineNumber}: ${ctx.content}`);
              });
            }
          });
          if (matches.length > 10) {
            this.logger.log(`   ... and ${matches.length - 10} more matches`);
          }
        }
      }
    }

    if (results.matches.length === 0) {
      this.logger.log(`\n❌ No matches found for ${results.system} data system.`);
      this.logger.log(`   Try using different search terms or check if the system name is correct.`);
    } else {
      this.logger.log(`\n💡 IMPLEMENTATION INSIGHTS:`);
      this.logger.log(`   • Found ${results.matches.length} code references across ${results.files.length} files`);
      this.logger.log(`   • Primary implementation areas: ${Object.keys(results.categories).join(', ')}`);
      this.logger.log(`   • Use these locations to understand how the ${results.system} system is currently implemented`);
      this.logger.log(`   • Consider these files when planning database migration or refactoring`);
    }
  }

  /**
   * Format file size in human readable format
   */
  formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Error: No command specified. Use --help for usage information.');
    process.exit(1);
  }

  const command = args[0];

  if (command === 'discover') {
    await handleDiscoverCommand(args.slice(1));
  } else if (command === 'analyze') {
    await handleAnalyzeCommand(args.slice(1));
  } else if (command === 'search') {
    await handleSearchCommand(args.slice(1));
  } else {
    console.error(`Error: Unknown command '${command}'. Use --help for usage information.`);
    process.exit(1);
  }
}

async function handleDiscoverCommand(args) {
  // Parse options
  const options = {
    directories: ['data', 'config', 'src/data', 'src/config'],
    extensions: ['.json', '.ndjson', '.yaml', '.yml'],
    analyzeUsage: false,
    suggestMigrations: true,
    showDetails: false,
    json: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--dirs':
        options.directories = [];
        while (i + 1 < args.length && !args[i + 1].startsWith('--')) {
          options.directories.push(args[++i]);
        }
        break;
      case '--extensions':
        options.extensions = [];
        while (i + 1 < args.length && !args[i + 1].startsWith('--')) {
          options.extensions.push(args[++i]);
        }
        break;
      case '--detailed':
        options.showDetails = true;
        break;
      case '--usage':
        options.analyzeUsage = true;
        break;
      case '--no-migrations':
        options.suggestMigrations = false;
        break;
      case '--json':
        options.json = true;
        break;
      default:
        console.error(`Error: Unknown option '${arg}'`);
        process.exit(1);
    }
  }

  const tool = new ReviewNonDbData();
  await tool.initialize();

  const findings = await tool.discoverData({
    directories: options.directories,
    extensions: options.extensions,
    analyzeUsage: options.analyzeUsage,
    suggestMigrations: options.suggestMigrations
  });

  if (options.json) {
    const report = tool.generateReport(findings);
    console.log(JSON.stringify(report, null, 2));
  } else {
    tool.displayFindings(findings, {
      showDetails: options.showDetails,
      showUsage: options.analyzeUsage
    });
  }
}

async function handleAnalyzeCommand(args) {
  if (args.length === 0) {
    console.error('Error: analyze command requires a file path');
    process.exit(1);
  }

  const filePath = args[0];

  const tool = new ReviewNonDbData();
  await tool.initialize();

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const fileInfo = {
    path: filePath,
    relativePath: path.relative(process.cwd(), filePath),
    size: fs.statSync(filePath).size,
    modified: fs.statSync(filePath).mtime.toISOString()
  };

  const analysis = await tool.analyzeFile(fileInfo);
  analysis.usage = await tool.findCodeUsage(filePath);
  analysis.migration = tool.suggestMigration(analysis);

  console.log('\n📁 FILE ANALYSIS');
  console.log('='.repeat(30));
  console.log(`Path: ${analysis.relativePath}`);
  console.log(`Type: ${analysis.type}`);
  console.log(`Records: ${analysis.records}`);
  console.log(`Size: ${tool.formatSize(analysis.size)}`);

  if (analysis.schema) {
    console.log('\n📋 SCHEMA:');
    for (const [field, info] of Object.entries(analysis.schema)) {
      console.log(`  ${field}: ${info.types.join('|')} ${info.nullable ? '(nullable)' : ''}`);
      if (info.examples.length > 0) {
        console.log(`    Examples: ${info.examples.slice(0, 2).join(', ')}`);
      }
    }
  }

  if (analysis.usage.references.length > 0) {
    console.log('\n🔗 CODE USAGE:');
    for (const ref of analysis.usage.references.slice(0, 5)) {
      console.log(`  ${ref.file}:${ref.line} - ${ref.content}`);
    }
    if (analysis.usage.references.length > 5) {
      console.log(`  ... and ${analysis.usage.references.length - 5} more references`);
    }
  }

  console.log('\n🔄 MIGRATION SUGGESTIONS:');
  console.log(`Complexity: ${analysis.migration.complexity}`);
  console.log(`Strategy: ${analysis.migration.strategy}`);
  console.log(`Table: ${analysis.migration.dbTable}`);
  console.log('\nSteps:');
  analysis.migration.steps.forEach((step, i) => {
    console.log(`  ${i + 1}. ${step}`);
  });

  if (analysis.migration.concerns.length > 0) {
    console.log('\n⚠️  CONCERNS:');
    analysis.migration.concerns.forEach(concern => {
      console.log(`  • ${concern}`);
    });
  }
}

if (require.main === module) {
  main().catch(console.error);
}

async function handleSearchCommand(args) {
  if (args.length === 0) {
    console.error('Error: search command requires a system name');
    process.exit(1);
  }

  const systemName = args[0];

  // Parse options
  const options = {
    additionalTerms: [],
    filesOnly: false,
    contextLines: 2
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--terms':
        while (i + 1 < args.length && !args[i + 1].startsWith('--')) {
          options.additionalTerms.push(args[++i]);
        }
        break;
      case '--files-only':
        options.filesOnly = true;
        break;
      case '--context':
        if (i + 1 < args.length) {
          options.contextLines = parseInt(args[++i]);
        }
        break;
      default:
        console.error(`Error: Unknown option '${arg}'`);
        process.exit(1);
    }
  }

  const tool = new ReviewNonDbData();
  await tool.initialize();

  const results = await tool.searchDataSystem(systemName, options);
  tool.displaySearchResults(results, { filesOnly: options.filesOnly });
}

module.exports = { ReviewNonDbData };