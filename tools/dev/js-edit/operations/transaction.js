#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Transaction Manager: Atomic multi-file edits with rollback
 * 
 * Purpose: Apply multiple file changes as a single atomic operation.
 * If any edit fails, all changes are rolled back.
 * 
 * Transaction JSON format:
 * {
 *   "description": "Optional description",
 *   "edits": [
 *     { "file": "path/to/file.js", "startLine": 10, "endLine": 15, "replacement": "new code" }
 *   ]
 * }
 * 
 * Features:
 * - Pre-flight validation (all files readable/writable)
 * - Backup creation before changes
 * - Automatic rollback on failure
 * - Human-readable diff preview
 * - Transaction log for debugging
 */

class TransactionManager {
  /**
   * Create a TransactionManager from transaction data
   * @param {Object} transactionData - Transaction specification (edits array)
   * @param {Object} options - Configuration options
   */
  constructor(transactionData, options = {}) {
    this.backups = new Map();      // Map<filePath, originalContent>
    this.changes = [];             // Ordered list of changes to apply
    this.applied = [];             // Successfully applied changes (for rollback)
    this.log = [];                 // Transaction log
    this.verbose = options.verbose || false;
    this.baseDir = options.baseDir || process.cwd();
    
    // Parse transaction data
    if (transactionData && transactionData.edits) {
      this._loadEdits(transactionData.edits);
    }
    this.description = transactionData?.description || 'Transaction';
  }

  /**
   * Load edits from transaction data
   * @param {Array} edits - Array of edit operations
   */
  _loadEdits(edits) {
    for (const edit of edits) {
      const filePath = path.isAbsolute(edit.file) 
        ? edit.file 
        : path.resolve(this.baseDir, edit.file);
      
      this.changes.push({
        filePath,
        startLine: edit.startLine,
        endLine: edit.endLine,
        replacement: edit.replacement,
        description: edit.description,
        order: this.changes.length
      });
    }
    this._log('load', `Loaded ${edits.length} edits`);
  }

  /**
   * Add a file change to the transaction
   * @param {string} filePath - Absolute path to file
   * @param {Object} change - Change specification
   */
  addEdit(filePath, change) {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(this.baseDir, filePath);
    this.changes.push({
      filePath: absolutePath,
      startLine: change.startLine,
      endLine: change.endLine,
      replacement: change.replacement,
      description: change.description,
      order: this.changes.length
    });
    this._log('add', `Queued change for ${absolutePath}`);
  }

  /**
   * Generate preview with diff intent
   * @returns {Object} Preview object with validation and diffs
   */
  preview() {
    const result = {
      valid: true,
      errors: [],
      fileCount: new Set(this.changes.map(c => c.filePath)).size,
      editCount: this.changes.length,
      diffs: []
    };

    // Group changes by file
    const byFile = new Map();
    for (const change of this.changes) {
      if (!byFile.has(change.filePath)) {
        byFile.set(change.filePath, []);
      }
      byFile.get(change.filePath).push(change);
    }

    // Validate and build diffs for each file
    for (const [filePath, fileChanges] of byFile) {
      // Check file exists and is readable
      if (!fs.existsSync(filePath)) {
        result.errors.push(`File not found: ${filePath}`);
        result.valid = false;
        continue;
      }

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        for (const change of fileChanges) {
          // Validate line numbers
          if (change.startLine < 1 || change.endLine > lines.length) {
            result.errors.push(`Invalid line range ${change.startLine}-${change.endLine} in ${path.basename(filePath)} (file has ${lines.length} lines)`);
            result.valid = false;
            continue;
          }

          // Extract before/after snippets
          const beforeLines = lines.slice(change.startLine - 1, change.endLine);
          const before = beforeLines.join('\n');
          const after = change.replacement;

          result.diffs.push({
            file: path.relative(this.baseDir, filePath),
            startLine: change.startLine,
            endLine: change.endLine,
            before: before.substring(0, 200),
            after: after.substring(0, 200),
            description: change.description
          });
        }
      } catch (e) {
        result.errors.push(`Cannot read ${filePath}: ${e.message}`);
        result.valid = false;
      }
    }

    return result;
  }

  /**
   * Execute all changes atomically
   * @returns {Object} Result with success status and details
   */
  async execute() {
    const result = {
      success: false,
      applied: 0,
      failed: 0,
      rolledBack: false,
      errors: []
    };

    // Validate first via preview
    const preview = this.preview();
    if (!preview.valid) {
      result.errors = preview.errors;
      result.failed = this.changes.length;
      return result;
    }

    // Create backups
    if (!this._createBackups()) {
      result.errors.push('Failed to create backups');
      result.failed = this.changes.length;
      return result;
    }

    // Group changes by file and apply
    const byFile = new Map();
    for (const change of this.changes) {
      if (!byFile.has(change.filePath)) {
        byFile.set(change.filePath, []);
      }
      byFile.get(change.filePath).push(change);
    }

    try {
      for (const [filePath, fileChanges] of byFile) {
        // Read current content
        let content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        // Apply changes in reverse order (to preserve line numbers)
        const sortedChanges = [...fileChanges].sort((a, b) => b.startLine - a.startLine);
        
        for (const change of sortedChanges) {
          const beforeLines = lines.slice(0, change.startLine - 1);
          const afterLines = lines.slice(change.endLine);
          const replacementLines = change.replacement.split('\n');
          
          lines.splice(change.startLine - 1, change.endLine - change.startLine + 1, ...replacementLines);
          this._log('apply', `Applied change at lines ${change.startLine}-${change.endLine} in ${path.basename(filePath)}`);
          result.applied++;
        }

        // Write back
        fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
        this.applied.push({ filePath, changes: fileChanges });
      }

      result.success = true;
    } catch (e) {
      result.errors.push(e.message);
      result.failed = this.changes.length - result.applied;
      
      // Rollback
      this._rollback();
      result.rolledBack = true;
    }

    return result;
  }

  /**
   * Create backups of all files to be modified
   * @returns {boolean} Success
   */
  _createBackups() {
    for (const change of this.changes) {
      if (fs.existsSync(change.filePath) && !this.backups.has(change.filePath)) {
        try {
          const content = fs.readFileSync(change.filePath, 'utf-8');
          this.backups.set(change.filePath, content);
          this._log('backup', `Created backup for ${change.filePath}`);
        } catch (e) {
          this._log('error', `Failed to backup ${change.filePath}: ${e.message}`);
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Rollback all applied changes
   */
  _rollback() {
    this._log('rollback', 'Starting rollback');
    
    for (const [filePath, backup] of this.backups) {
      try {
        fs.writeFileSync(filePath, backup, 'utf-8');
        this._log('rollback', `Restored ${filePath}`);
      } catch (e) {
        this._log('error', `Failed to rollback ${filePath}: ${e.message}`);
      }
    }

    this._log('rollback', 'Rollback complete');
  }

  _log(type, message) {
    const entry = {
      timestamp: new Date().toISOString(),
      type,
      message
    };
    this.log.push(entry);
    if (this.verbose) {
      console.log(`[${type.toUpperCase()}] ${message}`);
    }
  }
}

module.exports = TransactionManager;
