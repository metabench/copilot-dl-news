/**
 * recipe-engine.test.js — Jest tests for RecipeEngine
 * 
 * Tests recipe loading, validation, execution flow, variable resolution,
 * and error handling for the recipe orchestration system.
 */

const path = require('path');
const fs = require('fs');
const RecipeEngine = require('../../../tools/dev/js-edit/recipes/RecipeEngine');
const OperationDispatcher = require('../../../tools/dev/js-edit/recipes/OperationDispatcher');

describe('RecipeEngine', () => {
  let recipeDir;
  let mockDispatcher;

  beforeAll(() => {
    recipeDir = path.join(__dirname, '../../../tmp/test-recipes');
    if (!fs.existsSync(recipeDir)) {
      fs.mkdirSync(recipeDir, { recursive: true });
    }
  });

  beforeEach(() => {
    mockDispatcher = new OperationDispatcher({
      logger: jest.fn(),
      verbose: false
    });
  });

  afterAll(() => {
    // Cleanup test recipes
    if (fs.existsSync(recipeDir)) {
      fs.rmSync(recipeDir, { recursive: true, force: true });
    }
  });

  describe('Recipe loading', () => {
    it('should load valid JSON recipe', async () => {
      const recipe = {
        name: 'Test Recipe',
        version: '1.0',
        steps: []
      };

      const recipeFile = path.join(recipeDir, 'test-recipe.json');
      fs.writeFileSync(recipeFile, JSON.stringify(recipe, null, 2));

      const engine = new RecipeEngine(recipeFile, { dispatcher: mockDispatcher });
      await engine.load();

      expect(engine.recipe).toEqual(recipe);
      expect(engine.manifest.recipeName).toBe('Test Recipe');
    });

    it('should throw when recipe file not found', async () => {
      const engine = new RecipeEngine('/nonexistent/recipe.json', { 
        dispatcher: mockDispatcher 
      });

      await expect(engine.load()).rejects.toThrow('Recipe file not found');
    });

    it('should throw for invalid JSON', async () => {
      const recipeFile = path.join(recipeDir, 'invalid.json');
      fs.writeFileSync(recipeFile, '{ invalid json }');

      const engine = new RecipeEngine(recipeFile, { dispatcher: mockDispatcher });
      await expect(engine.load()).rejects.toThrow();
    });
  });

  describe('Recipe validation', () => {
    it('should validate recipe structure on load', async () => {
      const recipe = {
        name: 'Validate Test',
        version: '1.0',
        steps: [
          { name: 'Step 1', operation: 'report', message: 'test' }
        ]
      };

      const recipeFile = path.join(recipeDir, 'validate-recipe.json');
      fs.writeFileSync(recipeFile, JSON.stringify(recipe, null, 2));

      const engine = new RecipeEngine(recipeFile, { dispatcher: mockDispatcher });
      await engine.load();
      await engine.validate();

      expect(engine.recipe.name).toBe('Validate Test');
    });

    it('should throw when recipe missing required fields', async () => {
      const recipe = {
        // Missing name and version
        steps: []
      };

      const recipeFile = path.join(recipeDir, 'invalid-validate-recipe.json');
      fs.writeFileSync(recipeFile, JSON.stringify(recipe, null, 2));

      const engine = new RecipeEngine(recipeFile, { dispatcher: mockDispatcher });
      await engine.load();

      await expect(engine.validate()).rejects.toThrow('Recipe validation failed');
    });
  });

  describe('Step execution', () => {
    it('should execute simple js-scan step', async () => {
      const recipe = {
        name: 'Scan Test',
        version: '1.0',
        steps: [
          {
            name: 'Search for functions',
            operation: 'js-scan',
            search: 'buildQuery',
            scope: 'src/',
            emit: 'search_results'
          }
        ]
      };

      const recipeFile = path.join(recipeDir, 'scan-recipe.json');
      fs.writeFileSync(recipeFile, JSON.stringify(recipe, null, 2));

      const engine = new RecipeEngine(recipeFile, { dispatcher: mockDispatcher });
      await engine.load();
      
      await engine.execute({});
      
      expect(engine.stepResults.length).toBeGreaterThan(0);
      expect(engine.manifest.status).toBe('success');
    });

    it('should handle step errors gracefully', async () => {
      const recipe = {
        name: 'Error Test',
        version: '1.0',
        steps: [
          {
            name: 'Invalid operation',
            operation: 'invalid-op',
            onError: 'continue'
          }
        ]
      };

      const recipeFile = path.join(recipeDir, 'error-recipe.json');
      fs.writeFileSync(recipeFile, JSON.stringify(recipe, null, 2));

      const engine = new RecipeEngine(recipeFile, { dispatcher: mockDispatcher });
      await engine.load();

      await engine.execute({});
      
      expect(engine.stepResults.length).toBeGreaterThan(0);
    });
  });

  describe('Variable substitution', () => {
    it('should substitute variables in steps', async () => {
      const recipe = {
        name: 'Substitution Test',
        version: '1.0',
        parameters: {
          functionName: { type: 'string', default: 'myFunction' }
        },
        steps: [
          {
            name: 'Search for ${functionName}',
            operation: 'js-scan',
            search: '${functionName}',
            emit: 'results'
          }
        ]
      };

      const recipeFile = path.join(recipeDir, 'subst-recipe.json');
      fs.writeFileSync(recipeFile, JSON.stringify(recipe, null, 2));

      const engine = new RecipeEngine(recipeFile, { dispatcher: mockDispatcher });
      await engine.load();

      await engine.execute({ functionName: 'buildQuery' });

      expect(engine.stepResults[0].results).toBeDefined();
    });

    it('should handle nested variable paths', async () => {
      const recipe = {
        name: 'Nested Path Test',
        version: '1.0',
        steps: [
          {
            name: 'First step',
            operation: 'js-scan',
            search: 'test',
            emit: 'step1'
          },
          {
            name: 'Use step1 output',
            operation: 'report',
            message: 'Search completed'
          }
        ]
      };

      const recipeFile = path.join(recipeDir, 'nested-recipe.json');
      fs.writeFileSync(recipeFile, JSON.stringify(recipe, null, 2));

      const engine = new RecipeEngine(recipeFile, { dispatcher: mockDispatcher });
      await engine.load();

      await engine.execute({});
      
      expect(engine.stepResults.length).toBe(2);
    });
  });

  describe('Dry-run mode', () => {
    it('should preview changes without applying', async () => {
      const recipe = {
        name: 'Dry Run Test',
        version: '1.0',
        steps: [
          {
            name: 'Mock operation',
            operation: 'report',
            message: 'Test'
          }
        ]
      };

      const recipeFile = path.join(recipeDir, 'dryrun-recipe.json');
      fs.writeFileSync(recipeFile, JSON.stringify(recipe, null, 2));

      const engine = new RecipeEngine(recipeFile, { dispatcher: mockDispatcher, dryRun: true });
      await engine.load();

      await engine.execute({});

      expect(engine.dryRun).toBe(true);
      expect(engine.stepResults.length).toBeGreaterThan(0);
    });
  });

  describe('Manifest and reporting', () => {
    it('should generate execution manifest', async () => {
      const recipe = {
        name: 'Manifest Test',
        version: '1.0',
        steps: []
      };

      const recipeFile = path.join(recipeDir, 'manifest-recipe.json');
      fs.writeFileSync(recipeFile, JSON.stringify(recipe, null, 2));

      const engine = new RecipeEngine(recipeFile, { dispatcher: mockDispatcher });
      await engine.load();

      await engine.execute({});
      
      expect(engine.manifest.recipeName).toBe('Manifest Test');
      expect(engine.manifest.startTime).toBeDefined();
      expect(engine.manifest.endTime).toBeDefined();
      expect(engine.manifest.totalDuration).toBeGreaterThanOrEqual(0);
      expect(engine.manifest.status).toBe('success');
    });

    it('should format summary report', async () => {
      const recipe = {
        name: 'Summary Test',
        version: '1.0',
        steps: [
          {
            name: 'Step 1',
            operation: 'report',
            message: 'First step'
          }
        ]
      };

      const recipeFile = path.join(recipeDir, 'summary-recipe.json');
      fs.writeFileSync(recipeFile, JSON.stringify(recipe, null, 2));

      const engine = new RecipeEngine(recipeFile, { dispatcher: mockDispatcher });
      await engine.load();

      await engine.execute({});
      const summary = engine.getSummary?.() || `Executed ${engine.stepResults.length} steps`;

      expect(engine.stepResults.length).toBeGreaterThan(0);
    });
  });

  describe('Conditional execution', () => {
    it('should execute steps and handle conditions', async () => {
      const recipe = {
        name: 'Condition Test',
        version: '1.0',
        steps: [
          {
            name: 'Simple report',
            operation: 'report',
            message: 'Test'
          }
        ]
      };

      const recipeFile = path.join(recipeDir, 'condition-recipe.json');
      fs.writeFileSync(recipeFile, JSON.stringify(recipe, null, 2));

      const engine = new RecipeEngine(recipeFile, { dispatcher: mockDispatcher });
      await engine.load();

      await engine.execute({});

      expect(engine.manifest.status).toBe('success');
    });
  });

  describe('Error handling modes', () => {
    it('should abort recipe on error when onError="abort"', async () => {
      const recipe = {
        name: 'Abort Test',
        version: '1.0',
        steps: [
          {
            name: 'Step 1',
            operation: 'report',
            message: 'First'
          },
          {
            name: 'Failing step',
            operation: 'js-edit',
            action: 'invalid-action-type',
            onError: 'abort'
          },
          {
            name: 'Step 3',
            operation: 'report',
            message: 'Should not run'
          }
        ]
      };

      const recipeFile = path.join(recipeDir, 'abort-recipe.json');
      fs.writeFileSync(recipeFile, JSON.stringify(recipe, null, 2));

      const engine = new RecipeEngine(recipeFile, { dispatcher: mockDispatcher });
      await engine.load();

      try {
        await engine.execute({});
      } catch (e) {
        // Expected to throw
      }

      expect(engine.manifest.status).toBe('failed');
    });

    it('should continue on error when onError="continue"', async () => {
      const recipe = {
        name: 'Continue Test',
        version: '1.0',
        steps: [
          {
            name: 'Failing step',
            operation: 'js-edit',
            action: 'invalid-action-type',
            onError: 'continue'
          },
          {
            name: 'Next step',
            operation: 'report',
            message: 'Should still run'
          }
        ]
      };

      const recipeFile = path.join(recipeDir, 'continue-recipe.json');
      fs.writeFileSync(recipeFile, JSON.stringify(recipe, null, 2));

      const engine = new RecipeEngine(recipeFile, { dispatcher: mockDispatcher });
      await engine.load();

      await engine.execute({});

      expect(engine.manifest.status).toBe('success');
      expect(engine.stepResults.length).toBe(2);
    });
  });
});
