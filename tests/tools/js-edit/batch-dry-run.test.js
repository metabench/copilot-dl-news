#!/usr/bin/env node
'use strict';

const path = require('path');
const BatchDryRunner = require(path.join(__dirname, '../../../tools/dev/js-edit/BatchDryRunner'));

describe('BatchDryRunner - Batch Operation Dry-Run', () => {
  const sampleSource = `function add(a, b) {
  return a + b;
}

function subtract(a, b) {
  return a - b;
}

function multiply(a, b) {
  return a * b;
}`;

  let runner;

  beforeEach(() => {
    runner = new BatchDryRunner(sampleSource);
  });

  test('should add and track changes', () => {
    const change = { file: 'test.js', startLine: 0, endLine: 2, replacement: 'new' };
    runner.addChange(change);
    expect(runner.changes.length).toBe(1);
  });

  test('should preview single change', () => {
    runner.addChange({ file: 'test.js', startLine: 0, endLine: 2, replacement: 'new code' });
    const result = runner.dryRun();
    expect(result.success).toBe(true);
    expect(result.preview.length).toBe(1);
  });

  test('should detect conflicting changes', () => {
    runner.addChange({ file: 'test.js', startLine: 0, endLine: 5, replacement: 'a' });
    runner.addChange({ file: 'test.js', startLine: 3, endLine: 8, replacement: 'b' });
    const result = runner.dryRun();
    expect(result.conflicts.length).toBeGreaterThan(0);
  });

  test('should recalculate offsets', () => {
    // Insert 3 lines where 1 line was (line 0)
    runner.addChange({ file: 'test.js', startLine: 1, endLine: 2, replacement: 'added\nlines\nextra' });
    const result = runner.recalculateOffsets();
    // Removing 2 lines (1-2), adding 3 = net +1
    expect(result.totalLineShift).toBe(1);
  });

  test('should suggest recovery strategies', () => {
    runner.addChange({ file: 'test.js', startLine: 0, endLine: 5, replacement: 'a' });
    runner.addChange({ file: 'test.js', startLine: 3, endLine: 8, replacement: 'b' });
    const suggestions = runner.suggestRecovery();
    expect(suggestions.strategies).toBeDefined();
  });

  test('should verify guards', () => {
    runner.addChange({ file: 'test.js', startLine: 0, endLine: 2, replacement: 'new' });
    const result = runner.verifyGuards();
    expect(result.valid).toBe(true);
  });

  test('should handle non-overlapping changes', async () => {
    runner.addChange({ file: 'test.js', startLine: 0, endLine: 2, replacement: 'new1' });
    runner.addChange({ file: 'test.js', startLine: 5, endLine: 7, replacement: 'new2' });
    const result = await runner.apply();
    expect(result.applied).toBeGreaterThan(0);
  });

  test('should emit result plan', async () => {
    runner.addChange({ file: 'test.js', startLine: 0, endLine: 2, replacement: 'new' });
    const result = await runner.apply({ emitPlan: true });
    expect(result.resultPlan).toBeDefined();
    expect(result.resultPlan.version).toBe(1);
  });
});

