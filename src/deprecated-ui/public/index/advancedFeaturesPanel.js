/**
 * @file advancedFeaturesPanel.js
 * @description Manages the advanced features configuration panel including feature flags,
 * priority bonuses, and priority weights. Handles loading, rendering, and state management.
 */

import { each, is_defined, tof } from 'lang-tools';
import {
  renderFeatureFlags as renderFeatureFlagsBase,
  renderPriorityBonuses as renderPriorityBonusesBase,
  renderPriorityWeights as renderPriorityWeightsBase
} from './renderingHelpers.js';
import { showElement } from './domUtils.js';
import { formatTimestamp } from './formatters.js';

/**
 * Creates an advanced features panel manager
 * @param {Object} deps - Dependencies
 * @param {HTMLElement} deps.panelEl - The main panel element
 * @param {HTMLElement} deps.statusEl - Status text element
 * @param {HTMLElement} deps.featureFlagsList - Feature flags list container
 * @param {HTMLElement} deps.priorityBonusesList - Priority bonuses list container
 * @param {HTMLElement} deps.priorityWeightsList - Priority weights list container
 * @returns {Object} Advanced features panel API
 */
export function createAdvancedFeaturesPanel(deps) {
  const {
    panelEl,
    statusEl,
    featureFlagsList,
    priorityBonusesList,
    priorityWeightsList
  } = deps;

  const toPlainObject = (value) => (tof(value) === 'object' ? value : {});

  const sectionRenderers = [
    {
      render: renderFeatureFlagsBase,
      select: (config) => config.features,
      target: featureFlagsList
    },
    {
      render: renderPriorityBonusesBase,
      select: (config) => config.queue,
      target: priorityBonusesList
    },
    {
      render: renderPriorityWeightsBase,
      select: (config) => config.queue,
      target: priorityWeightsList
    }
  ];

  const renderSections = (config) => {
    const resolvedConfig = toPlainObject(config);
    each(sectionRenderers, ({ render, select, target }) => {
      if (!is_defined(target)) return;
      render(toPlainObject(select(resolvedConfig)), target);
    });
  };

  /**
   * Sets the visual state of the advanced features panel
   * @param {Object} options - State options
   * @param {string} [options.state] - State name (loading, ready, error)
   * @param {string} [options.message] - Status message
   * @param {boolean} [options.busy] - Whether panel is busy
   */
  function setState({ state, message, busy } = {}) {
    if (!is_defined(panelEl)) return;
    if (tof(state) === 'string') {
      panelEl.dataset.state = state;
    }
    if (tof(busy) === 'boolean') {
      panelEl.setAttribute('aria-busy', busy ? 'true' : 'false');
    }
    if (is_defined(statusEl) && tof(message) === 'string') {
      statusEl.textContent = message;
    }
  }

  /**
   * Renders feature flags in the list container
   * @param {Object} features - Feature flags configuration
   */
  function renderFeatureFlags(features) {
    renderFeatureFlagsBase(toPlainObject(features), featureFlagsList);
  }

  /**
   * Renders priority bonuses in the list container
   * @param {Object} queueConfig - Queue configuration with bonus settings
   */
  function renderPriorityBonuses(queueConfig) {
    renderPriorityBonusesBase(toPlainObject(queueConfig), priorityBonusesList);
  }

  /**
   * Renders priority weights in the list container
   * @param {Object} queueConfig - Queue configuration with weight settings
   */
  function renderPriorityWeights(queueConfig) {
    renderPriorityWeightsBase(toPlainObject(queueConfig), priorityWeightsList);
  }

  /**
   * Loads advanced capabilities configuration from the API
   * @param {Object} options - Load options
   * @param {boolean} [options.quiet=false] - If true, suppress UI updates during load
   * @returns {Promise<void>}
   */
  async function load({ quiet = false } = {}) {
    if (!is_defined(panelEl) || !is_defined(statusEl)) return;

    try {
      setState({ busy: true });
      
      if (!quiet) {
        showElement(panelEl);
        setState({ 
          state: 'loading', 
          message: 'Loading configuration…', 
          busy: true 
        });
      }

      const res = await fetch('/api/config');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const payload = await res.json();
      const config = toPlainObject(payload?.config);

      // Render all configuration sections
      renderSections(config);

      // Store config globally for debugging
      try {
        window.__advancedConfig = config;
      } catch (_) {
        // Ignore errors setting window property
      }

      showElement(panelEl);
      setState({ 
        state: 'ready', 
        message: `Updated ${formatTimestamp()}`, 
        busy: false 
      });

    } catch (error) {
      showElement(panelEl);
      
      const message = is_defined(error?.message)
        ? error.message
        : String(error || 'unknown error');
      
      setState({ 
        state: 'error', 
        message: `Failed to load advanced config (${message})`, 
        busy: false 
      });

      if (!quiet) {
        // Clear all lists on error
        renderSections({});
      }
    }
  }

  // Public API
  return {
    setState,
    load,
    renderFeatureFlags,
    renderPriorityBonuses,
    renderPriorityWeights
  };
}
