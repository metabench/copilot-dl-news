"use strict";

/**
 * DiagramDiagnosticsControl - Stats panel for the Diagram Atlas
 * 
 * Displays diagnostic statistics in a grid of labeled values:
 * - Generated timestamp
 * - Code files count
 * - Total bytes
 * - Largest file
 * - DB tables
 * - Features count
 */

const jsgui = require("jsgui3-html");

const StringControl = jsgui.String_Control;

/**
 * Format a byte count for display
 */
function formatBytes(bytes, fallback = "—") {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return fallback;
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / (1024 ** exponent);
  const fixed = value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2);
  return `${fixed} ${units[exponent]}`;
}

/**
 * Format a number with locale separators
 */
function formatNumber(value, fallback = "—") {
  if (!Number.isFinite(value)) return fallback;
  return value.toLocaleString("en-US");
}

/**
 * Summarize a file path to show only the last N segments
 */
function summarizePath(value, segments = 2) {
  if (!value || typeof value !== "string") return value || "";
  const normalized = value.split("\\").join("/");
  const parts = normalized.split("/");
  if (parts.length <= segments) return normalized;
  return `.../${parts.slice(-segments).join("/")}`;
}

/**
 * Diagnostics stats panel control
 * 
 * @example
 * const diagnostics = new DiagramDiagnosticsControl({
 *   context,
 *   stats: [
 *     { label: "Generated", value: "Nov 26, 2025", metric: "generatedAt", icon: "🕒" },
 *     { label: "Code Files", value: "150", metric: "codeFiles", icon: "📁", detail: "2.05 MB" }
 *   ]
 * });
 */
class DiagramDiagnosticsControl extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   * @param {Object} spec.context - jsgui context
   * @param {Array} [spec.stats] - Array of stat objects { label, value, metric, icon, detail, tooltip }
   * @param {Object} [spec.diagramData] - Raw diagram data to auto-generate stats from
   * @param {string} [spec.generatedAt] - Formatted timestamp (when using diagramData)
   */
  constructor(spec = {}) {
    super({
      ...spec,
      tagName: "div",
      __type_name: "diagram_diagnostics"
    });
    
    this.add_class("diagram-diagnostics");
    this.dom.attributes["data-role"] = "diagram-diagnostics";
    
    // Accept either pre-built stats or raw data
    this.stats = spec.stats || null;
    this.diagramData = spec.diagramData || null;
    this.generatedAt = spec.generatedAt || "—";
    
    if (!spec.el) {
      this.compose();
    }
  }

  /**
   * Compose the diagnostics panel
   */
  compose() {
    const stats = this.stats || this._buildStatsFromData();
    
    for (const stat of stats) {
      const item = this._createStatItem(stat);
      this.add(item);
    }
  }

  /**
   * Build stats array from raw diagram data
   * @private
   */
  _buildStatsFromData() {
    if (!this.diagramData) {
      return [{ label: "Status", value: "No data", icon: "⏳" }];
    }
    
    const codeSummary = this.diagramData.code?.summary || {};
    const topFiles = this.diagramData.code?.topFiles || [];
    const largestFile = topFiles.length > 0 ? topFiles[0] : null;
    
    return [
      {
        label: "Generated",
        value: this.generatedAt,
        metric: "generatedAt",
        icon: "🕒"
      },
      {
        label: "Code Files",
        value: formatNumber(codeSummary.fileCount),
        metric: "codeFiles",
        icon: "📁",
        detail: formatBytes(codeSummary.totalBytes)
      },
      {
        label: "Code Bytes",
        value: formatBytes(codeSummary.totalBytes),
        metric: "codeBytes",
        icon: "💾"
      },
      {
        label: "Largest File",
        value: formatBytes(largestFile?.bytes),
        metric: "largestFile",
        icon: "🗂️",
        tooltip: largestFile?.file,
        detail: largestFile?.file ? summarizePath(largestFile.file, 2) : null
      },
      {
        label: "DB Tables",
        value: formatNumber(this.diagramData.db?.totalTables),
        metric: "dbTables",
        icon: "🗄️"
      },
      {
        label: "Features",
        value: formatNumber(this.diagramData.features?.featureCount),
        metric: "features",
        icon: "✨"
      }
    ];
  }

  /**
   * Create a single stat item
   * @private
   */
  _createStatItem(stat) {
    const item = new jsgui.Control({ context: this.context, tagName: "div" });
    item.add_class("diagram-diagnostics__item");
    
    if (stat.metric) {
      item.dom.attributes["data-metric"] = stat.metric;
    }
    if (stat.tooltip) {
      item.dom.attributes.title = stat.tooltip;
    }
    if (stat.icon) {
      item.dom.attributes["data-icon"] = stat.icon;
    }
    
    const labelEl = new jsgui.Control({ context: this.context, tagName: "div" });
    labelEl.add_class("diagram-diagnostics__label");
    labelEl.add(new StringControl({ context: this.context, text: stat.label }));
    item.add(labelEl);
    
    const valueEl = new jsgui.Control({ context: this.context, tagName: "div" });
    valueEl.add_class("diagram-diagnostics__value");
    valueEl.add(new StringControl({ context: this.context, text: stat.value || "—" }));
    item.add(valueEl);
    
    if (stat.detail) {
      const detailEl = new jsgui.Control({ context: this.context, tagName: "div" });
      detailEl.add_class("diagram-diagnostics__detail");
      detailEl.add(new StringControl({ context: this.context, text: stat.detail }));
      item.add(detailEl);
    }
    
    return item;
  }
}

module.exports = { DiagramDiagnosticsControl, formatBytes, formatNumber, summarizePath };
