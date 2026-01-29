'use strict';

const CrawlPlan = require('../CrawlPlan');

describe('CrawlPlan', () => {
  describe('constructor', () => {
    test('creates empty plan with defaults', () => {
      const plan = new CrawlPlan();

      expect(plan.goals).toEqual([]);
      expect(plan.constraints).toEqual({});
      expect(plan.priorities).toEqual([]);
      expect(plan.seeds).toEqual([]);
      expect(plan.isFrozen).toBe(false);
    });

    test('initializes from options', () => {
      const plan = new CrawlPlan({
        goals: [{ type: 'discover-articles', target: { count: 100 } }],
        constraints: { maxPages: 500 },
        priorities: [{ preset: 'articles-first' }],
        seeds: [{ url: 'https://example.com', priority: 0 }],
        metadata: { source: 'test' }
      });

      expect(plan.goals).toHaveLength(1);
      expect(plan.constraints.maxPages).toBe(500);
      expect(plan.priorities).toHaveLength(1);
      expect(plan.seeds).toHaveLength(1);
      expect(plan.metadata.source).toBe('test');
    });
  });

  describe('goal management', () => {
    test('adds goals with fluent API', () => {
      const plan = new CrawlPlan();

      plan.addGoal(CrawlPlan.GOALS.DISCOVER_ARTICLES, { count: 100 })
          .addGoal(CrawlPlan.GOALS.MAP_STRUCTURE, { pages: 50 });

      expect(plan.goals).toHaveLength(2);
      expect(plan.goals[0].type).toBe('discover-articles');
      expect(plan.goals[0].target.count).toBe(100);
      expect(plan.goals[1].type).toBe('map-structure');
    });

    test('assigns unique IDs to goals', () => {
      const plan = new CrawlPlan();
      plan.addGoal('discover-articles').addGoal('map-structure');

      expect(plan.goals[0].id).toBe('goal-1');
      expect(plan.goals[1].id).toBe('goal-2');
    });

    test('getGoal returns goal by ID', () => {
      const plan = new CrawlPlan();
      plan.addGoal('discover-articles');

      const goal = plan.getGoal('goal-1');
      expect(goal).not.toBeNull();
      expect(goal.type).toBe('discover-articles');
    });

    test('getGoalsByType filters correctly', () => {
      const plan = new CrawlPlan();
      plan.addGoal('discover-articles')
          .addGoal('map-structure')
          .addGoal('discover-articles');

      const articleGoals = plan.getGoalsByType('discover-articles');
      expect(articleGoals).toHaveLength(2);
    });
  });

  describe('goal satisfaction', () => {
    test('isGoalSatisfied returns true when target met', () => {
      const plan = new CrawlPlan();
      plan.addGoal(CrawlPlan.GOALS.DISCOVER_ARTICLES, { count: 10 });

      const context = { stats: { articles: 15 } };
      expect(plan.isGoalSatisfied(plan.goals[0], context)).toBe(true);
    });

    test('isGoalSatisfied returns false when target not met', () => {
      const plan = new CrawlPlan();
      plan.addGoal(CrawlPlan.GOALS.DISCOVER_ARTICLES, { count: 100 });

      const context = { stats: { articles: 50 } };
      expect(plan.isGoalSatisfied(plan.goals[0], context)).toBe(false);
    });

    test('isSatisfied checks all goals', () => {
      const plan = new CrawlPlan();
      plan.addGoal(CrawlPlan.GOALS.DISCOVER_ARTICLES, { count: 10 })
          .addGoal(CrawlPlan.GOALS.MAP_STRUCTURE, { pages: 20 });

      const context = { stats: { articles: 15, visited: 25 } };
      expect(plan.isSatisfied(context)).toBe(true);
    });

    test('hasAnySatisfied returns true if any goal met', () => {
      const plan = new CrawlPlan();
      plan.addGoal(CrawlPlan.GOALS.DISCOVER_ARTICLES, { count: 100 })
          .addGoal(CrawlPlan.GOALS.MAP_STRUCTURE, { pages: 10 });

      const context = { stats: { articles: 5, visited: 20 } };
      expect(plan.hasAnySatisfied(context)).toBe(true);
    });

    test('getSatisfactionPercent calculates average progress', () => {
      const plan = new CrawlPlan();
      plan.addGoal(CrawlPlan.GOALS.DISCOVER_ARTICLES, { count: 100 })
          .addGoal(CrawlPlan.GOALS.MAP_STRUCTURE, { pages: 100 });

      const context = { stats: { articles: 50, visited: 100 } };
      // 50% articles + 100% structure = 75% average
      expect(plan.getSatisfactionPercent(context)).toBe(75);
    });

    test('getGoalProgress returns percentage', () => {
      const plan = new CrawlPlan();
      plan.addGoal(CrawlPlan.GOALS.DISCOVER_ARTICLES, { count: 100 });

      const context = { stats: { articles: 25 } };
      expect(plan.getGoalProgress(plan.goals[0], context)).toBe(25);
    });

    test('getGoalProgress caps at 100', () => {
      const plan = new CrawlPlan();
      plan.addGoal(CrawlPlan.GOALS.DISCOVER_ARTICLES, { count: 10 });

      const context = { stats: { articles: 50 } };
      expect(plan.getGoalProgress(plan.goals[0], context)).toBe(100);
    });
  });

  describe('constraint management', () => {
    test('setConstraint with fluent API', () => {
      const plan = new CrawlPlan();
      plan.setConstraint('maxPages', 100)
          .setConstraint('maxDepth', 5);

      expect(plan.constraints.maxPages).toBe(100);
      expect(plan.constraints.maxDepth).toBe(5);
    });

    test('setConstraints sets multiple at once', () => {
      const plan = new CrawlPlan();
      plan.setConstraints({ maxPages: 200, maxBytes: 1024 });

      expect(plan.constraints.maxPages).toBe(200);
      expect(plan.constraints.maxBytes).toBe(1024);
    });

    test('getConstraint returns value', () => {
      const plan = new CrawlPlan();
      plan.setConstraint('maxPages', 100);

      expect(plan.getConstraint('maxPages')).toBe(100);
      expect(plan.getConstraint('nonexistent')).toBeUndefined();
    });

    test('hasConstraint checks existence', () => {
      const plan = new CrawlPlan();
      plan.setConstraint('maxPages', 100);

      expect(plan.hasConstraint('maxPages')).toBe(true);
      expect(plan.hasConstraint('maxDepth')).toBe(false);
    });
  });

  describe('constraint violation checking', () => {
    test('wouldViolateConstraint detects maxPages violation', () => {
      const plan = new CrawlPlan();
      plan.setConstraint('maxPages', 100);

      const context = { stats: { visited: 99 } };
      const action = { pages: 5 };

      const violation = plan.wouldViolateConstraint(context, action);
      expect(violation).not.toBeNull();
      expect(violation.constraint).toBe('maxPages');
      expect(violation.violated).toBe(true);
    });

    test('wouldViolateConstraint returns null when OK', () => {
      const plan = new CrawlPlan();
      plan.setConstraint('maxPages', 100);

      const context = { stats: { visited: 50 } };
      const action = { pages: 10 };

      expect(plan.wouldViolateConstraint(context, action)).toBeNull();
    });

    test('wouldViolateConstraint checks maxDepth', () => {
      const plan = new CrawlPlan();
      plan.setConstraint('maxDepth', 3);

      const context = { stats: {} };
      const action = { depth: 5 };

      const violation = plan.wouldViolateConstraint(context, action);
      expect(violation.constraint).toBe('maxDepth');
    });

    test('wouldViolateConstraint checks maxErrors', () => {
      const plan = new CrawlPlan();
      plan.setConstraint('maxErrors', 10);

      const context = { stats: { errors: 10 } };
      const action = {};

      const violation = plan.wouldViolateConstraint(context, action);
      expect(violation.constraint).toBe('maxErrors');
    });
  });

  describe('seed management', () => {
    test('addSeed with metadata', () => {
      const plan = new CrawlPlan();
      plan.addSeed('https://example.com', { priority: 0, depth: 0 });

      expect(plan.seeds).toHaveLength(1);
      expect(plan.seeds[0].url).toBe('https://example.com');
      expect(plan.seeds[0].priority).toBe(0);
    });

    test('addSeeds adds multiple', () => {
      const plan = new CrawlPlan();
      plan.addSeeds(['https://a.com', 'https://b.com']);

      expect(plan.seeds).toHaveLength(2);
    });

    test('addSeeds accepts objects', () => {
      const plan = new CrawlPlan();
      plan.addSeeds([
        { url: 'https://a.com', priority: 0 },
        { url: 'https://b.com', priority: 1 }
      ]);

      expect(plan.seeds[1].priority).toBe(1);
    });

    test('getSeedsByPriority returns sorted seeds', () => {
      const plan = new CrawlPlan();
      plan.addSeed('https://low.com', { priority: 10 })
          .addSeed('https://high.com', { priority: 0 })
          .addSeed('https://mid.com', { priority: 5 });

      const sorted = plan.getSeedsByPriority();
      expect(sorted[0].url).toBe('https://high.com');
      expect(sorted[2].url).toBe('https://low.com');
    });

    test('startDomains extracts unique domains', () => {
      const plan = new CrawlPlan();
      plan.addSeed('https://example.com/page1')
          .addSeed('https://example.com/page2')
          .addSeed('https://other.com');

      expect(plan.startDomains).toHaveLength(2);
      expect(plan.startDomains).toContain('example.com');
      expect(plan.startDomains).toContain('other.com');
    });
  });

  describe('lifecycle', () => {
    test('freeze makes plan immutable', () => {
      const plan = new CrawlPlan();
      plan.addGoal('discover-articles').freeze();

      expect(plan.isFrozen).toBe(true);
      expect(() => plan.addGoal('map-structure'))
        .toThrow('CrawlPlan is frozen');
    });

    test('freeze emits event', () => {
      const plan = new CrawlPlan();
      const handler = jest.fn();
      plan.on('frozen', handler);

      plan.freeze();
      expect(handler).toHaveBeenCalled();
    });

    test('clone creates mutable copy', () => {
      const plan = new CrawlPlan();
      plan.addGoal('discover-articles')
          .setConstraint('maxPages', 100)
          .freeze();

      const clone = plan.clone();
      expect(clone.isFrozen).toBe(false);
      clone.addGoal('map-structure'); // Should not throw
      expect(clone.goals).toHaveLength(2);
    });

    test('merge combines plans', () => {
      const plan1 = new CrawlPlan();
      plan1.addGoal('discover-articles')
           .setConstraint('maxPages', 100)
           .addSeed('https://a.com');

      const plan2 = new CrawlPlan();
      plan2.addGoal('map-structure')
           .setConstraint('maxDepth', 5)
           .addSeed('https://b.com');

      const merged = plan1.merge(plan2);
      expect(merged.goals).toHaveLength(2);
      expect(merged.constraints.maxPages).toBe(100);
      expect(merged.constraints.maxDepth).toBe(5);
      expect(merged.seeds).toHaveLength(2);
    });

    test('merge dedupes goals by type', () => {
      const plan1 = new CrawlPlan();
      plan1.addGoal('discover-articles');

      const plan2 = new CrawlPlan();
      plan2.addGoal('discover-articles');

      const merged = plan1.merge(plan2);
      expect(merged.goals).toHaveLength(1);
    });
  });

  describe('serialization', () => {
    test('toJSON serializes plan', () => {
      const plan = new CrawlPlan();
      plan.addGoal('discover-articles', { count: 100 })
          .setConstraint('maxPages', 500)
          .addSeed('https://example.com');

      const json = plan.toJSON();
      expect(json.goals).toHaveLength(1);
      expect(json.constraints.maxPages).toBe(500);
      expect(json.seeds).toHaveLength(1);
    });

    test('fromJSON deserializes plan', () => {
      const original = new CrawlPlan();
      original.addGoal('discover-articles', { count: 100 })
              .setConstraint('maxPages', 500)
              .freeze();

      const json = original.toJSON();
      const restored = CrawlPlan.fromJSON(json);

      expect(restored.goals).toHaveLength(1);
      expect(restored.constraints.maxPages).toBe(500);
      expect(restored.isFrozen).toBe(true);
    });
  });

  describe('fromConfig', () => {
    test('creates plan from crawler config', () => {
      const config = {
        startUrl: 'https://example.com',
        maxPages: 1000,
        maxDepth: 3,
        crawlType: 'intelligent'
      };

      const plan = CrawlPlan.fromConfig(config);

      expect(plan.seeds).toHaveLength(1);
      expect(plan.seeds[0].url).toBe('https://example.com');
      expect(plan.constraints.maxPages).toBe(1000);
      expect(plan.constraints.maxDepth).toBe(3);
      expect(plan.goals).toHaveLength(1);
      expect(plan.goals[0].type).toBe('discover-articles');
    });

    test('infers goals from crawl type', () => {
      expect(CrawlPlan.fromConfig({ crawlType: 'structure' }).goals[0].type)
        .toBe('map-structure');

      expect(CrawlPlan.fromConfig({ crawlType: 'gazetteer' }).goals[0].type)
        .toBe('geographic-coverage');

      expect(CrawlPlan.fromConfig({ crawlType: 'sitemap' }).goals[0].type)
        .toBe('sitemap-only');
    });
  });

  describe('builder pattern', () => {
    test('builder creates plan fluently', () => {
      const plan = CrawlPlan.builder()
        .addGoal('discover-articles', { count: 100 })
        .setConstraint('maxPages', 500)
        .addSeed('https://example.com')
        .build();

      expect(plan.isFrozen).toBe(true);
      expect(plan.goals).toHaveLength(1);
      expect(plan.constraints.maxPages).toBe(500);
    });

    test('buildMutable creates unfrozen plan', () => {
      const plan = CrawlPlan.builder()
        .addGoal('discover-articles')
        .buildMutable();

      expect(plan.isFrozen).toBe(false);
      plan.addGoal('map-structure'); // Should not throw
    });
  });

  describe('goal status updates', () => {
    test('updateGoalStatus changes status', () => {
      const plan = new CrawlPlan();
      plan.addGoal('discover-articles');

      expect(plan.goals[0].status).toBe('pending');

      plan.updateGoalStatus('goal-1', 'in-progress');
      expect(plan.getGoal('goal-1').status).toBe('in-progress');
    });

    test('updateGoalStatus emits event', () => {
      const plan = new CrawlPlan();
      plan.addGoal('discover-articles');

      const handler = jest.fn();
      plan.on('goal:status-changed', handler);

      plan.updateGoalStatus('goal-1', 'satisfied');
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        goalId: 'goal-1',
        oldStatus: 'pending',
        newStatus: 'satisfied'
      }));
    });
  });
});
