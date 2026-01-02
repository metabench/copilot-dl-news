"use strict";

const { splitJsonlChunk, tryFormatTelemetryLine } = require("../lib/telemetryJsonl");

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
      this._jsonlBuffers = new Map();

      this._scanTotal = 0;
      this._scanCurrent = 0;
      this._scanLastFile = "";
      
      this._api = spec.api || null;

      this._autoRebuildUiClient = false;

      this._keepRunningAfterExit = false;

      this._scanVisibility = {
        ui: true,
        labs: false,
        api: false,
        tools: false,
        tests: false,
        checks: false,
        other: false
      };

      this._scanInFlight = false;
      this._scanProgressUnsub = null;

      this._debug = false;
      
      if (!spec.el) {
        this.compose();
      }
    }

    _loadDebugSetting() {
      try {
        const raw = globalThis.localStorage && globalThis.localStorage.getItem("zserver:debug");
        return raw === "1" || raw === "true";
      } catch {
        return false;
      }
    }

    _debugLog(...args) {
      if (this._debug !== true) return;
      // eslint-disable-next-line no-console
      console.log(...args);
    }

    _loadAutoRebuildUiClientSetting() {
      try {
        const raw = globalThis.localStorage && globalThis.localStorage.getItem("zserver:autoRebuildUiClient");
        return raw === "1" || raw === "true";
      } catch {
        return false;
      }
    }

    _loadKeepRunningAfterExitSetting() {
      try {
        const raw = globalThis.localStorage && globalThis.localStorage.getItem("zserver:keepRunningAfterExit");
        return raw === "1" || raw === "true";
      } catch {
        return false;
      }
    }

    _loadScanVisibilitySetting() {
      try {
        const raw = globalThis.localStorage && globalThis.localStorage.getItem("zserver:scanVisibility");
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;
        return parsed;
      } catch {
        return null;
      }
    }

    _saveScanVisibilitySetting(visibility) {
      try {
        if (!globalThis.localStorage) return;
        globalThis.localStorage.setItem("zserver:scanVisibility", JSON.stringify(visibility));
      } catch {
        // Best-effort only.
      }
    }

    _normalizeScanVisibility(visibility) {
      const defaults = this._scanVisibility;
      const next = { ...defaults, ...(visibility && typeof visibility === "object" ? visibility : null) };
      for (const key of Object.keys(defaults)) {
        next[key] = next[key] === true;
      }
      return next;
    }

    _saveAutoRebuildUiClientSetting(enabled) {
      try {
        if (!globalThis.localStorage) return;
        globalThis.localStorage.setItem("zserver:autoRebuildUiClient", enabled ? "1" : "0");
      } catch {
        // Best-effort only.
      }
    }

    _saveKeepRunningAfterExitSetting(enabled) {
      try {
        if (!globalThis.localStorage) return;
        globalThis.localStorage.setItem("zserver:keepRunningAfterExit", enabled ? "1" : "0");
      } catch {
        // Best-effort only.
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
        onOpenUrl: (url) => this._openInBrowser(url),
        scanVisibility: this._scanVisibility,
        onChangeScanVisibility: (visibility) => this._setScanVisibility(visibility)
      });
      container.add(this._sidebar);
      
      this._contentArea = new ContentAreaControl({
        context: ctx,
        onStart: () => this._startServer(),
        onStop: () => this._stopServer(),
        onRestart: () => this._restartServer(),
        onUrlDetected: (filePath, url) => this._setServerUrl(filePath, url),
        onOpenUrl: (url) => this._openInBrowser(url),
        onSelectServer: (server) => this._selectServer(server),
        onQuickStartServer: (server, options) => this._quickStartServer(server, options),
        autoRebuildUiClient: this._autoRebuildUiClient,
        onRebuildUiClient: () => this._rebuildUiClient(),
        onToggleAutoRebuildUiClient: (enabled) => this._setAutoRebuildUiClient(enabled),
        keepRunningAfterExit: this._keepRunningAfterExit,
        onToggleKeepRunningAfterExit: (enabled) => this._setKeepRunningAfterExit(enabled)
      });
      container.add(this._contentArea);
      
      this.add(container);
    }

    async init() {
      if (!this._api) {
        console.error("No electronAPI provided");
        return;
      }

      this._debug = this._loadDebugSetting();
      this._autoRebuildUiClient = this._loadAutoRebuildUiClientSetting();
      this._contentArea.setAutoRebuildUiClient(this._autoRebuildUiClient);

      this._keepRunningAfterExit = this._loadKeepRunningAfterExitSetting();
      if (this._contentArea && typeof this._contentArea.setKeepRunningAfterExit === "function") {
        this._contentArea.setKeepRunningAfterExit(this._keepRunningAfterExit);
      }

      const savedVisibility = this._loadScanVisibilitySetting();
      if (savedVisibility) {
        this._scanVisibility = this._normalizeScanVisibility(savedVisibility);
        if (this._sidebar && typeof this._sidebar.setScanVisibility === "function") {
          this._sidebar.setScanVisibility(this._scanVisibility);
        }
      }
      
      try {
        if (!this._scanProgressUnsub) {
          this._scanProgressUnsub = this._api.onScanProgress((progress) => {
            this._debugLog("[ZServerApp] Scan progress:", progress);
            if (progress.type === 'count-start') {
              this._scanTotal = 0;
              this._scanCurrent = 0;
              this._scanLastFile = "";
              this._contentArea.setScanCounting();
            } else if (progress.type === 'count-progress') {
              this._scanCurrent = progress.current || 0;
              this._scanLastFile = progress.file || "";
              this._contentArea.setScanCountingProgress(progress.current, progress.file);
            } else if (progress.type === 'count') {
              this._scanTotal = progress.total || 0;
              this._scanCurrent = 0;
              this._contentArea.setScanTotal(progress.total);
            } else if (progress.type === 'progress') {
              this._scanTotal = progress.total || this._scanTotal;
              this._scanCurrent = progress.current || 0;
              this._scanLastFile = progress.file || "";
              this._contentArea.setScanProgress(progress.current, progress.total, progress.file);
            } else if (progress.type === 'complete') {
              // Make completion visually truthful even if we hide the indicator immediately after.
              if (this._scanTotal > 0 && this._scanCurrent < this._scanTotal) {
                this._contentArea.setScanProgress(this._scanTotal, this._scanTotal, this._scanLastFile);
              }
            }
          });
        }

        await this._scanAndPopulateServers();

        for (const server of this._servers) {
          if (server.running && server.detectedPort) {
            const url = `http://localhost:${server.detectedPort}`;
            this._addLog(server.file, 'system', `\u2713 Server detected as already running on port ${server.detectedPort}`);
            this._addLog(server.file, 'system', `\ud83d\udccd URL: ${url}`);
          }
        }
        
        this._debugLog("[ZServerApp] Servers set on sidebar");

        if (!this._serverLogUnsub) {
          this._serverLogUnsub = this._api.onServerLog(({ filePath, type, data }) => {
            this._addLog(filePath, type, data);
          });
        }

        if (!this._serverStatusUnsub) {
          this._serverStatusUnsub = this._api.onServerStatusChange((payload) => {
            this._updateServerStatus(payload);
          });
        }
      } catch (error) {
        console.error("Failed to scan servers:", error);
        this._contentArea.addLog("stderr", `Failed to scan servers: ${error.message}`);
      } finally {
        this._contentArea.setScanning(false);
        this._scanInFlight = false;
      }
    }

    async _scanAndPopulateServers() {
      this._scanTotal = 0;
      this._scanCurrent = 0;
      this._scanLastFile = "";

      this._scanInFlight = true;
      this._contentArea.setScanning(true);
      this._debugLog("[ZServerApp] Starting scan...", this._scanVisibility);

      const scanned = await this._api.scanServers({ visibility: this._scanVisibility });
      for (const server of scanned) {
        if (server && server.running && server.detectedPort) {
          server.runningUrl = `http://localhost:${server.detectedPort}`;
        }
      }
      this._servers = scanned;
      this._debugLog("[ZServerApp] Scan complete, found servers:", this._servers.length);

      this._sidebar.setServers(this._servers);
      this._contentArea.setServers(this._servers);

      // Keep selection stable across rescans when possible.
      if (this._selectedServer && this._selectedServer.file) {
        const match = this._servers.find(s => s.file === this._selectedServer.file);
        if (match) {
          this._selectServer(match);
        } else {
          this._selectedServer = null;
          this._contentArea.setSelectedServer(null);
          this._contentArea.setLogs([]);
        }
      }
    }

    async _setScanVisibility(visibility) {
      const next = this._normalizeScanVisibility(visibility);
      this._scanVisibility = next;
      this._saveScanVisibilitySetting(next);

      if (this._sidebar && typeof this._sidebar.setScanVisibility === "function") {
        this._sidebar.setScanVisibility(next);
      }

      if (this._scanInFlight) return;

      try {
        await this._scanAndPopulateServers();
      } catch (err) {
        this._contentArea.addLog("stderr", `Failed to rescan servers: ${err.message}`);
      } finally {
        this._contentArea.setScanning(false);
        this._scanInFlight = false;
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

      this._refreshUiClientStatusForSelectedServer();
    }

    async _refreshUiClientStatusForSelectedServer() {
      try {
        if (!this._api || !this._selectedServer) return;
        if (this._selectedServer.hasHtmlInterface !== true) {
          this._contentArea.setUiClientStatus(null);
          return;
        }

        const result = await this._api.getUiClientStatus();
        if (result && result.success && result.status) {
          this._contentArea.setUiClientStatus(result.status);
        }
      } catch (err) {
        // Non-fatal: keep UI responsive.
        this._addLog(this._selectedServer?.file || "system", "stderr", `[ui-client] Status check failed: ${err.message}`);
      }
    }

    _setAutoRebuildUiClient(enabled) {
      this._autoRebuildUiClient = enabled === true;
      this._saveAutoRebuildUiClientSetting(this._autoRebuildUiClient);
      this._contentArea.setAutoRebuildUiClient(this._autoRebuildUiClient);
    }

    _setKeepRunningAfterExit(enabled) {
      this._keepRunningAfterExit = enabled === true;
      this._saveKeepRunningAfterExitSetting(this._keepRunningAfterExit);
      if (this._contentArea && typeof this._contentArea.setKeepRunningAfterExit === "function") {
        this._contentArea.setKeepRunningAfterExit(this._keepRunningAfterExit);
      }
    }

    async _rebuildUiClient() {
      if (!this._selectedServer || !this._api) return;
      if (this._selectedServer.hasHtmlInterface !== true) return;

      this._addLog(this._selectedServer.file, "system", "[ui-client] Rebuild requested...");
      const result = await this._api.rebuildUiClient({ force: true, logToFilePath: this._selectedServer.file });
      if (!result || result.success !== true) {
        this._addLog(this._selectedServer.file, "stderr", `[ui-client] Rebuild failed: ${result?.message || 'unknown error'}`);
        return;
      }
      await this._refreshUiClientStatusForSelectedServer();
    }

    _addLog(filePath, type, data) {
      const text = data == null ? "" : String(data);
      const key = `${filePath}:${type}`;
      const prevBuffer = this._jsonlBuffers.get(key) || "";
      const trimmed = text.trim();

      const isLikelyJson = prevBuffer.length > 0 || trimmed.startsWith("{");
      if (isLikelyJson) {
        const { lines, buffer } = splitJsonlChunk(prevBuffer, text);
        if (buffer.length > 20000) {
          // Safety valve: avoid unbounded memory if something writes huge JSON without newlines.
          this._jsonlBuffers.set(key, "");
          this._addLogLine(filePath, type, buffer);
          return;
        }

        this._jsonlBuffers.set(key, buffer);

        if (lines.length === 0) {
          // Buffer until we get a newline terminator.
          return;
        }

        lines.forEach((line) => {
          const formatted = tryFormatTelemetryLine(line);
          this._addLogLine(filePath, type, formatted || line);
        });
        return;
      }

      this._addLogLine(filePath, type, text);
    }

    _addLogLine(filePath, type, data) {
      if (!this._logs.has(filePath)) {
        this._logs.set(filePath, []);
      }
      this._logs.get(filePath).push({ type, data });

      const isSelectedServer = this._selectedServer && this._selectedServer.file === filePath;
      this._debugLog("[ZServerApp] _addLog isSelectedServer:", isSelectedServer,
        "selected:", this._selectedServer?.file,
        "incoming:", filePath);

      if (isSelectedServer) {
        this._contentArea.addLog(type, data);

        if (type === "stderr" && data.includes("EADDRINUSE")) {
          const portMatch = data.match(/(?:port\s+)?(\d{4,5})/i);
          const port = portMatch ? portMatch[1] : this._selectedServer.metadata?.defaultPort;

          if (port) {
            const url = `http://localhost:${port}`;
            this._addLog(filePath, "system", `\u26a0\ufe0f Port ${port} is already in use by another process.`);
            this._addLog(filePath, "system", `\ud83d\udccd The server might already be running at: ${url}`);
            this._setServerUrl(filePath, url);
          } else {
            this._addLog(filePath, "system", "⚠️ Port is already in use. Server may already be running.");
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

    _updateServerStatus(updateOrFilePath, runningLegacy) {
      const update = (updateOrFilePath && typeof updateOrFilePath === "object")
        ? updateOrFilePath
        : { filePath: updateOrFilePath, running: runningLegacy };

      const filePath = update.filePath;
      const running = update.running === true;
      const pid = Number.isFinite(update.pid) ? update.pid : null;
      const port = Number.isFinite(update.port) ? update.port : null;
      const url = typeof update.url === "string" && update.url.trim() ? update.url.trim() : null;

      const server = this._servers.find(s => s.file === filePath);
      if (!server) return;

      const wasRunning = server.running === true;
      const prevPid = server.pid || null;
      const prevUrl = server.runningUrl || null;

      server.running = running;

      if (running) {
        if (pid) {
          server.pid = pid;
        }

        const nextUrl = url || (port ? `http://localhost:${port}` : null);
        if (nextUrl) {
          server.runningUrl = nextUrl;
          this._sidebar.setServerRunningUrl(filePath, nextUrl);
          if (this._selectedServer && this._selectedServer.file === filePath) {
            this._contentArea.setRunningUrl(nextUrl);
          }
        }

        if (wasRunning && prevPid && pid && pid !== prevPid) {
            this._addLog(filePath, "system", `Restart detected (PID changed: ${prevPid} → ${pid})`);
        }
      } else {
        server.pid = null;
        server.runningUrl = null;
      }

      this._sidebar.updateServerStatus(filePath, running);
      if (this._selectedServer && this._selectedServer.file === filePath) {
        this._contentArea.setServerRunning(running);
      }

      if (prevUrl && !running) {
        // Force the selected view to drop any stale URL if we didn't have a direct URL update.
        if (this._selectedServer && this._selectedServer.file === filePath) {
          this._contentArea.setRunningUrl(null);
        }
      }
    }

    async _startServer() {
      if (!this._selectedServer || !this._api) return;
      
      this._addLog(this._selectedServer.file, "system", "Starting server...");
      
      const result = await this._api.startServer(this._selectedServer.file, {
        isUiServer: this._selectedServer.hasHtmlInterface === true,
        ensureUiClientBundle: this._autoRebuildUiClient === true,
        keepRunningAfterExit: this._keepRunningAfterExit === true,
        logToFilePath: this._selectedServer.file
      });
      
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

    async _waitForUrlReachable(baseUrl, { timeoutMs = 15000, intervalMs = 250 } = {}) {
      if (typeof baseUrl !== "string" || !baseUrl) return false;

      // In unit tests or non-browser contexts, skip waiting.
      if (typeof globalThis.fetch !== "function") return true;
      if (typeof globalThis.AbortController !== "function") return true;

      const deadline = Date.now() + Math.max(0, timeoutMs);
      while (Date.now() < deadline) {
        try {
          const controller = new AbortController();
          const attemptTimer = setTimeout(() => controller.abort(), 2000);

          // Any HTTP response (even 404) means the server is up.
          await fetch(baseUrl, {
            method: "GET",
            cache: "no-store",
            signal: controller.signal
          });

          clearTimeout(attemptTimer);
          return true;
        } catch {
          // keep retrying
        }

        await new Promise((r) => setTimeout(r, intervalMs));
      }

      return false;
    }

    _isUnifiedUiServer(server) {
      if (!server || typeof server.file !== "string") return false;
      const normalized = server.file.replace(/\\/g, "/");
      return normalized.endsWith("/src/ui/server/unifiedApp/server.js");
    }

    async _tryFetchUnifiedCrawlSummary(baseUrl, { timeoutMs = 2500 } = {}) {
      if (typeof baseUrl !== "string" || !baseUrl) return null;

      if (typeof globalThis.fetch !== "function") return null;
      if (typeof globalThis.AbortController !== "function") return null;

      try {
        const controller = new AbortController();
        const attemptTimer = setTimeout(() => controller.abort(), Math.max(250, timeoutMs));

        const res = await fetch(`${baseUrl}/api/crawl/summary`, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal
        });

        clearTimeout(attemptTimer);

        if (!res.ok) return null;
        const json = await res.json();
        if (!json || json.status !== "ok") return null;
        return json;
      } catch {
        return null;
      }
    }

    async _pickAutoOpenPath(server, baseUrl) {
      if (!this._isUnifiedUiServer(server)) return null;
      const summary = await this._tryFetchUnifiedCrawlSummary(baseUrl);
      const lastError = summary && typeof summary.lastError === "object" ? summary.lastError : null;
      const hasError = Boolean(lastError && lastError.message);
      if (!hasError) return null;
      return "/?app=crawl-status";
    }

    async _quickStartServer(server, options = {}) {
      if (!server || !this._api) return;

      const action = options && typeof options === "object" ? options.action : null;
      const openPath = options && typeof options === "object" && typeof options.openPath === "string"
        ? options.openPath
        : null;
      if (action !== "start-detached") {
        this._selectServer(server);
        return;
      }

      // Ensure selection so the user sees immediate UI feedback.
      this._selectServer(server);
      this._addLog(server.file, "system", "Launching (detached)...");

      const result = await this._api.startServer(server.file, {
        isUiServer: server.hasHtmlInterface === true,
        ensureUiClientBundle: this._autoRebuildUiClient === true,
        keepRunningAfterExit: true,
        logToFilePath: server.file
      });

      if (result && result.success) {
        server.running = true;
        server.pid = result.pid;

        const port = result.port || server.metadata?.defaultPort || server.detectedPort;
        const baseUrl = port ? `http://localhost:${port}` : null;

        if (baseUrl) {
          const ready = await this._waitForUrlReachable(baseUrl);
          if (!ready) {
            this._addLog(server.file, "system", "⚠️ Server did not respond before timeout; opening anyway...");
          }
        }

        let resolvedOpenPath = openPath;
        if (!resolvedOpenPath && baseUrl) {
          resolvedOpenPath = await this._pickAutoOpenPath(server, baseUrl);
        }

        const url = baseUrl ? `${baseUrl}${resolvedOpenPath || ""}` : null;

        if (url) {
          server.runningUrl = url;
          this._setServerUrl(server.file, url);
          await this._openInBrowser(url);
        }

        this._contentArea.setServerRunning(true);
        this._sidebar.updateServerStatus(server.file, true);
        this._addLog(server.file, "system", `Server started (PID: ${result.pid})`);
      } else {
        const message = result && result.message ? result.message : "Failed to start";
        if (message === "Already running") {
          server.running = true;
          this._contentArea.setServerRunning(true);
          this._sidebar.updateServerStatus(server.file, true);

          const port = server.metadata?.defaultPort || server.detectedPort;
          const baseUrl = port ? `http://localhost:${port}` : null;

          if (baseUrl) {
            const ready = await this._waitForUrlReachable(baseUrl, { timeoutMs: 5000 });
            if (!ready) {
              this._addLog(server.file, "system", "⚠️ Server did not respond before timeout; opening anyway...");
            }
          }

          let resolvedOpenPath = openPath;
          if (!resolvedOpenPath && baseUrl) {
            resolvedOpenPath = await this._pickAutoOpenPath(server, baseUrl);
          }

          const url = baseUrl ? `${baseUrl}${resolvedOpenPath || ""}` : null;
          this._addLog(server.file, "system", "\u26a0\ufe0f Server is already running!");
          if (url) {
            server.runningUrl = url;
            this._setServerUrl(server.file, url);
            await this._openInBrowser(url);
          }
        } else {
          this._addLog(server.file, "stderr", `Failed to start: ${message}`);
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

    async _restartServer() {
      if (!this._selectedServer || !this._api) return;

      const filePath = this._selectedServer.file;
      this._addLog(filePath, "system", "Restarting server...");

      const stopRes = await this._api.stopServer(filePath, this._selectedServer.pid);
      if (!stopRes || stopRes.success !== true) {
        const message = stopRes && stopRes.message ? stopRes.message : "unknown";
        // Allow restart even if it wasn't running (or if PID drifted).
        this._addLog(filePath, "system", `Stop step: ${message}`);
      }

      const startRes = await this._api.startServer(filePath, {
        isUiServer: this._selectedServer.hasHtmlInterface === true,
        ensureUiClientBundle: this._autoRebuildUiClient === true,
        keepRunningAfterExit: this._keepRunningAfterExit === true,
        logToFilePath: filePath
      });

      if (startRes && startRes.success) {
        this._selectedServer.running = true;
        this._selectedServer.pid = startRes.pid;
        this._contentArea.setServerRunning(true);
        this._sidebar.updateServerStatus(filePath, true);

        const port = startRes.port || this._selectedServer.metadata?.defaultPort || this._selectedServer.detectedPort;
        const url = port ? `http://localhost:${port}` : null;
        if (url) {
          this._setServerUrl(filePath, url);
        }

        this._addLog(filePath, "system", `Server restarted (PID: ${startRes.pid})`);
        return;
      }

      const message = startRes && startRes.message ? startRes.message : "Failed to start";
      this._addLog(filePath, "stderr", `Restart failed: ${message}`);
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
