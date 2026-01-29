'use strict';

jest.mock('chalk', () => {
  const identity = (text) => String(text);
  const colorFn = Object.assign(identity, { bold: identity });
  return {
    green: colorFn,
    red: colorFn,
    yellow: colorFn,
    blue: colorFn,
    cyan: colorFn,
    gray: colorFn,
    white: colorFn,
    magenta: colorFn,
    dim: colorFn
  };
});

const EventEmitter = require('events');
const { createOrchestratorCliAdapter, printOrchestratorSummary } = require('../orchestratorAdapter');

// Mock orchestrator
class MockOrchestrator extends EventEmitter {
  constructor() {
    super();
    this.context = {
      stats: { visited: 10, articles: 5, errors: 2 }
    };
    this.budget = {
      summary: {
        limits: { requests: 100, time: 3600000 },
        spent: { requests: 45, time: 120000 }
      }
    };
    this.plan = {
      goals: [
        { type: 'articles', status: 'satisfied' },
        { type: 'coverage', status: 'pending' }
      ]
    };
  }
}

describe('orchestratorAdapter', () => {
  let orchestrator;
  let output;
  let stdout;
  let stderr;

  beforeEach(() => {
    orchestrator = new MockOrchestrator();
    output = [];
    stdout = (msg) => output.push({ type: 'out', msg });
    stderr = (msg) => output.push({ type: 'err', msg });
  });

  describe('createOrchestratorCliAdapter', () => {
    it('subscribes to started event', () => {
      createOrchestratorCliAdapter(orchestrator, { stdout, stderr });

      orchestrator.emit('started', {
        jobId: 'test-123',
        plan: { goals: [{ type: 'articles' }] },
        budget: { limits: { requests: 100 } }
      });

      expect(output.length).toBeGreaterThan(0);
      expect(output[0].msg).toContain('Crawl started');
    });

    it('subscribes to stopped event', () => {
      createOrchestratorCliAdapter(orchestrator, { stdout, stderr });

      orchestrator.emit('stopped', { reason: 'completed' });

      const stopMsg = output.find(o => o.msg.includes('stopped'));
      expect(stopMsg).toBeDefined();
      expect(stopMsg.msg).toContain('completed');
    });

    it('subscribes to goal:satisfied event', () => {
      createOrchestratorCliAdapter(orchestrator, { stdout, stderr, showGoals: true });

      orchestrator.emit('goal:satisfied', { goalId: 'articles' });

      const goalMsg = output.find(o => o.msg.includes('Goal satisfied'));
      expect(goalMsg).toBeDefined();
      expect(goalMsg.msg).toContain('articles');
    });

    it('subscribes to budget:exhausted event', () => {
      createOrchestratorCliAdapter(orchestrator, { stdout, stderr, showBudget: true });

      orchestrator.emit('budget:exhausted', { resource: 'requests' });

      const budgetMsg = output.find(o => o.msg.includes('Budget exhausted'));
      expect(budgetMsg).toBeDefined();
      expect(budgetMsg.msg).toContain('requests');
    });

    it('subscribes to phase:changed event', () => {
      createOrchestratorCliAdapter(orchestrator, { stdout, stderr, showPhases: true });

      orchestrator.emit('phase:changed', { phase: 'crawling' });

      const phaseMsg = output.find(o => o.msg.includes('Phase'));
      expect(phaseMsg).toBeDefined();
      expect(phaseMsg.msg).toContain('Crawling');
    });

    it('detach() removes all listeners', () => {
      const adapter = createOrchestratorCliAdapter(orchestrator, { stdout, stderr });

      expect(orchestrator.listenerCount('started')).toBeGreaterThan(0);

      adapter.detach();

      expect(orchestrator.listenerCount('started')).toBe(0);
      expect(orchestrator.listenerCount('stopped')).toBe(0);
    });
  });

  describe('printOrchestratorSummary', () => {
    it('prints stats summary', () => {
      printOrchestratorSummary(orchestrator, { stdout });

      expect(output.some(o => o.msg.includes('Summary'))).toBe(true);
      expect(output.some(o => o.msg.includes('10'))).toBe(true); // visited
      expect(output.some(o => o.msg.includes('5'))).toBe(true);  // articles
    });

    it('prints budget usage', () => {
      printOrchestratorSummary(orchestrator, { stdout });

      expect(output.some(o => o.msg.includes('Budget Usage'))).toBe(true);
      expect(output.some(o => o.msg.includes('45/100'))).toBe(true);
    });

    it('prints goal status', () => {
      printOrchestratorSummary(orchestrator, { stdout });

      expect(output.some(o => o.msg.includes('Goals'))).toBe(true);
      expect(output.some(o => o.msg.includes('satisfied'))).toBe(true);
      expect(output.some(o => o.msg.includes('pending'))).toBe(true);
    });
  });
});
