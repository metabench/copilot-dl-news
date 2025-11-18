const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

describe('js-edit Gap 4 Integration', () => {
  const tmpDir = path.join(__dirname, 'tmp-integration');
  const targetFile = path.join(tmpDir, 'target.js');
  const changesFile = path.join(tmpDir, 'changes.json');
  const planFile = path.join(tmpDir, 'plan.json');
  const jsEditPath = path.resolve(__dirname, '../../tools/dev/js-edit.js');

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
    if (fs.existsSync(planFile)) fs.unlinkSync(planFile);
  });

  test('should emit plan and apply it successfully', () => {
    // 1. Create changes file
    const changes = [{
      file: targetFile,
      startLine: 0,
      endLine: 0,
      replacement: 'function hello() { return "universe"; }'
    }];
    fs.writeFileSync(changesFile, JSON.stringify(changes), 'utf8');

    // 2. Emit plan
    execSync(`node ${jsEditPath} --changes ${changesFile} --emit-plan ${planFile} --json`);
    expect(fs.existsSync(planFile)).toBe(true);
    
    const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
    expect(plan.changes[0].guards.fileHash).toBeDefined();

    // 3. Apply plan
    execSync(`node ${jsEditPath} --from-plan ${planFile} --fix --json`);
    
    const content = fs.readFileSync(targetFile, 'utf8');
    expect(content).toContain('universe');
  });

  test('should fail to apply plan if file changed', () => {
    // 1. Create changes file
    const changes = [{
      file: targetFile,
      startLine: 0,
      endLine: 0,
      replacement: 'function hello() { return "universe"; }'
    }];
    fs.writeFileSync(changesFile, JSON.stringify(changes), 'utf8');

    // 2. Emit plan
    execSync(`node ${jsEditPath} --changes ${changesFile} --emit-plan ${planFile} --json`);

    // 3. Modify file
    fs.writeFileSync(targetFile, 'function hello() { return "modified"; }\n', 'utf8');

    // 4. Apply plan (should fail)
    try {
      execSync(`node ${jsEditPath} --from-plan ${planFile} --fix --json`, { stdio: 'pipe' });
      fail('Should have failed');
    } catch (error) {
      expect(error.status).not.toBe(0);
      const output = error.stdout.toString() + error.stderr.toString();
      expect(output).toContain('Guard verification failed');
    }
  });
});
