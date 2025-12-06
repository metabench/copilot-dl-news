"use strict";

/**
 * Data Explorer Views Index
 * 
 * Re-exports all view renderers for the data explorer server.
 * 
 * @module src/ui/server/dataExplorer/views
 */

// Shared utilities and constants (DRY - single source of truth)
const {
  attachBackLink,
  attachBackLinks,
  tryGetCachedUrlTotals,
  buildUrlTotals,
  DOMAIN_WINDOW_SIZE,
  DOMAIN_LIMIT,
  HOME_CARD_CRAWL_LIMIT,
  HOME_CARD_ERROR_LIMIT,
  CRAWL_LIMIT,
  ERROR_LIMIT,
  DOMAIN_DOWNLOAD_LIMIT
} = require("./shared");

// Dashboard view
const {
  buildHomeCards,
  createCrawlerStatusSection,
  createJobsPanelSection,
  buildDashboardSections,
  renderDashboardView
} = require("./dashboard");

// URL listing view
const {
  buildUrlSummarySubtitle,
  buildUrlMeta,
  buildUrlListingPayload,
  renderUrlListingView,
  URL_COLUMNS
} = require("./urlListing");

// Domain views
const {
  buildDomainSubtitle,
  renderDomainSummaryView
} = require("./domains");

// Crawl jobs view
const {
  renderCrawlJobsView
} = require("./crawls");

// Error log view
const {
  renderErrorLogView
} = require("./errors");

// Classifications view
const {
  buildClassificationColumns,
  buildClassificationRows,
  renderClassificationsView
} = require("./classifications");

// Config view
const {
  renderConfigView
} = require("./config");

/**
 * DATA_VIEWS array - defines all main navigation views
 */
const DATA_VIEWS = [
  {
    key: "home",
    path: "/",
    navLabel: "Home",
    title: "Crawler Operations Dashboard",
    render: renderDashboardView
  },
  {
    key: "urls",
    path: "/urls",
    navLabel: "URLs",
    title: "Crawler URL Snapshot",
    render: renderUrlListingView
  },
  {
    key: "domains",
    path: "/domains",
    navLabel: "Domains",
    title: "Recent Domain Activity",
    render: renderDomainSummaryView
  },
  {
    key: "crawls",
    path: "/crawls",
    navLabel: "Crawls",
    title: "Recent Crawl Jobs",
    render: renderCrawlJobsView
  },
  {
    key: "errors",
    path: "/errors",
    navLabel: "Errors",
    title: "Recent Crawl Errors",
    render: renderErrorLogView
  },
  {
    key: "classifications",
    path: "/classifications",
    navLabel: "Classifications",
    title: "Document Classifications",
    render: renderClassificationsView
  },
  {
    key: "config",
    path: "/config",
    navLabel: "Config",
    title: "Configuration",
    render: renderConfigView
  }
];

module.exports = {
  // Shared utilities
  attachBackLink,
  attachBackLinks,
  tryGetCachedUrlTotals,
  buildUrlTotals,
  
  // Dashboard
  buildHomeCards,
  createCrawlerStatusSection,
  createJobsPanelSection,
  buildDashboardSections,
  renderDashboardView,
  
  // URL Listing
  buildUrlSummarySubtitle,
  buildUrlMeta,
  buildUrlListingPayload,
  renderUrlListingView,
  URL_COLUMNS,
  
  // Domains
  buildDomainSubtitle,
  renderDomainSummaryView,
  
  // Crawls
  renderCrawlJobsView,
  
  // Errors
  renderErrorLogView,
  
  // Classifications
  buildClassificationColumns,
  buildClassificationRows,
  renderClassificationsView,
  
  // Config
  renderConfigView,
  
  // View registry
  DATA_VIEWS,
  
  // Constants (from shared.js)
  DOMAIN_WINDOW_SIZE,
  DOMAIN_LIMIT,
  CRAWL_LIMIT,
  ERROR_LIMIT,
  HOME_CARD_CRAWL_LIMIT,
  HOME_CARD_ERROR_LIMIT,
  DOMAIN_DOWNLOAD_LIMIT
};
