'use strict';

const {
  listSequencePresets,
  getSequencePreset,
  resolveSequencePreset
} = require('../sequencePresets');

describe('sequencePresets', () => {
  it('lists available presets with metadata', () => {
    const presets = listSequencePresets();
    const names = presets.map((preset) => preset.name);

    expect(Array.isArray(presets)).toBe(true);
    expect(names).toEqual(expect.arrayContaining([
      'ensureCountryStructure',
      'fullCountryHubDiscovery',
      'resilientCountryExploration'
    ]));

    const presetMeta = presets.find((preset) => preset.name === 'fullCountryHubDiscovery');
    expect(presetMeta.stepCount).toBeGreaterThanOrEqual(3);
    expect(presetMeta.description).toMatch(/Ensure/);
  });

  it('resolves presets with merged overrides and continue behaviour', () => {
    const resolved = resolveSequencePreset('resilientCountryExploration', {
      startUrl: 'https://example.com',
      sharedOverrides: { rateLimitMs: 500 },
      stepOverrides: {
        exploreCountryHubs: { plannerVerbosity: 3 }
      }
    });

    expect(resolved.startUrl).toBe('https://example.com');
    expect(resolved.sharedOverrides.rateLimitMs).toBe(500);
    expect(resolved.continueOnError).toBe(true);
    expect(resolved.sequence).toHaveLength(3);

    const exploreStep = resolved.sequence.find((step) => step.operation === 'exploreCountryHubs');
    expect(exploreStep.overrides.plannerVerbosity).toBe(3);
  });

  it('returns deep copies when retrieving presets', () => {
    const preset = getSequencePreset('ensureCountryStructure');
    expect(preset).not.toBeNull();
    expect(preset.steps).toHaveLength(1);

    // mutate result and ensure original remains unchanged by fetching again
    preset.steps[0] = 'mutated';
    const presetAgain = getSequencePreset('ensureCountryStructure');
    expect(presetAgain.steps[0]).toBe('ensureCountryHubs');
  });
});
