const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  scanServers: (options) => ipcRenderer.invoke('scan-servers', options || null),
  startServer: (filePath, options) => ipcRenderer.invoke('start-server', filePath, options),
  stopServer: (filePath, detectedPid) => ipcRenderer.invoke('stop-server', filePath, detectedPid),
  openInBrowser: (url) => ipcRenderer.invoke('open-in-browser', url),
  getActivityLogs: (count) => ipcRenderer.invoke('get-activity-logs', count),
  getPortStatus: () => ipcRenderer.invoke('get-port-status'),
  getUiClientStatus: () => ipcRenderer.invoke('ui-client-status'),
  rebuildUiClient: (options) => ipcRenderer.invoke('ui-client-rebuild', options),
  onServerLog: (callback) => {
    const handler = (_event, value) => callback(value);
    ipcRenderer.on('server-log', handler);
    return () => ipcRenderer.removeListener('server-log', handler);
  },
  onServerStatusChange: (callback) => {
    const handler = (_event, value) => callback(value);
    ipcRenderer.on('server-status-change', handler);
    return () => ipcRenderer.removeListener('server-status-change', handler);
  },
  onScanProgress: (callback) => {
    const handler = (_event, value) => callback(value);
    ipcRenderer.on('scan-progress', handler);
    return () => ipcRenderer.removeListener('scan-progress', handler);
  }
});
