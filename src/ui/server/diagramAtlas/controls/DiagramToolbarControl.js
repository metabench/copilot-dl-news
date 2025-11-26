"use strict";

/**
 * DiagramToolbarControl - Toolbar for the Diagram Atlas
 * 
 * A dedicated control that renders the toolbar with:
 * - Snapshot status indicator
 * - Refresh button with hint text
 * - Progress indicator
 * 
 * This follows the principle of creating precisely-named controls
 * that do specific things, rather than inline compositions.
 */

const jsgui = require("jsgui3-html");
const { DiagramProgressControl } = require("../../../controls/DiagramAtlasControls");

const StringControl = jsgui.String_Control;

/**
 * Toolbar control for the Diagram Atlas header
 * 
 * @example
 * const toolbar = new DiagramToolbarControl({
 *   context,
 *   snapshotTime: "Nov 26, 2025, 10:30 AM",
 *   status: "complete",
 *   progressLabel: "Diagram Atlas ready",
 *   progressDetail: "Loaded from cached snapshot"
 * });
 */
class DiagramToolbarControl extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   * @param {Object} spec.context - jsgui context
   * @param {string} [spec.snapshotTime] - Formatted timestamp of the snapshot
   * @param {string} [spec.status="loading"] - Status: "loading" | "complete" | "error"
   * @param {string} [spec.progressLabel] - Label for the progress indicator
   * @param {string} [spec.progressDetail] - Detail text for progress indicator
   * @param {string} [spec.refreshHint] - Hint text for the refresh button
   */
  constructor(spec = {}) {
    super({
      ...spec,
      tagName: "div",
      __type_name: "diagram_toolbar"
    });
    
    this.add_class("diagram-toolbar");
    
    // Toolbar-specific state
    this.snapshotTime = spec.snapshotTime || "—";
    this.status = spec.status || "loading";
    this.progressLabel = spec.progressLabel || (this.status === "complete" 
      ? "Diagram Atlas ready" 
      : "Preparing Diagram Atlas");
    this.progressDetail = spec.progressDetail || (this.status === "complete"
      ? "Loaded from cached snapshot"
      : "Collecting sources and metrics...");
    this.refreshHint = spec.refreshHint || "Refresh triggers the CLI and bypasses cache.";
    
    if (!spec.el) {
      this.compose();
    }
  }

  /**
   * Compose the toolbar structure
   */
  compose() {
    // Status card showing snapshot time
    const statusCard = this._buildStatusCard();
    this.add(statusCard);
    
    // Actions section with refresh button
    const actions = this._buildActions();
    this.add(actions);
    
    // Progress indicator card
    const progressCard = this._buildProgressCard();
    this.add(progressCard);
  }

  /**
   * Build the snapshot status card
   * @private
   */
  _buildStatusCard() {
    const statusCard = new jsgui.Control({ context: this.context, tagName: "div" });
    statusCard.add_class("diagram-toolbar__status");
    
    const statusTitle = new jsgui.Control({ context: this.context, tagName: "span" });
    statusTitle.add_class("diagram-toolbar__status-title");
    statusTitle.add(new StringControl({ context: this.context, text: "Snapshot" }));
    statusCard.add(statusTitle);
    
    const statusValue = new jsgui.Control({ context: this.context, tagName: "span" });
    statusValue.add_class("diagram-toolbar__status-value");
    statusValue.dom.attributes["data-toolbar-metric"] = "generatedAt";
    statusValue.add(new StringControl({ context: this.context, text: this.snapshotTime }));
    statusCard.add(statusValue);
    
    return statusCard;
  }

  /**
   * Build the actions section with refresh button
   * @private
   */
  _buildActions() {
    const actions = new jsgui.Control({ context: this.context, tagName: "div" });
    actions.add_class("diagram-toolbar__actions");
    
    // Refresh button
    const refreshBtn = new jsgui.Control({ context: this.context, tagName: "button" });
    refreshBtn.add_class("diagram-button");
    refreshBtn.dom.attributes.type = "button";
    refreshBtn.dom.attributes["data-role"] = "diagram-refresh";
    refreshBtn.add(new StringControl({ context: this.context, text: "Refresh data" }));
    actions.add(refreshBtn);
    
    // Hint text
    const hint = new jsgui.Control({ context: this.context, tagName: "span" });
    hint.add_class("diagram-toolbar__hint");
    hint.add(new StringControl({ context: this.context, text: this.refreshHint }));
    actions.add(hint);
    
    return actions;
  }

  /**
   * Build the progress indicator card
   * @private
   */
  _buildProgressCard() {
    const progressCard = new jsgui.Control({ context: this.context, tagName: "div" });
    progressCard.add_class("diagram-toolbar__progress");
    
    const progress = new DiagramProgressControl({
      context: this.context,
      status: this.status,
      label: this.progressLabel,
      detail: this.progressDetail
    });
    
    progressCard.add(progress);
    
    return progressCard;
  }
}

module.exports = { DiagramToolbarControl };
