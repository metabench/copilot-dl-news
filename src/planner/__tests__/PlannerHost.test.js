'use strict';

const { PlannerHost } = require('../PlannerHost');
const { GraphReasonerPlugin } = require('../plugins/GraphReasonerPlugin');

describe('PlannerHost', () => {
  it('should run a single plugin successfully', async () => {
    const plugin = new GraphReasonerPlugin();
    const host = new PlannerHost({
      plugins: [plugin],
      options: {
        domain: 'example.com',
        baseUrl: 'https://example.com',
        startUrl: 'https://example.com'
      },
      budgetMs: 5000,
      preview: true
    });

    const result = await host.run();

    expect(result).toHaveProperty('blackboard');
    expect(result).toHaveProperty('telemetryEvents');
    expect(result).toHaveProperty('elapsedMs');
    expect(result).toHaveProperty('budgetExceeded');
    expect(result).toHaveProperty('statusReason');

    expect(result.blackboard.graphHubsReady).toBe(true);
    expect(result.blackboard.proposedHubs.length).toBeGreaterThan(0);
    expect(result.budgetExceeded).toBe(false);
  });

  it('should capture telemetry events from plugins', async () => {
    const plugin = new GraphReasonerPlugin();
    const host = new PlannerHost({
      plugins: [plugin],
      options: {
        domain: 'example.com',
        baseUrl: 'https://example.com',
        startUrl: 'https://example.com'
      },
      budgetMs: 5000,
      preview: true
    });

    const result = await host.run();

    expect(result.telemetryEvents.length).toBeGreaterThan(0);
    const traceEvents = result.telemetryEvents.filter(e => e.type === 'gofai-trace');
    expect(traceEvents.length).toBeGreaterThan(0);
  });

  it('should enforce time budget', async () => {
    const slowPlugin = {
      pluginId: 'slow-plugin',
      priority: 50,
      init: async () => {},
      tick: async (ctx) => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return false; // Never done
      },
      teardown: async () => {}
    };

    const host = new PlannerHost({
      plugins: [slowPlugin],
      options: { domain: 'example.com', baseUrl: 'https://example.com', startUrl: 'https://example.com' },
      budgetMs: 200,
      preview: true
    });

    const result = await host.run();

    expect(result.elapsedMs).toBeGreaterThanOrEqual(200);
    expect(result.budgetExceeded).toBe(true);
  });

  it('should handle plugin failures gracefully', async () => {
    const failingPlugin = {
      pluginId: 'failing-plugin',
      priority: 50,
      init: async () => {},
      tick: async () => {
        throw new Error('Plugin failure');
      },
      teardown: async () => {}
    };

    const host = new PlannerHost({
      plugins: [failingPlugin],
      options: { domain: 'example.com', baseUrl: 'https://example.com', startUrl: 'https://example.com' },
      budgetMs: 5000,
      preview: true
    });

    const result = await host.run();

    expect(result).toHaveProperty('blackboard');
    expect(result.blackboard.rationale).toContain('Plugin failing-plugin encountered error during planning');
  });

  it('should sort plugins by priority (high to low)', async () => {
    const tickOrder = [];

    const lowPriorityPlugin = {
      pluginId: 'low-priority',
      priority: 10,
      init: async () => {},
      tick: async () => { tickOrder.push('low'); return true; },
      teardown: async () => {}
    };

    const highPriorityPlugin = {
      pluginId: 'high-priority',
      priority: 90,
      init: async () => {},
      tick: async () => { tickOrder.push('high'); return true; },
      teardown: async () => {}
    };

    const host = new PlannerHost({
      plugins: [lowPriorityPlugin, highPriorityPlugin],
      options: { domain: 'example.com', baseUrl: 'https://example.com', startUrl: 'https://example.com' },
      budgetMs: 5000,
      preview: true
    });

    await host.run();

    expect(tickOrder).toEqual(['high', 'low']);
  });
});
