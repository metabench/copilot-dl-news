"use strict";

const { extractUrl } = require("../lib/extractUrl");
const { getMajorServersWithCards } = require("../appCatalog");

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createContentAreaControl(jsgui, {
  ControlPanelControl,
  ServerUrlControl,
  ScanningIndicatorControl,
  LogViewerControl,
  StringControl
}) {
  class ContentAreaControl extends jsgui.Control {
    constructor(spec = {}) {
      const normalized = {
        ...spec,
        tagName: "main",
        __type_name: "content_area"
      };
      super(normalized);
      this.add_class("zs-content");

      this._defaultTitleText = "Select a Server";
      this._scanningTitleText = "Scanning for servers...";
      
      this._selectedServer = null;
      this._servers = [];
      this._majorServers = [];
      this._serverByFile = new Map();
      this._onStart = spec.onStart || null;
      this._onStop = spec.onStop || null;
      this._onRestart = spec.onRestart || null;
      this._onUrlDetected = spec.onUrlDetected || null;
      this._onOpenUrl = spec.onOpenUrl || null;
      this._onSelectServer = spec.onSelectServer || null;
      this._onQuickStartServer = spec.onQuickStartServer || null;

      this._isScanning = false;

      this._onRebuildUiClient = spec.onRebuildUiClient || null;
      this._onToggleAutoRebuildUiClient = spec.onToggleAutoRebuildUiClient || null;
      this._autoRebuildUiClient = spec.autoRebuildUiClient === true;

      this._onToggleKeepRunningAfterExit = spec.onToggleKeepRunningAfterExit || null;
      this._keepRunningAfterExit = spec.keepRunningAfterExit === true;

      this._detectedUrl = null;
      
      if (!spec.el) {
        this.compose();
      }
    }

    compose() {
      const ctx = this.context;
      
      const header = new jsgui.div({ context: ctx, class: "zs-content__header" });
      
      this._title = new jsgui.h1({ context: ctx, class: "zs-content__title" });
      this._title.add(new StringControl({ context: ctx, text: this._defaultTitleText }));
      header.add(this._title);
      
      this._controlPanel = new ControlPanelControl({
        context: ctx,
        visible: false,
        onStart: () => this._onStart && this._onStart(),
        onStop: () => this._onStop && this._onStop(),
        onRestart: () => this._onRestart && this._onRestart(),
        isUiServer: false,
        onRebuildUiClient: () => this._onRebuildUiClient && this._onRebuildUiClient(),
        autoRebuildUiClient: this._autoRebuildUiClient,
        onToggleAutoRebuildUiClient: (enabled) => {
          this._autoRebuildUiClient = enabled === true;
          if (this._onToggleAutoRebuildUiClient) {
            this._onToggleAutoRebuildUiClient(this._autoRebuildUiClient);
          }
        },
        keepRunningAfterExit: this._keepRunningAfterExit,
        onToggleKeepRunningAfterExit: (enabled) => {
          this._keepRunningAfterExit = enabled === true;
          if (this._onToggleKeepRunningAfterExit) {
            this._onToggleKeepRunningAfterExit(this._keepRunningAfterExit);
          }
        }
      });
      header.add(this._controlPanel);
      
      this.add(header);
      
      this._serverUrl = new ServerUrlControl({
        context: ctx,
        visible: false,
        onClick: (url) => {
          if (this._onOpenUrl) {
            this._onOpenUrl(url);
          }
        }
      });
      this.add(this._serverUrl);

      this._overview = new jsgui.div({ context: ctx, class: "zs-overview" });
      this._overview.add_class("zs-hidden");

      const overviewHeader = new jsgui.div({ context: ctx, class: "zs-overview__header" });
      const overviewTitle = new jsgui.div({ context: ctx, class: "zs-overview__title" });
      overviewTitle.add(new StringControl({ context: ctx, text: "Featured Apps" }));
      overviewHeader.add(overviewTitle);

      const overviewHint = new jsgui.div({ context: ctx, class: "zs-overview__hint" });
      overviewHint.add(new StringControl({ context: ctx, text: "Click a card to select; open if already running." }));
      overviewHeader.add(overviewHint);

      this._overview.add(overviewHeader);

      this._overviewGrid = new jsgui.div({ context: ctx, class: "zs-app-cards" });
      this._overview.add(this._overviewGrid);

      this.add(this._overview);
      
      this._scanningIndicator = new ScanningIndicatorControl({ context: ctx });
      this._scanningIndicator.add_class("zs-hidden");
      this.add(this._scanningIndicator);
      
      this._logViewer = new LogViewerControl({
        context: ctx,
        showEmpty: true
      });
      this.add(this._logViewer);
    }

    setSelectedServer(server) {
      this._selectedServer = server;
      this._detectedUrl = null;

      this._updateOverviewVisibility();
      
      this._serverUrl.setUrl(null);
      this._serverUrl.setVisible(false);
      
      const displayName = server.metadata && server.metadata.name
        ? server.metadata.name
        : server.relativeFile.split(/[\\/\\\\]/).pop();
      
      if (this._title.dom.el) {
        this._title.dom.el.textContent = displayName;
      }
      
      this._controlPanel.setVisible(true);
      this._controlPanel.setServerRunning(server.running || false);
      this._controlPanel.setUiServer(server.hasHtmlInterface === true);
      
      if (server.running && server.runningUrl) {
        this._detectedUrl = server.runningUrl;
        this._serverUrl.setUrl(server.runningUrl);
        this._serverUrl.setVisible(true);
      }
    }

    setUiClientStatus(status) {
      this._controlPanel.setUiClientStatus(status);
    }

    setAutoRebuildUiClient(enabled) {
      this._autoRebuildUiClient = enabled === true;
      this._controlPanel.setAutoRebuildUiClient(this._autoRebuildUiClient);
    }

    setKeepRunningAfterExit(enabled) {
      this._keepRunningAfterExit = enabled === true;
      this._controlPanel.setKeepRunningAfterExit(this._keepRunningAfterExit);
    }
    
    setRunningUrl(url) {
      this._detectedUrl = url;
      this._serverUrl.setUrl(url);
      this._serverUrl.setVisible(!!url);
    }

    setServerRunning(running) {
      if (this._selectedServer) {
        this._selectedServer.running = running;
        this._controlPanel.setServerRunning(running);
        
        if (!running) {
          this._detectedUrl = null;
          this._serverUrl.setUrl(null);
          this._serverUrl.setVisible(false);
        }
      }
    }

    addLog(type, data) {
      this._logViewer.addLog(type, data);
      
      if (!this._detectedUrl && (type === 'stdout' || type === 'system')) {
        const url = extractUrl(data);
        if (url && this._selectedServer) {
          this._detectedUrl = url;
          this._serverUrl.setUrl(url);
          this._serverUrl.setVisible(true);
          if (this._onUrlDetected) {
            this._onUrlDetected(this._selectedServer.file, url);
          }
        }
      }
    }

    setLogs(logs) {
      this._logViewer.setLogs(logs);
      
      this._detectedUrl = null;
      for (const log of logs) {
        if (log.type === 'stdout' || log.type === 'system') {
          const url = extractUrl(log.data);
          if (url && this._selectedServer) {
            this._detectedUrl = url;
            this._serverUrl.setUrl(url);
            this._serverUrl.setVisible(true);
            if (this._onUrlDetected) {
              this._onUrlDetected(this._selectedServer.file, url);
            }
            break;
          }
        }
      }
      
      if (!this._detectedUrl) {
        this._serverUrl.setUrl(null);
        this._serverUrl.setVisible(false);
      }
    }
    
    setScanning(isScanning) {
      this._isScanning = isScanning === true;
      if (isScanning) {
        if (this._title?.dom?.el) this._title.dom.el.textContent = this._scanningTitleText;
        this._controlPanel.setVisible(false);
        this._serverUrl.setUrl(null);
        this._serverUrl.setVisible(false);

        this._scanningIndicator.remove_class("zs-hidden");
        this._scanningIndicator.reset();
        this._logViewer.add_class("zs-hidden");
      } else {
        if (!this._selectedServer && this._title?.dom?.el) {
          this._title.dom.el.textContent = this._defaultTitleText;
        }

        this._scanningIndicator.add_class("zs-hidden");
        this._logViewer.remove_class("zs-hidden");
      }

      this._updateOverviewVisibility();

      // Sync live DOM immediately when elements are linked
      if (this._scanningIndicator.dom.el && this._logViewer.dom.el) {
        if (isScanning) {
          this._scanningIndicator.dom.el.classList.remove("zs-hidden");
          this._logViewer.dom.el.classList.add("zs-hidden");
          this._scanningIndicator.ensureDomRefs();
        } else {
          this._scanningIndicator.dom.el.classList.add("zs-hidden");
          this._logViewer.dom.el.classList.remove("zs-hidden");
        }
      }
    }

    setServers(servers) {
      this._servers = Array.isArray(servers) ? servers : [];
      this._serverByFile = new Map(this._servers.map((s) => [s.file, s]));
      this._majorServers = getMajorServersWithCards(this._servers);
      this._renderOverviewCards();
      this._updateOverviewVisibility();
    }

    _updateOverviewVisibility() {
      const shouldShow = !this._isScanning && !this._selectedServer;

      if (shouldShow) {
        this._overview?.remove_class?.("zs-hidden");
      } else {
        this._overview?.add_class?.("zs-hidden");
      }

      if (this._overview?.dom?.el) {
        this._overview.dom.el.classList.toggle("zs-hidden", !shouldShow);
      }
    }

    _renderOverviewCards() {
      if (!this._overviewGrid?.dom?.el) return;

      const cards = Array.isArray(this._majorServers) ? this._majorServers : [];
      if (cards.length === 0) {
        this._overviewGrid.dom.el.innerHTML = "<div class=\"zs-app-cards__empty\">No featured apps detected.</div>";
        return;
      }

      const html = cards.map(({ server, card }) => {
        const file = escapeHtml(server && server.file);
        const title = escapeHtml(card && card.title);
        const subtitle = escapeHtml(card && card.subtitle);
        const accent = escapeHtml(card && card.accent);
        const svgPath = escapeHtml(card && card.svgPath);

        const runningUrl = server && server.runningUrl ? String(server.runningUrl) : "";
        const openBtn = runningUrl
          ? `<button class=\"zs-app-card__open\" data-open-url=\"${escapeHtml(runningUrl)}\" type=\"button\">\ud83c\udf10 Open</button>`
          : "";

        const primaryAction = card && card.primaryAction ? String(card.primaryAction) : "";
        const primaryLabel = card && card.primaryLabel ? String(card.primaryLabel) : "";
        const primaryBtn = (primaryAction && primaryLabel)
          ? `<button class=\"zs-app-card__primary\" data-primary-action=\"${escapeHtml(primaryAction)}\" type=\"button\">${escapeHtml(primaryLabel)}</button>`
          : "";

        const quickLinks = card && Array.isArray(card.quickLinks) ? card.quickLinks : [];
        const quickBtns = quickLinks.map((q) => {
          const label = q && q.label ? String(q.label) : "";
          const linkPath = q && q.path ? String(q.path) : "";
          if (!label || !linkPath) return "";
          return `<button class=\"zs-app-card__primary zs-app-card__primary--link\" data-primary-action=\"${escapeHtml(primaryAction)}\" data-open-path=\"${escapeHtml(linkPath)}\" type=\"button\">${escapeHtml(label)}</button>`;
        }).filter(Boolean).join("");

        return `
<div class=\"zs-app-card zs-app-card--${accent}\" data-server-file=\"${file}\" tabindex=\"0\" role=\"button\">
  <div class=\"zs-app-card__top\">
    <div class=\"zs-app-card__svg\"><img src=\"${svgPath}\" alt=\"${title}\"></div>
    <div class=\"zs-app-card__cta\">${primaryBtn}${quickBtns}${openBtn}</div>
  </div>
  <div class=\"zs-app-card__title\">${title}</div>
  <div class=\"zs-app-card__subtitle\">${subtitle}</div>
</div>`;
      }).join("\n");

      this._overviewGrid.dom.el.innerHTML = html;
    }

    _activateOverview() {
      if (this._overviewActivated) return;
      if (!this._overviewGrid?.dom?.el) return;

      this._overviewGrid.dom.el.addEventListener("click", (e) => {
        const target = e.target;

        const primaryEl = target && target.closest ? target.closest("[data-primary-action]") : null;
        if (primaryEl) {
          const action = primaryEl.getAttribute("data-primary-action");
          const openPath = primaryEl.getAttribute("data-open-path") || null;
          const cardEl = primaryEl.closest ? primaryEl.closest("[data-server-file]") : null;
          const file = cardEl ? cardEl.getAttribute("data-server-file") : null;
          const server = file ? this._serverByFile.get(file) : null;

          if (action && server && this._onQuickStartServer) {
            e.preventDefault();
            e.stopPropagation();
            this._onQuickStartServer(server, { action, openPath });
          }
          return;
        }

        const openEl = target && target.closest ? target.closest("[data-open-url]") : null;
        if (openEl) {
          const url = openEl.getAttribute("data-open-url");
          if (url && this._onOpenUrl) {
            e.preventDefault();
            e.stopPropagation();
            this._onOpenUrl(url);
          }
          return;
        }

        const cardEl = target && target.closest ? target.closest("[data-server-file]") : null;
        if (!cardEl) return;

        const file = cardEl.getAttribute("data-server-file");
        if (!file) return;
        const server = this._serverByFile.get(file);
        if (server && this._onSelectServer) {
          this._onSelectServer(server);
        }
      });

      this._overviewActivated = true;
    }

    setScanProgress(current, total, file) {
      this._scanningIndicator.setProgress(current, total, file);
    }

    setScanCounting() {
      this._scanningIndicator.startCounting();
    }

    setScanCountingProgress(current, file) {
      this._scanningIndicator.setCountingProgress(current, file);
    }

    setScanTotal(total) {
      this._scanningIndicator.setTotal(total);
    }

    activate() {
      this._controlPanel.activate();
      this._serverUrl.activate();
      this._activateOverview();
    }
  }

  return ContentAreaControl;
}

module.exports = { createContentAreaControl };
