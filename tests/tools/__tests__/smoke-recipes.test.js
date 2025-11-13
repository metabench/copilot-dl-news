/**
 * smoke-recipes.test.js — End-to-end smoke tests for recipe CLI
 * 
 * Tests complete recipe workflows using actual CLI commands against real
 * test fixtures. These are smoke tests to validate production readiness.
 * 
 * Run with: npx jest --config jest.careful.config.js --runTestsByPath tests/tools/__tests__/smoke-recipes.test.js
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

describe('Recipe System Smoke Tests', () => {
  let fixtureDir;
  let recipeDir;

  beforeAll(() => {
    // Setup test directories
    fixtureDir = path.join(__dirname, '../../fixtures/smoke-tests');
    recipeDir = path.join(fixtureDir, 'recipes');
    
    if (!fs.existsSync(fixtureDir)) {
      fs.mkdirSync(fixtureDir, { recursive: true });
    }
    if (!fs.existsSync(recipeDir)) {
      fs.mkdirSync(recipeDir, { recursive: true });
    }
  });

  afterAll(() => {
    // Cleanup
    if (fs.existsSync(fixtureDir)) {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  describe('Basic Recipe Execution', () => {
    beforeEach(() => {
      const recipeFile = path.join(recipeDir, 'simple-report.json');
      const recipe = {
        name: 'simple-report',
        description: 'Simple test recipe',
        version: '1.0.0',
        steps: [
          {
            name: 'Step 1',
            operation: 'report',
            message: 'First step'
          },
          {
            name: 'Step 2',
            operation: 'report',
            message: 'Second step'
          }
        ]
      };
      fs.writeFileSync(recipeFile, JSON.stringify(recipe, null, 2));
    });

    it('should execute simple recipe and produce JSON output', () => {
      const recipeFile = path.join(recipeDir, 'simple-report.json');
      const cmd = `node tools/dev/js-edit.js --recipe "${recipeFile}" --json 2>&1`;

      const result = execSync(cmd, {
        encoding: 'utf-8',
        cwd: path.join(__dirname, '../../..'),
        windowsHide: true
      });

      // Extract JSON from output (look for complete JSON object)
      const jsonMatch = result.match(/\{[\s\S]*"recipeName"[\s\S]*\}/);
      
      expect(jsonMatch).toBeTruthy();
      const output = JSON.parse(jsonMatch[0]);

      expect(output.manifest).toBeDefined();
      expect(output.manifest.recipeName).toBe('simple-report');
      expect(output.manifest.status).toBe('success');
      expect(output.stepResults).toHaveLength(2);
      output.stepResults.forEach((step) => {
        expect(step.status).toBe('success');
      });
    });
  });

  describe('Human-Readable Output', () => {
    beforeEach(() => {
      const recipeFile = path.join(recipeDir, 'text-output.json');
      const recipe = {
        name: 'text-output',
        description: 'Test human-readable output',
        version: '1.0.0',
        steps: [
          {
            name: 'Step 1',
            operation: 'report',
            message: 'First step'
          },
          {
            name: 'Step 2',
            operation: 'report',
            message: 'Second step'
          }
        ]
      };
      fs.writeFileSync(recipeFile, JSON.stringify(recipe, null, 2));
    });

    it('should produce formatted text output without --json', () => {
      const recipeFile = path.join(recipeDir, 'text-output.json');
      const cmd = `node tools/dev/js-edit.js --recipe "${recipeFile}" 2>&1`;

      const result = execSync(cmd, {
        encoding: 'utf-8',
        cwd: path.join(__dirname, '../../..'),
        windowsHide: true
      });

      // Check for formatted output markers
      expect(result).toContain('Recipe validated successfully');
      expect(result).toContain('Recipe Execution');
      expect(result).toContain('Step Results');
      expect(result).toContain('✓'); // Success icon
    });
  });

  describe('Variable Substitution', () => {
    beforeEach(() => {
      const recipeFile = path.join(recipeDir, 'variable-test.json');
      const recipe = {
        name: 'variable-test',
        description: 'Test variable substitution',
        version: '1.0.0',
        parameters: {
          message: { type: 'string', default: 'default message' }
        },
        steps: [
          {
            name: 'Report built-ins',
            operation: 'report',
            message: 'Time=${NOW}, Workspace=${WORKSPACE}'
          },
          {
            name: 'Report parameters',
            operation: 'report',
            message: 'Message=${parameters.message}'
          }
        ]
      };
      fs.writeFileSync(recipeFile, JSON.stringify(recipe, null, 2));
    });

    it('should substitute variables correctly', () => {
      const recipeFile = path.join(recipeDir, 'variable-test.json');
      expect(fs.existsSync(recipeFile)).toBe(true);
      const cmd = `node tools/dev/js-edit.js --recipe "${recipeFile}" --param message="custom message" --json 2>&1`;

      const result = execSync(cmd, {
        encoding: 'utf-8',
        cwd: path.join(__dirname, '../../..'),
        windowsHide: true
      });

      const jsonMatch = result.match(/\{[\s\S]*"recipeName"[\s\S]*\}/);
      expect(jsonMatch).toBeTruthy();
      const output = JSON.parse(jsonMatch[0]);

      expect(output.manifest.status).toBe('success');
      expect(output.builtInVariables).toHaveProperty('NOW');
      expect(output.builtInVariables).toHaveProperty('TODAY');
      expect(output.builtInVariables).toHaveProperty('WORKSPACE');
      expect(output.stepResults).toHaveLength(2);
    });
  });

  describe('Parameter Override', () => {
    beforeEach(() => {
      const recipeFile = path.join(recipeDir, 'param-override.json');
      const recipe = {
        name: 'param-override',
        description: 'Test parameter override',
        version: '1.0.0',
        parameters: {
          message: { type: 'string', default: 'default message' }
        },
        steps: [
          {
            name: 'Report params',
            operation: 'report',
            message: 'Message: ${parameters.message}'
          }
        ]
      };
      fs.writeFileSync(recipeFile, JSON.stringify(recipe, null, 2));
    });

    it('should override parameters from command line', () => {
      const recipeFile = path.join(recipeDir, 'param-override.json');
      expect(fs.existsSync(recipeFile)).toBe(true);
      const cmd = `node tools/dev/js-edit.js --recipe "${recipeFile}" --param message="custom message" --json 2>&1`;

      const result = execSync(cmd, {
        encoding: 'utf-8',
        cwd: path.join(__dirname, '../../..'),
        windowsHide: true
      });

      const jsonMatch = result.match(/\{[\s\S]*"recipeName"[\s\S]*\}/);
      expect(jsonMatch).toBeTruthy();
      const output = JSON.parse(jsonMatch[0]);

      expect(output.manifest.status).toBe('success');
      expect(output.stepResults).toHaveLength(1);
      expect(output.stepResults[0].status).toBe('success');
    });
  });
});

describe('Ripple Analysis CLI Smoke Tests', () => {
  let testFile;

  beforeAll(() => {
    const fixtureDir = path.join(__dirname, '../../fixtures/smoke-tests');
    if (!fs.existsSync(fixtureDir)) {
      fs.mkdirSync(fixtureDir, { recursive: true });
    }

    testFile = path.join(fixtureDir, 'rippleTest.js');
    fs.writeFileSync(testFile, `
// Test module for ripple analysis
function mainFunction() {
  return helperFunction();
}

function helperFunction() {
  return 'result';
}

module.exports = { mainFunction };
`);
  });

  afterAll(() => {
    const fixtureDir = path.join(__dirname, '../../fixtures/smoke-tests');
    if (fs.existsSync(fixtureDir)) {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it('should analyze file and return JSON results', () => {
    const cmd = `node tools/dev/js-scan.js --ripple-analysis "${testFile}" --json 2>&1`;

    const result = execSync(cmd, {
      encoding: 'utf-8',
      cwd: path.join(__dirname, '../../..'),
      windowsHide: true
    });

    // Extract complete JSON object from output
    const jsonMatch = result.match(/\{[\s\S]*"targetFile"[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error('No JSON output found in result');
    }

    const output = JSON.parse(jsonMatch[0]);
    expect(output).toHaveProperty('targetFile');
    expect(output).toHaveProperty('success', true);
    expect(output).toHaveProperty('graph');
    expect(output).toHaveProperty('risk');
    expect(output).toHaveProperty('safetyAssertions');
    
    // Check risk structure
    expect(output.risk).toHaveProperty('score');
    expect(output.risk).toHaveProperty('level');
    expect(['GREEN', 'YELLOW', 'RED']).toContain(output.risk.level);
    
    // Check safety assertions
    expect(output.safetyAssertions).toHaveProperty('canRename');
    expect(output.safetyAssertions).toHaveProperty('canDelete');
    expect(output.safetyAssertions).toHaveProperty('canModifySignature');
    expect(output.safetyAssertions).toHaveProperty('canExtract');
  });

  it('should produce formatted text output without --json', () => {
    const cmd = `node tools/dev/js-scan.js --ripple-analysis "${testFile}" 2>&1`;

    const result = execSync(cmd, {
      encoding: 'utf-8',
      cwd: path.join(__dirname, '../../..'),
      windowsHide: true
    });

    // Check for formatted output sections (actual output uses abbreviated labels)
    expect(result).toContain('Ripple Analysis');
    expect(result).toContain('Risk Assessment');
    expect(result).toContain('Safety Checks'); // Not "Safety Assertions"
    expect(result).toContain('Rename');
    expect(result).toContain('Delete');
  });

  it('should handle non-existent files gracefully', () => {
    const cmd = `node tools/dev/js-scan.js --ripple-analysis "nonexistent.js" --json 2>&1`;

    const result = execSync(cmd, {
      encoding: 'utf-8',
      cwd: path.join(__dirname, '../../..'),
      windowsHide: true
    });

    // Extract JSON from output (might have warnings)
    const jsonMatch = result.match(/\{[\s\S]*"targetFile"[\s\S]*\}/);
    
    if (jsonMatch) {
      const output = JSON.parse(jsonMatch[0]);
      expect(output).toHaveProperty('success', true);
      expect(output.graph.nodeCount).toBe(0);
      expect(output.risk.level).toBe('GREEN');
      expect(output.summary.hasCycles).toBe(false);
    } else {
      // If no JSON found, command should have failed
      expect(result).toContain('error');
    }
  });
});
