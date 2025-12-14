"use strict";

const fs = require("fs");
const path = require("path");
const jsgui = require("jsgui3-html");

const { openNewsDb } = require("../db/dbAccess");
const { findProjectRoot } = require("../utils/project-root");
const { selectInitialUrls, countUrls } = require("../db/sqlite/v1/queries/ui/urlListingNormalized");
const {
  UrlListingTableControl,
  buildColumns,
  buildDisplayRows,
  buildIndexCell,
  formatDateTime
} = require("./controls/UrlListingTable");
const { PagerButtonControl } = require("./controls/PagerButton");
const { SparklineControl } = require("./controls");
const { UrlFilterToggleControl } = require("./controls/UrlFilterToggle");
const { SearchFormControl } = require("./controls/SearchFormControl");
const { buildHomeCards } = require("./homeCards");
const { createHomeCardLoaders } = require("./homeCardData");
const { listControlTypes } = require("./controls/controlManifest");
const { themeConfigToCss, DEFAULT_THEME_CONFIG } = require("./server/services/themeService");
const { buildDataExplorerCss } = require("./styles/dataExplorerCss");

const StringControl = jsgui.String_Control;

const DOMAIN_WINDOW_SIZE = 4000;
const DOMAIN_LIMIT = 40;
const HOME_CARD_CRAWL_LIMIT = 12;
const HOME_CARD_ERROR_LIMIT = 50;

function parseArgs(argv) {
  const args = {};
  const normalized = Array.isArray(argv) ? argv.slice() : [];
  for (let i = 0; i < normalized.length; i += 1) {
    const token = normalized[i];
    if (!token) continue;
    switch (token) {
      case "--db":
      case "-d":
        args.db = normalized[++i];
        break;
      case "--limit":
      case "-l":
        args.limit = Number(normalized[++i]);
        break;
      case "--output":
      case "-o":
        args.output = normalized[++i];
        break;
      case "--title":
        args.title = normalized[++i];
        break;
      default:
        if (token.startsWith("--")) {
          const [key, value] = token.split("=");
          if (key === "--db" && value) args.db = value;
          if (key === "--limit" && value) args.limit = Number(value);
          if (key === "--output" && value) args.output = value;
          if (key === "--title" && value) args.title = value;
        }
        break;
    }
  }
  return args;
}

function resolveDbPath(cliPath) {
  const projectRoot = findProjectRoot(__dirname);
  if (cliPath) {
    return path.isAbsolute(cliPath) ? cliPath : path.resolve(process.cwd(), cliPath);
  }
  return path.join(projectRoot, "data", "news.db");
}

function buildUrlTotals(dbHandle) {
  if (!dbHandle) return null;
  try {
    const totalRows = countUrls(dbHandle);
    return {
      source: "live",
      totalRows,
      cache: null
    };
  } catch (_) {
    return null;
  }
}

function buildCliHomeCards(dbHandle, totals) {
  if (!dbHandle) {
    return buildHomeCards({ totals });
  }
  try {
    const loaders = createHomeCardLoaders({
      db: dbHandle,
      domainWindowSize: DOMAIN_WINDOW_SIZE,
      domainLimit: DOMAIN_LIMIT,
      crawlLimit: HOME_CARD_CRAWL_LIMIT,
      errorLimit: HOME_CARD_ERROR_LIMIT
    });
    return buildHomeCards({ totals, loaders });
  } catch (_) {
    return buildHomeCards({ totals });
  }
}

function injectControlManifestScript(context, body, controlTypes) {
  if (!context || !body) {
    return;
  }
  const expectedTypes = Array.isArray(controlTypes) && controlTypes.length
    ? controlTypes
    : listControlTypes();
  const normalized = expectedTypes
    .map((type) => (typeof type === "string" ? type.trim().toLowerCase() : ""))
    .filter(Boolean);
  if (!normalized.length) {
    return;
  }
  const script = new jsgui.script({ context });
  const serialized = JSON.stringify(normalized).replace(/</g, "\\u003c");
  script.add(new StringControl({ context, text: `window.__COPILOT_EXPECTED_CONTROLS__ = ${serialized};` }));
  body.add(script);
}

/**
 * Build a simple search form control for SSR pages
 * @param {Object} context - jsgui Page_Context
 * @param {Object} options - { action, currentSearch, placeholder }
 * @returns {jsgui.Control}
 */
function buildSearchFormControl(context, options = {}) {
  const { action = "/", currentSearch = "", placeholder = "Search..." } = options;

  return new SearchFormControl({
    context,
    action,
    method: "get",
    input: {
      name: "search",
      value: currentSearch || "",
      placeholder,
      type: "search"
    },
    button: {
      text: "🔍",
      ariaLabel: "Search"
    }
  });
}

function renderHtml({ columns = [], rows = [], meta = {}, title }, options = {}) {
  const normalizedColumns = Array.isArray(columns) ? columns : [];
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const controlTypes = Array.isArray(options.controlTypes) && options.controlTypes.length
    ? options.controlTypes
    : listControlTypes();
  const clientScriptPath = options.clientScriptPath;
  const bindingPluginEnabled = options.bindingPlugin !== false;
  const navLinks = Array.isArray(options.navLinks) ? options.navLinks : null;
  const breadcrumbs = Array.isArray(options.breadcrumbs) ? options.breadcrumbs : null;
  const filterOptions = options.filterOptions;
  const searchForm = options.searchForm;
  const homeCards = Array.isArray(options.homeCards) ? options.homeCards : null;
  const listingState = options.listingState || null;
  const layoutMode = typeof options.layoutMode === "string" && options.layoutMode.trim() ? options.layoutMode : "listing";
  const hideListingPanel = options.hideListingPanel === true || layoutMode === "dashboard";
  const mainControl = options.mainControl;
  const dashboardSections = Array.isArray(options.dashboardSections) ? options.dashboardSections.slice() : [];
  const includeDashboardScaffold = options.includeDashboardScaffold === true || dashboardSections.length > 0;
  const safeMeta = {
    rowCount: 0,
    limit: 0,
    dbLabel: "—",
    generatedAt: "",
    subtitle: "",
    extraCards: [],
    ...meta
  };
  const rowCountDisplay = Number.isFinite(Number(safeMeta.rowCount)) ? Number(safeMeta.rowCount) : 0;
  const limitDisplay = Number.isFinite(Number(safeMeta.limit)) ? Number(safeMeta.limit) : 0;
  const dbLabelDisplay = safeMeta.dbLabel || "—";
  const generatedAtDisplay = safeMeta.generatedAt || "";
  const subtitleDisplay = safeMeta.subtitle || "";
  const shouldRenderListing = !hideListingPanel && normalizedColumns.length > 0;

  const context = new jsgui.Page_Context();
  const document = new jsgui.Blank_HTML_Document({ context });

  document.title.add(new StringControl({ context, text: title }));
  const head = document.head;
  head.add(new jsgui.meta({ context, attrs: { charset: "utf-8" } }));
  head.add(new jsgui.meta({ context, attrs: { name: "viewport", content: "width=device-width, initial-scale=1" } }));
  
  // Theme system: inject Google Fonts and CSS variables
  const themeConfig = options.themeConfig || DEFAULT_THEME_CONFIG;
  
  // Google Fonts preconnect + stylesheet links (as proper jsgui link controls)
  const preconnectFonts = new jsgui.link({ context });
  preconnectFonts.dom.attributes.rel = "preconnect";
  preconnectFonts.dom.attributes.href = "https://fonts.googleapis.com";
  head.add(preconnectFonts);
  
  const preconnectGstatic = new jsgui.link({ context });
  preconnectGstatic.dom.attributes.rel = "preconnect";
  preconnectGstatic.dom.attributes.href = "https://fonts.gstatic.com";
  preconnectGstatic.dom.attributes.crossorigin = "";
  head.add(preconnectGstatic);
  
  const fontsStylesheet = new jsgui.link({ context });
  fontsStylesheet.dom.attributes.rel = "stylesheet";
  fontsStylesheet.dom.attributes.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Playfair+Display:wght@600;700&display=swap";
  head.add(fontsStylesheet);
  
  head.add(createStyleTag(context, themeConfigToCss(themeConfig)));
  head.add(createStyleTag(context, buildDataExplorerCss()));

  const body = document.body;
  const shell = new jsgui.div({ context, class: "page-shell" });
  shell.add_class("page-shell--offset");
  const header = new jsgui.Control({ context, tagName: "header" });
  header.add_class("page-shell__header");
  const breadcrumbNav = breadcrumbs ? createBreadcrumbsNav(context, breadcrumbs) : null;
  if (breadcrumbNav) header.add(breadcrumbNav);
  const hero = new jsgui.div({ context, class: "page-shell__hero" });
  const headingGroup = new jsgui.div({ context, class: "page-shell__heading" });
  const heading = new jsgui.h1({ context });
  if (title) {
    heading.add(new StringControl({ context, text: title }));
  }
  const subtitle = new jsgui.p({ context, class: "page-shell__subtitle" });
  subtitle.dom.attributes["data-meta-field"] = "subtitle";
  if (subtitleDisplay) {
    subtitle.add(new StringControl({ context, text: subtitleDisplay }));
  }
  headingGroup.add(heading);
  headingGroup.add(subtitle);
  let filterControl = null;
  if (filterOptions && typeof filterOptions === "object") {
    filterControl = new UrlFilterToggleControl({ context, ...filterOptions });
  }
  let searchFormControl = null;
  if (searchForm && typeof searchForm === "object") {
    searchFormControl = buildSearchFormControl(context, searchForm);
  }
  hero.add(headingGroup);
  if (filterControl || searchFormControl) {
    const actions = new jsgui.div({ context, class: "page-shell__actions" });
    if (searchFormControl) actions.add(searchFormControl);
    if (filterControl) actions.add(filterControl);
    hero.add(actions);
  }
  header.add(hero);

  let panel = null;
  if (shouldRenderListing) {
    panel = new jsgui.Control({ context, tagName: "section" });
    panel.add_class("panel");
    const metaGrid = new jsgui.div({ context, class: "panel__meta" });
    
    // Render extraCards first (allows classification emoji to be top-left)
    if (Array.isArray(safeMeta.extraCards)) {
      safeMeta.extraCards.forEach((card) => {
        if (card && card.label) {
          const content = card.control || card.value || (Array.isArray(card.series)
            ? new SparklineControl({ context, series: card.series, width: card.width || 240, height: card.height || 36 })
            : "—");
          metaGrid.add(createMetaCard(context, card.label, content, {
            isEmoji: card.isEmoji,
            subtitle: card.subtitle
          }));
        }
      });
    }
    
    // Then render standard meta cards
    metaGrid.add(createMetaCard(context, "Rows Rendered", rowCountDisplay.toLocaleString("en-US"), { field: "rowCount" }));
    metaGrid.add(createMetaCard(context, "Requested Limit", limitDisplay.toLocaleString("en-US"), { field: "limit" }));
    metaGrid.add(createMetaCard(context, "Database", dbLabelDisplay, { field: "dbLabel" }));
    metaGrid.add(createMetaCard(context, "Generated", generatedAtDisplay, { field: "generatedAt" }));
    
    // Render filter controls if provided (for classification detail pages, etc.)
    // Supports:
    // 1. filterControlsFactory: function(context) => jsgui.Control (preferred - lazy creation with context)
    // 2. filterControls: jsgui.Control (if caller has access to same context)
    // 3. filterControlsHtml: string (legacy - uses Text_Node to inject raw HTML)
    let filterControlsContainer = null;
    if (typeof safeMeta.filterControlsFactory === "function") {
      // Factory function - call it with our context to build the control
      filterControlsContainer = new jsgui.div({ context, class: "panel__filters" });
      const filterControl = safeMeta.filterControlsFactory(context);
      if (filterControl) {
        filterControlsContainer.add(filterControl);
      }
    } else if (safeMeta.filterControls && typeof safeMeta.filterControls === "object" && safeMeta.filterControls.all_html_render) {
      // Pre-built jsgui Control
      filterControlsContainer = new jsgui.div({ context, class: "panel__filters" });
      filterControlsContainer.add(safeMeta.filterControls);
    } else if (safeMeta.filterControlsHtml && typeof safeMeta.filterControlsHtml === "string") {
      // Legacy HTML string - use Text_Node to inject raw HTML
      filterControlsContainer = new jsgui.div({ context, class: "panel__filters" });
      const textNode = new jsgui.Text_Node({ context, text: safeMeta.filterControlsHtml });
      filterControlsContainer.add(textNode);
    }
    
    const table = new UrlListingTableControl({ context, columns: normalizedColumns, rows: normalizedRows });
    const tableWrapper = new jsgui.div({ context, class: "table-wrapper" });
    tableWrapper.add(table);
    const paginationNavTop = safeMeta.pagination ? createPaginationNav(context, safeMeta.pagination, "top") : null;
    const paginationNavBottom = safeMeta.pagination ? createPaginationNav(context, safeMeta.pagination, "bottom") : null;
    panel.add(metaGrid);
    if (filterControlsContainer) panel.add(filterControlsContainer);
    if (paginationNavTop) panel.add(paginationNavTop);
    panel.add(tableWrapper);
    if (paginationNavBottom) panel.add(paginationNavBottom);
  }

  shell.add(header);
  const primaryNav = navLinks ? createPrimaryNav(context, navLinks) : null;
  if (primaryNav) shell.add(primaryNav);
  const homeGrid = homeCards ? createHomeGrid(context, homeCards) : null;
  if (homeGrid) shell.add(homeGrid);
  const dashboardGrid = includeDashboardScaffold ? createDashboardSections(context, dashboardSections) : null;
  if (dashboardGrid) shell.add(dashboardGrid);
  if (mainControl) {
    shell.add(mainControl);
  }
  if (panel) {
    shell.add(panel);
  }
  body.add(shell);

  injectControlManifestScript(context, body, controlTypes);

  if (shouldRenderListing && listingState) {
    const stateScript = new jsgui.script({ context });
    const serialized = JSON.stringify(listingState).replace(/</g, "\\u003c");
    stateScript.add(new StringControl({ context, text: `window.__COPILOT_URL_LISTING_STATE__ = ${serialized};` }));
    body.add(stateScript);
  }

  if (clientScriptPath) {
    const attrs = { src: clientScriptPath, defer: "defer" };
    if (!bindingPluginEnabled) {
      attrs["data-binding-plugin"] = "off";
    }
    const clientScript = new jsgui.script({ context, attrs });
    body.add(clientScript);
  }

  return `<!DOCTYPE html>${document.all_html_render()}`;
}

// Note: CSS generation moved to src/ui/styles/dataExplorerCss.js
// Uses CSS variables for theming support - see themeService.js for token definitions


function createMetaCard(context, label, value, options = {}) {
  const isEmoji = options.isEmoji === true;
  const cardClass = isEmoji ? "meta-card meta-card--emoji" : "meta-card";
  const card = new jsgui.div({ context, class: cardClass });
  const labelCtrl = new jsgui.p({ context, class: "meta-card__label" });
  labelCtrl.add(new StringControl({ context, text: label }));
  const valueClass = isEmoji ? "meta-card__value meta-card__value--emoji" : "meta-card__value";
  const valueCtrl = new jsgui.p({ context, class: valueClass });
  if (options.field) {
    valueCtrl.dom.attributes["data-meta-field"] = options.field;
  }
  if (value instanceof jsgui.Control) {
    valueCtrl.add(value);
  } else {
    valueCtrl.add(new StringControl({ context, text: value }));
  }
  card.add(labelCtrl);
  card.add(valueCtrl);
  
  // Add subtitle if provided (used for emoji cards to show classification name)
  if (options.subtitle) {
    const subtitleCtrl = new jsgui.p({ context, class: "meta-card__subtitle" });
    subtitleCtrl.add(new StringControl({ context, text: options.subtitle }));
    card.add(subtitleCtrl);
  }
  
  return card;
}

function createHomeCard(context, card = {}) {
  if (!card || !card.title || !card.action || !card.action.href) return null;
  const container = new jsgui.div({ context, class: "home-card" });
  if (card.key) {
    container.dom.attributes["data-home-card"] = card.key;
    container.dom.attributes["data-home-card-key"] = card.key;
  }

  const headline = new jsgui.div({ context, class: "home-card__headline" });
  const title = new jsgui.h3({ context, class: "home-card__title" });
  title.add(new StringControl({ context, text: card.title }));
  headline.add(title);
  if (card.badge && card.badge.label) {
    const badge = new jsgui.span({ context, class: "badge home-card__badge" });
    const tone = typeof card.badge.tone === "string" && card.badge.tone.trim() ? card.badge.tone.trim() : null;
    if (tone) {
      badge.add_class(`badge--${tone}`);
      badge.dom.attributes["data-home-card-badge-tone"] = tone;
    }
    badge.dom.attributes["data-home-card-badge-label"] = card.badge.label;
    if (card.badge.title) {
      badge.dom.attributes.title = card.badge.title;
    }
    badge.add(new StringControl({ context, text: card.badge.label }));
    headline.add(badge);
  }
  container.add(headline);

  if (card.description) {
    const description = new jsgui.p({ context, class: "home-card__description" });
    description.add(new StringControl({ context, text: card.description }));
    container.add(description);
  }

  if (card.statLabel || card.statValue != null) {
    const stat = new jsgui.div({ context, class: "home-card__stat" });
    if (card.statLabel) {
      stat.add(new StringControl({ context, text: card.statLabel }));
    }
    const statValue = new jsgui.span({ context, class: "home-card__stat-value" });
    const appendStatValue = (target) => {
      if (card.statValue instanceof jsgui.Control) {
        target.add(card.statValue);
      } else {
        const valueText = card.statValue != null ? String(card.statValue) : "—";
        target.add(new StringControl({ context, text: valueText }));
      }
    };
    if (card.statHref) {
      const link = new jsgui.Control({ context, tagName: "a" });
      link.add_class("home-card__stat-link");
      link.dom.attributes.href = card.statHref;
      if (card.statTooltip) {
        link.dom.attributes.title = card.statTooltip;
      }
      appendStatValue(link);
      statValue.add(link);
    } else {
      appendStatValue(statValue);
    }
    stat.add(statValue);
    container.add(stat);
  }

  const hints = Array.isArray(card.hints) ? card.hints : null;
  if (hints && hints.length) {
    const hintList = new jsgui.ul({ context, class: "home-card__hints" });
    hints.forEach((hintEntry) => {
      const normalized = typeof hintEntry === "string" ? { text: hintEntry } : hintEntry;
      if (!normalized || !normalized.text) return;
      const hintItem = new jsgui.li({ context, class: "home-card__hint" });
      if (normalized.href) {
        const hintLink = new jsgui.Control({ context, tagName: "a" });
        hintLink.add_class("home-card__hint-link");
        hintLink.dom.attributes.href = normalized.href;
        if (normalized.title) {
          hintLink.dom.attributes.title = normalized.title;
        }
        hintLink.add(new StringControl({ context, text: normalized.text }));
        hintItem.add(hintLink);
      } else {
        hintItem.add(new StringControl({ context, text: normalized.text }));
      }
      hintList.add(hintItem);
    });
    container.add(hintList);
  }

  const action = new jsgui.Control({ context, tagName: "a" });
  action.add_class("home-card__action");
  action.dom.attributes.href = card.action.href;
  if (card.action.title) {
    action.dom.attributes.title = card.action.title;
  }
  action.add(new StringControl({ context, text: card.action.label || "Open" }));
  container.add(action);
  return container;
}


function createHomeGrid(context, cards) {
  if (!Array.isArray(cards) || cards.length === 0) return null;
  const entries = cards.filter((card) => card && card.title && card.action && card.action.href);
  if (!entries.length) return null;
  const grid = new jsgui.div({ context, class: "home-grid" });
  entries.forEach((card) => {
    const rendered = createHomeCard(context, card);
    if (rendered) {
      grid.add(rendered);
    }
  });
  return grid;
}

function appendContent(context, target, content) {
  if (!target || content == null) return;
  if (Array.isArray(content)) {
    content.forEach((entry) => appendContent(context, target, entry));
    return;
  }
  if (content instanceof jsgui.Control) {
    target.add(content);
    return;
  }
  if (typeof content === "function") {
    const produced = content({ context, target });
    if (produced && produced !== content) {
      appendContent(context, target, produced);
    }
    return;
  }
  const text = typeof content === "string" ? content : String(content);
  target.add(new StringControl({ context, text }));
}

function createDashboardSections(context, sections) {
  if (!Array.isArray(sections) || sections.length === 0) return null;
  const entries = sections.filter((section) => section && section.title);
  if (!entries.length) return null;
  const grid = new jsgui.div({ context, class: "dashboard-grid" });
  entries.forEach((section) => {
    const panel = new jsgui.div({ context, class: "dashboard-panel" });
    if (section.key) {
      panel.dom.attributes["data-dashboard-panel"] = section.key;
    }
    if (section.className) {
      String(section.className)
        .split(/\s+/)
        .filter(Boolean)
        .forEach((cls) => panel.add_class(cls));
    }
    const head = new jsgui.div({ context, class: "dashboard-panel__head" });
    const heading = new jsgui.h2({ context });
    heading.add(new StringControl({ context, text: section.title }));
    head.add(heading);
    if (section.meta || (Array.isArray(section.badges) && section.badges.length)) {
      const metaWrap = new jsgui.div({ context, class: "dashboard-panel__meta" });
      if (section.meta) {
        appendContent(context, metaWrap, section.meta);
      }
      if (Array.isArray(section.badges) && section.badges.length) {
        const badgeRow = new jsgui.div({ context, class: "status-badges" });
        section.badges.forEach((badgeEntry) => {
          const normalized = typeof badgeEntry === "string" ? { label: badgeEntry } : badgeEntry;
          if (!normalized || !normalized.label) return;
          const pill = new jsgui.span({ context, class: "status-pill" });
          if (normalized.tone) {
            pill.add_class(`status-pill--${normalized.tone}`);
          }
          if (normalized.title) {
            pill.dom.attributes.title = normalized.title;
          }
          pill.add(new StringControl({ context, text: normalized.label }));
          badgeRow.add(pill);
        });
        metaWrap.add(badgeRow);
      }
      head.add(metaWrap);
    }
    panel.add(head);
    const body = new jsgui.div({ context, class: "dashboard-panel__body" });
    if (section.bodyClassName) {
      String(section.bodyClassName)
        .split(/\s+/)
        .filter(Boolean)
        .forEach((cls) => body.add_class(cls));
    }
    let hasBodyContent = false;
    const addBodyContent = (content) => {
      if (content == null) return;
      appendContent(context, body, content);
      hasBodyContent = true;
    };
    if (typeof section.render === "function") {
      addBodyContent(section.render({ context, section }));
    }
    if (section.content) {
      addBodyContent(section.content);
    }
    if (Array.isArray(section.children) && section.children.length) {
      addBodyContent(section.children);
    }
    if (section.footer) {
      const footer = new jsgui.div({ context, class: "dashboard-panel__footer" });
      appendContent(context, footer, section.footer);
      body.add(footer);
      hasBodyContent = true;
    }
    if (hasBodyContent) {
      panel.add(body);
    }
    grid.add(panel);
  });
  return grid;
}

function createStyleTag(context, cssText) {
  const styleCtrl = new jsgui.Control({ context, tagName: "style" });
  styleCtrl.add(new StringControl({ context, text: cssText }));
  return styleCtrl;
}

function createPagerButton(context, { label, href, disabled, kind, position }) {
  const button = new PagerButtonControl({
    context,
    text: label,
    kind,
    disabled: disabled || !href,
    title: label,
    href
  });
  button.setHref(href);
  button.dom.attributes["data-pager-link"] = kind;
  if (position) {
    button.dom.attributes["data-pager-position"] = position;
  }
  return button;
}

function createPaginationNav(context, pagination, position = "primary") {
  if (!pagination) return null;
  const nav = new jsgui.Control({ context, tagName: "nav" });
  nav.add_class("pager");
  nav.dom.attributes["data-pager"] = position;
  const info = new jsgui.p({ context, class: "pager__info" });
  info.dom.attributes["data-pager-info"] = position;
  const { currentPage, totalPages, startRow, endRow, totalRows } = pagination;
  const startDisplay = totalRows === 0 ? 0 : startRow;
  const endDisplay = totalRows === 0 ? 0 : endRow;
  const summary = `Page ${currentPage} of ${totalPages} • Rows ${startDisplay}-${endDisplay} of ${totalRows}`;
  info.add(new StringControl({ context, text: summary }));
  const buttons = new jsgui.div({ context, class: "pager__buttons" });
  const buttonConfigs = [
    { kind: "first", label: "<< First", href: pagination.firstHref, disabled: currentPage === 1 },
    { kind: "prev", label: "< Previous", href: pagination.prevHref, disabled: currentPage === 1 },
    { kind: "next", label: "Next >", href: pagination.nextHref, disabled: currentPage === totalPages },
    { kind: "last", label: "Last >>", href: pagination.lastHref, disabled: currentPage === totalPages }
  ];
  buttonConfigs.forEach((config) => buttons.add(createPagerButton(context, { ...config, position })));
  nav.add(info);
  nav.add(buttons);
  return nav;
}

function createPrimaryNav(context, navLinks) {
  if (!Array.isArray(navLinks) || navLinks.length === 0) return null;
  const filtered = navLinks.filter((link) => link && link.label);
  if (!filtered.length) return null;
  const nav = new jsgui.Control({ context, tagName: "nav" });
  nav.add_class("primary-nav");
  filtered.forEach((link) => {
    const anchor = new jsgui.Control({ context, tagName: "a" });
    anchor.add_class("primary-nav__link");
    anchor.add(new StringControl({ context, text: link.label }));
    if (link.href) {
      anchor.dom.attributes.href = link.href;
    } else {
      anchor.dom.attributes["aria-disabled"] = "true";
    }
    if (link.active) {
      anchor.add_class("primary-nav__link--active");
    }
    nav.add(anchor);
  });
  return nav;
}

function createBreadcrumbsNav(context, crumbs) {
  if (!Array.isArray(crumbs) || crumbs.length === 0) return null;
  const items = crumbs.filter((crumb) => crumb && crumb.label);
  if (!items.length) return null;
  const nav = new jsgui.Control({ context, tagName: "nav" });
  nav.add_class("breadcrumbs");
  items.forEach((crumb, index) => {
    if (index > 0) {
      nav.add(new jsgui.span({ context, class: "breadcrumbs__sep", text: "/" }));
    }
    if (crumb.href) {
      const anchor = new jsgui.Control({ context, tagName: "a" });
      anchor.add_class("breadcrumbs__link");
      anchor.dom.attributes.href = crumb.href;
      anchor.add(new StringControl({ context, text: crumb.label }));
      nav.add(anchor);
    } else {
      const span = new jsgui.span({ context, class: "breadcrumbs__current", text: crumb.label });
      nav.add(span);
    }
  });
  return nav;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbPath = resolveDbPath(args.db);
  const limit = Number.isFinite(args.limit) && args.limit > 0 ? Math.min(args.limit, 5000) : 1000;
  const title = args.title || "Crawler URL Snapshot";
  const db = openNewsDb(dbPath);
  let rawRows = [];
  let totals = null;
  let homeCards = [];
  try {
    rawRows = selectInitialUrls(db.db, { limit });
    totals = buildUrlTotals(db.db);
    homeCards = buildCliHomeCards(db.db, totals);
  } finally {
    try {
      db.close();
    } catch (_) {}
  }

  const columns = buildColumns();
  const rows = buildDisplayRows(rawRows);
  const projectRoot = findProjectRoot(__dirname);
  const relativeDb = path.relative(projectRoot, dbPath) || path.basename(dbPath);
  const meta = {
    rowCount: rows.length,
    limit,
    dbLabel: relativeDb,
    generatedAt: formatDateTime(new Date(), true),
    subtitle: `First ${rows.length} URLs from ${relativeDb}`
  };

  const html = renderHtml({ columns, rows, meta, title }, { homeCards });

  if (args.output) {
    const target = path.isAbsolute(args.output) ? args.output : path.resolve(process.cwd(), args.output);
    fs.writeFileSync(target, html, "utf8");
    console.error(`Saved HTML table to ${target}`);
  } else {
    process.stdout.write(html);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Failed to render URL table:", error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  resolveDbPath,
  buildColumns,
  buildDisplayRows,
  renderHtml,
  formatDateTime,
  buildIndexCell
};
