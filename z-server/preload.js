const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  scanServers: () => ipcRenderer.invoke('scan-servers'),
  startServer: (filePath) => ipcRenderer.invoke('start-server', filePath),
  stopServer: (filePath) => ipcRenderer.invoke('stop-server', filePath),
  openInBrowser: (url) => ipcRenderer.invoke('open-in-browser', url),
  onServerLog: (callback) => ipcRenderer.on('server-log', (_event, value) => callback(value)),
  onServerStatusChange: (callback) => ipcRenderer.on('server-status-change', (_event, value) => callback(value)),
  onScanProgress: (callback) => ipcRenderer.on('scan-progress', (_event, value) => callback(value)),
  onServerStartupError: (callback) => ipcRenderer.on('server-startup-error', (_event, value) => callback(value))
});
