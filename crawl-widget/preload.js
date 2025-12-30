/**
 * Crawl Widget - Preload Script
 * Exposes safe APIs to the renderer process
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('crawlAPI', {
  // Crawl control
  getCrawlTypes: () => ipcRenderer.invoke('get-crawl-types'),
  startCrawl: (options) => ipcRenderer.invoke('start-crawl', options),
  togglePause: () => ipcRenderer.invoke('toggle-pause'),
  stopCrawl: () => ipcRenderer.invoke('stop-crawl'),
  getCrawlStatus: () => ipcRenderer.invoke('get-crawl-status'),
  
  // News sources (with favicons)
  getNewsSources: () => ipcRenderer.invoke('get-news-sources'),
  fetchMissingFavicons: () => ipcRenderer.invoke('fetch-missing-favicons'),
  addNewsSource: (options) => ipcRenderer.invoke('add-news-source', options),
  
  // Telemetry
  connectTelemetry: (options) => ipcRenderer.invoke('connect-telemetry', options),
  getTelemetryInfo: () => ipcRenderer.invoke('get-telemetry-info'),

  // Place hubs
  listPlaceHubs: (options) => ipcRenderer.invoke('list-place-hubs', options),
  guessPlaceHubs: (options) => ipcRenderer.invoke('guess-place-hubs', options),
  
  // Window control
  closeWidget: () => ipcRenderer.invoke('close-widget'),
  minimizeWidget: () => ipcRenderer.invoke('minimize-widget'),

  // Tools
  openDataExplorer: () => ipcRenderer.invoke('open-data-explorer'),
  openDecisionTrees: () => ipcRenderer.invoke('open-decision-trees'),
  openTelemetryHealth: () => ipcRenderer.invoke('open-telemetry-health'),
  
  // Event listeners
  onCrawlLog: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('crawl-log', handler);
    return () => ipcRenderer.removeListener('crawl-log', handler);
  },
  onCrawlProgress: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('crawl-progress', handler);
    return () => ipcRenderer.removeListener('crawl-progress', handler);
  },
  onCrawlStopped: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('crawl-stopped', handler);
    return () => ipcRenderer.removeListener('crawl-stopped', handler);
  },
  onCrawlError: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('crawl-error', handler);
    return () => ipcRenderer.removeListener('crawl-error', handler);
  },
  onFaviconProgress: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('favicon-progress', handler);
    return () => ipcRenderer.removeListener('favicon-progress', handler);
  }
});
