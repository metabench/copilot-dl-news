const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  scanServers: () => ipcRenderer.invoke('scan-servers'),
  startServer: (filePath) => ipcRenderer.invoke('start-server', filePath),
  stopServer: (filePath, detectedPid) => ipcRenderer.invoke('stop-server', filePath, detectedPid),
  openInBrowser: (url) => ipcRenderer.invoke('open-in-browser', url),
  getActivityLogs: (count) => ipcRenderer.invoke('get-activity-logs', count),
  getPortStatus: () => ipcRenderer.invoke('get-port-status'),
  onServerLog: (callback) => ipcRenderer.on('server-log', (_event, value) => callback(value)),
  onServerStatusChange: (callback) => ipcRenderer.on('server-status-change', (_event, value) => callback(value)),
  onScanProgress: (callback) => ipcRenderer.on('scan-progress', (_event, value) => callback(value))
});
