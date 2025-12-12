"use strict";

const { extractUrl } = require("../lib/extractUrl");

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
      
      this._selectedServer = null;
      this._onStart = spec.onStart || null;
      this._onStop = spec.onStop || null;
      this._onUrlDetected = spec.onUrlDetected || null;
      this._onOpenUrl = spec.onOpenUrl || null;
      this._detectedUrl = null;
      
      if (!spec.el) {
        this.compose();
      }
    }

    compose() {
      const ctx = this.context;
      
      const header = new jsgui.div({ context: ctx, class: "zs-content__header" });
      
      this._title = new jsgui.h1({ context: ctx, class: "zs-content__title" });
      this._title.add(new StringControl({ context: ctx, text: "Select a Server" }));
      header.add(this._title);
      
      this._controlPanel = new ControlPanelControl({
        context: ctx,
        visible: false,
        onStart: () => this._onStart && this._onStart(),
        onStop: () => this._onStop && this._onStop()
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
      
      if (server.running && server.runningUrl) {
        this._detectedUrl = server.runningUrl;
        this._serverUrl.setUrl(server.runningUrl);
        this._serverUrl.setVisible(true);
      }
    }
    
    setRunningUrl(url) {
      this._detectedUrl = url;
      this._serverUrl.setUrl(url);
      this._serverUrl.setVisible(!!url);
      console.log("[ContentArea] setRunningUrl called, url:", url, "visible:", !!url);
    }

    setServerRunning(running) {
      if (this._selectedServer) {
        this._selectedServer.running = running;
        this._controlPanel.setServerRunning(running);
        console.log("[ContentArea] setServerRunning:", running);
        
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
      if (isScanning) {
        this._scanningIndicator.remove_class("zs-hidden");
        this._scanningIndicator.reset();
        this._logViewer.add_class("zs-hidden");
      } else {
        this._scanningIndicator.add_class("zs-hidden");
        this._logViewer.remove_class("zs-hidden");
      }
      if (this._scanningIndicator.dom.el) {
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
    }
  }

  return ContentAreaControl;
}

module.exports = { createContentAreaControl };
