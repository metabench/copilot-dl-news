/**
 * integration-recipes.test.js — End-to-end integration tests for recipes
 * 
 * Tests complete recipe workflows, multi-step orchestration, and realistic
 * refactoring scenarios using the recipe system with mocked dependencies.
 */

jest.mock('../../../tools/dev/js-scan/operations/rippleAnalysis', () => ({
  analyzeRipple: jest.fn(async (targetFile) => ({
    targetFile,
    success: true,
    graph: {
      targetFile,
      nodeCount: 1,
      edgeCount: 0,
      depth: 0,
      hasCycles: false,
      nodes: []
    },
    risk: {
      score: 10,
      level: 'GREEN',
      factors: {},
      recommendations: []
    },
    cycles: {
      hasCycles: false,
      cycleCount: 0,
      cycles: []
    },
    safetyAssertions: {
      canRename: true,
      canDelete: false,
      canModifySignature: true,
      canExtract: true
    },
    summary: {
      message: `Ripple analysis for ${targetFile}: GREEN risk`,
      nodeCount: 1,
      riskScore: 10,
      riskLevel: 'GREEN',
      hasCycles: false
    }
  }))
}));

const { analyzeRipple } = require('../../../tools/dev/js-scan/operations/rippleAnalysis');
const path = require('path');
const fs = require('fs');
const RecipeEngine = require('../../../tools/dev/js-edit/recipes/RecipeEngine');
const OperationDispatcher = require('../../../tools/dev/js-edit/recipes/OperationDispatcher');
const VariableResolver = require('../../../tools/dev/js-edit/recipes/VariableResolver');
const ConditionEvaluator = require('../../../tools/dev/js-edit/recipes/ConditionEvaluator');

describe('Recipe Integration Tests', () => {
  let recipeDir;
  let mockDispatcher;

  beforeAll(() => {
    recipeDir = path.join(__dirname, '../../../tmp/test-integration-recipes');
    if (!fs.existsSync(recipeDir)) {
      fs.mkdirSync(recipeDir, { recursive: true });
    }
  });

  beforeEach(() => {
    analyzeRipple.mockClear();
    mockDispatcher = new OperationDispatcher({
      logger: jest.fn(),
      verbose: false
    });
  });

  afterAll(() => {
    if (fs.existsSync(recipeDir)) {
      fs.rmSync(recipeDir, { recursive: true, force: true });
    }
  });

  describe('Rename globally recipe workflow', () => {
    it('should execute rename-globally recipe', async () => {
      const workspaceRoot = path.join(recipeDir, 'rename-workspace');
      const targetFile = path.join(workspaceRoot, 'build-query.js');

      if (!fs.existsSync(workspaceRoot)) {
        fs.mkdirSync(workspaceRoot, { recursive: true });
      }
      fs.writeFileSync(targetFile, 'export function buildQuery() { return true; }\n');

      const recipe = {
        version: '1.0',
        name: 'Rename function globally',
        description: 'Rename a function across all files',
        parameters: {
          oldName: { type: 'string', required: true },
          newName: { type: 'string', required: true },
          scope: { type: 'string', required: true },
          targetFile: { type: 'string', required: true },
          workspaceRoot: { type: 'string', required: true }
        },
        steps: [
          {
            name: 'Find usage sites',
            operation: 'js-scan',
            search: '${oldName}',
            scope: '${scope}',
            emit: 'usage_sites'
          },
          {
            name: 'Verify can rename',
            operation: 'js-scan',
            'ripple-analysis': '${targetFile}',
            workspace: '${workspaceRoot}',
            depth: 3,
            emit: 'ripple_report'
          },
          {
            name: 'Rename globally',
            operation: 'js-edit',
            action: 'rename',
            oldName: '${oldName}',
            newName: '${newName}',
            condition: '${ripple_report.safetyAssertions.canRename} == true',
            emit: 'rename_result'
          },
          {
            name: 'Report results',
            operation: 'report',
            message: 'Renamed ${oldName} to ${newName}'
          }
        ]
      };

      const recipeFile = path.join(recipeDir, 'rename-globally.json');
      fs.writeFileSync(recipeFile, JSON.stringify(recipe, null, 2));

      const engine = new RecipeEngine(recipeFile, { dispatcher: mockDispatcher });
      await engine.load();

      const results = await engine.execute({
        params: {
          oldName: 'buildQuery',
          newName: 'constructQuery',
          scope: workspaceRoot,
          targetFile,
          workspaceRoot
        }
      });

      expect(results.stepResults.length).toBeGreaterThan(0);
      expect(engine.manifest.status).toBe('success');
      expect(analyzeRipple).toHaveBeenCalledWith(targetFile, expect.objectContaining({
        workspaceRoot,
        depth: 3
      }));

      const rippleStep = results.stepResults.find(stepResult => stepResult.stepName === 'Verify can rename');
      expect(rippleStep).toBeDefined();
      expect(rippleStep.results.safetyAssertions.canRename).toBe(true);
    });
  });

  describe('Move and update recipe workflow', () => {
    it('should execute move-and-update recipe', async () => {
      const recipe = {
        version: '1.0',
        name: 'Move function and update imports',
        description: 'Move a function to a new file and update imports',
        parameters: {
          functionName: { type: 'string', required: true },
          sourceFile: { type: 'string', required: true },
          targetFile: { type: 'string', required: true }
        },
        steps: [
          {
            name: 'Locate function',
            operation: 'js-edit',
            action: 'locate-function',
            file: '${sourceFile}',
            functionName: '${functionName}',
            emit: 'function_location'
          },
          {
            name: 'Extract to module',
            operation: 'js-edit',
            action: 'extract-to-module',
            file: '${sourceFile}',
            functionName: '${functionName}',
            targetFile: '${targetFile}',
            emit: 'extraction_result'
          },
          {
            name: 'Find importers',
            operation: 'js-scan',
            search: '${functionName}',
            emit: 'import_locations'
          },
          {
            name: 'Report',
            operation: 'report',
            message: 'Moved function to ${targetFile}'
          }
        ]
      };

      const recipeFile = path.join(recipeDir, 'move-and-update.json');
      fs.writeFileSync(recipeFile, JSON.stringify(recipe, null, 2));

      const engine = new RecipeEngine(recipeFile, { dispatcher: mockDispatcher });
      await engine.load();

      const results = await engine.execute({
        params: {
          functionName: 'buildQuery',
          sourceFile: 'src/utils.js',
          targetFile: 'src/db/query-builder.js'
        }
      });

      expect(results.stepResults.length).toBeGreaterThan(0);
    });
  });

  describe('Consolidate imports recipe workflow', () => {
    it('should execute consolidate-imports recipe', async () => {
      const recipe = {
        version: '1.0',
        name: 'Consolidate imports',
        description: 'Merge multiple imports from same module',
        parameters: {
          targetModule: { type: 'string', required: true },
          scope: { type: 'string', default: 'src/' }
        },
        steps: [
          {
            name: 'Find import instances',
            operation: 'js-scan',
            search: '${targetModule}',
            scope: '${scope}',
            pattern: 'import.*from.*${targetModule}',
            emit: 'import_instances'
          },
          {
            name: 'Group by file',
            operation: 'js-scan',
            search: '${targetModule}',
            emit: 'imports_by_file'
          },
          {
            name: 'Consolidate',
            operation: 'js-edit',
            action: 'batch',
            targetModule: '${targetModule}',
            emit: 'consolidation_results'
          },
          {
            name: 'Report',
            operation: 'report',
            message: 'Consolidated imports from ${targetModule}'
          }
        ]
      };

      const recipeFile = path.join(recipeDir, 'consolidate-imports.json');
      fs.writeFileSync(recipeFile, JSON.stringify(recipe, null, 2));

      const engine = new RecipeEngine(recipeFile, { dispatcher: mockDispatcher });
      await engine.load();

      const results = await engine.execute({
        params: {
          targetModule: 'lodash',
          scope: 'src/'
        }
      });

      expect(results.stepResults.length).toBeGreaterThan(0);
    });
  });

  describe('Variable resolution across steps', () => {
    it('should resolve step outputs in subsequent steps', async () => {
      const recipe = {
        version: '1.0',
        name: 'Multi-step with variable passing',
        parameters: {
          searchTerm: { type: 'string', required: true }
        },
        steps: [
          {
            name: 'Find files',
            operation: 'js-scan',
            search: '${searchTerm}',
            emit: 'search_results'
          },
          {
            name: 'Process first result',
            operation: 'report',
            message: 'Found in ${search_results.matches[0].file}',
            condition: '${search_results.count > 0}'
          }
        ]
      };

      const recipeFile = path.join(recipeDir, 'multi-step.json');
      fs.writeFileSync(recipeFile, JSON.stringify(recipe, null, 2));

      const engine = new RecipeEngine(recipeFile, { dispatcher: mockDispatcher });
      await engine.load();

      const results = await engine.execute({
        params: { searchTerm: 'myFunction' }
      });

      expect(results.stepResults.length).toBe(2);
    });
  });

  describe('Condition evaluation in recipes', () => {
    it('should skip steps when conditions are false', async () => {
      const recipe = {
        version: '1.0',
        name: 'Conditional execution',
        parameters: {
          shouldProcess: { type: 'boolean', default: false }
        },
        steps: [
          {
            name: 'Check flag',
            operation: 'report',
            message: 'Initial',
            emit: 'check1'
          },
          {
            name: 'Conditional processing',
            operation: 'js-scan',
            search: 'test',
            condition: '${shouldProcess} == true'
          },
          {
            name: 'Final report',
            operation: 'report',
            message: 'Done'
          }
        ]
      };

      const recipeFile = path.join(recipeDir, 'conditional.json');
      fs.writeFileSync(recipeFile, JSON.stringify(recipe, null, 2));

      const engine = new RecipeEngine(recipeFile, { dispatcher: mockDispatcher });
      await engine.load();

      const results = await engine.execute({
        params: { shouldProcess: false }
      });

      // Step with false condition should be skipped
      const skippedStep = results.stepResults.find(s => s.name === 'Conditional processing');
      expect(skippedStep.skipped || !skippedStep.executed).toBe(true);
    });
  });

  describe('Error recovery in recipes', () => {
    it('should handle errors with continue strategy', async () => {
      const recipe = {
        version: '1.0',
        name: 'Error recovery',
        steps: [
          {
            name: 'Normal step',
            operation: 'report',
            message: 'Step 1'
          },
          {
            name: 'Failing step',
            operation: 'js-edit',
            action: 'invalid-action',
            onError: 'continue'
          },
          {
            name: 'Recovery step',
            operation: 'report',
            message: 'Recovered'
          }
        ]
      };

      const recipeFile = path.join(recipeDir, 'error-recovery.json');
      fs.writeFileSync(recipeFile, JSON.stringify(recipe, null, 2));

      const engine = new RecipeEngine(recipeFile, { dispatcher: mockDispatcher });
      await engine.load();

      const results = await engine.execute({ params: {} });

      // Should have attempted all 3 steps
      expect(results.stepResults.length).toBe(3);
      expect(engine.manifest.status).toBe('success');
    });
  });

  describe('Dry-run mode for recipes', () => {
    it('should preview recipe execution without changes', async () => {
      const recipe = {
        version: '1.0',
        name: 'Dry run test',
        parameters: {
          functionName: { type: 'string', required: true }
        },
        steps: [
          {
            name: 'Rename function',
            operation: 'js-edit',
            action: 'rename',
            oldName: '${functionName}',
            newName: 'renamed_${functionName}'
          }
        ]
      };

      const recipeFile = path.join(recipeDir, 'dryrun.json');
      fs.writeFileSync(recipeFile, JSON.stringify(recipe, null, 2));

      const engine = new RecipeEngine(recipeFile, { dispatcher: mockDispatcher });
      await engine.load();

      const results = await engine.execute({
        params: { functionName: 'myFunc' },
        dryRun: true
      });

      expect(results.dryRun).toBe(true);
      expect(results.stepResults[0].preview).toBeDefined();
    });
  });

  describe('Recipe manifest and reporting', () => {
    it('should generate comprehensive execution report', async () => {
      const recipe = {
        version: '1.0',
        name: 'Test recipe',
        steps: [
          { name: 'Step 1', operation: 'report', message: 'First' },
          { name: 'Step 2', operation: 'report', message: 'Second' }
        ]
      };

      const recipeFile = path.join(recipeDir, 'report.json');
      fs.writeFileSync(recipeFile, JSON.stringify(recipe, null, 2));

      const engine = new RecipeEngine(recipeFile, { dispatcher: mockDispatcher });
      await engine.load();

      await engine.execute({ params: {} });

      const manifest = engine.manifest;

      expect(manifest.recipeName).toBe('Test recipe');
      expect(manifest.steps.length).toBe(2);
      expect(manifest.status).toBe('success');
      expect(manifest.totalDuration).toBeGreaterThanOrEqual(0);
      expect(manifest.startTime).toBeDefined();
      expect(manifest.endTime).toBeDefined();
    });

    it('should format human-readable summary', async () => {
      const recipe = {
        version: '1.0',
        name: 'Summary test',
        steps: [
          { name: 'Search', operation: 'js-scan', search: 'test' },
          { name: 'Report', operation: 'report', message: 'Completed' }
        ]
      };

      const recipeFile = path.join(recipeDir, 'summary.json');
      fs.writeFileSync(recipeFile, JSON.stringify(recipe, null, 2));

      const engine = new RecipeEngine(recipeFile, { dispatcher: mockDispatcher });
      await engine.load();

      await engine.execute({ params: {} });
      const summary = engine.getSummary();

      expect(summary).toContain('Summary test');
      expect(summary).toContain('completed');
      expect(summary).toContain('2 steps');
    });
  });

  describe('VariableResolver integration', () => {
    it('should resolve complex variable paths', () => {
      const context = {
        step1: {
          matches: [
            { file: 'src/utils.js', name: 'myFunc', hash: 'abc' },
            { file: 'src/other.js', name: 'myFunc', hash: 'def' }
          ],
          count: 2
        }
      };

      const resolver = new VariableResolver(context);

      expect(resolver.resolve('${step1.count}')).toBe('2');
      expect(resolver.resolve('${step1.matches[0].name}')).toBe('myFunc');
      expect(resolver.resolve('${step1.matches[1].file}')).toBe('src/other.js');
    });

    it('should handle fallback values', () => {
      const resolver = new VariableResolver({ existing: 'value' });

      expect(resolver.resolve('${missing|default}')).toBe('default');
      expect(resolver.resolve('${existing|fallback}')).toBe('value');
    });
  });

  describe('ConditionEvaluator integration', () => {
    it('should evaluate complex conditions', () => {
      const context = {
        count: 5,
        safe: true,
        result: 'success'
      };

      expect(ConditionEvaluator.evaluate('${count} > 3', context)).toBe(true);
      expect(ConditionEvaluator.evaluate('${count} < 3', context)).toBe(false);
      expect(ConditionEvaluator.evaluate('${safe} == true', context)).toBe(true);
      expect(ConditionEvaluator.evaluate('${count} > 0 && ${safe} == true', context))
        .toBe(true);
    });
  });

  describe('Large-scale refactor workflow', () => {
    it('should execute multi-phase refactor recipe', async () => {
      const recipe = {
        version: '1.0',
        name: 'Large-scale refactor',
        steps: [
          {
            name: 'Phase 1: Preparation',
            operation: 'js-scan',
            search: 'TODO',
            emit: 'prep_notes'
          },
          {
            name: 'Phase 2: Analysis',
            operation: 'js-scan',
            'ripple-analysis': '*',
            depth: 4,
            emit: 'dependency_graph'
          },
          {
            name: 'Phase 3: Processing',
            operation: 'report',
            message: 'Processing ${dependency_graph.nodeCount} nodes'
          },
          {
            name: 'Phase 4: Validation',
            operation: 'js-scan',
            search: 'error',
            emit: 'validation'
          },
          {
            name: 'Phase 5: Report',
            operation: 'report',
            message: 'Refactor complete'
          }
        ]
      };

      const recipeFile = path.join(recipeDir, 'large-refactor.json');
      fs.writeFileSync(recipeFile, JSON.stringify(recipe, null, 2));

      const engine = new RecipeEngine(recipeFile, { dispatcher: mockDispatcher });
      await engine.load();

      const results = await engine.execute({ params: {} });

      expect(results.stepResults.length).toBe(5);
      expect(engine.manifest.status).toBe('success');
    });
  });
});
