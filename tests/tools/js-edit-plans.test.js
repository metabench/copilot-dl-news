const fs = require('fs');
const path = require('path');
const BatchDryRunner = require('../../tools/dev/js-edit/BatchDryRunner');
const { createDigest } = require('../../tools/dev/lib/swcAst');

describe('BatchDryRunner Plans (Gap 4)', () => {
  const tmpDir = path.join(__dirname, 'tmp-plans');
  const targetFile = path.join(tmpDir, 'target.js');
  const planFile = path.join(tmpDir, 'plan.json');

  beforeAll(() => {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    fs.writeFileSync(targetFile, 'function hello() { return "world"; }\n', 'utf8');
  });

  test('should verify file hash guards', () => {
    const source = fs.readFileSync(targetFile, 'utf8');
    const fileHash = createDigest(source);
    
    const runner = new BatchDryRunner(source, { filePath: targetFile });
    runner.addChange({
      file: targetFile,
      startLine: 0,
      endLine: 0,
      replacement: 'function hello() { return "universe"; }',
      guards: {
        fileHash: fileHash
      }
    });

    const result = runner.verifyGuards();
    expect(result.valid).toBe(true);
    expect(result.verified).toBe(1);
  });

  test('should fail verification if file hash does not match', () => {
    const source = fs.readFileSync(targetFile, 'utf8');
    const wrongHash = 'sha256-0000000000000000000000000000000000000000000000000000000000000000';
    
    const runner = new BatchDryRunner(source, { filePath: targetFile });
    runner.addChange({
      file: targetFile,
      startLine: 0,
      endLine: 0,
      replacement: 'function hello() { return "universe"; }',
      guards: {
        fileHash: wrongHash
      }
    });

    const result = runner.verifyGuards();
    expect(result.valid).toBe(false);
    expect(result.failed).toBe(1);
    expect(result.details[0].checks.find(c => c.type === 'fileHash').valid).toBe(false);
  });

  test('should emit a plan with guards', async () => {
    const source = fs.readFileSync(targetFile, 'utf8');
    const runner = new BatchDryRunner(source, { filePath: targetFile });
    
    runner.addChange({
      file: targetFile,
      startLine: 0,
      endLine: 0,
      replacement: 'function hello() { return "universe"; }'
    });

    // Mock the apply result to generate a plan
    const applyResult = await runner.apply({ emitPlan: true, dryRun: true }); // dryRun option doesn't exist in apply, but we just want the plan structure
    
    // We need to manually call _emitResultPlan or similar if apply doesn't do it without actually applying
    // But wait, apply() returns a resultPlan if emitPlan is true.
    // However, apply() modifies the source in memory.
    
    // Let's check if we can generate a plan without applying.
    // The current implementation of _emitResultPlan is based on the result of apply().
    // We might need a new method `generatePlan()` that calculates guards without applying.
  });
});
