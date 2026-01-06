'use strict';

/**
 * Dashboard Controls - Reusable jsgui3 components for progress dashboards
 * 
 * Extracted from labs/jsgui3-idiomatic-progress with anti-jitter patterns:
 * - CSS containment for isolated reflows
 * - RAF batching for coalesced updates  
 * - Fixed dimensions for layout stability
 * - Tabular numerics for stable number widths
 * 
 * @module src/ui/controls/dashboard
 * 
 * @example Server-side rendering
 * const jsgui = require('jsgui3-html');
 * const { createDashboardControls } = require('./controls/dashboard');
 * const { ProgressBar, ProgressCard, StatsGrid, StatusBadge } = createDashboardControls(jsgui);
 * 
 * const card = new ProgressCard({
 *   context,
 *   title: 'Analysis Progress',
 *   current: 42,
 *   total: 100
 * });
 * 
 * @example Client-side activation
 * const dashboard = require('./controls/dashboard/client');
 * dashboard.activateAll(document.body);
 */

const { createProgressBar } = require('./ProgressBar');
const { createProgressCard } = require('./ProgressCard');
const { createStatsGrid } = require('./StatsGrid');
const { createStatusBadge } = require('./StatusBadge');
const { SSEHelper } = require('./SSEHelper');

// Collect all CSS with anti-jitter patterns
const STYLES = require('./styles');

/**
 * Factory function to create dashboard controls bound to a jsgui instance.
 * This pattern enables server (jsgui3-html) and client (jsgui3-client) compatibility.
 * 
 * @param {Object} jsgui - jsgui3-html or jsgui3-client instance
 * @returns {Object} Control classes
 */
function createDashboardControls(jsgui) {
  const ProgressBar = createProgressBar(jsgui);
  const StatusBadge = createStatusBadge(jsgui);
  const StatsGrid = createStatsGrid(jsgui);
  const ProgressCard = createProgressCard(jsgui, { ProgressBar, StatusBadge, StatsGrid });

  return {
    ProgressBar,
    ProgressCard,
    StatsGrid,
    StatusBadge,
    SSEHelper,
    STYLES
  };
}

module.exports = {
  createDashboardControls,
  SSEHelper,
  STYLES
};
