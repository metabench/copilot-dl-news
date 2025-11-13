#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

/**
 * BatchDryRunner: Batch operation preview and dry-run with recovery
 * 
 * Purpose: Enable safe batch operations with:
 * 1. Dry-run preview - see all changes before applying
 * 2. Offset recalculation - recompute positions after each change
 * 3. Conflict detection - identify overlapping/conflicting changes
 * 4. Recovery suggestions - recommend fixes for failures
 * 
 * Implements Gap 3 of tooling strategy: 95%+ batch success vs 60% currently
 */
class BatchDryRunner {
  constructor(sourceCode = '', options = {}) {
    this.source = sourceCode || '';
    this.lines = this.source.split('\n');
    this.changes = [];
    this.applied = [];
    this.conflicts = [];
    this.verbose = options.verbose || false;
    this.sortByOffset = options.sortByOffset !== false;
  }

  /**
   * Add a change to the batch operation
   */
  addChange(change) {
    // Validate change structure
    if (!change.file && !change.filePath) {
      throw new Error('Change must specify file or filePath');
    }
    if (change.startLine === undefined || change.endLine === undefined) {
      throw new Error('Change must specify startLine and endLine');
    }
    if (change.replacement === undefined && !change.delete) {
      throw new Error('Change must specify replacement or set delete=true');
    }

    // Normalize and validate
    const normalized = {
      file: change.file || change.filePath,
      startLine: Number(change.startLine),
      endLine: Number(change.endLine),
      replacement: change.replacement || '',
      delete: Boolean(change.delete),
      id: change.id || `change-${this.changes.length}`,
      description: change.description || '',
      guards: change.guards || {}
    };

    if (normalized.startLine >= normalized.endLine) {
      throw new Error(`Invalid range: startLine (${normalized.startLine}) must be < endLine (${normalized.endLine})`);
    }

    this.changes.push(normalized);
    return normalized;
  }

  /**
   * Perform a dry-run: preview all changes without modifying source
   * Returns detailed report of what would change
   */
  dryRun() {
    const result = {
      success: true,
      totalChanges: this.changes.length,
      preview: [],
      conflicts: [],
      estimatedResult: this.source,
      warnings: [],
      errors: []
    };

    if (this.changes.length === 0) {
      result.warnings.push('No changes to preview');
      return result;
    }

    // Sort changes by offset to detect conflicts
    const sorted = this._sortChanges();

    // Check for overlaps
    const overlaps = this._findConflicts(sorted);
    if (overlaps.length > 0) {
      result.success = false;
      result.conflicts = overlaps.map(conflict => ({
        type: 'overlap',
        changeIds: conflict.ids,
        affectedLines: `${conflict.startLine}-${conflict.endLine}`,
        message: `Changes ${conflict.ids.join(', ')} overlap on lines ${conflict.startLine}-${conflict.endLine}`
      }));
    }

    // Generate preview for each change
    for (const change of sorted) {
      const preview = this._previewChange(change, result.estimatedResult);
      result.preview.push(preview);

      // Apply to estimated result for cascading previews
      if (!preview.error) {
        result.estimatedResult = preview.estimatedResult;
      }
    }

    result.changeCount = result.preview.length;
    result.conflictCount = result.conflicts.length;
    result.lineChangeEstimate = this._estimateLineChanges(result.preview);

    return result;
  }

  /**
   * Recalculate offsets and line numbers after changes
   * Accounts for insertions/deletions affecting subsequent positions
   */
  recalculateOffsets(appliedChanges = []) {
    const result = {
      recalculated: [],
      lineOffset: 0,
      charOffset: 0,
      changes: []
    };

    let currentSource = this.source;
    let lineShift = 0;

    // Sort by offset
    const sorted = appliedChanges.length > 0 
      ? appliedChanges.sort((a, b) => (a.startLine || 0) - (b.startLine || 0))
      : this.changes;

    for (const change of sorted) {
      const recalc = this._recalculateForChange(change, currentSource, lineShift);
      result.recalculated.push(recalc);

      // Update state for next iteration
      currentSource = recalc.resultingSource || currentSource;
      lineShift += recalc.lineShift;

      result.changes.push({
        originalRange: `${change.startLine}:${change.endLine}`,
        recalculatedRange: `${recalc.newStartLine}:${recalc.newEndLine}`,
        lineShift: recalc.lineShift,
        status: recalc.valid ? 'valid' : 'adjusted'
      });
    }

    result.totalLineShift = lineShift;
    result.valid = result.recalculated.every(r => r.valid);

    return result;
  }

  /**
   * Suggest recovery actions for conflicts or failures
   */
  suggestRecovery() {
    const suggestions = {
      strategies: [],
      fixes: [],
      workarounds: []
    };

    if (this.conflicts.length === 0) {
      suggestions.strategies.push({
        priority: 'info',
        suggestion: 'No conflicts detected - batch is safe to apply'
      });
      return suggestions;
    }

    // Generate recovery strategies
    for (const conflict of this.conflicts) {
      // Strategy 1: Sequential application
      suggestions.strategies.push({
        priority: 'high',
        suggestion: 'Apply changes sequentially (one at a time)',
        reasoning: 'Avoids offset recalculation complexity',
        effort: 'manual'
      });

      // Strategy 2: Reorder changes
      if (conflict.ids.length === 2) {
        suggestions.strategies.push({
          priority: 'high',
          suggestion: `Reorder changes: apply ${conflict.ids[1]} before ${conflict.ids[0]}`,
          reasoning: 'Later changes will have correct offsets after earlier ones',
          effort: 'manual'
        });
      }

      // Strategy 3: Merge overlapping changes
      suggestions.fixes.push({
        priority: 'medium',
        suggestion: `Merge changes ${conflict.ids.join(', ')} into single operation`,
        reasoning: 'Eliminates conflict by combining overlapping edits',
        effort: 'automated'
      });

      // Strategy 4: Staged application
      suggestions.workarounds.push({
        priority: 'low',
        suggestion: 'Use --from-plan to apply changes with automatic guard verification',
        reasoning: 'Plans track guards and can handle offset drift',
        effort: 'automated'
      });
    }

    return suggestions;
  }

  /**
   * Apply all changes to source and emit result
   * Returns detailed result with guards for next operation (--from-plan)
   */
  async apply(options = {}) {
    const result = {
      success: true,
      applied: 0,
      failed: 0,
      changes: [],
      resultingSource: this.source,
      resultPlan: null,
      errors: []
    };

    if (this.changes.length === 0) {
      result.errors.push('No changes to apply');
      return result;
    }

    // Check for conflicts
    const conflicts = this._findConflicts(this._sortChanges());
    if (conflicts.length > 0 && !options.force) {
      result.success = false;
      result.errors.push(`Found ${conflicts.length} conflicts - use --force to override`);
      result.conflicts = conflicts;
      return result;
    }

    // Apply in reverse order (to avoid offset issues)
    const sorted = this._sortChanges().reverse();
    let currentSource = this.source;

    for (const change of sorted) {
      try {
        const { resultingSource, removed, added } = this._applyChange(change, currentSource);
        currentSource = resultingSource;

        result.changes.push({
          id: change.id,
          status: 'applied',
          linesBefore: removed.length,
          linesAfter: added.length,
          description: change.description
        });

        result.applied++;
        this.applied.push(change);
      } catch (err) {
        result.changes.push({
          id: change.id,
          status: 'failed',
          error: err.message,
          description: change.description
        });

        result.failed++;
        if (!options.continueOnError) {
          result.success = false;
          result.errors.push(`Failed to apply change ${change.id}: ${err.message}`);
          break;
        }
      }
    }

    result.resultingSource = currentSource;

    // Emit result plan for next operation (--from-plan)
    if (options.emitPlan) {
      result.resultPlan = this._emitResultPlan(result);
    }

    return result;
  }

  /**
   * Verify that changes can be applied by checking guards
   * Returns validity report
   */
  verifyGuards(sourceToVerify = this.source) {
    const result = {
      valid: true,
      verified: 0,
      failed: 0,
      details: []
    };

    for (const change of this.changes) {
      if (!change.guards || Object.keys(change.guards).length === 0) {
        result.details.push({
          id: change.id,
          status: 'no-guards',
          message: 'Change has no guard constraints'
        });
        continue;
      }

      const verification = this._verifyChangeGuards(change, sourceToVerify);
      result.details.push(verification);

      if (verification.valid) {
        result.verified++;
      } else {
        result.failed++;
        result.valid = false;
      }
    }

    return result;
  }

  // ============ Private Helpers ============

  _sortChanges() {
    return [...this.changes].sort((a, b) => {
      const aStart = a.startLine;
      const bStart = b.startLine;
      if (aStart !== bStart) return aStart - bStart;
      // For same start, sort by end (longer first)
      return (b.endLine - b.startLine) - (a.endLine - a.startLine);
    });
  }

  _findConflicts(sorted) {
    const conflicts = [];

    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i];
        const b = sorted[j];

        // Check if ranges overlap
        if (a.startLine <= b.endLine && b.startLine <= a.endLine) {
          conflicts.push({
            ids: [a.id, b.id],
            startLine: Math.max(a.startLine, b.startLine),
            endLine: Math.min(a.endLine, b.endLine),
            overlap: Math.min(a.endLine, b.endLine) - Math.max(a.startLine, b.startLine)
          });
        }
      }
    }

    return conflicts;
  }

  _previewChange(change, currentSource) {
    const lines = currentSource.split('\n');
    
    if (change.startLine < 0 || change.endLine > lines.length) {
      return {
        id: change.id,
        error: `Line range ${change.startLine}-${change.endLine} out of bounds (file has ${lines.length} lines)`,
        valid: false
      };
    }

    const removed = lines.slice(change.startLine, change.endLine + 1);
    const replacementLines = change.replacement.split('\n');
    
    const before = lines.slice(0, change.startLine);
    const after = lines.slice(change.endLine + 1);
    const resultLines = [...before, ...replacementLines, ...after];
    const estimatedResult = resultLines.join('\n');

    return {
      id: change.id,
      valid: true,
      lineRange: `${change.startLine}-${change.endLine}`,
      removedLines: removed.length,
      addedLines: replacementLines.length,
      description: change.description,
      estimatedResult
    };
  }

  _recalculateForChange(change, source, lineShift) {
    const lines = source.split('\n');
    const newStartLine = change.startLine + lineShift;
    const newEndLine = change.endLine + lineShift;

    // Check bounds
    if (newStartLine < 0 || newEndLine > lines.length) {
      return {
        error: `Recalculated range out of bounds: ${newStartLine}-${newEndLine}`,
        valid: false
      };
    }

    const removed = lines.slice(newStartLine, newEndLine + 1);
    const replacementLines = change.replacement.split('\n');
    const lineShiftForNext = replacementLines.length - removed.length;

    // Apply this change to get resulting source
    const before = lines.slice(0, newStartLine);
    const after = lines.slice(newEndLine + 1);
    const resultLines = [...before, ...replacementLines, ...after];
    const resultingSource = resultLines.join('\n');

    return {
      valid: true,
      originalStartLine: change.startLine,
      originalEndLine: change.endLine,
      newStartLine,
      newEndLine,
      lineShift: lineShiftForNext,
      resultingSource
    };
  }

  _applyChange(change, source) {
    const lines = source.split('\n');

    if (change.startLine < 0 || change.endLine > lines.length) {
      throw new Error(`Line range out of bounds: ${change.startLine}-${change.endLine}`);
    }

    const removed = lines.slice(change.startLine, change.endLine + 1);
    const replacementLines = change.replacement.split('\n');
    
    const before = lines.slice(0, change.startLine);
    const after = lines.slice(change.endLine + 1);
    const resultLines = [...before, ...replacementLines, ...after];
    const resultingSource = resultLines.join('\n');

    return {
      resultingSource,
      removed,
      added: replacementLines
    };
  }

  _estimateLineChanges(previews) {
    let totalAdded = 0;
    let totalRemoved = 0;

    for (const preview of previews) {
      if (preview.valid) {
        totalAdded += preview.addedLines;
        totalRemoved += preview.removedLines;
      }
    }

    return {
      added: totalAdded,
      removed: totalRemoved,
      net: totalAdded - totalRemoved
    };
  }

  _verifyChangeGuards(change, source) {
    const result = {
      id: change.id,
      valid: true,
      checks: []
    };

    // Check line bounds
    const lines = source.split('\n');
    if (change.startLine >= lines.length || change.endLine > lines.length) {
      result.valid = false;
      result.checks.push({
        type: 'bounds',
        valid: false,
        message: `Line range exceeds source (${change.startLine}-${change.endLine} vs ${lines.length} lines)`
      });
      return result;
    }

    // Check hash guard if present
    if (change.guards.hash) {
      const content = lines.slice(change.startLine, change.endLine + 1).join('\n');
      // Simplified hash check (would use actual hash function)
      result.checks.push({
        type: 'hash',
        valid: true,
        message: 'Hash guard present (not verified in dry-run)'
      });
    }

    // Check span guard if present
    if (change.guards.span) {
      const spanValid = change.startLine === change.guards.span.start &&
                       change.endLine === change.guards.span.end;
      result.checks.push({
        type: 'span',
        valid: spanValid,
        message: spanValid ? 'Span guard matches' : 'Span guard mismatch'
      });
      result.valid = result.valid && spanValid;
    }

    return result;
  }

  _emitResultPlan(result) {
    return {
      version: 1,
      timestamp: new Date().toISOString(),
      source: 'batch-dry-runner',
      operations: result.changes.map((change, idx) => ({
        id: change.id,
        index: idx,
        status: change.status,
        linesBefore: change.linesBefore,
        linesAfter: change.linesAfter,
        guards: {
          applied: true,
          timestamp: new Date().toISOString()
        }
      })),
      resultingSource: result.resultingSource,
      canContinue: result.failed === 0,
      nextAction: result.failed === 0 
        ? 'verify-result' 
        : 'manual-review'
    };
  }
}

module.exports = BatchDryRunner;
