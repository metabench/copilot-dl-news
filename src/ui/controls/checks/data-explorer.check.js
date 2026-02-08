#!/usr/bin/env node
"use strict";

/**
 * Data Explorer Controls Check
 * 
 * Renders all Data Explorer controls and outputs HTML for visual verification.
 * Run: node src/ui/controls/checks/data-explorer.check.js > checks/html-outputs/data-explorer.check.html
 */

const jsgui = require("jsgui3-html");
const {
  DataExplorerPanel,
  DataExplorerTabs,
  DataExplorerUrlList,
  DataExplorerHistory,
  DataExplorerMetadata,
  DataExplorerCSS
} = require("../uiKit/dataExplorer");

// Mock data
const mockUrls = [
  { id: 1, url: "https://theguardian.com/world/2026/jan/03/breaking-news-article", status: 200, size: 127456, fetchedAt: "2026-01-03T14:23:45Z", downloadCount: 3 },
  { id: 2, url: "https://theguardian.com/uk-news/article/latest-update", status: 200, size: 98234, fetchedAt: "2026-01-03T14:23:42Z", downloadCount: 1 },
  { id: 3, url: "https://bbc.com/news/world-europe-breaking", status: 200, size: 156789, fetchedAt: "2026-01-03T14:22:58Z", downloadCount: 4 },
  { id: 4, url: "https://reuters.com/world/asia/china-economy", status: 304, size: 0, fetchedAt: "2026-01-03T14:22:45Z", downloadCount: 2 },
  { id: 5, url: "https://nytimes.com/2026/01/03/world/article.html", status: 404, size: 0, fetchedAt: "2026-01-03T14:22:30Z", downloadCount: 1 }
];

const mockDownloads = [
  { id: 101, status: 200, size: 127456, fetchedAt: "2026-01-03T14:23:45.234Z", ttfb: 234, totalTime: 456, contentType: "text/html" },
  { id: 102, status: 200, size: 118234, fetchedAt: "2026-01-02T09:15:22.123Z", ttfb: 189, totalTime: 412, contentType: "text/html" },
  { id: 103, status: 200, size: 122567, fetchedAt: "2025-12-28T16:45:10.567Z", ttfb: 267, totalTime: 534, contentType: "text/html" }
];

const mockMetadata = {
  id: 101,
  responseId: 1247856,
  urlId: 45231,
  status: 200,
  statusText: "OK",
  contentType: "text/html; charset=utf-8",
  contentLength: 127456,
  fetchedAt: "2026-01-03T14:23:45.234Z",
  ttfb: 234,
  totalTime: 456,
  dnsTime: 45,
  connectTime: 89,
  downloadTime: 88,
  compression: "gzip → 42% savings",
  cacheStatus: "MISS",
  headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "max-age=60",
    "ETag": '"abc123def456"',
    "Last-Modified": "Fri, 03 Jan 2026 14:20:00 GMT",
    "X-Frame-Options": "SAMEORIGIN",
    "Content-Encoding": "gzip"
  }
};

function render() {
  const context = new jsgui.Page_Context();

  // Container
  const page = new jsgui.div({ context, class: "dex-root" });
  page.dom.attributes.style = "padding: 24px; background: #0a0d14; min-height: 100vh;";

  // Title
  const title = new jsgui.Control({ context, tagName: "h1" });
  title.dom.attributes.style = "color: #c9a227; font-family: Georgia, serif; margin-bottom: 32px;";
  title.add(new jsgui.String_Control({ context, text: "📊 Data Explorer UI Kit Check" }));
  page.add(title);

  // Section: Panel with Tabs and URL List
  const section1 = new jsgui.div({ context });
  section1.dom.attributes.style = "margin-bottom: 48px;";
  
  const panel1 = new DataExplorerPanel({
    context,
    title: "Data Explorer",
    subtitle: "Browse and analyze downloaded content",
    icon: "📊",
    variant: "gold",
    actions: [
      { label: "⚙️ Advanced", id: "toggleAdvanced" }
    ]
  });

  // Add tabs
  const tabs = new DataExplorerTabs({
    context,
    tabs: [
      { id: "recent", label: "Recent", count: 42, active: true },
      { id: "queue", label: "Queue", count: 156, variant: "warning" },
      { id: "errors", label: "Errors", count: 3, variant: "error" }
    ]
  });
  panel1.addContent(tabs);

  // Add search placeholder
  const search = new jsgui.div({ context });
  search.dom.attributes.style = "margin: 16px 0; padding: 10px 16px; background: rgba(20,24,36,0.6); border: 1px solid rgba(51,65,85,0.4); border-radius: 6px; color: #64748b; font-size: 13px;";
  search.add(new jsgui.String_Control({ context, text: "🔍 Filter URLs..." }));
  panel1.addContent(search);

  // Add URL list
  const urlList = new DataExplorerUrlList({
    context,
    urls: mockUrls,
    selectedId: 1,
    pagination: { current: 1, total: 23, totalItems: 550 }
  });
  panel1.addContent(urlList);

  section1.add(panel1);
  page.add(section1);

  // Section: History Panel
  const section2 = new jsgui.div({ context });
  section2.dom.attributes.style = "margin-bottom: 48px;";
  
  const panel2 = new DataExplorerPanel({
    context,
    title: "Download History",
    subtitle: "All downloads for this URL",
    icon: "📜",
    variant: "emerald"
  });

  const history = new DataExplorerHistory({
    context,
    url: "https://theguardian.com/world/2026/jan/03/breaking-news-article",
    urlId: 45231,
    downloads: mockDownloads,
    selectedDownloadId: 101,
    onBack: "goBack()"
  });
  panel2.addContent(history);

  section2.add(panel2);
  page.add(section2);

  // Section: Metadata Panel
  const section3 = new jsgui.div({ context });
  section3.dom.attributes.style = "margin-bottom: 48px;";
  
  const panel3 = new DataExplorerPanel({
    context,
    title: "Download Details",
    subtitle: "Full metadata for this download",
    icon: "🔬",
    variant: "sapphire"
  });

  const metadata = new DataExplorerMetadata({
    context,
    download: mockMetadata,
    onBack: "goBackToHistory()",
    showHeaders: true
  });
  panel3.addContent(metadata);

  section3.add(panel3);
  page.add(section3);

  return page.all_html_render();
}

function buildFullHTML() {
  const content = render();
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Data Explorer UI Kit Check</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: "Inter", system-ui, sans-serif;
      background: #050508;
    }
    ${DataExplorerCSS}
  </style>
</head>
<body>
  ${content}
</body>
</html>`;
}

// Output HTML
console.log(buildFullHTML());
