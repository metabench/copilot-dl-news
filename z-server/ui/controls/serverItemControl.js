"use strict";

const { getAppCardSpecForServer } = require("../appCatalog");

function createServerItemControl(jsgui, { StringControl }) {
  class ServerItemControl extends jsgui.Control {
    constructor(spec = {}) {
      const normalized = {
        ...spec,
        tagName: "div",
        __type_name: "server_item"
      };
      super(normalized);
      this.add_class("zs-server-item");
      
      this._server = spec.server || {};
      this._selected = spec.selected || false;
      this._onSelect = spec.onSelect || null;
      this._onOpenUrl = spec.onOpenUrl || null;
      this._runningUrl = null;
      this._clickHandlerAttached = false;
      
      // Get app card spec to check if this is a featured app
      this._appSpec = getAppCardSpecForServer(this._server);
      
      if (!spec.el) {
        this.compose();
      }
      this._syncState();
    }

    compose() {
      const ctx = this.context;
      const isFeatured = this._appSpec && this._appSpec.isMajor;
      
      // Add featured class for special styling
      if (isFeatured) {
        this.add_class("zs-server-item--featured");
        this.add_class(`zs-server-item--${this._appSpec.accent}`);
      }
      
      // Large card image for featured apps
      if (isFeatured && this._appSpec.svgPath) {
        const cardImage = new jsgui.div({ context: ctx, class: "zs-server-item__card-image" });
        const cardImg = new jsgui.img({
          context: ctx,
          class: "zs-server-item__card-img"
        });
        cardImg.dom.attributes.src = this._appSpec.svgPath;
        cardImg.dom.attributes.alt = this._appSpec.title || "";
        cardImage.add(cardImg);
        this.add(cardImage);
        this._cardImage = cardImage;
      }
      
      // Status indicator (running/stopped)
      const statusIndicator = new jsgui.div({ context: ctx, class: "zs-server-item__status" });
      this.add(statusIndicator);
      this._statusEl = statusIndicator;
      
      // Content wrapper
      const content = new jsgui.div({ context: ctx, class: "zs-server-item__content" });
      
      // Server name
      const name = new jsgui.div({ context: ctx, class: "zs-server-item__name" });
      const displayName = this._getDisplayName();
      name.add(new StringControl({ context: ctx, text: displayName }));
      content.add(name);
      this._nameEl = name;
      
      // Description or path
      const desc = new jsgui.div({ context: ctx, class: "zs-server-item__desc" });
      const descText = this._getDescription();
      desc.add(new StringControl({ context: ctx, text: descText }));
      content.add(desc);
      this._descEl = desc;
      
      // Running URL display (hidden until server starts)
      const urlContainer = new jsgui.div({ context: ctx, class: "zs-server-item__url-container" });
      urlContainer.add_class("zs-server-item__url-container--hidden");
      
      const urlIcon = new jsgui.span({ context: ctx, class: "zs-server-item__url-icon" });
      urlIcon.add(new StringControl({ context: ctx, text: "\ud83c\udf10" }));
      urlContainer.add(urlIcon);
      
      const urlText = new jsgui.span({ context: ctx, class: "zs-server-item__url-text" });
      urlText.add(new StringControl({ context: ctx, text: "" }));
      urlContainer.add(urlText);
      this._urlTextEl = urlText;
      
      const urlHint = new jsgui.span({ context: ctx, class: "zs-server-item__url-hint" });
      urlHint.add(new StringControl({ context: ctx, text: "Click to open \u2192" }));
      urlContainer.add(urlHint);
      
      content.add(urlContainer);
      this._urlContainer = urlContainer;
      
      this.add(content);
      
      // Score badge
      const score = new jsgui.div({ context: ctx, class: "zs-server-item__score" });
      score.dom.attributes.title = "Confidence Score";
      score.add(new StringControl({ context: ctx, text: String(this._server.score || 0) }));
      this.add(score);
      this._scoreEl = score;
    }

    _getDisplayName() {
      if (this._server.metadata && this._server.metadata.name) {
        return this._server.metadata.name;
      }
      if (this._server.relativeFile) {
        return this._server.relativeFile.split(/[\\/\\\\]/).pop();
      }
      return "Unknown Server";
    }

    _getDescription() {
      if (this._server.metadata && this._server.metadata.description) {
        return this._server.metadata.description;
      }
      return this._server.relativeFile || "";
    }

    _syncState() {
      if (this._selected) {
        this.add_class("zs-server-item--selected");
      } else {
        this.remove_class("zs-server-item--selected");
      }
      
      if (this._server.running) {
        this.add_class("zs-server-item--running");
      } else {
        this.remove_class("zs-server-item--running");
      }
      
      if (this.dom.el) {
        if (this._selected) {
          this.dom.el.classList.add("zs-server-item--selected");
        } else {
          this.dom.el.classList.remove("zs-server-item--selected");
        }
        
        if (this._server.running) {
          this.dom.el.classList.add("zs-server-item--running");
        } else {
          this.dom.el.classList.remove("zs-server-item--running");
        }
      }
      
      if (this._urlContainer && this._urlContainer.dom.el) {
        if (this._runningUrl) {
          this._urlContainer.dom.el.classList.remove("zs-server-item__url-container--hidden");
        } else {
          this._urlContainer.dom.el.classList.add("zs-server-item__url-container--hidden");
        }
      }
    }

    setSelected(selected) {
      this._selected = selected;
      this._syncState();
    }

    setRunning(running) {
      this._server.running = running;
      if (!running) {
        this._runningUrl = null;
      }
      this._syncState();
    }

    setRunningUrl(url) {
      this._runningUrl = url;
      
      if (this._urlTextEl && this._urlTextEl.dom.el) {
        this._urlTextEl.dom.el.textContent = url || "";
      }
      
      if (this._urlContainer && this._urlContainer.dom.el) {
        if (url) {
          this._urlContainer.dom.el.classList.remove("zs-server-item__url-container--hidden");
        } else {
          this._urlContainer.dom.el.classList.add("zs-server-item__url-container--hidden");
        }
      }
    }

    getServer() {
      return this._server;
    }

    getRunningUrl() {
      return this._runningUrl;
    }

    activate() {
      if (this._clickHandlerAttached) return;
      if (!this.dom || !this.dom.el) return;

      this.dom.el.addEventListener("click", (e) => {
        const urlContainer = this._urlContainer?.dom?.el;
        if (urlContainer && (e.target === urlContainer || urlContainer.contains(e.target))) {
          if (this._runningUrl && this._onOpenUrl) {
            e.stopPropagation();
            this._onOpenUrl(this._runningUrl);
            return;
          }
        }

        if (this._onSelect) {
          this._onSelect(this._server);
        }
      });

      this._clickHandlerAttached = true;
    }
  }

  return ServerItemControl;
}

module.exports = { createServerItemControl };
