"use strict";

/**
 * Dashboard View Renderer
 * 
 * Renders the main dashboard view with home cards and status panels.
 * 
 * @module src/ui/server/dataExplorer/views/dashboard
 */

const jsgui = require("jsgui3-html");
const StringControl = jsgui.String_Control;

const { formatCount } = require('../../utils/serverStartupCheckformatting");
const { createHomeCardLoaders } = require("../../../homeCardData");
const { buildHomeCards: buildSharedHomeCards } = require("../../../homeCards");

// Import shared utilities (DRY)
const {
  tryGetCachedUrlTotals,
  buildUrlTotals,
  DOMAIN_WINDOW_SIZE,
  DOMAIN_LIMIT,
  HOME_CARD_CRAWL_LIMIT,
  HOME_CARD_ERROR_LIMIT,
  buildViewMeta
} = require("./shared");

/**
 * Build home cards for dashboard
 * @param {Object} params
 * @param {Object} params.totals - URL totals
 * @param {Object} params.db - Database connection
 * @returns {Array} - Home cards
 */
function buildHomeCards({ totals, db }) {
  if (!db) {
    return buildSharedHomeCards({ totals });
  }
  const loaders = createHomeCardLoaders({
    db,
    domainWindowSize: DOMAIN_WINDOW_SIZE,
    domainLimit: DOMAIN_LIMIT,
    crawlLimit: HOME_CARD_CRAWL_LIMIT,
    errorLimit: HOME_CARD_ERROR_LIMIT
  });
  return buildSharedHomeCards({ totals, loaders });
}

/**
 * Create crawler status section control
 * @param {Object} context - jsgui Page_Context
 * @returns {Object} - jsgui control
 */
function createCrawlerStatusSection(context) {
  const container = new jsgui.div({ context });
  const badges = new jsgui.div({ context, class: "status-badges" });

  const stageBadge = new jsgui.span({ context, class: "status-pill" });
  stageBadge.dom.attributes["data-crawl-stage"] = "";
  stageBadge.add(new StringControl({ context, text: "Stage: idle" }));
  badges.add(stageBadge);

  const pausedBadge = new jsgui.span({ context, class: "status-pill status-pill--paused" });
  pausedBadge.dom.attributes["data-crawl-paused"] = "";
  pausedBadge.dom.attributes.hidden = "hidden";
  pausedBadge.add(new StringControl({ context, text: "Paused" }));
  badges.add(pausedBadge);

  const typeBadge = new jsgui.span({ context, class: "status-pill status-pill--meta" });
  typeBadge.dom.attributes["data-crawl-type-label"] = "";
  typeBadge.add(new StringControl({ context, text: "standard" }));
  badges.add(typeBadge);

  container.add(badges);

  const startupStatus = new jsgui.div({ context, class: "startup-status" });
  startupStatus.dom.attributes["data-crawl-startup-status"] = "";
  startupStatus.dom.attributes.hidden = "hidden";

  const statusText = new jsgui.p({ context, class: "startup-status__text" });
  statusText.dom.attributes["data-crawl-startup-text"] = "";
  statusText.add(new StringControl({ context, text: "Awaiting startup events" }));
  startupStatus.add(statusText);

  const progress = new jsgui.div({ context, class: "startup-progress" });
  const progressFill = new jsgui.div({ context, class: "startup-progress__fill" });
  progressFill.dom.attributes["data-crawl-startup-progress"] = "";
  progress.add(progressFill);
  startupStatus.add(progress);

  const stagesList = new jsgui.ul({ context, class: "startup-stage-list" });
  stagesList.dom.attributes["data-crawl-startup-stages"] = "";
  const placeholder = new jsgui.li({ context });
  placeholder.add(new StringControl({ context, text: "No startup activity yet." }));
  stagesList.add(placeholder);
  startupStatus.add(stagesList);

  container.add(startupStatus);
  return container;
}

/**
 * Create jobs panel section control
 * @param {Object} context - jsgui Page_Context
 * @returns {Object} - jsgui control
 */
function createJobsPanelSection(context) {
  const wrapper = new jsgui.div({ context });
  const list = new jsgui.div({ context, class: "jobs-list" });
  list.dom.attributes["data-crawl-jobs-list"] = "";
  list.dom.attributes["aria-live"] = "polite";
  list.dom.attributes["aria-busy"] = "true";
  const empty = new jsgui.div({ context, class: "jobs-empty-state" });
  const icon = new jsgui.span({ context, class: "jobs-empty-state__icon" });
  icon.add(new StringControl({ context, text: "..." }));
  const text = new jsgui.p({ context, class: "jobs-empty-state__text" });
  text.add(new StringControl({ context, text: "Waiting for crawl jobs to start." }));
  empty.add(icon);
  empty.add(text);
  list.add(empty);
  wrapper.add(list);
  return wrapper;
}

/**
 * Build dashboard sections configuration
 * @returns {Array} - Section configurations
 */
function buildDashboardSections() {
  return [
    {
      key: "crawler-status",
      title: "Crawler Status",
      className: "status-panel",
      meta: "Live stage + startup feed",
      render: ({ context }) => createCrawlerStatusSection(context)
    },
    {
      key: "crawler-jobs",
      title: "Active Jobs",
      className: "jobs-panel",
      meta: "Latest crawl jobs from SSE stream",
      render: ({ context }) => createJobsPanelSection(context)
    }
  ];
}

/**
 * Render the dashboard view
 * @param {Object} params
 * @param {Object} params.db - Database connection
 * @param {string} params.relativeDb - Relative database path
 * @param {Date} params.now - Current timestamp
 * @returns {Object} - View payload
 */
function renderDashboardView({ db, relativeDb, now }) {
  const totals = buildUrlTotals(db);
  const totalCount = totals && Number.isFinite(Number(totals.totalRows)) ? Number(totals.totalRows) : null;
  const subtitle = totalCount != null
    ? `Monitoring ${formatCount(totalCount)} URLs tracked in ${relativeDb}`
    : `Monitoring crawler activity for ${relativeDb}`;
  const homeCards = buildHomeCards({ totals, db });
  return {
    title: "Crawler Operations Dashboard",
    columns: [],
    rows: [],
    meta: buildViewMeta({
      rowCount: 0,
      limit: 0,
      relativeDb,
      now,
      subtitle
    }),
    renderOptions: {
      homeCards,
      layoutMode: "dashboard",
      hideListingPanel: true,
      includeDashboardScaffold: true,
      dashboardSections: buildDashboardSections()
    }
  };
}

module.exports = {
  buildHomeCards,
  createCrawlerStatusSection,
  createJobsPanelSection,
  buildDashboardSections,
  renderDashboardView,
  // Re-export from shared for backward compatibility
  buildUrlTotals,
  DOMAIN_WINDOW_SIZE,
  DOMAIN_LIMIT,
  HOME_CARD_CRAWL_LIMIT,
  HOME_CARD_ERROR_LIMIT
};
