"use strict";

/**
 * ExplorerHomeCardControl - Dashboard card for the Data Explorer
 * 
 * Displays a dashboard metric card with:
 * - Title/label
 * - Primary value
 * - Optional subtitle/description
 * - Optional variant styling
 */

const { MetricCardControl, CARD_VARIANTS } = require("../../../controls/MetricCardControl");

/**
 * Dashboard card control for home/dashboard views
 * 
 * @example
 * const card = new ExplorerHomeCardControl({
 *   context,
 *   title: "Total URLs",
 *   value: 12345,
 *   subtitle: "Across all domains",
 *   variant: "primary"
 * });
 */
class ExplorerHomeCardControl extends MetricCardControl {
  /**
   * @param {Object} spec - Control specification
   * @param {Object} spec.context - jsgui context
   * @param {string} spec.title - Card title/label
   * @param {string|number} [spec.value] - Primary value to display
   * @param {string} [spec.subtitle] - Optional subtitle text
   * @param {string} [spec.variant] - Card variant for styling
   * @param {string} [spec.href] - Optional link URL
   */
  constructor(spec = {}) {
    super({
      ...spec,
      __type_name: "explorer_home_card"
    });

    // Legacy class for existing CSS/layout hooks.
    this.add_class("data-explorer__card");
  }
}

ExplorerHomeCardControl.VARIANTS = CARD_VARIANTS;

module.exports = { ExplorerHomeCardControl, CARD_VARIANTS };
