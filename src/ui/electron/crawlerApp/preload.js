'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('crawlerAPI', {
  // Crawl control
  startCrawl: () => ipcRenderer.invoke('crawl:start'),
  stopCrawl: () => ipcRenderer.invoke('crawl:stop'),
  
  // Configuration
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (config) => ipcRenderer.invoke('config:set', config),
  
  // State
  getState: () => ipcRenderer.invoke('state:get'),
  
  // URL list and analysis
  getUrls: () => ipcRenderer.invoke('urls:get'),
  analyzeUrl: (url) => ipcRenderer.invoke('url:analyze', url),
  
  // Database
  getDbStats: () => ipcRenderer.invoke('db:stats'),
  clearCache: () => ipcRenderer.invoke('db:clear-cache'),
  getContent: (url) => ipcRenderer.invoke('url:content', url),
  
  // Utilities
  exportUrls: (urls) => ipcRenderer.invoke('urls:export', urls),
  openLogs: () => ipcRenderer.invoke('logs:open'),
  openExternal: (url) => ipcRenderer.invoke('shell:open', url),
  
  // Updates
  onUpdate: (callback) => {
    ipcRenderer.on('crawl:update', (event, data) => callback(data));
  },
  
  // Loading overlay control
  onShowLoading: (callback) => {
    ipcRenderer.on('loading:show', (event, message) => callback(message));
  },
  onHideLoading: (callback) => {
    ipcRenderer.on('loading:hide', () => callback());
  }
});
