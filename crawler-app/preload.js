'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('crawlerAPI', {
  // Crawl events
  onProgress: (callback) => ipcRenderer.on('crawl-progress', (_, data) => callback(data)),
  onLog: (callback) => ipcRenderer.on('crawl-log', (_, text) => callback(text)),
  onStarted: (callback) => ipcRenderer.on('crawl-started', (_, config) => callback(config)),
  onComplete: (callback) => ipcRenderer.on('crawl-complete', (_, data) => callback(data)),
  onError: (callback) => ipcRenderer.on('crawl-error', (_, error) => callback(error)),
  
  // Crawl controls
  stopCrawl: () => ipcRenderer.send('stop-crawl'),
  startCrawl: () => ipcRenderer.send('start-crawl'),
  
  // Config
  onConfigUpdate: (callback) => ipcRenderer.on('config-update', (_, config) => callback(config)),
  updateConfig: (config) => ipcRenderer.send('update-config', config),
  getConfig: () => ipcRenderer.send('get-config'),
  
  // Article stats
  onArticleStats: (callback) => ipcRenderer.on('article-stats', (_, stats) => callback(stats)),
  refreshStats: () => ipcRenderer.send('refresh-stats')
});
