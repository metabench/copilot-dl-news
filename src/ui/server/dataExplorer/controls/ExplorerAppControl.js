"use strict";

/**
 * ExplorerAppControl - Main application control for Data Explorer
 * 
 * Composes the Data Explorer page using jsgui3 controls:
 * - Header with navigation
 * - Main content area (listing/dashboard)
 * - Footer with metadata
 * 
 * This follows the same pattern as DocAppControl in the docs viewer.
 */

const jsgui = require("jsgui3-html");
const { BaseAppControl } = require("../../shared/BaseAppControl");
const { ExplorerHomeCardControl } = require("./ExplorerHomeCardControl");
const { ExplorerPaginationControl } = require("./ExplorerPaginationControl");

// Import existing table controls
const { UrlListingTableControl } = require("../../../controls/UrlListingTable");
const { DomainSummaryTableControl } = require("../../../controls/DomainSummaryTable");
const { CrawlJobsTableControl } = require("../../../controls/CrawlJobsTable");
const { ErrorLogTableControl } = require("../../../controls/ErrorLogTable");
const { ConfigMatrixControl } = require("../../../controls/ConfigMatrixControl");
const { UrlFilterToggleControl } = require("../../../controls/UrlFilterToggle");

const StringControl = jsgui.String_Control;

/**
 * View types supported by the Data Explorer
 */
const VIEW_TYPES = Object.freeze({
  DASHBOARD: "dashboard",
  URLS: "urls",
  DOMAINS: "domains",
  CRAWLS: "crawls",
  ERRORS: "errors",
  CONFIG: "config",
  URL_DETAIL: "url-detail",
  DOMAIN_DETAIL: "domain-detail"
});

/**
 * Main application control for the Data Explorer
 */
class ExplorerAppControl extends BaseAppControl {
  /**
   * @param {Object} spec - Control specification
   * @param {string} spec.viewType - Type of view to render (see VIEW_TYPES)
   * @param {Array} spec.columns - Column definitions for table views
   * @param {Array} spec.rows - Row data for table views
   * @param {Object} spec.pagination - Pagination state { currentPage, totalPages, ... }
   * @param {Object} spec.filters - Active filters { hasFetches, ... }
   * @param {Object} spec.filterOptions - Filter control options
   * @param {Array} spec.homeCards - Home card data for dashboard view
   * @param {Array} spec.dashboardSections - Section data for dashboard view
   */
  constructor(spec = {}) {
    super({
      ...spec,
      appName: "Data Explorer",
      appClass: "data-explorer",
      title: spec.title || "Crawler Data Explorer"
    });
    
    // View-specific state
    this.viewType = spec.viewType || VIEW_TYPES.URLS;
    this.columns = spec.columns || [];
    this.rows = spec.rows || [];
    this.pagination = spec.pagination || null;
    this.filters = spec.filters || {};
    this.filterOptions = spec.filterOptions || null;
    this.homeCards = spec.homeCards || [];
    this.dashboardSections = spec.dashboardSections || [];
    this.breadcrumbs = spec.breadcrumbs || null;
    this.listingState = spec.listingState || null;
    
    // Now compose after all properties are set
    if (!spec.el) {
      this.compose();
    }
  }

  /**
   * Compose main content based on view type
   */
  composeMainContent() {
    switch (this.viewType) {
      case VIEW_TYPES.DASHBOARD:
        this._composeDashboard();
        break;
      case VIEW_TYPES.URLS:
        this._composeUrlListing();
        break;
      case VIEW_TYPES.DOMAINS:
        this._composeDomainListing();
        break;
      case VIEW_TYPES.CRAWLS:
        this._composeCrawlListing();
        break;
      case VIEW_TYPES.ERRORS:
        this._composeErrorListing();
        break;
      case VIEW_TYPES.CONFIG:
        this._composeConfig();
        break;
      case VIEW_TYPES.URL_DETAIL:
        this._composeUrlDetail();
        break;
      case VIEW_TYPES.DOMAIN_DETAIL:
        this._composeDomainDetail();
        break;
      default:
        this._composeGenericListing();
    }
  }

  /**
   * Compose dashboard view with cards and sections
   */
  _composeDashboard() {
    // Home cards section
    if (this.homeCards && this.homeCards.length > 0) {
      const cardsSection = this._buildHomeCards();
      this.mainContainer.add(cardsSection);
    }
    
    // Dashboard sections
    for (const section of this.dashboardSections) {
      const sectionControl = this._buildDashboardSection(section);
      this.mainContainer.add(sectionControl);
    }
  }

  /**
   * Build home cards grid using ExplorerHomeCardControl
   */
  _buildHomeCards() {
    const grid = new jsgui.Control({ context: this.context, tagName: "div" });
    grid.add_class("data-explorer__cards");
    
    for (const card of this.homeCards) {
      const cardControl = new ExplorerHomeCardControl({
        context: this.context,
        title: card.title,
        value: card.value,
        subtitle: card.subtitle,
        variant: card.variant,
        href: card.href
      });
      grid.add(cardControl);
    }
    
    return grid;
  }

  /**
   * Build a dashboard section
   */
  _buildDashboardSection(section) {
    const sectionEl = this.createSection(
      `data-explorer__section--${section.key || "default"}`,
      section.title
    );
    
    // Add table if section has columns/rows
    if (section.columns && section.rows) {
      const table = this._buildTable(section.columns, section.rows);
      sectionEl.add(table);
    }
    
    // Add custom content if present
    if (section.control) {
      sectionEl.add(section.control);
    }
    
    return sectionEl;
  }

  /**
   * Compose URL listing view
   */
  _composeUrlListing() {
    // Filter toggle
    if (this.filterOptions) {
      const filterBar = this._buildFilterBar();
      this.mainContainer.add(filterBar);
    }
    
    // Table
    const table = new UrlListingTableControl({
      context: this.context,
      columns: this.columns,
      rows: this.rows
    });
    this.mainContainer.add(table);
    
    // Pagination
    if (this.pagination) {
      const pager = this._buildPagination();
      this.mainContainer.add(pager);
    }
  }

  /**
   * Compose domain listing view
   */
  _composeDomainListing() {
    const table = new DomainSummaryTableControl({
      context: this.context,
      columns: this.columns,
      rows: this.rows
    });
    this.mainContainer.add(table);
  }

  /**
   * Compose crawl jobs listing
   */
  _composeCrawlListing() {
    const table = new CrawlJobsTableControl({
      context: this.context,
      columns: this.columns,
      rows: this.rows
    });
    this.mainContainer.add(table);
  }

  /**
   * Compose error log listing
   */
  _composeErrorListing() {
    const table = new ErrorLogTableControl({
      context: this.context,
      columns: this.columns,
      rows: this.rows
    });
    this.mainContainer.add(table);
  }

  /**
   * Compose configuration view
   */
  _composeConfig() {
    if (this.props.configControl) {
      this.mainContainer.add(this.props.configControl);
    } else if (this.props.configData) {
      const config = new ConfigMatrixControl({
        context: this.context,
        data: this.props.configData
      });
      this.mainContainer.add(config);
    } else {
      const msg = new jsgui.Control({ context: this.context, tagName: "p" });
      msg.add(new StringControl({ context: this.context, text: "No configuration available" }));
      this.mainContainer.add(msg);
    }
  }

  /**
   * Compose URL detail view
   */
  _composeUrlDetail() {
    // URL info section
    if (this.props.urlInfo) {
      const info = this._buildUrlInfo(this.props.urlInfo);
      this.mainContainer.add(info);
    }
    
    // Fetch history section
    if (this.props.fetchHistory && this.props.fetchHistory.length > 0) {
      const section = this.createSection("data-explorer__fetch-history", "Fetch History");
      const table = this._buildTable(this.columns, this.rows);
      section.add(table);
      this.mainContainer.add(section);
    }
  }

  /**
   * Compose domain detail view
   */
  _composeDomainDetail() {
    // Domain summary
    if (this.props.domainSummary) {
      const summary = this._buildDomainSummary(this.props.domainSummary);
      this.mainContainer.add(summary);
    }
    
    // Downloads table
    if (this.columns && this.rows) {
      const section = this.createSection("data-explorer__downloads", "Recent Downloads");
      const table = this._buildTable(this.columns, this.rows);
      section.add(table);
      this.mainContainer.add(section);
    }
  }

  /**
   * Generic listing view for any table data
   */
  _composeGenericListing() {
    if (this.columns && this.rows) {
      const table = this._buildTable(this.columns, this.rows);
      this.mainContainer.add(table);
    }
  }

  /**
   * Build filter bar with toggles
   */
  _buildFilterBar() {
    const bar = new jsgui.Control({ context: this.context, tagName: "div" });
    bar.add_class("data-explorer__filter-bar");
    
    const filterControl = new UrlFilterToggleControl({
      context: this.context,
      ...this.filterOptions
    });
    bar.add(filterControl);
    
    return bar;
  }

  /**
   * Build pagination controls using ExplorerPaginationControl
   */
  _buildPagination() {
    return new ExplorerPaginationControl({
      context: this.context,
      currentPage: this.pagination.currentPage,
      totalPages: this.pagination.totalPages,
      basePath: this.pagination.basePath
    });
  }

  /**
   * Build a generic table from columns and rows
   */
  _buildTable(columns, rows) {
    // Use the base Table control
    const { TableControl } = require("../../../controls/Table");
    return new TableControl({
      context: this.context,
      columns,
      rows
    });
  }

  /**
   * Build URL info panel
   */
  _buildUrlInfo(info) {
    const panel = new jsgui.Control({ context: this.context, tagName: "div" });
    panel.add_class("data-explorer__url-info");
    
    const dl = new jsgui.Control({ context: this.context, tagName: "dl" });
    
    const fields = [
      { label: "URL", value: info.url },
      { label: "Host", value: info.host },
      { label: "Created", value: info.createdAt },
      { label: "Last Fetch", value: info.lastFetchAt },
      { label: "HTTP Status", value: info.httpStatus }
    ];
    
    for (const field of fields) {
      if (field.value) {
        const dt = new jsgui.Control({ context: this.context, tagName: "dt" });
        dt.add(new StringControl({ context: this.context, text: field.label }));
        dl.add(dt);
        
        const dd = new jsgui.Control({ context: this.context, tagName: "dd" });
        dd.add(new StringControl({ context: this.context, text: String(field.value) }));
        dl.add(dd);
      }
    }
    
    panel.add(dl);
    return panel;
  }

  /**
   * Build domain summary panel
   */
  _buildDomainSummary(summary) {
    const panel = new jsgui.Control({ context: this.context, tagName: "div" });
    panel.add_class("data-explorer__domain-summary");
    
    const h2 = new jsgui.Control({ context: this.context, tagName: "h2" });
    h2.add(new StringControl({ context: this.context, text: summary.host || "Domain" }));
    panel.add(h2);
    
    const stats = new jsgui.Control({ context: this.context, tagName: "ul" });
    stats.add_class("data-explorer__domain-stats");
    
    const statItems = [
      { label: "Total URLs", value: summary.urlCount },
      { label: "Total Fetches", value: summary.fetchCount },
      { label: "Articles", value: summary.articleCount }
    ];
    
    for (const stat of statItems) {
      if (stat.value !== undefined) {
        const li = new jsgui.Control({ context: this.context, tagName: "li" });
        const label = new jsgui.Control({ context: this.context, tagName: "span" });
        label.add(new StringControl({ context: this.context, text: stat.label }));
        li.add(label);
        
        const value = new jsgui.Control({ context: this.context, tagName: "strong" });
        value.add(new StringControl({ context: this.context, text: String(stat.value) }));
        li.add(value);
        
        stats.add(li);
      }
    }
    
    panel.add(stats);
    return panel;
  }
}

// Export view types for external use
ExplorerAppControl.VIEW_TYPES = VIEW_TYPES;

module.exports = { ExplorerAppControl, VIEW_TYPES };
