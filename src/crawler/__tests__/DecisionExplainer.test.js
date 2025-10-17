/**
 * Tests for DecisionExplainer - Quick Win #1: Explainable Intelligence
 */

const { DecisionExplainer } = require('../DecisionExplainer');

describe('DecisionExplainer', () => {
  let explainer;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };
    explainer = new DecisionExplainer({ logger: mockLogger });
  });

  afterEach(() => {
    if (explainer) {
      explainer.close();
    }
  });

  describe('logDecision', () => {
    test('logs decision with full context', () => {
      explainer.logDecision({
        decision: 'selected',
        url: 'https://example.com/article',
        reason: 'High priority hub',
        confidence: 0.85,
        alternatives: ['https://example.com/other'],
        context: { domain: 'example.com' },
        metadata: { hubType: 'section' }
      });

      const decisions = explainer.getRecentDecisions();
      expect(decisions).toHaveLength(1);
      expect(decisions[0].decision).toBe('selected');
      expect(decisions[0].url).toBe('https://example.com/article');
      expect(decisions[0].confidence).toBe(0.85);
    });

    test('maintains rolling log (max 1000 entries)', () => {
      // Add 1100 decisions
      for (let i = 0; i < 1100; i++) {
        explainer.logDecision({
          decision: 'selected',
          url: `https://example.com/${i}`,
          reason: 'Test',
          confidence: 0.5
        });
      }

      const decisions = explainer.getRecentDecisions(1100);
      expect(decisions.length).toBeLessThanOrEqual(1000);
      // Should keep most recent 1000
      expect(decisions[decisions.length - 1].url).toBe('https://example.com/1099');
    });

    test('includes timestamp for each decision', () => {
      const before = Date.now();
      explainer.logDecision({
        decision: 'avoided',
        url: 'https://example.com/spam',
        reason: 'Avoidance rule match'
      });
      const after = Date.now();

      const decisions = explainer.getRecentDecisions();
      const timestamp = new Date(decisions[0].timestamp).getTime();
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('explainSelection', () => {
    test('generates explanation for selected URL', () => {
      const url = 'https://example.com/politics/article';
      const action = {
        url,
        priority: 0.85,
        confidence: 0.85,
        source: 'hub-tree',
        sources: ['hub_tree'],
        metadata: { hubType: 'section', depth: 2 }
      };
      const playbook = {
        hubTree: [
          { url: 'https://example.com/politics', type: 'section', confidence: 0.9 }
        ]
      };
      const context = { domain: 'example.com', totalCandidates: 10 };

      const explanation = explainer.explainSelection(url, action, playbook, context);

      expect(explanation).toHaveProperty('summary');
      expect(explanation).toHaveProperty('confidence');
      expect(explanation).toHaveProperty('factors');
      expect(explanation.confidence).toBeDefined();
      expect(explanation.factors).toBeInstanceOf(Array);
    });

    test('includes confidence intervals', () => {
      const explanation = explainer.explainSelection(
        'https://example.com/test',
        { priority: 0.7, confidence: 0.7, source: 'hub-tree', sources: ['hub_tree'] },
        { hubTree: [] },
        {}
      );

      expect(explanation.confidence).toBeDefined();
      expect(typeof explanation.confidence).toBe('number');
      expect(explanation.factors).toBeInstanceOf(Array);
    });
  });

  describe('explainAvoidance', () => {
    test('explains why URL was avoided', () => {
      const url = 'https://example.com/tag/spam';
      const avoidanceRules = [
        { pattern: '/tag/', kind: 'tag', confidence: 0.95, created: Date.now() }
      ];
      const matchedRule = avoidanceRules[0];

      const explanation = explainer.explainAvoidance(url, avoidanceRules, matchedRule);

      expect(explanation).toHaveProperty('summary');
      expect(explanation).toHaveProperty('confidence');
      expect(explanation).toHaveProperty('rule');
      expect(explanation.summary).toContain('tag');
      expect(explanation.confidence).toBe(0.95);
    });

    test('handles no matched rule gracefully', () => {
      const explanation = explainer.explainAvoidance(
        'https://example.com/test',
        [],
        null
      );

      expect(explanation.summary).toBeDefined();
      expect(explanation.confidence).toBeDefined();
    });
  });

  describe('explainCounterfactual', () => {
    test('explains why URL A was chosen over URL B', () => {
      const chosenUrl = 'https://example.com/important';
      const alternativeUrl = 'https://example.com/less-important';
      const chosenAction = {
        url: chosenUrl,
        priority: 0.9,
        confidence: 0.9,
        source: 'hub-tree',
        sources: ['hub_tree', 'gap_resolution'],
        metadata: { hubType: 'country' }
      };
      const alternativeAction = {
        url: alternativeUrl,
        priority: 0.6,
        confidence: 0.6,
        source: 'hub-tree',
        sources: ['hub_tree'],
        metadata: { hubType: 'region' }
      };

      const explanation = explainer.explainCounterfactual(
        chosenUrl,
        alternativeUrl,
        chosenAction,
        alternativeAction
      );

      expect(explanation).toHaveProperty('summary');
      expect(explanation).toHaveProperty('comparison');
      expect(explanation.comparison).toHaveProperty('confidenceDiff');
      expect(explanation.comparison.confidenceDiff).toBeCloseTo(0.3, 1);
    });
  });

  describe('generateDecisionTree', () => {
    test('creates visualization data structure', () => {
      const candidateActions = [
        { url: 'https://example.com/a', priority: 0.9, sources: ['hub_tree'], metadata: {} },
        { url: 'https://example.com/b', priority: 0.7, sources: ['gap_resolution'], metadata: {} },
        { url: 'https://example.com/c', priority: 0.5, sources: ['hub_tree'], metadata: {} }
      ];
      const finalActions = candidateActions.slice(0, 2);
      const avoidanceRules = [
        { pattern: '/tag/', kind: 'tag', confidence: 0.95 }
      ];

      const tree = explainer.generateDecisionTree(candidateActions, finalActions, avoidanceRules);

      expect(tree).toHaveProperty('root');
      expect(tree.root).toHaveProperty('count');
      expect(tree.root).toHaveProperty('children');
      expect(tree.root.count).toBe(3);
      expect(tree.root.children.length).toBeGreaterThan(0);
    });

    test('groups candidates by source', () => {
      const candidateActions = [
        { url: 'https://example.com/a', priority: 0.9, sources: ['hub_tree'], metadata: {} },
        { url: 'https://example.com/b', priority: 0.8, sources: ['hub_tree'], metadata: {} },
        { url: 'https://example.com/c', priority: 0.7, sources: ['gap_resolution'], metadata: {} }
      ];

      const tree = explainer.generateDecisionTree(candidateActions, candidateActions, []);

      expect(tree.root.children.length).toBeGreaterThan(0);
      const sourceNodes = tree.root.children.filter(c => c.id.startsWith('source_'));
      expect(sourceNodes.length).toBeGreaterThan(0);
    });

    test('organizes by confidence tiers', () => {
      const candidateActions = [
        { url: 'https://example.com/a', priority: 0.95, sources: ['hub_tree'], metadata: {} },
        { url: 'https://example.com/b', priority: 0.75, sources: ['hub_tree'], metadata: {} },
        { url: 'https://example.com/c', priority: 0.45, sources: ['hub_tree'], metadata: {} }
      ];

      const tree = explainer.generateDecisionTree(candidateActions, candidateActions, []);

      expect(tree.root.children.length).toBeGreaterThan(0);
      const sourceNode = tree.root.children[0];
      expect(sourceNode).toHaveProperty('children');
      expect(sourceNode.children.length).toBeGreaterThan(0);
    });
  });

  describe('getDecisionStats', () => {
    test('aggregates decisions by type', () => {
      explainer.logDecision({ decision: 'selected', url: 'https://example.com/a', reason: 'Test', confidence: 0.9 });
      explainer.logDecision({ decision: 'selected', url: 'https://example.com/b', reason: 'Test', confidence: 0.8 });
      explainer.logDecision({ decision: 'avoided', url: 'https://example.com/c', reason: 'Test', confidence: 0.95 });

      const stats = explainer.getDecisionStats();

      expect(stats).toHaveProperty('byDecision');
      expect(stats.byDecision.selected).toBe(2);
      expect(stats.byDecision.avoided).toBe(1);
    });

    test('calculates average confidence per type', () => {
      explainer.logDecision({ decision: 'selected', url: 'https://example.com/a', reason: 'Test', confidence: 0.9 });
      explainer.logDecision({ decision: 'selected', url: 'https://example.com/b', reason: 'Test', confidence: 0.7 });

      const stats = explainer.getDecisionStats();

      expect(stats.avgConfidence).toBeCloseTo(0.8, 1);
    });

    test('aggregates by source', () => {
      explainer.logDecision({
        decision: 'selected',
        url: 'https://example.com/a',
        reason: 'Test',
        metadata: { sources: ['hub_tree'] }
      });
      explainer.logDecision({
        decision: 'selected',
        url: 'https://example.com/b',
        reason: 'Test',
        metadata: { sources: ['gap_resolution'] }
      });

      const stats = explainer.getDecisionStats();

      expect(stats.bySource).toHaveProperty('unknown');
      expect(stats.bySource.unknown).toBeGreaterThan(0);
    });
  });

  describe('exportDecisions', () => {
    beforeEach(() => {
      explainer.logDecision({
        decision: 'selected',
        url: 'https://example.com/article',
        reason: 'High priority',
        confidence: 0.85,
        context: { domain: 'example.com' },
        metadata: { hubType: 'section' }
      });
    });

    test('exports as JSON', () => {
      const exported = explainer.exportDecisions('json');
      const parsed = JSON.parse(exported);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].url).toBe('https://example.com/article');
    });

    test('exports as CSV', () => {
      const exported = explainer.exportDecisions('csv');

      expect(typeof exported).toBe('string');
      expect(exported).toContain('timestamp,decision,url');
      expect(exported).toContain('https://example.com/article');
    });

    test('exports as summary', () => {
      const exported = explainer.exportDecisions('summary');

      expect(typeof exported).toBe('string');
      expect(exported).toContain('Decision Summary');
      expect(exported).toContain('selected: 1');
    });

    test('defaults to JSON format', () => {
      const exported = explainer.exportDecisions();
      expect(() => JSON.parse(exported)).not.toThrow();
    });
  });

  describe('getDecisions with filters', () => {
    beforeEach(() => {
      explainer.logDecision({
        decision: 'selected',
        url: 'https://example.com/important',
        reason: 'High priority',
        confidence: 0.9
      });
      explainer.logDecision({
        decision: 'avoided',
        url: 'https://example.com/spam',
        reason: 'Avoidance rule',
        confidence: 0.95
      });
      explainer.logDecision({
        decision: 'selected',
        url: 'https://example.com/normal',
        reason: 'Medium priority',
        confidence: 0.6
      });
    });

    test('gets recent decisions with limit', () => {
      const recent = explainer.getRecentDecisions(2);
      expect(recent).toHaveLength(2);
      expect(recent[1].url).toContain('normal');
    });

    test('gets all decisions by default', () => {
      const all = explainer.getRecentDecisions(100);
      expect(all).toHaveLength(3);
    });

    test('filters decisions manually', () => {
      const decisions = explainer.getRecentDecisions();
      const selected = decisions.filter(d => d.decision === 'selected');
      expect(selected).toHaveLength(2);
    });

    test('filters by confidence manually', () => {
      const decisions = explainer.getRecentDecisions();
      const highConfidence = decisions.filter(d => d.confidence >= 0.85);
      expect(highConfidence).toHaveLength(2);
    });
  });

  describe('close', () => {
    test('clears decision log', () => {
      explainer.logDecision({
        decision: 'selected',
        url: 'https://example.com/test',
        reason: 'Test'
      });
      expect(explainer.getRecentDecisions()).toHaveLength(1);

      explainer.close();
      expect(explainer.getRecentDecisions()).toHaveLength(0);
    });
  });
});
