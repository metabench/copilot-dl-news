/**
 * Telemetry Display Component
 * Client-side wrapper for isomorphic telemetry rendering
 * 
 * Displays real-time telemetry events from crawlers with:
 * - Automatic updates from SSE events
 * - Severity-based filtering and styling
 * - Statistics summary
 * - Auto-scroll to latest events
 * 
 * @module components/TelemetryDisplay
 */

import {
  renderTelemetryList,
  getTelemetryStats,
  filterTelemetryByType,
  parseTelemetryFromConsole
} from '../../../shared/telemetry/telemetryRenderer.js';

/**
 * Create a telemetry display component
 * @param {Object} options - Component options
 * @param {HTMLElement} options.container - Container element
 * @param {number} options.maxEntries - Maximum entries to keep (default: 100)
 * @param {boolean} options.autoScroll - Auto-scroll to latest (default: true)
 * @param {boolean} options.showStats - Show statistics summary (default: true)
 * @param {Array<string>} options.filterTypes - Filter to specific types (optional)
 * @returns {Object} Component API
 */
export function createTelemetryDisplay(options = {}) {
  const {
    container,
    maxEntries = 100,
    autoScroll = true,
    showStats = true,
    filterTypes = null
  } = options;

  if (!container || !(container instanceof HTMLElement)) {
    throw new Error('TelemetryDisplay requires a valid container element');
  }

  // Component state
  const state = {
    entries: [],
    isVisible: true,
    isPaused: false
  };

  // Create structure
  const wrapper = document.createElement('div');
  wrapper.className = 'telemetry-display';
  
  let statsContainer = null;
  if (showStats) {
    statsContainer = document.createElement('div');
    statsContainer.className = 'telemetry-stats';
    wrapper.appendChild(statsContainer);
  }

  const listContainer = document.createElement('div');
  listContainer.className = 'telemetry-list-container';
  wrapper.appendChild(listContainer);

  container.appendChild(wrapper);

  /**
   * Add a telemetry entry
   * @param {Object} entry - Telemetry entry
   */
  function addEntry(entry) {
    if (state.isPaused) return;

    // Apply filtering if specified
    if (filterTypes && !filterTypes.includes(entry.type)) {
      return;
    }

    state.entries.push(entry);

    // Limit entries
    if (state.entries.length > maxEntries) {
      state.entries = state.entries.slice(-maxEntries);
    }

    render();
  }

  /**
   * Add multiple entries
   * @param {Array<Object>} entries - Array of telemetry entries
   */
  function addEntries(entries) {
    if (state.isPaused || !Array.isArray(entries)) return;

    entries.forEach(entry => {
      if (!filterTypes || filterTypes.includes(entry.type)) {
        state.entries.push(entry);
      }
    });

    // Limit entries
    if (state.entries.length > maxEntries) {
      state.entries = state.entries.slice(-maxEntries);
    }

    render();
  }

  /**
   * Parse and add telemetry from console line
   * @param {string} line - Console output line
   */
  function addFromConsole(line) {
    const parsed = parseTelemetryFromConsole(line);
    if (parsed) {
      addEntry(parsed);
    }
  }

  /**
   * Clear all entries
   */
  function clear() {
    state.entries = [];
    render();
  }

  /**
   * Pause/resume updates
   * @param {boolean} paused - Pause state
   */
  function setPaused(paused) {
    state.isPaused = !!paused;
  }

  /**
   * Show/hide component
   * @param {boolean} visible - Visibility state
   */
  function setVisible(visible) {
    state.isVisible = !!visible;
    wrapper.style.display = visible ? '' : 'none';
  }

  /**
   * Get current entries
   * @returns {Array<Object>} Current entries
   */
  function getEntries() {
    return [...state.entries];
  }

  /**
   * Get filtered entries
   * @param {string|Array<string>} types - Types to filter
   * @returns {Array<Object>} Filtered entries
   */
  function getFilteredEntries(types) {
    return filterTelemetryByType(state.entries, types);
  }

  /**
   * Get statistics
   * @returns {Object} Statistics
   */
  function getStats() {
    return getTelemetryStats(state.entries);
  }

  /**
   * Render telemetry list
   */
  function render() {
    if (!state.isVisible) return;

    // Render stats
    if (showStats && statsContainer) {
      const stats = getStats();
      statsContainer.innerHTML = `
        <div class="telemetry-stats__item">
          <span class="telemetry-stats__item-label">Total:</span>
          <span class="telemetry-stats__item-value">${stats.total}</span>
        </div>
        <div class="telemetry-stats__item">
          <span class="telemetry-stats__item-label">Stages:</span>
          <span class="telemetry-stats__item-value">${stats.stages}</span>
        </div>
        <div class="telemetry-stats__item">
          <span class="telemetry-stats__item-label">Warnings:</span>
          <span class="telemetry-stats__item-value">${stats.warnings}</span>
        </div>
        <div class="telemetry-stats__item">
          <span class="telemetry-stats__item-label">Errors:</span>
          <span class="telemetry-stats__item-value">${stats.errors}</span>
        </div>
      `;
    }

    // Render list
    const html = renderTelemetryList(state.entries, {
      showTimestamp: true,
      showIcon: true,
      showStage: true,
      compact: false
    });
    listContainer.innerHTML = html;

    // Auto-scroll to bottom
    if (autoScroll) {
      const listEl = listContainer.querySelector('.telemetry-list');
      if (listEl) {
        listEl.scrollTop = listEl.scrollHeight;
      }
    }
  }

  /**
   * Destroy component
   */
  function destroy() {
    wrapper.remove();
    state.entries = [];
  }

  // Initial render
  render();

  // Return API
  return {
    addEntry,
    addEntries,
    addFromConsole,
    clear,
    setPaused,
    setVisible,
    getEntries,
    getFilteredEntries,
    getStats,
    render,
    destroy
  };
}
