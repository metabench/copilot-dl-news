"use strict";

function normalizePath(p) {
  if (!p) return "";
  return String(p).replace(/\\/g, "/");
}

function getServerIdentity(server) {
  const relativeFile = normalizePath(server && server.relativeFile);
  const absoluteFile = normalizePath(server && server.file);
  const name = server && server.metadata && server.metadata.name ? String(server.metadata.name) : "";
  const description = server && server.metadata && server.metadata.description ? String(server.metadata.description) : "";

  return {
    relativeFile,
    absoluteFile,
    name,
    description,
    haystack: `${relativeFile}\n${absoluteFile}\n${name}\n${description}`.toLowerCase()
  };
}

// Category definitions with display order and styling
const CATEGORIES = {
  featured: { label: "Featured", order: 1 },
  crawler: { label: "🕷️ Crawler Tools", order: 2 },
  geo: { label: "🌍 Geo & Places", order: 3 },
  data: { label: "📊 Data & Docs", order: 4 }
};

const APP_CARDS = [
  // ─────────────────────────────────────────────────────────────────
  // Featured
  // ─────────────────────────────────────────────────────────────────
  {
    id: "unified-ui",
    title: "Unified UI",
    subtitle: "All dashboards in one shell",
    category: "featured",
    badges: ["🎯 Hub"],
    accent: "gold",
    svgPath: "ui/assets/app-cards/generic.svg",
    sidebarIcon: "ui/assets/sidebar-icons/generic.svg",
    order: 5,
    primaryAction: "start-detached",
    primaryLabel: "\u25b6 Launch (detached)",
    quickLinks: [
      { label: "\uD83D\uDDD3\uFE0F Scheduler", path: "/scheduler" },
      { label: "\uD83D\uDD77\uFE0F Crawl", path: "/crawl-observer" },
      { label: "\uD83D\uDD0E Data", path: "/data-explorer" },
      { label: "\uD83C\uDF10 Hubs", path: "/place-hubs" }
    ],
    match: ["unifiedapp", "unified-app", "unified ui", "src/ui/server/unifiedApp/server.js"]
  },

  // ─────────────────────────────────────────────────────────────────
  // Crawler Tools
  // ─────────────────────────────────────────────────────────────────
  {
    id: "crawler-monitor",
    title: "Crawler Monitor",
    subtitle: "Real-time health • workers • queues",
    category: "crawler",
    badges: ["📡 Live", "🔄 SSE"],
    accent: "topaz",
    svgPath: "ui/assets/app-cards/generic.svg",
    sidebarIcon: "ui/assets/sidebar-icons/generic.svg",
    order: 100,
    primaryAction: "start-detached",
    primaryLabel: "\u25b6 Launch",
    match: ["crawlermonitor", "crawler-monitor", "src/ui/server/crawlerMonitor/"]
  },
  {
    id: "crawl-observer",
    title: "Crawl Observer",
    subtitle: "Task events • telemetry • history",
    category: "crawler",
    badges: ["📋 Events", "🔍 Debug"],
    accent: "topaz",
    svgPath: "ui/assets/app-cards/generic.svg",
    sidebarIcon: "ui/assets/sidebar-icons/generic.svg",
    order: 101,
    primaryAction: "start-detached",
    primaryLabel: "\u25b6 Launch",
    match: ["crawlobserver", "crawl-observer", "src/ui/server/crawlObserver/"]
  },
  {
    id: "scheduler-dashboard",
    title: "Scheduler Dashboard",
    subtitle: "Schedule reconciliation • due counts",
    category: "crawler",
    badges: ["📅 Schedules", "⏰ Cron"],
    accent: "topaz",
    svgPath: "ui/assets/app-cards/generic.svg",
    sidebarIcon: "ui/assets/sidebar-icons/generic.svg",
    order: 102,
    primaryAction: "start-detached",
    primaryLabel: "\u25b6 Launch",
    match: ["schedulerdashboard", "scheduler-dashboard", "src/ui/server/schedulerDashboard/"]
  },
  {
    id: "rate-limit-dashboard",
    title: "Rate Limit Dashboard",
    subtitle: "Domain throttling • intervals • resets",
    category: "crawler",
    badges: ["🚦 Throttle", "⏱️ Limits"],
    accent: "topaz",
    svgPath: "ui/assets/app-cards/generic.svg",
    sidebarIcon: "ui/assets/sidebar-icons/generic.svg",
    order: 103,
    primaryAction: "start-detached",
    primaryLabel: "\u25b6 Launch",
    match: ["ratelimitdashboard", "rate-limit-dashboard", "src/ui/server/rateLimitDashboard/"]
  },
  {
    id: "crawl-strategies",
    title: "Crawl Strategies",
    subtitle: "Profiles • URL patterns • site configs",
    category: "crawler",
    badges: ["⚙️ Config", "🎯 Profiles"],
    accent: "topaz",
    svgPath: "ui/assets/app-cards/generic.svg",
    sidebarIcon: "ui/assets/sidebar-icons/generic.svg",
    order: 104,
    primaryAction: "start-detached",
    primaryLabel: "\u25b6 Launch",
    match: ["crawlstrategies", "crawl-strategies", "crawlStrategies", "src/ui/server/crawlStrategies/"]
  },
  {
    id: "quality-dashboard",
    title: "Quality Dashboard",
    subtitle: "Extraction quality • regressions • confidence",
    category: "crawler",
    badges: ["📈 Metrics", "🎯 Quality"],
    accent: "topaz",
    svgPath: "ui/assets/app-cards/generic.svg",
    sidebarIcon: "ui/assets/sidebar-icons/generic.svg",
    order: 105,
    primaryAction: "start-detached",
    primaryLabel: "\u25b6 Launch",
    match: ["qualitydashboard", "quality-dashboard", "src/ui/server/qualityDashboard/"]
  },

  // ─────────────────────────────────────────────────────────────────
  // Geo & Places
  // ─────────────────────────────────────────────────────────────────
  {
    id: "place-hub-guessing",
    title: "Place Hub Matrix",
    subtitle: "Hub guessing • verification • coverage",
    category: "geo",
    badges: ["🗺️ Matrix", "✓ Verify"],
    accent: "ruby",
    svgPath: "ui/assets/app-cards/gazetteer.svg",
    sidebarIcon: "ui/assets/sidebar-icons/gazetteer.svg",
    order: 200,
    // This is mounted under Unified UI, not a standalone server
    match: []  // Don't match any server file - link via Unified UI quickLinks instead
  },
  {
    id: "geo-import",
    title: "Geo Import",
    subtitle: "NDJSON • geonames • shape merges",
    category: "geo",
    badges: ["📥 Import", "🌐 GeoNames"],
    accent: "emerald",
    svgPath: "ui/assets/app-cards/geo-import.svg",
    sidebarIcon: "ui/assets/sidebar-icons/geo-import.svg",
    order: 201,
    primaryAction: "start-detached",
    primaryLabel: "\u25b6 Launch",
    match: ["geoimportserver", "geo-import", "geoimportdashboard", "src/ui/server/geoImportServer.js", "geo import dashboard"]
  },
  {
    id: "gazetteer",
    title: "Gazetteer Info",
    subtitle: "Places • regions • admin levels",
    category: "geo",
    badges: ["📍 Places", "🏛️ Admin"],
    accent: "ruby",
    svgPath: "ui/assets/app-cards/gazetteer.svg",
    sidebarIcon: "ui/assets/sidebar-icons/gazetteer.svg",
    order: 202,
    primaryAction: "start-detached",
    primaryLabel: "\u25b6 Launch",
    match: ["gazetteerinfoserver", "gazetteer-info", "src/ui/server/gazetteerInfoServer.js", "gazetteer info"]
  },

  // ─────────────────────────────────────────────────────────────────
  // Data & Docs
  // ─────────────────────────────────────────────────────────────────
  {
    id: "data-explorer",
    title: "Data Explorer",
    subtitle: "URLs • fetches • filters • decisions",
    category: "data",
    badges: ["🔍 Browse", "📊 Filter"],
    accent: "emerald",
    svgPath: "ui/assets/app-cards/data-explorer.svg",
    sidebarIcon: "ui/assets/sidebar-icons/data-explorer.svg",
    order: 300,
    primaryAction: "start-detached",
    primaryLabel: "\u25b6 Launch",
    quickLinks: [
      { label: "\uD83D\uDD17 URLs", path: "/urls" },
      { label: "\uD83D\uDCE5 Fetches", path: "/fetches" },
      { label: "\u2699\uFE0F Decisions", path: "/decisions" }
    ],
    match: ["dataexplorerserver", "data-explorer", "ui:data-explorer", "src/ui/server/dataExplorerServer.js", "data explorer"]
  },
  {
    id: "docs-viewer",
    title: "Docs Viewer",
    subtitle: "Docs • guides • sessions • diagrams",
    category: "data",
    badges: ["📖 Docs", "🗂️ Sessions"],
    accent: "sapphire",
    svgPath: "ui/assets/app-cards/docs-viewer.svg",
    sidebarIcon: "ui/assets/sidebar-icons/docs-viewer.svg",
    order: 301,
    primaryAction: "start-detached",
    primaryLabel: "\u25b6 Launch",
    quickLinks: [
      { label: "\uD83D\uDCD6 Guides", path: "/guides" },
      { label: "\uD83D\uDCC5 Sessions", path: "/sessions" },
      { label: "\uD83D\uDDFA\uFE0F Diagrams", path: "/diagrams" }
    ],
    match: ["docsviewer", "docs-viewer", "src/ui/server/docsViewer/", "ui:docs", "docs viewer"]
  },
  {
    id: "design-studio",
    title: "Design Studio",
    subtitle: "WLILO • themes • components",
    category: "data",
    badges: ["🎨 Themes", "🧩 UI"],
    accent: "amethyst",
    svgPath: "ui/assets/app-cards/design-studio.svg",
    sidebarIcon: "ui/assets/sidebar-icons/design-studio.svg",
    order: 302,
    primaryAction: "start-detached",
    primaryLabel: "\u25b6 Launch",
    match: ["designstudio", "design-studio", "src/ui/server/designStudio/", "ui:design", "design studio"]
  },
  {
    id: "diagram-atlas",
    title: "Diagram Atlas",
    subtitle: "SVG • maps • collision checks",
    category: "data",
    badges: ["🖼️ SVG", "✓ Validate"],
    accent: "topaz",
    svgPath: "ui/assets/app-cards/diagram-atlas.svg",
    sidebarIcon: "ui/assets/sidebar-icons/diagram-atlas.svg",
    order: 303,
    primaryAction: "start-detached",
    primaryLabel: "\u25b6 Launch",
    match: ["diagramatlas", "diagram-atlas", "diagramatlasserver", "src/ui/server/diagramAtlasServer.js", "diagram atlas"]
  }
];

function getAppCardSpecForServer(server) {
  const id = getServerIdentity(server);

  for (const card of APP_CARDS) {
    const hit = card.match.some((m) => id.haystack.includes(String(m).toLowerCase()));
    if (hit) {
      return {
        id: card.id,
        title: card.title,
        subtitle: card.subtitle,
        category: card.category || "data",
        badges: Array.isArray(card.badges) ? card.badges.slice() : [],
        accent: card.accent,
        svgPath: card.svgPath,
        sidebarIcon: card.sidebarIcon,
        order: card.order,
        primaryAction: card.primaryAction || null,
        primaryLabel: card.primaryLabel || null,
        quickLinks: Array.isArray(card.quickLinks) ? card.quickLinks.slice() : null,
        isMajor: true
      };
    }
  }

  const fallbackTitle = (server && server.metadata && server.metadata.name)
    ? String(server.metadata.name)
    : (id.relativeFile ? id.relativeFile.split("/").pop() : "Server");

  return {
    id: "generic",
    title: fallbackTitle || "Server",
    subtitle: (server && server.metadata && server.metadata.description) ? String(server.metadata.description) : (id.relativeFile || ""),
    category: "data",
    badges: [],
    accent: "gold",
    svgPath: "ui/assets/app-cards/generic.svg",
    sidebarIcon: "ui/assets/sidebar-icons/generic.svg",
    order: 999,
    isMajor: false
  };
}

function getMajorServersWithCards(servers) {
  if (!Array.isArray(servers)) return [];

  const matches = [];
  for (const server of servers) {
    const spec = getAppCardSpecForServer(server);
    if (spec.isMajor) {
      matches.push({ server, card: spec });
    }
  }

  matches.sort((a, b) => {
    const ao = a.card.order || 999;
    const bo = b.card.order || 999;
    if (ao !== bo) return ao - bo;
    return String(a.card.title || "").localeCompare(String(b.card.title || ""));
  });

  // De-dupe by card id (in case multiple hits exist)
  const seen = new Set();
  return matches.filter((m) => {
    if (seen.has(m.card.id)) return false;
    seen.add(m.card.id);
    return true;
  });
}

module.exports = {
  CATEGORIES,
  APP_CARDS,
  getAppCardSpecForServer,
  getMajorServersWithCards
};
