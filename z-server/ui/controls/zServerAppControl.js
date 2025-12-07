"use strict";

function createZServerAppControl(jsgui, { TitleBarControl, SidebarControl, ContentAreaControl }) {
  class ZServerAppControl extends jsgui.Control {
    constructor(spec = {}) {
      const normalized = {
        ...spec,
        tagName: "div",
        __type_name: "zserver_app"
      };
      super(normalized);
      this.add_class("zs-app");
      
      this._servers = [];
      this._selectedServer = null;
      this._logs = new Map();
      
      this._api = spec.api || null;
      
      if (!spec.el) {
        this.compose();
      }
    }

    compose() {
      const ctx = this.context;
      
      this._titleBar = new TitleBarControl({ context: ctx });
      this.add(this._titleBar);
      
      const container = new jsgui.div({ context: ctx, class: "zs-container" });
      
      this._sidebar = new SidebarControl({
        context: ctx,
        servers: this._servers,
        onSelect: (s) => this._selectServer(s),
        onOpenUrl: (url) => this._openInBrowser(url)
      });
      container.add(this._sidebar);
      
      this._contentArea = new ContentAreaControl({
        context: ctx,
        onStart: () => this._startServer(),
        onStop: () => this._stopServer(),
        onUrlDetected: (filePath, url) => this._setServerUrl(filePath, url),
        onOpenUrl: (url) => this._openInBrowser(url)
      });
      container.add(this._contentArea);
      
      this.add(container);
    }

    async init() {
      if (!this._api) {
        console.error("No electronAPI provided");
        return;
      }
      
      try {
        this._contentArea.setScanning(true);
        console.log("[ZServerApp] Starting scan...");
        
        this._api.onScanProgress((progress) => {
          console.log("[ZServerApp] Scan progress:", progress);
          if (progress.type === 'count') {
            this._contentArea.setScanTotal(progress.total);
          } else if (progress.type === 'progress') {
            this._contentArea.setScanProgress(progress.current, progress.total, progress.file);
          }
        });
        
        this._servers = await this._api.scanServers();
        console.log("[ZServerApp] Scan complete, found servers:", this._servers.length, this._servers);
        
        for (const server of this._servers) {
          if (server.running && server.detectedPort) {
            const url = `http://localhost:${server.detectedPort}`;
            server.runningUrl = url;
            this._addLog(server.file, 'system', `\u2713 Server detected as already running on port ${server.detectedPort}`);
            this._addLog(server.file, 'system', `\ud83d\udccd URL: ${url}`);
          }
        }
        
        this._sidebar.setServers(this._servers);
        console.log("[ZServerApp] Servers set on sidebar");
        
        this._api.onServerLog(({ filePath, type, data }) => {
          this._addLog(filePath, type, data);
        });
        
        this._api.onServerStatusChange(({ filePath, running }) => {
          this._updateServerStatus(filePath, running);
        });
      } catch (error) {
        console.error("Failed to scan servers:", error);
        this._contentArea.addLog("stderr", `Failed to scan servers: ${error.message}`);
      } finally {
        this._contentArea.setScanning(false);
      }
    }

    _selectServer(server) {
      this._selectedServer = server;
      this._contentArea.setSelectedServer(server);
      
      const serverLogs = this._logs.get(server.file) || [];
      this._contentArea.setLogs(serverLogs);
      
      if (server.running && server.runningUrl) {
        this._contentArea.setRunningUrl(server.runningUrl);
        this._sidebar.setServerRunningUrl(server.file, server.runningUrl);
      }
    }

    _addLog(filePath, type, data) {
      console.log("[ZServerApp] _addLog called:", { filePath, type, dataLen: data?.length });
      
      if (!this._logs.has(filePath)) {
        this._logs.set(filePath, []);
      }
      this._logs.get(filePath).push({ type, data });
      
      const isSelectedServer = this._selectedServer && this._selectedServer.file === filePath;
      console.log("[ZServerApp] _addLog isSelectedServer:", isSelectedServer, 
        "selected:", this._selectedServer?.file, 
        "incoming:", filePath);
      
      if (isSelectedServer) {
        this._contentArea.addLog(type, data);
        
        if (type === 'stderr' && data.includes('EADDRINUSE')) {
          const portMatch = data.match(/(?:port\s+)?(\d{4,5})/i);
          const port = portMatch ? portMatch[1] : this._selectedServer.metadata?.defaultPort;
          
          if (port) {
            const url = `http://localhost:${port}`;
            this._addLog(filePath, 'system', `\u26a0\ufe0f Port ${port} is already in use by another process.`);
            this._addLog(filePath, 'system', `\ud83d\udccd The server might already be running at: ${url}`);
            this._setServerUrl(filePath, url);
          } else {
            this._addLog(filePath, 'system', '⚠️ Port is already in use. Server may already be running.');
          }
        }
      }
    }

    _setServerUrl(filePath, url) {
      this._sidebar.setServerRunningUrl(filePath, url);
      
      if (this._selectedServer && this._selectedServer.file === filePath) {
        this._contentArea.setRunningUrl(url);
      }
      
      const server = this._servers.find(s => s.file === filePath);
      if (server) {
        server.runningUrl = url;
      }
    }

    _updateServerStatus(filePath, running) {
      const server = this._servers.find(s => s.file === filePath);
      if (server) {
        server.running = running;
        if (!running) server.pid = null;
        
        this._sidebar.updateServerStatus(filePath, running);
        
        if (this._selectedServer && this._selectedServer.file === filePath) {
          this._contentArea.setServerRunning(running);
        }
      }
    }

    async _startServer() {
      if (!this._selectedServer || !this._api) return;
      
      this._addLog(this._selectedServer.file, "system", "Starting server...");
      
      const result = await this._api.startServer(this._selectedServer.file);
      
      if (result.success) {
        this._selectedServer.running = true;
        this._selectedServer.pid = result.pid;
        this._contentArea.setServerRunning(true);
        this._sidebar.updateServerStatus(this._selectedServer.file, true);
        this._addLog(this._selectedServer.file, "system", `Server started (PID: ${result.pid})`);
      } else {
        if (result.message === 'Already running') {
          this._selectedServer.running = true;
          this._contentArea.setServerRunning(true);
          this._sidebar.updateServerStatus(this._selectedServer.file, true);
          
          const port = this._selectedServer.metadata?.defaultPort;
          const url = port ? `http://localhost:${port}` : null;
          
          this._addLog(this._selectedServer.file, "system", "⚠️ Server is already running!");
          
          if (url) {
            this._setServerUrl(this._selectedServer.file, url);
            this._addLog(this._selectedServer.file, "system", `\ud83d\udccd Click to open: ${url}`);
          } else {
            this._addLog(this._selectedServer.file, "system", "Check the server log output for the URL.");
          }
        } else {
          this._addLog(this._selectedServer.file, "stderr", `Failed to start: ${result.message}`);
        }
      }
    }

    async _stopServer() {
      if (!this._selectedServer || !this._api) return;
      
      this._addLog(this._selectedServer.file, "system", "Stopping server...");
      
      const result = await this._api.stopServer(this._selectedServer.file, this._selectedServer.pid);
      
      if (result.success) {
        this._selectedServer.running = false;
        this._selectedServer.pid = null;
        this._contentArea.setServerRunning(false);
        this._sidebar.updateServerStatus(this._selectedServer.file, false);
        this._addLog(this._selectedServer.file, "system", result.wasExternal ? "External server stopped" : "Server stopped");
      } else {
        this._addLog(this._selectedServer.file, "stderr", `Failed to stop: ${result.message}`);
      }
    }

    async _openInBrowser(url) {
      if (!this._api || !url) return;
      
      this._addLog(this._selectedServer?.file || "system", "system", `Opening ${url} in browser...`);
      
      try {
        const result = await this._api.openInBrowser(url);
        if (result.success) {
          this._addLog(this._selectedServer?.file || "system", "system", `Opened in ${result.browser}`);
        }
      } catch (error) {
        this._addLog(this._selectedServer?.file || "system", "stderr", `Failed to open browser: ${error.message}`);
      }
    }

    activate() {
      this._sidebar.activate();
      this._contentArea.activate();
    }
  }

  return ZServerAppControl;
}

module.exports = { createZServerAppControl };
