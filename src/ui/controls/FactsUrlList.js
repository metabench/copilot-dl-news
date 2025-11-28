"use strict";

const jsgui = require("jsgui3-html");

const StringControl = jsgui.String_Control;

/**
 * FactsUrlListControl - A paginated URL listing for the Facts server
 * 
 * Renders a luxury-obsidian themed table of URLs with:
 * - Row index
 * - URL (truncated with full URL in title)
 * - Host
 * - Timestamps
 * 
 * Designed for the Industrial Luxury Obsidian theme.
 */
class FactsUrlListControl extends jsgui.Control {
  /**
   * @param {Object} spec
   * @param {Array<Object>} spec.urls - Array of URL records
   * @param {Object} spec.pagination - Pagination info
   * @param {number} spec.pagination.currentPage
   * @param {number} spec.pagination.totalPages
   * @param {number} spec.pagination.totalRows
   * @param {number} spec.pagination.pageSize
   * @param {number} spec.pagination.startRow
   * @param {number} spec.pagination.endRow
   */
  constructor(spec = {}) {
    const context = spec.context || new jsgui.Page_Context();
    super({ context, tagName: "div" });

    this.add_class("lux-url-list");

    const urls = Array.isArray(spec.urls) ? spec.urls : [];
    const pagination = spec.pagination || {};
    const basePath = spec.basePath || "/";

    // Build table
    this._buildTable(urls, pagination);

    // Build pagination controls
    this._buildPagination(pagination, basePath);
  }

  _buildTable(urls, pagination) {
    const { context } = this;
    const startIndex = pagination.startRow || 1;

    const panel = new jsgui.div({ context, class: "lux-panel lux-panel--gold" });
    
    // Panel header
    const header = new jsgui.div({ context, class: "lux-panel__header" });
    const title = new jsgui.Control({ context, tagName: "h2", class: "lux-panel__title" });
    title.add(new StringControl({ context, text: "URL Index" }));
    header.add(title);
    
    const meta = new jsgui.span({ context, class: "lux-panel__meta" });
    const totalRows = pagination.totalRows || urls.length;
    meta.add(new StringControl({ context, text: `${formatCount(totalRows)} URLs in database` }));
    header.add(meta);
    
    panel.add(header);

    // Panel body with table
    const body = new jsgui.div({ context, class: "lux-panel__body" });
    body.dom.attributes.style = "padding: 0; overflow-x: auto;";

    if (urls.length === 0) {
      const empty = new jsgui.div({ context, class: "lux-empty" });
      const icon = new jsgui.div({ context, class: "lux-empty__icon" });
      icon.add(new StringControl({ context, text: "📭" }));
      empty.add(icon);
      const emptyTitle = new jsgui.div({ context, class: "lux-empty__title" });
      emptyTitle.add(new StringControl({ context, text: "No URLs Found" }));
      empty.add(emptyTitle);
      const msg = new jsgui.div({ context, class: "lux-empty__message" });
      msg.add(new StringControl({ context, text: "The database appears to be empty or the query returned no results." }));
      empty.add(msg);
      body.add(empty);
    } else {
      const table = new jsgui.Control({ context, tagName: "table", class: "lux-table" });
      
      // Table head
      const thead = new jsgui.Control({ context, tagName: "thead" });
      const headerRow = new jsgui.Control({ context, tagName: "tr" });
      
      const columns = [
        { key: "index", label: "#", align: "right", width: "60px" },
        { key: "url", label: "URL" },
        { key: "host", label: "Host", width: "180px" },
        { key: "classification", label: "Classification", width: "120px" },
        { key: "lastSeenAt", label: "Last Seen", width: "160px" }
      ];
      
      columns.forEach(col => {
        const th = new jsgui.Control({ context, tagName: "th" });
        if (col.width) th.dom.attributes.style = `width: ${col.width};`;
        if (col.align) th.dom.attributes.style = (th.dom.attributes.style || "") + `text-align: ${col.align};`;
        th.add(new StringControl({ context, text: col.label }));
        headerRow.add(th);
      });
      
      thead.add(headerRow);
      table.add(thead);

      // Table body
      const tbody = new jsgui.Control({ context, tagName: "tbody" });
      
      urls.forEach((urlRecord, idx) => {
        const row = new jsgui.Control({ context, tagName: "tr" });
        
        // Index cell
        const indexCell = new jsgui.Control({ context, tagName: "td", class: "is-index" });
        indexCell.add(new StringControl({ context, text: String(startIndex + idx) }));
        row.add(indexCell);

        // URL cell
        const urlCell = new jsgui.Control({ context, tagName: "td", class: "is-url" });
        const urlText = urlRecord.url || "—";
        const truncated = truncateUrl(urlText, 80);
        
        const urlLink = new jsgui.a({ context });
        urlLink.dom.attributes.href = `/urls/${urlRecord.id}`;
        urlLink.dom.attributes.title = urlText;
        urlLink.add(new StringControl({ context, text: truncated }));
        urlCell.add(urlLink);
        row.add(urlCell);

        // Host cell
        const hostCell = new jsgui.Control({ context, tagName: "td" });
        const host = urlRecord.host || extractHost(urlText) || "—";
        hostCell.add(new StringControl({ context, text: host }));
        row.add(hostCell);

        // Classification cell
        const classCell = new jsgui.Control({ context, tagName: "td" });
        const classification = urlRecord.classification || "—";
        classCell.add(new StringControl({ context, text: classification }));
        row.add(classCell);

        // Last Seen At cell (from normalized query)
        const seenCell = new jsgui.Control({ context, tagName: "td" });
        const lastSeen = urlRecord.lastSeenAt || urlRecord.createdAt || "—";
        seenCell.add(new StringControl({ context, text: formatDateTime(lastSeen) }));
        row.add(seenCell);

        tbody.add(row);
      });
      
      table.add(tbody);
      body.add(table);
    }

    panel.add(body);
    this.add(panel);
  }

  _buildPagination(pagination, basePath) {
    const { context } = this;
    const { currentPage = 1, totalPages = 1, startRow = 0, endRow = 0, totalRows = 0 } = pagination;

    if (totalPages <= 1) return;

    const pager = new jsgui.div({ context, class: "lux-pager" });

    // Info section
    const info = new jsgui.div({ context, class: "lux-pager__info" });
    info.add(new StringControl({ 
      context, 
      text: `Showing ` 
    }));
    const strong1 = new jsgui.Control({ context, tagName: "strong" });
    strong1.add(new StringControl({ context, text: `${formatCount(startRow)}-${formatCount(endRow)}` }));
    info.add(strong1);
    info.add(new StringControl({ context, text: ` of ` }));
    const strong2 = new jsgui.Control({ context, tagName: "strong" });
    strong2.add(new StringControl({ context, text: formatCount(totalRows) }));
    info.add(strong2);
    info.add(new StringControl({ context, text: ` URLs` }));
    pager.add(info);

    // Controls section
    const controls = new jsgui.div({ context, class: "lux-pager__controls" });

    // Previous button
    const prevBtn = new jsgui.Control({ context, tagName: "a", class: "lux-pager__btn" });
    if (currentPage > 1) {
      prevBtn.dom.attributes.href = `${basePath}?page=${currentPage - 1}`;
    } else {
      prevBtn.add_class("lux-pager__btn--disabled");
      prevBtn.dom.attributes.disabled = "disabled";
    }
    prevBtn.add(new StringControl({ context, text: "← Prev" }));
    controls.add(prevBtn);

    // Page numbers
    const pages = getPageNumbers(currentPage, totalPages, 5);
    pages.forEach(page => {
      if (page === "...") {
        const ellipsis = new jsgui.span({ context, class: "lux-pager__ellipsis" });
        ellipsis.dom.attributes.style = "padding: 0 8px; color: var(--lux-text-muted);";
        ellipsis.add(new StringControl({ context, text: "..." }));
        controls.add(ellipsis);
      } else {
        const pageBtn = new jsgui.Control({ context, tagName: "a", class: "lux-pager__btn" });
        pageBtn.dom.attributes.href = `${basePath}?page=${page}`;
        if (page === currentPage) {
          pageBtn.add_class("lux-pager__btn--active");
        }
        pageBtn.add(new StringControl({ context, text: String(page) }));
        controls.add(pageBtn);
      }
    });

    // Next button
    const nextBtn = new jsgui.Control({ context, tagName: "a", class: "lux-pager__btn" });
    if (currentPage < totalPages) {
      nextBtn.dom.attributes.href = `${basePath}?page=${currentPage + 1}`;
    } else {
      nextBtn.add_class("lux-pager__btn--disabled");
      nextBtn.dom.attributes.disabled = "disabled";
    }
    nextBtn.add(new StringControl({ context, text: "Next →" }));
    controls.add(nextBtn);

    pager.add(controls);
    this.add(pager);
  }
}

/**
 * Format a number with thousands separators
 */
function formatCount(value) {
  if (value == null) return "0";
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return num.toLocaleString("en-US");
}

/**
 * Truncate a URL to a max length
 */
function truncateUrl(url, maxLen = 80) {
  if (!url || typeof url !== "string") return "—";
  if (url.length <= maxLen) return url;
  return url.substring(0, maxLen - 1) + "…";
}

/**
 * Extract host from URL
 */
function extractHost(url) {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/**
 * Format a date/time value
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
 * Get page numbers to display with ellipsis
 */
function getPageNumbers(current, total, maxVisible = 5) {
  if (total <= maxVisible + 2) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages = [];
  const half = Math.floor(maxVisible / 2);
  
  // Always show first page
  pages.push(1);
  
  let start = Math.max(2, current - half);
  let end = Math.min(total - 1, current + half);
  
  // Adjust if we're near the beginning
  if (current <= half + 2) {
    end = maxVisible;
    start = 2;
  }
  
  // Adjust if we're near the end
  if (current >= total - half - 1) {
    start = total - maxVisible + 1;
    end = total - 1;
  }
  
  // Add ellipsis before middle section if needed
  if (start > 2) {
    pages.push("...");
  }
  
  // Add middle pages
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }
  
  // Add ellipsis after middle section if needed
  if (end < total - 1) {
    pages.push("...");
  }
  
  // Always show last page
  pages.push(total);
  
  return pages;
}

module.exports = {
  FactsUrlListControl,
  formatCount,
  truncateUrl,
  extractHost,
  formatDateTime,
  getPageNumbers
};
