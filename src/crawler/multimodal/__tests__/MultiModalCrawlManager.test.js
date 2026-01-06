'use strict';

const { EventEmitter } = require('events');
const { MultiModalCrawlManager } = require('../MultiModalCrawlManager');

function createMockOrchestrator() {
  const orchestrator = new EventEmitter();
  orchestrator.stop = jest.fn();
  orchestrator.pause = jest.fn();
  orchestrator.resume = jest.fn();
  orchestrator.getStatistics = () => ({ phase: 'running' });
  orchestrator.start = async (domain) => {
    orchestrator.emit('phase-change', { from: 'idle', to: 'downloading', batch: 1 });
    return {
      domain,
      sessionId: `mm-${domain}`,
      runtimeFormatted: '0s',
      batchNumber: 1,
      totalPagesDownloaded: 0,
      totalPagesAnalyzed: 0,
      totalPatternsLearned: 0,
      totalHubsDiscovered: 0,
      totalReanalyzed: 0,
      pagesPerMinute: 0
    };
  };
  return { orchestrator };
}

describe('MultiModalCrawlManager', () => {
  test('runs multiple domains and forwards events', async () => {
    const manager = new MultiModalCrawlManager({
      maxParallel: 2,
      createOrchestrator: createMockOrchestrator
    });

    const events = [];
    manager.on('phase-change', (payload) => events.push(payload));

    const results = await manager.start(['a.com', 'b.com']);

    expect(results).toHaveLength(2);
    expect(events.length).toBe(2);
    const domains = events.map(e => e.domain).sort();
    expect(domains).toEqual(['a.com', 'b.com']);
  });
});
