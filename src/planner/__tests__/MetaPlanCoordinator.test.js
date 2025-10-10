'use strict';

const { MetaPlanCoordinator } = require('../meta/MetaPlanCoordinator');

describe('MetaPlanCoordinator', () => {
  function createBlueprint() {
    return {
      domain: 'example.com',
      proposedHubs: [
        { url: 'https://example.com/hub' },
        { url: 'https://example.com/hub' } // duplicate for dedupe
      ],
      seedQueue: [
        { url: 'https://example.com/a' },
        { url: 'https://example.com/a' },
        { url: 'https://example.com/b?x=1&y=2' }
      ],
      schedulingConstraints: [
        { host: 'example.com', slot: 1 },
        { host: 'example.com', slot: 2 }
      ],
      costEstimates: {
        estimatedRequests: 12,
        estimatedDurationMs: 42000
      },
      rationale: [{ type: 'text', message: 'Seed reasoning' }]
    };
  }

  it('validates, scores, and arbitrates blueprint without microprolog plan', async () => {
    const coordinator = new MetaPlanCoordinator();
    const blueprint = createBlueprint();

    const result = await coordinator.process({
      blueprint,
      context: {
        options: { domain: 'example.com' },
        telemetry: { elapsedMs: 2500 },
        history: {
          baselineRequests: 20,
          baselineDurationMs: 60000,
          precisionProxy: 0.65,
          noveltyLift: 0.1
        }
      }
    });

    expect(result.validatorResult.valid).toBe(true);
    expect(result.alternativeScores[0].score).toBeDefined();
    expect(result.alternativeScores[0].plan.seedQueue.length).toBeLessThanOrEqual(3);
    expect(['accept_alternative', 'fuse']).toContain(result.decision.outcome);
    expect(result.sanitizedBlueprint.seedQueue.length).toBeLessThanOrEqual(3);
  });
});
