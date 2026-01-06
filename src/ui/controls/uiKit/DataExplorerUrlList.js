"use strict";

const jsgui = require("jsgui3-html");
const StringControl = jsgui.String_Control;

/**
 * DataExplorerUrlList - Paginated URL listing with drill-down support
 * 
 * Displays URLs with:
 * - Status indicator (color-coded circle)
 * - URL text (truncated, hover for full)
 * - Size, timing metadata
 * - Download count badge for repeat fetches
 * - Click handler for drill-down to history
 * 
 * @example
 * const list = new DataExplorerUrlList({
 *   context,
 *   urls: [...],
 *   selectedId: 123,
 *   onUrlClick: "showHistory(event)",
 *   pagination: { current: 1, total: 23, pageSize: 25 }
 * });
 */
class DataExplorerUrlList extends jsgui.Control {
  /**
   * @param {Object} spec
   * @param {Array} spec.urls - URL records
   * @param {number} [spec.selectedId] - Currently selected URL ID
   * @param {string} [spec.onUrlClick] - Click handler
   * @param {Object} [spec.pagination] - Pagination info
   * @param {boolean} [spec.showAdvanced=false] - Show advanced columns
   */
  constructor(spec = {}) {
    const context = spec.context || new jsgui.Page_Context();
    super({ context, tagName: "div" });

    this.add_class("dex-url-list");

    const urls = spec.urls || [];
    const selectedId = spec.selectedId;
    const onUrlClick = spec.onUrlClick;
    const showAdvanced = spec.showAdvanced || false;

    // Build URL items
    const listContainer = new jsgui.div({ context, class: "dex-url-list__items" });

    if (urls.length === 0) {
      listContainer.add(this._buildEmptyState(context));
    } else {
      urls.forEach(url => {
        listContainer.add(this._buildUrlItem(context, url, selectedId, onUrlClick, showAdvanced));
      });
    }

    this.add(listContainer);

    // Pagination
    if (spec.pagination) {
      this.add(this._buildPagination(context, spec.pagination));
    }
  }

  _buildUrlItem(context, url, selectedId, onUrlClick, showAdvanced) {
    const item = new jsgui.div({ context, class: "dex-url-item" });
    
    if (url.id === selectedId) {
      item.add_class("dex-url-item--selected");
    }
    
    item.dom.attributes["data-url-id"] = url.id;
    
    if (onUrlClick) {
      item.dom.attributes.onclick = onUrlClick;
      item.dom.attributes.style = "cursor: pointer;";
    }

    // Status indicator with SVG circle
    const status = new jsgui.div({ context, class: "dex-url-item__status" });
    const statusClass = this._getStatusClass(url.status);
    status.add_class(statusClass);
    
    // SVG status dot with glow
    const statusSvg = `<svg width="12" height="12" viewBox="0 0 12 12">
      <circle cx="6" cy="6" r="4" fill="currentColor"/>
      <circle cx="6" cy="6" r="5.5" fill="none" stroke="currentColor" stroke-opacity="0.3"/>
    </svg>`;
    status._inner_html = statusSvg;
    item.add(status);

    // Content area
    const content = new jsgui.div({ context, class: "dex-url-item__content" });

    // URL text
    const urlText = new jsgui.div({ context, class: "dex-url-item__url" });
    const truncated = truncateUrl(url.url || url.path || "—", 70);
    urlText.add(new StringControl({ context, text: truncated }));
    urlText.dom.attributes.title = url.url || url.path || "";
    content.add(urlText);

    // Metadata row
    const meta = new jsgui.div({ context, class: "dex-url-item__meta" });
    
    // Status code
    const statusCode = new jsgui.span({ context, class: "dex-url-item__code" });
    statusCode.add(new StringControl({ context, text: String(url.status || "—") }));
    meta.add(statusCode);

    // Size
    if (url.size || url.contentLength) {
      const size = new jsgui.span({ context, class: "dex-url-item__size" });
      size.add(new StringControl({ context, text: `📦 ${formatBytes(url.size || url.contentLength)}` }));
      meta.add(size);
    }

    // Time
    if (url.fetchedAt || url.time) {
      const time = new jsgui.span({ context, class: "dex-url-item__time" });
      time.add(new StringControl({ context, text: formatTime(url.fetchedAt || url.time) }));
      meta.add(time);
    }

    // Advanced: TTFB
    if (showAdvanced && url.ttfb) {
      const ttfb = new jsgui.span({ context, class: "dex-url-item__ttfb" });
      ttfb.add(new StringControl({ context, text: `⏱ ${url.ttfb}ms` }));
      meta.add(ttfb);
    }

    content.add(meta);
    item.add(content);

    // Download count badge (for repeat fetches)
    if (url.downloadCount && url.downloadCount > 1) {
      const badge = new jsgui.div({ context, class: "dex-url-item__count" });
      badge.add(new StringControl({ context, text: `${url.downloadCount}×` }));
      item.add(badge);
    }

    // Arrow indicator
    const arrow = new jsgui.div({ context, class: "dex-url-item__arrow" });
    arrow.add(new StringControl({ context, text: "→" }));
    item.add(arrow);

    return item;
  }

  _buildEmptyState(context) {
    const empty = new jsgui.div({ context, class: "dex-empty" });
    
    const icon = new jsgui.div({ context, class: "dex-empty__icon" });
    icon.add(new StringControl({ context, text: "📭" }));
    empty.add(icon);
    
    const title = new jsgui.div({ context, class: "dex-empty__title" });
    title.add(new StringControl({ context, text: "No URLs Found" }));
    empty.add(title);
    
    const msg = new jsgui.div({ context, class: "dex-empty__message" });
    msg.add(new StringControl({ context, text: "Start a crawl to populate this list." }));
    empty.add(msg);
    
    return empty;
  }

  _buildPagination(context, pagination) {
    const pager = new jsgui.div({ context, class: "dex-pager" });
    
    const { current = 1, total = 1, totalItems = 0 } = pagination;

    // Info
    const info = new jsgui.div({ context, class: "dex-pager__info" });
    info.add(new StringControl({ 
      context, 
      text: `Page ${current} of ${total} · ${formatNumber(totalItems)} URLs` 
    }));
    pager.add(info);

    // Controls
    const controls = new jsgui.div({ context, class: "dex-pager__controls" });
    
    // Previous
    const prevBtn = new jsgui.Control({ context, tagName: "button", class: "dex-btn dex-btn--small" });
    prevBtn.dom.attributes.type = "button";
    if (current <= 1) {
      prevBtn.dom.attributes.disabled = "disabled";
    }
    prevBtn.add(new StringControl({ context, text: "◀" }));
    controls.add(prevBtn);

    // Next
    const nextBtn = new jsgui.Control({ context, tagName: "button", class: "dex-btn dex-btn--small" });
    nextBtn.dom.attributes.type = "button";
    if (current >= total) {
      nextBtn.dom.attributes.disabled = "disabled";
    }
    nextBtn.add(new StringControl({ context, text: "▶" }));
    controls.add(nextBtn);

    pager.add(controls);
    
    return pager;
  }

  _getStatusClass(status) {
    if (!status) return "dex-url-item__status--unknown";
    if (status >= 200 && status < 300) return "dex-url-item__status--success";
    if (status === 304) return "dex-url-item__status--cached";
    if (status >= 300 && status < 400) return "dex-url-item__status--redirect";
    if (status >= 400 && status < 500) return "dex-url-item__status--client-error";
    if (status >= 500) return "dex-url-item__status--server-error";
    return "dex-url-item__status--unknown";
  }
}

/**
 * Truncate a URL for display
 */
function truncateUrl(url, maxLen = 70) {
  if (!url || typeof url !== "string") return "—";
  if (url.length <= maxLen) return url;
  return url.substring(0, maxLen - 1) + "…";
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
 * Format time for display
 */
function formatTime(value) {
  if (!value) return "";
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return String(value);
    return date.toTimeString().substring(0, 8);
  } catch {
    return String(value);
  }
}

/**
 * Format number with thousands separator
 */
function formatNumber(num) {
  if (num == null) return "0";
  return Number(num).toLocaleString("en-US");
}

/**
 * CSS styles for DataExplorerUrlList
 */
const DataExplorerUrlListCSS = `
/* ═══════════════════════════════════════════════════════════════════════════════
   DATA EXPLORER URL LIST
   Paginated URL listing with drill-down
   ═══════════════════════════════════════════════════════════════════════════════ */

.dex-url-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dex-url-list__items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* URL Item */
.dex-url-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(20, 24, 36, 0.6);
  border: 1px solid rgba(51, 65, 85, 0.4);
  border-radius: 8px;
  transition: all 0.15s ease;
}

.dex-url-item:hover {
  background: rgba(30, 34, 46, 0.8);
  border-color: rgba(201, 162, 39, 0.3);
  transform: translateX(2px);
}

.dex-url-item--selected {
  background: rgba(201, 162, 39, 0.1);
  border-color: rgba(201, 162, 39, 0.5);
  box-shadow: 0 0 12px rgba(201, 162, 39, 0.1);
}

/* Status indicator */
.dex-url-item__status {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dex-url-item__status--success { color: #50c878; }
.dex-url-item__status--cached { color: #ffc87c; }
.dex-url-item__status--redirect { color: #6fa8dc; }
.dex-url-item__status--client-error { color: #ff6b6b; }
.dex-url-item__status--server-error { color: #e31837; }
.dex-url-item__status--unknown { color: #64748b; }

/* Content */
.dex-url-item__content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dex-url-item__url {
  font-family: "JetBrains Mono", "Fira Code", monospace;
  font-size: 12px;
  color: #cbd5e1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dex-url-item__meta {
  display: flex;
  gap: 16px;
  font-size: 11px;
  color: #64748b;
}

.dex-url-item__meta > span {
  display: flex;
  align-items: center;
  gap: 4px;
}

.dex-url-item__code {
  font-family: "JetBrains Mono", monospace;
  font-weight: 500;
}

/* Download count badge */
.dex-url-item__count {
  flex-shrink: 0;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  color: #c9a227;
  background: rgba(201, 162, 39, 0.15);
  border-radius: 12px;
  border: 1px solid rgba(201, 162, 39, 0.3);
}

/* Arrow */
.dex-url-item__arrow {
  flex-shrink: 0;
  color: #475569;
  font-size: 14px;
  transition: all 0.15s ease;
}

.dex-url-item:hover .dex-url-item__arrow {
  color: #c9a227;
  transform: translateX(3px);
}

/* Pagination */
.dex-pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-top: 1px solid rgba(51, 65, 85, 0.3);
}

.dex-pager__info {
  font-size: 12px;
  color: #64748b;
}

.dex-pager__controls {
  display: flex;
  gap: 4px;
}

/* Empty state */
.dex-empty {
  text-align: center;
  padding: 40px 20px;
  color: #64748b;
}

.dex-empty__icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}

.dex-empty__title {
  font-family: Georgia, serif;
  font-size: 16px;
  color: #94a3b8;
  margin-bottom: 8px;
}

.dex-empty__message {
  font-size: 13px;
}
`;

module.exports = {
  DataExplorerUrlList,
  DataExplorerUrlListCSS,
  truncateUrl,
  formatBytes,
  formatTime,
  formatNumber
};
