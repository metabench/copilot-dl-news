/**
 * @jest-environment jsdom
 *
 * Tests for createAdvancedFeaturesPanel using lang-tools patterns
 */

jest.mock('../renderingHelpers.js', () => ({
  renderFeatureFlags: jest.fn(),
  renderPriorityBonuses: jest.fn(),
  renderPriorityWeights: jest.fn()
}));

jest.mock('../domUtils.js', () => ({
  showElement: jest.fn()
}));

jest.mock('../formatters.js', () => ({
  formatTimestamp: jest.fn(() => 'now')
}));

const {
  renderFeatureFlags: renderFeatureFlagsBase,
  renderPriorityBonuses: renderPriorityBonusesBase,
  renderPriorityWeights: renderPriorityWeightsBase
} = require('../renderingHelpers.js');
const { showElement } = require('../domUtils.js');
const { formatTimestamp } = require('../formatters.js');
const { createAdvancedFeaturesPanel } = require('../advancedFeaturesPanel.js');

const createPanel = () => {
  const panelEl = document.createElement('section');
  const statusEl = document.createElement('div');
  const featureFlagsList = document.createElement('div');
  const priorityBonusesList = document.createElement('div');
  const priorityWeightsList = document.createElement('div');

  const panel = createAdvancedFeaturesPanel({
    panelEl,
    statusEl,
    featureFlagsList,
    priorityBonusesList,
    priorityWeightsList
  });

  return {
    panel,
    panelEl,
    statusEl,
    featureFlagsList,
    priorityBonusesList,
    priorityWeightsList
  };
};

describe('createAdvancedFeaturesPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete window.__advancedConfig;
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('setState updates dataset, aria attributes, and status text when types are valid', () => {
    const {
      panel,
      panelEl,
      statusEl
    } = createPanel();

    panel.setState({ state: 'ready', busy: true, message: 'Ready' });

    expect(panelEl.dataset.state).toBe('ready');
    expect(panelEl.getAttribute('aria-busy')).toBe('true');
    expect(statusEl.textContent).toBe('Ready');

    panel.setState({ state: 123, busy: 'nope', message: { text: 'ignore' } });

    expect(panelEl.dataset.state).toBe('ready');
    expect(panelEl.getAttribute('aria-busy')).toBe('true');
    expect(statusEl.textContent).toBe('Ready');
  });

  test('load fetches config, renders sections, and updates status on success', async () => {
    const {
      panel,
      panelEl,
      statusEl,
      featureFlagsList,
      priorityBonusesList,
      priorityWeightsList
    } = createPanel();

    const features = { advanced_mode: true };
    const queue = {
      bonuses: { homepage: { value: 5 } },
      weights: { freshness: 0.7 }
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ config: { features, queue } })
    });

    await panel.load({ quiet: true });

    expect(fetch).toHaveBeenCalledWith('/api/config');
    expect(renderFeatureFlagsBase).toHaveBeenCalledWith(features, featureFlagsList);
    expect(renderPriorityBonusesBase).toHaveBeenCalledWith(queue, priorityBonusesList);
    expect(renderPriorityWeightsBase).toHaveBeenCalledWith(queue, priorityWeightsList);

    expect(showElement).toHaveBeenCalledWith(panelEl);
    expect(panelEl.dataset.state).toBe('ready');
    expect(panelEl.getAttribute('aria-busy')).toBe('false');
    expect(statusEl.textContent).toBe('Updated now');
    expect(formatTimestamp).toHaveBeenCalled();
    expect(window.__advancedConfig).toEqual({ features, queue });
  });

  test('load handles errors by reporting state and clearing sections', async () => {
    const {
      panel,
      panelEl,
      statusEl,
      featureFlagsList,
      priorityBonusesList,
      priorityWeightsList
    } = createPanel();

    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

    await panel.load();

    expect(renderFeatureFlagsBase).toHaveBeenCalledTimes(1);
    expect(renderFeatureFlagsBase).toHaveBeenCalledWith({}, featureFlagsList);
    expect(renderPriorityBonusesBase).toHaveBeenCalledWith({}, priorityBonusesList);
    expect(renderPriorityWeightsBase).toHaveBeenCalledWith({}, priorityWeightsList);

    expect(panelEl.dataset.state).toBe('error');
    expect(panelEl.getAttribute('aria-busy')).toBe('false');
    expect(statusEl.textContent).toBe('Failed to load advanced config (HTTP 500)');
    expect(showElement).toHaveBeenCalledWith(panelEl);
  });
});
