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

const APP_CARDS = [
  {
    id: "unified-ui",
    title: "Unified UI",
    subtitle: "All dashboards in one shell",
    accent: "gold",
    svgPath: "ui/assets/app-cards/generic.svg",
    sidebarIcon: "ui/assets/sidebar-icons/generic.svg",
    order: 5,
    primaryAction: "start-detached",
    primaryLabel: "\u25b6 Launch (detached)",
    quickLinks: [
      { label: "\uD83D\uDDD3\uFE0F Scheduler", path: "/scheduler" },
      { label: "\uD83D\uDD77\uFE0F Crawl", path: "/crawl-observer" },
      { label: "\uD83D\uDD0E Data", path: "/data-explorer" }
    ],
    match: ["unifiedapp", "unified-app", "unified ui", "src/ui/server/unifiedApp/server.js"]
  },
  {
    id: "data-explorer",
    title: "Data Explorer",
    subtitle: "URLs • fetches • filters • decisions",
    accent: "emerald",
    svgPath: "ui/assets/app-cards/data-explorer.svg",
    sidebarIcon: "ui/assets/sidebar-icons/data-explorer.svg",
    order: 10,
    match: ["dataexplorerserver", "data-explorer", "ui:data-explorer", "src/ui/server/dataExplorerServer.js", "data explorer"]
  },
  {
    id: "docs-viewer",
    title: "Docs Viewer",
    subtitle: "Docs • guides • sessions • diagrams",
    accent: "sapphire",
    svgPath: "ui/assets/app-cards/docs-viewer.svg",
    sidebarIcon: "ui/assets/sidebar-icons/docs-viewer.svg",
    order: 20,
    match: ["docsviewer", "docs-viewer", "src/ui/server/docsViewer/", "ui:docs", "docs viewer"]
  },
  {
    id: "design-studio",
    title: "Design Studio",
    subtitle: "WLILO • themes • components",
    accent: "amethyst",
    svgPath: "ui/assets/app-cards/design-studio.svg",
    sidebarIcon: "ui/assets/sidebar-icons/design-studio.svg",
    order: 30,
    match: ["designstudio", "design-studio", "src/ui/server/designStudio/", "ui:design", "design studio"]
  },
  {
    id: "diagram-atlas",
    title: "Diagram Atlas",
    subtitle: "SVG • maps • collision checks",
    accent: "topaz",
    svgPath: "ui/assets/app-cards/diagram-atlas.svg",
    sidebarIcon: "ui/assets/sidebar-icons/diagram-atlas.svg",
    order: 40,
    match: ["diagramatlas", "diagram-atlas", "diagramatlasserver", "src/ui/server/diagramAtlasServer.js", "diagram atlas"]
  },
  {
    id: "geo-import",
    title: "Geo Import",
    subtitle: "NDJSON • geonames • shape merges",
    accent: "emerald",
    svgPath: "ui/assets/app-cards/geo-import.svg",
    sidebarIcon: "ui/assets/sidebar-icons/geo-import.svg",
    order: 50,
    match: ["geoimportserver", "geo-import", "geoimportdashboard", "src/ui/server/geoImportServer.js", "geo import dashboard"]
  },
  {
    id: "gazetteer",
    title: "Gazetteer Info",
    subtitle: "Places • regions • admin levels",
    accent: "ruby",
    svgPath: "ui/assets/app-cards/gazetteer.svg",
    sidebarIcon: "ui/assets/sidebar-icons/gazetteer.svg",
    order: 60,
    match: ["gazetteerinfoserver", "gazetteer-info", "src/ui/server/gazetteerInfoServer.js", "gazetteer info"]
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
  APP_CARDS,
  getAppCardSpecForServer,
  getMajorServersWithCards
};
