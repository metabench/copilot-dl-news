"use strict";

const jsgui = require("jsgui3-html");
const StringControl = jsgui.String_Control;

/**
 * DataExplorerHistory - Download history for a specific URL
 * 
 * Shows all downloads of a URL with:
 * - Summary stats (count, avg size, avg time)
 * - Individual download entries
 * - Click handler for drill-down to metadata
 * 
 * @example
 * const history = new DataExplorerHistory({
 *   context,
 *   url: "https://example.com/page",
 *   urlId: 123,
 *   downloads: [...],
 *   selectedDownloadId: 456,
 *   onDownloadClick: "showMetadata(event)",
 *   onBack: "goBack()"
 * });
 */
class DataExplorerHistory extends jsgui.Control {
  /**
   * @param {Object} spec
   * @param {string} spec.url - The URL being viewed
   * @param {number} spec.urlId - URL record ID
   * @param {Array} spec.downloads - Download records
   * @param {number} [spec.selectedDownloadId] - Currently selected download
   * @param {string} [spec.onDownloadClick] - Click handler
   * @param {string} [spec.onBack] - Back button handler
   */
  constructor(spec = {}) {
    const context = spec.context || new jsgui.Page_Context();
    super({ context, tagName: "div" });

    this.add_class("dex-history");

    const downloads = spec.downloads || [];
    const selectedId = spec.selectedDownloadId;

    // Back button
    if (spec.onBack) {
      const backBtn = new jsgui.Control({ 
        context, 
        tagName: "button", 
        class: "dex-btn dex-btn--ghost dex-history__back" 
      });
      backBtn.dom.attributes.type = "button";
      backBtn.dom.attributes.onclick = spec.onBack;
      backBtn.add(new StringControl({ context, text: "← Back to URL List" }));
      this.add(backBtn);
    }

    // URL display card
    this.add(this._buildUrlCard(context, spec.url, spec.urlId));

    // Stats summary
    this.add(this._buildStats(context, downloads));

    // Section header
    const sectionHeader = new jsgui.div({ context, class: "dex-history__section-header" });
    sectionHeader.add(new StringControl({ context, text: "All Downloads" }));
    this.add(sectionHeader);

    // Download list
    const listContainer = new jsgui.div({ context, class: "dex-history__list" });
    
    downloads.forEach((dl, idx) => {
      listContainer.add(this._buildDownloadItem(
        context, 
        dl, 
        idx === 0, // first is latest
        selectedId,
        spec.onDownloadClick
      ));
    });

    this.add(listContainer);

    // Action buttons
    this.add(this._buildActions(context, spec.url));
  }

  _buildUrlCard(context, url, urlId) {
    const card = new jsgui.div({ context, class: "dex-history__url-card" });
    
    const label = new jsgui.div({ context, class: "dex-history__label" });
    label.add(new StringControl({ context, text: "URL" }));
    card.add(label);
    
    const urlText = new jsgui.div({ context, class: "dex-history__url-text" });
    urlText.add(new StringControl({ context, text: url || "—" }));
    card.add(urlText);
    
    if (urlId) {
      const idBadge = new jsgui.div({ context, class: "dex-history__id-badge" });
      idBadge.add(new StringControl({ context, text: `ID: ${urlId}` }));
      card.add(idBadge);
    }
    
    return card;
  }

  _buildStats(context, downloads) {
    const stats = new jsgui.div({ context, class: "dex-stats" });
    
    // Calculate stats
    const count = downloads.length;
    const avgSize = count > 0 
      ? Math.round(downloads.reduce((sum, d) => sum + (d.size || d.contentLength || 0), 0) / count) 
      : 0;
    const avgTime = count > 0 
      ? Math.round(downloads.reduce((sum, d) => sum + (d.totalTime || d.duration || 0), 0) / count)
      : 0;

    // Stat cards
    const statData = [
      { value: count, label: "Downloads", variant: "success" },
      { value: formatBytes(avgSize), label: "Avg Size", variant: "default" },
      { value: `${avgTime}ms`, label: "Avg Time", variant: "default" }
    ];

    statData.forEach(stat => {
      const statCard = new jsgui.div({ context, class: "dex-stats__card" });
      if (stat.variant !== "default") {
        statCard.add_class(`dex-stats__card--${stat.variant}`);
      }
      
      const value = new jsgui.div({ context, class: "dex-stats__value" });
      value.add(new StringControl({ context, text: String(stat.value) }));
      statCard.add(value);
      
      const label = new jsgui.div({ context, class: "dex-stats__label" });
      label.add(new StringControl({ context, text: stat.label }));
      statCard.add(label);
      
      stats.add(statCard);
    });

    return stats;
  }

  _buildDownloadItem(context, dl, isLatest, selectedId, onClick) {
    const item = new jsgui.div({ context, class: "dex-history__item" });
    
    if (dl.id === selectedId) {
      item.add_class("dex-history__item--selected");
    }
    
    item.dom.attributes["data-download-id"] = dl.id;
    
    if (onClick) {
      item.dom.attributes.onclick = onClick;
      item.dom.attributes.style = "cursor: pointer;";
    }

    // Header row (date + latest badge)
    const header = new jsgui.div({ context, class: "dex-history__item-header" });
    
    const date = new jsgui.div({ context, class: "dex-history__item-date" });
    date.add(new StringControl({ context, text: formatDateTime(dl.fetchedAt || dl.createdAt) }));
    header.add(date);
    
    if (isLatest) {
      const badge = new jsgui.span({ context, class: "dex-history__latest-badge" });
      badge.add(new StringControl({ context, text: "Latest" }));
      header.add(badge);
    }
    
    item.add(header);

    // Metrics row
    const metrics = new jsgui.div({ context, class: "dex-history__item-metrics" });
    
    // Status dot
    const statusDot = new jsgui.span({ context, class: "dex-history__item-status" });
    const statusClass = (dl.status >= 200 && dl.status < 300) ? "success" : "error";
    statusDot.add_class(`dex-history__item-status--${statusClass}`);
    const dotSvg = `<svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="currentColor"/></svg>`;
    statusDot._inner_html = dotSvg;
    metrics.add(statusDot);
    
    const statusCode = new jsgui.span({ context });
    statusCode.add(new StringControl({ context, text: String(dl.status || "—") }));
    metrics.add(statusCode);
    
    const size = new jsgui.span({ context });
    size.add(new StringControl({ context, text: `📦 ${formatBytes(dl.size || dl.contentLength)}` }));
    metrics.add(size);
    
    if (dl.ttfb) {
      const ttfb = new jsgui.span({ context });
      ttfb.add(new StringControl({ context, text: `⏱ ${dl.ttfb}ms` }));
      metrics.add(ttfb);
    }
    
    if (dl.totalTime || dl.duration) {
      const total = new jsgui.span({ context });
      total.add(new StringControl({ context, text: `⏳ ${dl.totalTime || dl.duration}ms` }));
      metrics.add(total);
    }
    
    item.add(metrics);

    // Arrow
    const arrow = new jsgui.div({ context, class: "dex-history__item-arrow" });
    arrow.add(new StringControl({ context, text: "→" }));
    item.add(arrow);

    return item;
  }

  _buildActions(context, url) {
    const actions = new jsgui.div({ context, class: "dex-history__actions" });
    
    const buttons = [
      { label: "🔄 Re-fetch", id: "refetch" },
      { label: "📋 Copy URL", id: "copy" },
      { label: "🌐 Open", id: "open" }
    ];
    
    buttons.forEach(btn => {
      const button = new jsgui.Control({ 
        context, 
        tagName: "button", 
        class: "dex-btn" 
      });
      button.dom.attributes.type = "button";
      button.dom.attributes.id = btn.id;
      button.add(new StringControl({ context, text: btn.label }));
      actions.add(button);
    });
    
    return actions;
  }
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes == null || bytes === 0) return "0B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + sizes[i];
}

/**
 * Format date/time for display
 */
function formatDateTime(value) {
  if (!value) return "—";
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return String(value);
    return date.toISOString().replace("T", " ").substring(0, 19);
  } catch {
    return String(value);
  }
}

/**
 * CSS styles for DataExplorerHistory
 */
const DataExplorerHistoryCSS = `
/* ═══════════════════════════════════════════════════════════════════════════════
   DATA EXPLORER HISTORY
   Download history for a URL
   ═══════════════════════════════════════════════════════════════════════════════ */

.dex-history {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dex-history__back {
  align-self: flex-start;
  margin-bottom: 4px;
}

/* URL Card */
.dex-history__url-card {
  padding: 16px;
  background: rgba(10, 13, 20, 0.6);
  border: 1px solid rgba(51, 65, 85, 0.4);
  border-radius: 8px;
  position: relative;
}

.dex-history__label {
  font-size: 10px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 8px;
}

.dex-history__url-text {
  font-family: "JetBrains Mono", monospace;
  font-size: 12px;
  color: #c9a227;
  word-break: break-all;
  line-height: 1.5;
}

.dex-history__id-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  font-size: 10px;
  color: #64748b;
  padding: 2px 8px;
  background: rgba(100, 116, 139, 0.1);
  border-radius: 4px;
}

/* Stats */
.dex-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.dex-stats__card {
  text-align: center;
  padding: 16px;
  background: rgba(20, 24, 36, 0.6);
  border: 1px solid rgba(51, 65, 85, 0.4);
  border-radius: 8px;
  position: relative;
  overflow: hidden;
}

.dex-stats__card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: #c9a227;
  opacity: 0.5;
}

.dex-stats__card--success::before {
  background: #50c878;
}

.dex-stats__card--success .dex-stats__value {
  color: #50c878;
}

.dex-stats__value {
  font-family: Georgia, serif;
  font-size: 24px;
  font-weight: 700;
  color: #c9a227;
  margin-bottom: 4px;
}

.dex-stats__label {
  font-size: 11px;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Section header */
.dex-history__section-header {
  font-size: 10px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 1px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(51, 65, 85, 0.3);
}

/* Download list */
.dex-history__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Download item */
.dex-history__item {
  padding: 16px;
  background: rgba(20, 24, 36, 0.6);
  border: 1px solid rgba(51, 65, 85, 0.4);
  border-radius: 8px;
  transition: all 0.15s ease;
  position: relative;
}

.dex-history__item:hover {
  background: rgba(30, 34, 46, 0.8);
  border-color: rgba(201, 162, 39, 0.3);
}

.dex-history__item--selected {
  background: rgba(201, 162, 39, 0.1);
  border-color: rgba(201, 162, 39, 0.5);
}

.dex-history__item-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.dex-history__item-date {
  font-size: 13px;
  color: #cbd5e1;
}

.dex-history__latest-badge {
  padding: 2px 10px;
  font-size: 10px;
  font-weight: 600;
  color: #50c878;
  background: rgba(80, 200, 120, 0.15);
  border-radius: 10px;
}

.dex-history__item-metrics {
  display: flex;
  gap: 16px;
  font-size: 11px;
  color: #64748b;
}

.dex-history__item-metrics > span {
  display: flex;
  align-items: center;
  gap: 4px;
}

.dex-history__item-status {
  display: flex;
  align-items: center;
}

.dex-history__item-status--success { color: #50c878; }
.dex-history__item-status--error { color: #ff6b6b; }

.dex-history__item-arrow {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: #475569;
  font-size: 14px;
  transition: all 0.15s ease;
}

.dex-history__item:hover .dex-history__item-arrow {
  color: #c9a227;
  transform: translateY(-50%) translateX(3px);
}

/* Actions */
.dex-history__actions {
  display: flex;
  gap: 8px;
  padding-top: 8px;
}
`;

module.exports = {
  DataExplorerHistory,
  DataExplorerHistoryCSS,
  formatBytes,
  formatDateTime
};
