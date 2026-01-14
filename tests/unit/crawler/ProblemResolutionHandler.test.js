const ProblemResolutionHandler = require('../../../src/core/crawler/ProblemResolutionHandler');

describe('ProblemResolutionHandler', () => {
  test('hydrateResolvedHubsFromHistory skips when resolver disabled', async () => {
    const handler = new ProblemResolutionHandler({ telemetry: { milestoneOnce: jest.fn() }, state: { hasSeededHub: () => false, addSeededHub: jest.fn() }, normalizeUrl: (u) => u, domain: 'example.com', domainNormalized: 'example.com' });
    const res = await handler.hydrateResolvedHubsFromHistory(null);
    expect(res.status).toBe('skipped');
  });

  test('hydrateResolvedHubsFromHistory reuses seeds', async () => {
    const telemetry = { milestoneOnce: jest.fn(), problem: jest.fn() };
    const added = [];
    const state = {
      hasSeededHub: jest.fn(() => false),
      addSeededHub: jest.fn((n, opts) => { added.push(n); })
    };
    const resolver = {
      getKnownHubSeeds: jest.fn(() => [{ url: 'http://example.com/hub1', confidence: 0.8 }])
    };
    const handler = new ProblemResolutionHandler({ telemetry, state, normalizeUrl: (u) => u, domain: 'example.com', domainNormalized: 'example.com' });
    const res = await handler.hydrateResolvedHubsFromHistory(resolver);
    expect(res.status).toBe('completed');
    expect(added.length).toBe(1);
    expect(telemetry.milestoneOnce).toHaveBeenCalled();
  });

  test('handleProblemResolution adds seeded hub and emits telemetry', () => {
    const telemetry = { milestoneOnce: jest.fn() };
    const added = [];
    const state = { hasSeededHub: jest.fn(() => false), addSeededHub: jest.fn((n, o) => added.push({ n, o })) };
    const handler = new ProblemResolutionHandler({ telemetry, state, normalizeUrl: (u) => u, domain: 'example.com', domainNormalized: 'example.com' });
    handler.handleProblemResolution({ host: 'example.com', url: 'http://example.com/hub1', candidate: { confidence: 0.9 } });
    expect(added.length).toBe(1);
    expect(telemetry.milestoneOnce).toHaveBeenCalled();
  });

  test('attachToResolver sets observer and calls handler on events', () => {
    const telemetry = { milestoneOnce: jest.fn() };
    const added = [];
    const state = { hasSeededHub: jest.fn(() => false), addSeededHub: jest.fn((n, o) => added.push({ n, o })) };
    let receivedObserver;
    const resolver = { setResolutionObserver: jest.fn((obs) => { receivedObserver = obs; }) };
    const handler = new ProblemResolutionHandler({ telemetry, state, normalizeUrl: (u) => u, domain: 'example.com', domainNormalized: 'example.com' });
    handler.attachToResolver(resolver);
    expect(typeof receivedObserver).toBe('function');
    receivedObserver({ host: 'example.com', url: 'http://example.com/hub2', candidate: { confidence: 0.7 } });
    expect(added.length).toBe(1);
  });
});

