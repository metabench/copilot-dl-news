"use strict";

/**
 * Factory for Z-Server UI Controls
 * Industrial Luxury Obsidian Theme
 * 
 * @param {object} jsgui - jsgui3-client instance
 * @returns {object} Controls and style builder
 */
function createZServerControls(jsgui) {
  if (!jsgui) {
    throw new Error("jsgui instance is required to build Z-Server controls");
  }

  const StringControl = jsgui.String_Control;

  // ═══════════════════════════════════════════════════════════════════════════
  // SERVER ITEM CONTROL
  // ═══════════════════════════════════════════════════════════════════════════

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
      
      if (!spec.el) {
        this.compose();
      }
      this._syncState();
    }

    compose() {
      const ctx = this.context;
      
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
      urlIcon.add(new StringControl({ context: ctx, text: "🌐" }));
      urlContainer.add(urlIcon);
      
      const urlText = new jsgui.span({ context: ctx, class: "zs-server-item__url-text" });
      urlText.add(new StringControl({ context: ctx, text: "" }));
      urlContainer.add(urlText);
      this._urlTextEl = urlText;
      
      const urlHint = new jsgui.span({ context: ctx, class: "zs-server-item__url-hint" });
      urlHint.add(new StringControl({ context: ctx, text: "Click to open →" }));
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
        return this._server.relativeFile.split(/[\\/]/).pop();
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
      
      // Sync URL visibility to DOM if rendered
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
      
      // Update DOM if rendered
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
      if (typeof this.dom.el !== "undefined") {
        this.dom.el.addEventListener("click", (e) => {
          // Check if clicked on URL container
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
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SERVER LIST CONTROL
  // ═══════════════════════════════════════════════════════════════════════════

  class ServerListControl extends jsgui.Control {
    constructor(spec = {}) {
      const normalized = {
        ...spec,
        tagName: "div",
        __type_name: "server_list"
      };
      super(normalized);
      this.add_class("zs-server-list");
      
      this._servers = spec.servers || [];
      this._selectedFile = null;
      this._onSelect = spec.onSelect || null;
      this._onOpenUrl = spec.onOpenUrl || null;
      this._itemControls = new Map();
      
      if (!spec.el) {
        this.compose();
      }
    }

    compose() {
      this._renderItems();
    }

    _renderItems() {
      // Clear existing
      this.clear();
      this._itemControls.clear();
      
      this._servers.forEach(server => {
        const item = new ServerItemControl({
          context: this.context,
          server: server,
          selected: server.file === this._selectedFile,
          onSelect: (s) => this._handleSelect(s),
          onOpenUrl: (url) => this._onOpenUrl && this._onOpenUrl(url)
        });
        this.add(item);
        this._itemControls.set(server.file, item);
      });
    }

    _handleSelect(server) {
      // Deselect previous
      if (this._selectedFile && this._itemControls.has(this._selectedFile)) {
        this._itemControls.get(this._selectedFile).setSelected(false);
      }
      
      // Select new
      this._selectedFile = server.file;
      if (this._itemControls.has(server.file)) {
        this._itemControls.get(server.file).setSelected(true);
      }
      
      if (this._onSelect) {
        this._onSelect(server);
      }
    }

    setServers(servers) {
      console.log("[ServerList] setServers called with", servers.length, "servers");
      this._servers = servers;
      this._renderItems();
      console.log("[ServerList] _renderItems done, itemControls size:", this._itemControls.size);
      
      // If already rendered to DOM, update the DOM directly
      if (this.dom.el) {
        console.log("[ServerList] DOM element exists, updating directly");
        this.dom.el.innerHTML = '';
        
        this._itemControls.forEach((item) => {
          // Register the new control in context
          item.register_this_and_subcontrols();
          
          // Render HTML and insert into DOM
          const itemHtml = item.all_html_render();
          this.dom.el.insertAdjacentHTML('beforeend', itemHtml);
          
          // Find the newly inserted DOM element and link it to the control
          const itemEl = this.dom.el.querySelector('[data-jsgui-id="' + item._id() + '"]');
          if (itemEl) {
            item.dom.el = itemEl;
            // Also register in context.map_els
            this.context.map_els[item._id()] = itemEl;
            // Link any child elements
            if (item.rec_desc_ensure_ctrl_el_refs) {
              item.rec_desc_ensure_ctrl_el_refs(itemEl);
            }
          }
        });
        
        // Activate after DOM is fully linked
        this.activate();
        console.log("[ServerList] DOM updated and activated");
      } else {
        console.log("[ServerList] No DOM element yet - will render on next activation");
      }
    }

    updateServerStatus(filePath, running) {
      if (this._itemControls.has(filePath)) {
        this._itemControls.get(filePath).setRunning(running);
        if (!running) {
          this._itemControls.get(filePath).setRunningUrl(null);
        }
      }
    }

    setServerRunningUrl(filePath, url) {
      if (this._itemControls.has(filePath)) {
        this._itemControls.get(filePath).setRunningUrl(url);
      }
    }

    activate() {
      this._itemControls.forEach(item => {
        item.activate();
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SERVER URL CONTROL - Large clickable URL display
  // ═══════════════════════════════════════════════════════════════════════════

  class ServerUrlControl extends jsgui.Control {
    constructor(spec = {}) {
      const normalized = {
        ...spec,
        tagName: "div",
        __type_name: "server_url"
      };
      super(normalized);
      this.add_class("zs-server-url");
      // Start hidden by default - only show when URL is detected
      this.add_class("zs-server-url--hidden");
      
      this._url = spec.url || null;
      this._onClick = spec.onClick || null;
      this._visible = spec.visible || false;
      
      if (!spec.el) {
        this.compose();
      }
      this._syncState();
    }

    compose() {
      const ctx = this.context;
      
      // Icon
      const icon = new jsgui.div({ context: ctx, class: "zs-server-url__icon" });
      icon.add(new StringControl({ context: ctx, text: "🌐" }));
      this.add(icon);
      
      // URL wrapper
      const urlWrapper = new jsgui.div({ context: ctx, class: "zs-server-url__wrapper" });
      
      const label = new jsgui.div({ context: ctx, class: "zs-server-url__label" });
      label.add(new StringControl({ context: ctx, text: "Server Running At" }));
      urlWrapper.add(label);
      
      this._urlText = new jsgui.div({ context: ctx, class: "zs-server-url__text" });
      this._urlText.add(new StringControl({ context: ctx, text: this._url || "" }));
      urlWrapper.add(this._urlText);
      
      this.add(urlWrapper);
      
      // Browser indicator
      const browserHint = new jsgui.div({ context: ctx, class: "zs-server-url__browser" });
      browserHint.add(new StringControl({ context: ctx, text: "Click to open in Chrome Canary →" }));
      this.add(browserHint);
    }

    _syncState() {
      if (this._visible && this._url) {
        this.remove_class("zs-server-url--hidden");
      } else {
        this.add_class("zs-server-url--hidden");
      }
    }

    setUrl(url) {
      this._url = url;
      
      // Update DOM if rendered
      if (this._urlText && this._urlText.dom.el) {
        this._urlText.dom.el.textContent = url || "";
      }
      
      this._syncState();
      
      // Update DOM visibility
      if (this.dom.el) {
        if (url) {
          this.dom.el.classList.remove("zs-server-url--hidden");
        } else {
          this.dom.el.classList.add("zs-server-url--hidden");
        }
      }
    }

    setVisible(visible) {
      this._visible = visible;
      this._syncState();
      
      if (this.dom.el) {
        if (visible && this._url) {
          this.dom.el.classList.remove("zs-server-url--hidden");
        } else {
          this.dom.el.classList.add("zs-server-url--hidden");
        }
      }
    }

    getUrl() {
      return this._url;
    }

    activate() {
      if (this.dom.el && this._onClick) {
        this.dom.el.addEventListener("click", () => {
          if (this._url) {
            this._onClick(this._url);
          }
        });
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LOG ENTRY CONTROL
  // ═══════════════════════════════════════════════════════════════════════════

  class LogEntryControl extends jsgui.Control {
    constructor(spec = {}) {
      const normalized = {
        ...spec,
        tagName: "div",
        __type_name: "log_entry"
      };
      super(normalized);
      this.add_class("zs-log-entry");
      
      const type = spec.type || "stdout";
      this.add_class(`zs-log-entry--${type}`);
      
      const text = spec.text || "";
      this.add(new StringControl({ context: this.context, text }));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LOG VIEWER CONTROL
  // ═══════════════════════════════════════════════════════════════════════════

  class LogViewerControl extends jsgui.Control {
    constructor(spec = {}) {
      const normalized = {
        ...spec,
        tagName: "div",
        __type_name: "log_viewer"
      };
      super(normalized);
      this.add_class("zs-log-viewer");
      
      this._logs = spec.logs || [];
      this._showEmpty = spec.showEmpty !== false;
      
      if (!spec.el) {
        this.compose();
      }
    }

    compose() {
      this._renderLogs();
    }

    _renderLogs() {
      this.clear();
      
      if (this._logs.length === 0 && this._showEmpty) {
        const empty = new jsgui.div({ context: this.context, class: "zs-log-viewer__empty" });
        
        const icon = new jsgui.div({ context: this.context, class: "zs-log-viewer__empty-icon" });
        icon.add(new StringControl({ context: this.context, text: "◈" }));
        empty.add(icon);
        
        const text = new jsgui.div({ context: this.context, class: "zs-log-viewer__empty-text" });
        text.add(new StringControl({ context: this.context, text: "Select a server to view logs" }));
        empty.add(text);
        
        this.add(empty);
        return;
      }
      
      this._logs.forEach(log => {
        const entry = new LogEntryControl({
          context: this.context,
          type: log.type,
          text: log.data
        });
        this.add(entry);
      });
    }

    setLogs(logs) {
      this._logs = logs;
      this._renderLogs();
      this._scrollToBottom();
    }

    addLog(type, data) {
      this._logs.push({ type, data });
      
      // If we were showing empty state, re-render
      if (this._logs.length === 1) {
        this._renderLogs();
      } else {
        // Just append
        const entry = new LogEntryControl({
          context: this.context,
          type,
          text: data
        });
        this.add(entry);
      }
      this._scrollToBottom();
    }

    _scrollToBottom() {
      if (this.dom.el) {
        this.dom.el.scrollTop = this.dom.el.scrollHeight;
      }
    }

    clear() {
      // Remove all children
      while (this.content && this.content.length > 0) {
        this.content.pop();
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SERVER LOG WINDOW CONTROL
  // Extends jsgui3 Window with Industrial Luxury Obsidian styling
  // ═══════════════════════════════════════════════════════════════════════════

  class ServerLogWindowControl extends jsgui.Window {
    constructor(spec = {}) {
      const normalized = {
        ...spec,
        title: spec.serverName || "Server Logs",
        show_buttons: true,
        __type_name: "server_log_window"
      };
      super(normalized);
      this.add_class("zs-log-window");
      
      this._serverName = spec.serverName || "Server Logs";
      this._visible = spec.visible !== false;
      this._onClose = spec.onClose || null;
      this._position = spec.position || { x: 50, y: 50 };
      this._size = spec.size || { width: 600, height: 400 };
      this._minimized = false;
      this._maximized = false;
      
      // Add log viewer to the window's inner content
      if (this.ctrl_inner) {
        this._logViewer = new LogViewerControl({
          context: this.context,
          showEmpty: true
        });
        this.ctrl_inner.add(this._logViewer);
      }
      
      // Add resize handle
      const resizeHandle = new jsgui.div({ context: this.context, class: "zs-log-window__resize-handle" });
      this.add(resizeHandle);
      this._resizeHandle = resizeHandle;
      
      if (!this._visible) {
        this.add_class("zs-log-window--hidden");
      }
    }

    activate() {
      // Call parent activate first (sets up dragable/resizable mixins if available)
      if (super.activate) {
        super.activate();
      }
      
      if (!this.dom.el) return;
      
      const el = this.dom.el;
      
      // Apply initial position and size
      el.style.position = "absolute";
      el.style.left = `${this._position.x}px`;
      el.style.top = `${this._position.y}px`;
      el.style.width = `${this._size.width}px`;
      el.style.height = `${this._size.height}px`;
      
      // Wire up window buttons from parent's _ctrl_fields
      if (this._ctrl_fields) {
        const { btn_minimize, btn_maximize, btn_close } = this._ctrl_fields;
        
        if (btn_minimize && btn_minimize.dom.el) {
          btn_minimize.dom.el.addEventListener("click", () => this.toggleMinimize());
        }
        if (btn_maximize && btn_maximize.dom.el) {
          btn_maximize.dom.el.addEventListener("click", () => this.toggleMaximize());
        }
        if (btn_close && btn_close.dom.el) {
          btn_close.dom.el.addEventListener("click", () => this.close());
        }
      }
      
      // Set up title bar dragging
      if (this.title_bar && this.title_bar.dom.el) {
        this._setupDragging(this.title_bar.dom.el, el);
      }
      
      // Set up resize handle
      if (this._resizeHandle && this._resizeHandle.dom.el) {
        this._setupResizing(this._resizeHandle.dom.el, el);
      }
      
      // Click to bring to front
      el.addEventListener("mousedown", () => this.bringToFront());
      
      // Activate log viewer
      if (this._logViewer) {
        this._logViewer.activate();
      }
    }

    _setupDragging(titleEl, windowEl) {
      let isDragging = false;
      let dragStart = { x: 0, y: 0 };
      let posStart = { x: 0, y: 0 };
      
      titleEl.addEventListener("mousedown", (e) => {
        // Don't drag if clicking on buttons
        if (e.target.closest("button")) return;
        if (this._maximized) return;
        
        isDragging = true;
        dragStart = { x: e.clientX, y: e.clientY };
        posStart = { x: this._position.x, y: this._position.y };
        windowEl.classList.add("zs-log-window--dragging");
        this.bringToFront();
        e.preventDefault();
      });
      
      document.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        this._position.x = Math.max(0, posStart.x + dx);
        this._position.y = Math.max(0, posStart.y + dy);
        windowEl.style.left = `${this._position.x}px`;
        windowEl.style.top = `${this._position.y}px`;
      });
      
      document.addEventListener("mouseup", () => {
        if (isDragging) {
          isDragging = false;
          windowEl.classList.remove("zs-log-window--dragging");
        }
      });
    }

    _setupResizing(handleEl, windowEl) {
      let isResizing = false;
      let resizeStart = { x: 0, y: 0 };
      let sizeStart = { width: 0, height: 0 };
      
      handleEl.addEventListener("mousedown", (e) => {
        if (this._maximized) return;
        
        isResizing = true;
        resizeStart = { x: e.clientX, y: e.clientY };
        sizeStart = { width: this._size.width, height: this._size.height };
        windowEl.classList.add("zs-log-window--resizing");
        e.preventDefault();
        e.stopPropagation();
      });
      
      document.addEventListener("mousemove", (e) => {
        if (!isResizing) return;
        const dx = e.clientX - resizeStart.x;
        const dy = e.clientY - resizeStart.y;
        this._size.width = Math.max(300, sizeStart.width + dx);
        this._size.height = Math.max(200, sizeStart.height + dy);
        windowEl.style.width = `${this._size.width}px`;
        windowEl.style.height = `${this._size.height}px`;
      });
      
      document.addEventListener("mouseup", () => {
        if (isResizing) {
          isResizing = false;
          windowEl.classList.remove("zs-log-window--resizing");
        }
      });
    }

    bringToFront() {
      // Use parent's method if available, otherwise do it ourselves
      if (super.bring_to_front_z) {
        super.bring_to_front_z();
      } else {
        const windows = document.querySelectorAll(".zs-log-window");
        let maxZ = 100;
        windows.forEach(w => {
          const z = parseInt(w.style.zIndex || "100", 10);
          if (z > maxZ) maxZ = z;
        });
        this.dom.el.style.zIndex = String(maxZ + 1);
      }
    }

    toggleMinimize() {
      this._minimized = !this._minimized;
      const el = this.dom.el;
      const btn = this._ctrl_fields?.btn_minimize?.dom?.el;
      
      if (this._minimized) {
        el.classList.add("zs-log-window--minimized");
        if (btn) btn.textContent = "⊕";
      } else {
        el.classList.remove("zs-log-window--minimized");
        if (btn) btn.textContent = "⊖";
      }
    }

    toggleMaximize() {
      this._maximized = !this._maximized;
      const el = this.dom.el;
      const btn = this._ctrl_fields?.btn_maximize?.dom?.el;
      
      if (this._maximized) {
        this._savedPos = { ...this._position };
        this._savedSize = { ...this._size };
        el.classList.add("zs-log-window--maximized");
        if (btn) btn.textContent = "◱";
      } else {
        this._position = this._savedPos || this._position;
        this._size = this._savedSize || this._size;
        el.classList.remove("zs-log-window--maximized");
        el.style.left = `${this._position.x}px`;
        el.style.top = `${this._position.y}px`;
        el.style.width = `${this._size.width}px`;
        el.style.height = `${this._size.height}px`;
        if (btn) btn.textContent = "⊕";
      }
    }

    show(serverName) {
      if (serverName) {
        this._serverName = serverName;
        // Update title in Window's h2
        if (this.title_bar) {
          const h2 = this.title_bar.content?.find(c => c.__type_name === 'h2' || c.dom?.tagName?.toLowerCase() === 'h2');
          if (h2 && h2.dom.el) {
            h2.dom.el.textContent = serverName;
          }
        }
      }
      this._visible = true;
      this.dom.el.classList.remove("zs-log-window--hidden");
      this.bringToFront();
      this._logViewer.setLogs([]);
    }

    hide() {
      this._visible = false;
      this.dom.el.classList.add("zs-log-window--hidden");
    }

    close() {
      this.hide();
      if (this._onClose) {
        this._onClose();
      }
    }

    isVisible() {
      return this._visible;
    }

    addLog(type, data) {
      this._logViewer.addLog(type, data);
    }

    setLogs(logs) {
      this._logViewer.setLogs(logs);
    }

    clearLogs() {
      this._logViewer.setLogs([]);
    }

    setTitle(title) {
      this._serverName = title;
      if (this.title_bar) {
        const h2 = this.title_bar.content?.find(c => c.__type_name === 'h2' || c.dom?.tagName?.toLowerCase() === 'h2');
        if (h2 && h2.dom.el) {
          h2.dom.el.textContent = title;
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTROL BUTTON
  // ═══════════════════════════════════════════════════════════════════════════

  class ControlButtonControl extends jsgui.Control {
    constructor(spec = {}) {
      const normalized = {
        ...spec,
        tagName: "button",
        __type_name: "control_button"
      };
      super(normalized);
      this.add_class("zs-btn");
      
      if (spec.variant) {
        this.add_class(`zs-btn--${spec.variant}`);
      }
      
      this._disabled = spec.disabled || false;
      this._onClick = spec.onClick || null;
      this._label = spec.label || "Button";
      
      if (!spec.el) {
        this.compose();
      }
      this._syncState();
    }

    compose() {
      this.add(new StringControl({ context: this.context, text: this._label }));
    }

    _syncState() {
      if (this._disabled) {
        this.dom.attributes.disabled = "disabled";
        this.add_class("zs-btn--disabled");
      } else {
        delete this.dom.attributes.disabled;
        this.remove_class("zs-btn--disabled");
      }
    }

    setDisabled(disabled) {
      this._disabled = disabled;
      this._syncState();
      
      // Update DOM if rendered
      if (this.dom.el) {
        this.dom.el.disabled = disabled;
        if (disabled) {
          this.dom.el.classList.add("zs-btn--disabled");
        } else {
          this.dom.el.classList.remove("zs-btn--disabled");
        }
      }
    }

    activate() {
      if (this.dom.el && this._onClick) {
        this.dom.el.addEventListener("click", () => {
          if (!this._disabled) {
            this._onClick();
          }
        });
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTROL PANEL
  // ═══════════════════════════════════════════════════════════════════════════

  class ControlPanelControl extends jsgui.Control {
    constructor(spec = {}) {
      const normalized = {
        ...spec,
        tagName: "div",
        __type_name: "control_panel"
      };
      super(normalized);
      this.add_class("zs-control-panel");
      
      this._visible = spec.visible || false;
      this._serverRunning = spec.serverRunning || false;
      this._onStart = spec.onStart || null;
      this._onStop = spec.onStop || null;
      
      if (!spec.el) {
        this.compose();
      }
      this._syncState();
    }

    compose() {
      const ctx = this.context;
      
      this._startBtn = new ControlButtonControl({
        context: ctx,
        label: "▶ Start Server",
        variant: "start",
        disabled: this._serverRunning,
        onClick: () => this._onStart && this._onStart()
      });
      this.add(this._startBtn);
      
      this._stopBtn = new ControlButtonControl({
        context: ctx,
        label: "■ Stop Server",
        variant: "stop",
        disabled: !this._serverRunning,
        onClick: () => this._onStop && this._onStop()
      });
      this.add(this._stopBtn);
    }

    _syncState() {
      if (this._visible) {
        this.remove_class("zs-control-panel--hidden");
      } else {
        this.add_class("zs-control-panel--hidden");
      }
    }

    setVisible(visible) {
      this._visible = visible;
      this._syncState();
      
      if (this.dom.el) {
        if (visible) {
          this.dom.el.classList.remove("zs-control-panel--hidden");
        } else {
          this.dom.el.classList.add("zs-control-panel--hidden");
        }
      }
    }

    setServerRunning(running) {
      this._serverRunning = running;
      this._startBtn.setDisabled(running);
      this._stopBtn.setDisabled(!running);
    }

    activate() {
      this._startBtn.activate();
      this._stopBtn.activate();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCANNING INDICATOR CONTROL (with Progress Bar)
  // ═══════════════════════════════════════════════════════════════════════════

  class ScanningIndicatorControl extends jsgui.Control {
    constructor(spec = {}) {
      const normalized = {
        ...spec,
        tagName: "div",
        __type_name: "scanning_indicator"
      };
      super(normalized);
      this.add_class("zs-scanning");
      
      this._total = 0;
      this._current = 0;
      this._currentFile = "";
      
      if (!spec.el) {
        this.compose();
      }
    }

    compose() {
      const ctx = this.context;
      
      // SVG Container
      const svg = new jsgui.Control({ context: ctx, tagName: "svg" });
      svg.dom.attributes.viewBox = "0 0 100 100";
      svg.add_class("zs-scanning__svg");
      
      // Outer Ring
      const ring = new jsgui.Control({ context: ctx, tagName: "circle" });
      ring.dom.attributes.cx = "50";
      ring.dom.attributes.cy = "50";
      ring.dom.attributes.r = "45";
      ring.dom.attributes.class = "zs-scanning__ring";
      svg.add(ring);
      
      // Inner Ring
      const innerRing = new jsgui.Control({ context: ctx, tagName: "circle" });
      innerRing.dom.attributes.cx = "50";
      innerRing.dom.attributes.cy = "50";
      innerRing.dom.attributes.r = "30";
      innerRing.dom.attributes.class = "zs-scanning__ring-inner";
      svg.add(innerRing);
      
      // Radar Sweep (Gradient Sector)
      const sweep = new jsgui.Control({ context: ctx, tagName: "path" });
      sweep.dom.attributes.d = "M50 50 L50 5 A45 45 0 0 1 95 50 Z"; // Quarter sector
      sweep.dom.attributes.class = "zs-scanning__sweep";
      svg.add(sweep);
      
      // Center Dot
      const dot = new jsgui.Control({ context: ctx, tagName: "circle" });
      dot.dom.attributes.cx = "50";
      dot.dom.attributes.cy = "50";
      dot.dom.attributes.r = "4";
      dot.dom.attributes.class = "zs-scanning__dot";
      svg.add(dot);
      
      this.add(svg);
      
      // Text
      const text = new jsgui.div({ context: ctx, class: "zs-scanning__text" });
      text.add(new StringControl({ context: ctx, text: "SCANNING FOR SERVERS..." }));
      this.add(text);
      this._textEl = text;
      
      // Progress Bar Container
      const progressContainer = new jsgui.div({ context: ctx, class: "zs-scanning__progress-container" });
      
      // Progress bar background
      const progressBg = new jsgui.div({ context: ctx, class: "zs-scanning__progress-bg" });
      
      // Progress bar fill
      const progressFill = new jsgui.div({ context: ctx, class: "zs-scanning__progress-fill" });
      progressBg.add(progressFill);
      this._progressFillEl = progressFill;
      
      progressContainer.add(progressBg);
      
      // Progress text (e.g., "47 / 997 files")
      const progressText = new jsgui.div({ context: ctx, class: "zs-scanning__progress-text" });
      progressText.add(new StringControl({ context: ctx, text: "Counting files..." }));
      progressContainer.add(progressText);
      this._progressTextEl = progressText;
      
      this.add(progressContainer);
      
      // Current file subtitle
      const subtitle = new jsgui.div({ context: ctx, class: "zs-scanning__subtitle" });
      subtitle.add(new StringControl({ context: ctx, text: "Analyzing JavaScript files in repository" }));
      this.add(subtitle);
      this._subtitleEl = subtitle;
    }

    setTotal(total) {
      this._total = total;
      this._current = 0;
      this._updateProgress();
    }

    setProgress(current, total, file) {
      this._current = current;
      this._total = total || this._total;
      this._currentFile = file || "";
      this._updateProgress();
    }

    _updateProgress() {
      const percent = this._total > 0 ? (this._current / this._total) * 100 : 0;
      
      // Update progress bar fill
      if (this._progressFillEl && this._progressFillEl.dom.el) {
        this._progressFillEl.dom.el.style.width = `${percent}%`;
      }
      
      // Update progress text
      if (this._progressTextEl && this._progressTextEl.dom.el) {
        if (this._total > 0) {
          this._progressTextEl.dom.el.textContent = `${this._current} / ${this._total} files`;
        } else {
          this._progressTextEl.dom.el.textContent = "Counting files...";
        }
      }
      
      // Update subtitle with current file (truncated)
      if (this._subtitleEl && this._subtitleEl.dom.el && this._currentFile) {
        const displayFile = this._currentFile.length > 50 
          ? "..." + this._currentFile.slice(-47) 
          : this._currentFile;
        this._subtitleEl.dom.el.textContent = displayFile;
      }
    }

    reset() {
      this._total = 0;
      this._current = 0;
      this._currentFile = "";
      
      if (this._progressFillEl && this._progressFillEl.dom.el) {
        this._progressFillEl.dom.el.style.width = "0%";
      }
      if (this._progressTextEl && this._progressTextEl.dom.el) {
        this._progressTextEl.dom.el.textContent = "Counting files...";
      }
      if (this._subtitleEl && this._subtitleEl.dom.el) {
        this._subtitleEl.dom.el.textContent = "Analyzing JavaScript files in repository";
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SIDEBAR CONTROL
  // ═══════════════════════════════════════════════════════════════════════════

  class SidebarControl extends jsgui.Control {
    constructor(spec = {}) {
      const normalized = {
        ...spec,
        tagName: "aside",
        __type_name: "sidebar"
      };
      super(normalized);
      this.add_class("zs-sidebar");
      
      this._servers = spec.servers || [];
      this._onSelect = spec.onSelect || null;
      this._onOpenUrl = spec.onOpenUrl || null;
      
      if (!spec.el) {
        this.compose();
      }
    }

    compose() {
      const ctx = this.context;
      
      // Header
      const header = new jsgui.div({ context: ctx, class: "zs-sidebar__header" });
      const title = new jsgui.h2({ context: ctx, class: "zs-sidebar__title" });
      title.add(new StringControl({ context: ctx, text: "◈ Servers" }));
      header.add(title);
      this.add(header);
      
      // Server list
      this._serverList = new ServerListControl({
        context: ctx,
        servers: this._servers,
        onSelect: (s) => this._onSelect && this._onSelect(s),
        onOpenUrl: (url) => this._onOpenUrl && this._onOpenUrl(url)
      });
      this.add(this._serverList);
    }

    setServers(servers) {
      this._servers = servers;
      this._serverList.setServers(servers);
    }

    updateServerStatus(filePath, running) {
      this._serverList.updateServerStatus(filePath, running);
    }

    setServerRunningUrl(filePath, url) {
      this._serverList.setServerRunningUrl(filePath, url);
    }

    activate() {
      this._serverList.activate();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTENT AREA CONTROL
  // ═══════════════════════════════════════════════════════════════════════════

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
      this._detectedUrl = null;
      
      if (!spec.el) {
        this.compose();
      }
    }

    compose() {
      const ctx = this.context;
      
      // Header
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
      
      // Scanning Indicator (Hidden by default, shown during init)
      this._scanningIndicator = new ScanningIndicatorControl({ context: ctx });
      this._scanningIndicator.add_class("zs-hidden");
      this.add(this._scanningIndicator);
      
      // Log viewer
      this._logViewer = new LogViewerControl({
        context: ctx,
        showEmpty: true
      });
      this.add(this._logViewer);
    }

    setSelectedServer(server) {
      this._selectedServer = server;
      this._detectedUrl = null;
      
      // Update title
      const displayName = server.metadata && server.metadata.name
        ? server.metadata.name
        : server.relativeFile.split(/[\\/]/).pop();
      
      // Update title text
      if (this._title.dom.el) {
        this._title.dom.el.textContent = displayName;
      }
      
      // Show control panel
      this._controlPanel.setVisible(true);
      this._controlPanel.setServerRunning(server.running || false);
    }

    setServerRunning(running) {
      if (this._selectedServer) {
        this._selectedServer.running = running;
        this._controlPanel.setServerRunning(running);
        
        // Clear detected URL when server stops
        if (!running) {
          this._detectedUrl = null;
        }
      }
    }

    _extractUrl(text) {
      // Match common localhost URLs from server output
      const urlPatterns = [
        /https?:\/\/localhost:\d+[^\s]*/gi,
        /https?:\/\/127\.0\.0\.1:\d+[^\s]*/gi,
        /https?:\/\/0\.0\.0\.0:\d+[^\s]*/gi,
        /Server (?:running|listening|started) (?:on|at) (https?:\/\/[^\s]+)/gi,
        /listening on (https?:\/\/[^\s]+)/gi,
        /available at (https?:\/\/[^\s]+)/gi
      ];
      
      for (const pattern of urlPatterns) {
        const match = pattern.exec(text);
        if (match) {
          // Return the captured group if exists, otherwise the full match
          return match[1] || match[0];
        }
      }
      return null;
    }

    addLog(type, data) {
      this._logViewer.addLog(type, data);
      
      // Try to detect URL in log output
      if (!this._detectedUrl && (type === 'stdout' || type === 'system')) {
        const url = this._extractUrl(data);
        if (url && this._selectedServer) {
          this._detectedUrl = url;
          // Notify parent to update the sidebar's server item
          if (this._onUrlDetected) {
            this._onUrlDetected(this._selectedServer.file, url);
          }
        }
      }
    }

    setLogs(logs) {
      this._logViewer.setLogs(logs);
      
      // Scan all logs for URL
      this._detectedUrl = null;
      for (const log of logs) {
        if (log.type === 'stdout' || log.type === 'system') {
          const url = this._extractUrl(log.data);
          if (url && this._selectedServer) {
            this._detectedUrl = url;
            if (this._onUrlDetected) {
              this._onUrlDetected(this._selectedServer.file, url);
            }
            break;
          }
        }
      }
    }
    
    setScanning(isScanning) {
      if (isScanning) {
        this._scanningIndicator.remove_class("zs-hidden");
        this._scanningIndicator.reset(); // Reset progress on start
        this._logViewer.add_class("zs-hidden");
      } else {
        this._scanningIndicator.add_class("zs-hidden");
        this._logViewer.remove_class("zs-hidden");
      }
      // Update DOM if rendered
      if (this._scanningIndicator.dom.el) {
        if (isScanning) {
          this._scanningIndicator.dom.el.classList.remove("zs-hidden");
          this._logViewer.dom.el.classList.add("zs-hidden");
        } else {
          this._scanningIndicator.dom.el.classList.add("zs-hidden");
          this._logViewer.dom.el.classList.remove("zs-hidden");
        }
      }
    }

    setScanProgress(current, total, file) {
      this._scanningIndicator.setProgress(current, total, file);
    }

    setScanTotal(total) {
      this._scanningIndicator.setTotal(total);
    }

    activate() {
      this._controlPanel.activate();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TITLE BAR CONTROL
  // ═══════════════════════════════════════════════════════════════════════════

  class TitleBarControl extends jsgui.Control {
    constructor(spec = {}) {
      const normalized = {
        ...spec,
        tagName: "header",
        __type_name: "title_bar"
      };
      super(normalized);
      this.add_class("zs-title-bar");
      
      if (!spec.el) {
        this.compose();
      }
    }

    compose() {
      const ctx = this.context;
      
      const title = new jsgui.div({ context: ctx, class: "zs-title-bar__title" });
      title.add(new StringControl({ context: ctx, text: "Z-Server // Manager" }));
      this.add(title);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Z-SERVER APP (ROOT CONTROL)
  // ═══════════════════════════════════════════════════════════════════════════

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
      this._logs = new Map(); // filePath -> logs[]
      
      this._api = spec.api || null; // electronAPI
      
      if (!spec.el) {
        this.compose();
      }
    }

    compose() {
      const ctx = this.context;
      
      // Title bar
      this._titleBar = new TitleBarControl({ context: ctx });
      this.add(this._titleBar);
      
      // Main container
      const container = new jsgui.div({ context: ctx, class: "zs-container" });
      
      // Sidebar
      this._sidebar = new SidebarControl({
        context: ctx,
        servers: this._servers,
        onSelect: (s) => this._selectServer(s),
        onOpenUrl: (url) => this._openInBrowser(url)
      });
      container.add(this._sidebar);
      
      // Content area
      this._contentArea = new ContentAreaControl({
        context: ctx,
        onStart: () => this._startServer(),
        onStop: () => this._stopServer(),
        onUrlDetected: (filePath, url) => this._setServerUrl(filePath, url)
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
        
        // Set up scan progress listener BEFORE starting scan
        this._api.onScanProgress((progress) => {
          console.log("[ZServerApp] Scan progress:", progress);
          if (progress.type === 'count') {
            this._contentArea.setScanTotal(progress.total);
          } else if (progress.type === 'progress') {
            this._contentArea.setScanProgress(progress.current, progress.total, progress.file);
          }
          // 'complete' type is handled implicitly when scanServers resolves
        });
        
        this._servers = await this._api.scanServers();
        console.log("[ZServerApp] Scan complete, found servers:", this._servers.length, this._servers);
        
        this._sidebar.setServers(this._servers);
        console.log("[ZServerApp] Servers set on sidebar");
        
        // Set up event listeners
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
      
      // Load existing logs for this server
      const serverLogs = this._logs.get(server.file) || [];
      this._contentArea.setLogs(serverLogs);
    }

    _addLog(filePath, type, data) {
      if (!this._logs.has(filePath)) {
        this._logs.set(filePath, []);
      }
      this._logs.get(filePath).push({ type, data });
      
      // If this is the selected server, show the log
      if (this._selectedServer && this._selectedServer.file === filePath) {
        this._contentArea.addLog(type, data);
      }
    }

    _setServerUrl(filePath, url) {
      // Update the sidebar's server item with the running URL
      this._sidebar.setServerRunningUrl(filePath, url);
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
        this._addLog(this._selectedServer.file, "stderr", `Failed to start: ${result.message}`);
      }
    }

    async _stopServer() {
      if (!this._selectedServer || !this._api) return;
      
      this._addLog(this._selectedServer.file, "system", "Stopping server...");
      
      const result = await this._api.stopServer(this._selectedServer.file);
      
      if (result.success) {
        this._selectedServer.running = false;
        this._selectedServer.pid = null;
        this._contentArea.setServerRunning(false);
        this._sidebar.updateServerStatus(this._selectedServer.file, false);
        this._addLog(this._selectedServer.file, "system", "Server stopped");
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

  // ═══════════════════════════════════════════════════════════════════════════
  // STYLES BUILDER
  // ═══════════════════════════════════════════════════════════════════════════

  function buildZServerStyles() {
    return `
/* ═══════════════════════════════════════════════════════════════════════════ */
/* Z-SERVER MANAGER - INDUSTRIAL LUXURY OBSIDIAN THEME                         */
/* ═══════════════════════════════════════════════════════════════════════════ */

:root {
  /* Obsidian Base */
  --zs-bg: #050508;
  --zs-bg-panel: #0a0d14;
  --zs-bg-card: #141824;
  --zs-bg-elevated: #1a1f2e;
  
  /* Gold Accents */
  --zs-gold: #c9a227;
  --zs-gold-dim: #8b7500;
  --zs-gold-bright: #fffacd;
  
  /* Gemstone Accents */
  --zs-emerald: #50c878;
  --zs-emerald-dark: #2e8b57;
  --zs-ruby: #ff6b6b;
  --zs-ruby-dark: #e31837;
  --zs-sapphire: #6fa8dc;
  --zs-sapphire-dark: #0f52ba;
  --zs-amethyst: #da70d6;
  --zs-amethyst-dark: #9966cc;
  --zs-topaz: #ffc87c;
  
  /* Text */
  --zs-text: #f0f4f8;
  --zs-text-muted: #94a3b8;
  --zs-text-dim: #64748b;
  
  /* Typography */
  --zs-font-display: "Georgia", "Times New Roman", serif;
  --zs-font-body: "Inter", "Segoe UI", system-ui, sans-serif;
  --zs-font-mono: "JetBrains Mono", "Consolas", "Monaco", monospace;
  
  /* Shadows */
  --zs-shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.4);
  --zs-shadow-md: 0 4px 16px rgba(0, 0, 0, 0.5);
  --zs-shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.6);
  --zs-shadow-glow-gold: 0 0 20px rgba(201, 162, 39, 0.3);
  --zs-shadow-glow-emerald: 0 0 20px rgba(80, 200, 120, 0.3);
  --zs-shadow-glow-ruby: 0 0 20px rgba(255, 107, 107, 0.3);
  --zs-shadow-glow-amethyst: 0 0 20px rgba(218, 112, 214, 0.3);
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 0;
  font-family: var(--zs-font-body);
  background: var(--zs-bg);
  color: var(--zs-text);
  height: 100vh;
  overflow: hidden;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* APP SHELL                                                                   */
/* ═══════════════════════════════════════════════════════════════════════════ */

.zs-app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: 
    radial-gradient(ellipse at 0% 0%, rgba(201, 162, 39, 0.08) 0%, transparent 50%),
    radial-gradient(ellipse at 100% 0%, rgba(218, 112, 214, 0.05) 0%, transparent 50%),
    radial-gradient(ellipse at 50% 100%, rgba(80, 200, 120, 0.03) 0%, transparent 50%),
    var(--zs-bg);
}

/* Grid overlay */
.zs-app::before {
  content: "";
  position: fixed;
  inset: 0;
  background-image: 
    linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
  background-size: 40px 40px;
  pointer-events: none;
  z-index: 0;
}

.zs-app > * {
  position: relative;
  z-index: 1;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* TITLE BAR                                                                   */
/* ═══════════════════════════════════════════════════════════════════════════ */

.zs-title-bar {
  height: 36px;
  background: linear-gradient(180deg, rgba(20, 24, 36, 0.95), rgba(10, 13, 20, 0.98));
  -webkit-app-region: drag;
  display: flex;
  align-items: center;
  padding: 0 16px;
  border-bottom: 1px solid rgba(201, 162, 39, 0.2);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.5);
}

.zs-title-bar__title {
  font-family: var(--zs-font-display);
  font-size: 14px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--zs-gold);
  text-shadow: 0 0 10px rgba(201, 162, 39, 0.5);
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* MAIN CONTAINER                                                              */
/* ═══════════════════════════════════════════════════════════════════════════ */

.zs-container {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* SIDEBAR                                                                     */
/* ═══════════════════════════════════════════════════════════════════════════ */

.zs-sidebar {
  width: 380px;
  background: linear-gradient(180deg, 
    rgba(20, 24, 36, 0.8) 0%, 
    rgba(10, 13, 20, 0.9) 100%
  );
  border-right: 1px solid rgba(255, 255, 255, 0.05);
  display: flex;
  flex-direction: column;
  backdrop-filter: blur(12px);
}

.zs-sidebar__header {
  padding: 24px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  background: linear-gradient(180deg, rgba(26, 31, 46, 0.5), transparent);
}

.zs-sidebar__title {
  margin: 0;
  font-family: var(--zs-font-display);
  font-size: 22px;
  font-weight: 400;
  color: var(--zs-gold);
  letter-spacing: 1px;
  text-shadow: 0 0 15px rgba(201, 162, 39, 0.4);
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* SCANNING INDICATOR                                                          */
/* ═══════════════════════════════════════════════════════════════════════════ */

.zs-scanning {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  flex: 1;
}

.zs-scanning__svg {
  width: 120px;
  height: 120px;
  margin-bottom: 20px;
}

.zs-scanning__ring {
  fill: none;
  stroke: rgba(201, 162, 39, 0.2);
  stroke-width: 2;
}

.zs-scanning__ring-inner {
  fill: none;
  stroke: rgba(201, 162, 39, 0.1);
  stroke-width: 1;
  stroke-dasharray: 4 4;
  animation: zs-spin-reverse 10s linear infinite;
  transform-origin: 50px 50px;
}

.zs-scanning__sweep {
  fill: url(#radar-gradient); /* Fallback if defs not used */
  fill: rgba(201, 162, 39, 0.2);
  transform-origin: 50px 50px;
  animation: zs-spin 2s linear infinite;
}

.zs-scanning__dot {
  fill: var(--zs-gold);
  filter: drop-shadow(0 0 4px var(--zs-gold));
  animation: zs-pulse-fast 1s ease-in-out infinite;
}

.zs-scanning__text {
  font-family: var(--zs-font-mono);
  font-size: 14px;
  color: var(--zs-gold);
  letter-spacing: 3px;
  animation: zs-pulse 2s ease-in-out infinite;
}

.zs-scanning__subtitle {
  font-family: var(--zs-font-body);
  font-size: 12px;
  color: var(--zs-text-muted);
  margin-top: 8px;
  letter-spacing: 0.5px;
  max-width: 400px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Progress Bar Styles */
.zs-scanning__progress-container {
  width: 100%;
  max-width: 400px;
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.zs-scanning__progress-bg {
  width: 100%;
  height: 8px;
  background: rgba(201, 162, 39, 0.1);
  border: 1px solid rgba(201, 162, 39, 0.3);
  border-radius: 4px;
  overflow: hidden;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.3);
}

.zs-scanning__progress-fill {
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, 
    var(--zs-gold-dim) 0%,
    var(--zs-gold) 50%,
    var(--zs-gold-bright) 100%
  );
  border-radius: 3px;
  transition: width 0.05s ease-out;
  box-shadow: 
    0 0 8px rgba(201, 162, 39, 0.5),
    0 0 20px rgba(201, 162, 39, 0.2);
  position: relative;
}

.zs-scanning__progress-fill::after {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.3) 50%,
    transparent 100%
  );
  animation: zs-shimmer 1.5s infinite;
}

@keyframes zs-shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.zs-scanning__progress-text {
  font-family: var(--zs-font-mono);
  font-size: 12px;
  color: var(--zs-text-muted);
  letter-spacing: 1px;
}

@keyframes zs-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes zs-spin-reverse {
  from { transform: rotate(360deg); }
  to { transform: rotate(0deg); }
}

@keyframes zs-pulse-fast {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.8); }
}

.zs-hidden {
  display: none !important;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* SERVER LIST                                                                 */
/* ═══════════════════════════════════════════════════════════════════════════ */

.zs-server-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* SERVER ITEM                                                                 */
/* ═══════════════════════════════════════════════════════════════════════════ */

.zs-server-item {
  position: relative;
  background: linear-gradient(135deg, 
    rgba(26, 31, 46, 0.6) 0%, 
    rgba(20, 24, 36, 0.8) 100%
  );
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 16px;
  padding-left: 20px;
  margin-bottom: 10px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.zs-server-item::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: var(--zs-text-dim);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.zs-server-item:hover {
  background: linear-gradient(135deg, 
    rgba(40, 46, 66, 0.7) 0%, 
    rgba(26, 31, 46, 0.9) 100%
  );
  border-color: var(--zs-gold-dim);
  transform: translateX(4px);
  box-shadow: var(--zs-shadow-md), var(--zs-shadow-glow-gold);
}

.zs-server-item:hover::before {
  opacity: 1;
  background: var(--zs-gold);
}

/* Selected State */
.zs-server-item--selected {
  background: linear-gradient(135deg, 
    rgba(153, 102, 204, 0.15) 0%, 
    rgba(26, 31, 46, 0.9) 100%
  );
  border-color: var(--zs-amethyst-dark);
  box-shadow: var(--zs-shadow-md), var(--zs-shadow-glow-amethyst);
}

.zs-server-item--selected::before {
  opacity: 1;
  background: var(--zs-amethyst);
}

/* Running State */
.zs-server-item--running::after {
  content: "";
  position: absolute;
  top: 12px;
  right: 60px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--zs-emerald);
  box-shadow: 0 0 8px var(--zs-emerald), 0 0 16px var(--zs-emerald);
  animation: zs-pulse 2s ease-in-out infinite;
}

@keyframes zs-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(0.9); }
}

.zs-server-item__content {
  flex: 1;
  min-width: 0;
}

.zs-server-item__name {
  font-family: var(--zs-font-display);
  font-size: 15px;
  color: var(--zs-text);
  margin-bottom: 6px;
  font-weight: 500;
}

.zs-server-item__desc {
  font-family: var(--zs-font-body);
  font-size: 12px;
  color: var(--zs-text-muted);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.zs-server-item__score {
  position: absolute;
  top: 10px;
  right: 12px;
  font-family: var(--zs-font-mono);
  font-size: 10px;
  color: var(--zs-gold-dim);
  border: 1px solid var(--zs-gold-dim);
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(139, 117, 0, 0.1);
}

.zs-server-item__status {
  display: none;
}

/* Server Item - Inline URL Display */
.zs-server-item__url-container {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding: 10px 14px;
  background: linear-gradient(135deg, 
    rgba(80, 200, 120, 0.15) 0%, 
    rgba(46, 139, 87, 0.1) 100%
  );
  border: 1px solid var(--zs-emerald);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.zs-server-item__url-container:hover {
  background: linear-gradient(135deg, 
    rgba(80, 200, 120, 0.25) 0%, 
    rgba(46, 139, 87, 0.2) 100%
  );
  box-shadow: 0 0 15px rgba(80, 200, 120, 0.3);
  transform: translateX(2px);
}

.zs-server-item__url-container--hidden {
  display: none !important;
}

.zs-server-item__url-icon {
  font-size: 16px;
  filter: drop-shadow(0 0 4px rgba(80, 200, 120, 0.5));
}

.zs-server-item__url-text {
  flex: 1;
  font-family: var(--zs-font-mono);
  font-size: 13px;
  font-weight: 600;
  color: var(--zs-emerald);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.zs-server-item__url-hint {
  font-family: var(--zs-font-body);
  font-size: 10px;
  color: var(--zs-text-muted);
  opacity: 0.7;
  transition: opacity 0.2s ease;
}

.zs-server-item__url-container:hover .zs-server-item__url-hint {
  opacity: 1;
  color: var(--zs-emerald);
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* CONTENT AREA                                                                */
/* ═══════════════════════════════════════════════════════════════════════════ */

.zs-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: radial-gradient(ellipse at top right, 
    rgba(26, 31, 46, 0.8) 0%, 
    var(--zs-bg) 70%
  );
  padding: 24px;
  overflow: hidden;
}

.zs-content__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.zs-content__title {
  font-family: var(--zs-font-display);
  font-size: 28px;
  font-weight: 400;
  color: var(--zs-gold);
  margin: 0;
  text-shadow: 0 0 20px rgba(201, 162, 39, 0.3);
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* CONTROL PANEL                                                               */
/* ═══════════════════════════════════════════════════════════════════════════ */

.zs-control-panel {
  display: flex;
  gap: 12px;
}

.zs-control-panel--hidden {
  display: none;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* BUTTONS                                                                     */
/* ═══════════════════════════════════════════════════════════════════════════ */

.zs-btn {
  font-family: var(--zs-font-body);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 1px;
  text-transform: uppercase;
  padding: 10px 24px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.zs-btn::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(255,255,255,0.1), transparent);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.zs-btn:hover::before {
  opacity: 1;
}

/* Start Button */
.zs-btn--start {
  background: transparent;
  border: 1px solid var(--zs-emerald-dark);
  color: var(--zs-emerald);
}

.zs-btn--start:hover {
  background: var(--zs-emerald);
  color: var(--zs-bg);
  box-shadow: var(--zs-shadow-glow-emerald);
}

/* Stop Button */
.zs-btn--stop {
  background: transparent;
  border: 1px solid var(--zs-ruby-dark);
  color: var(--zs-ruby);
}

.zs-btn--stop:hover {
  background: var(--zs-ruby);
  color: var(--zs-bg);
  box-shadow: var(--zs-shadow-glow-ruby);
}

/* Disabled State */
.zs-btn--disabled,
.zs-btn:disabled {
  border-color: var(--zs-text-dim);
  color: var(--zs-text-dim);
  cursor: not-allowed;
  opacity: 0.5;
}

.zs-btn--disabled:hover,
.zs-btn:disabled:hover {
  background: transparent;
  box-shadow: none;
}

.zs-btn--disabled::before,
.zs-btn:disabled::before {
  display: none;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* SERVER URL DISPLAY (Large Clickable)                                        */
/* ═══════════════════════════════════════════════════════════════════════════ */

.zs-server-url {
  display: flex;
  align-items: center;
  gap: 16px;
  background: linear-gradient(135deg, 
    rgba(80, 200, 120, 0.15) 0%, 
    rgba(46, 139, 87, 0.1) 50%,
    rgba(26, 31, 46, 0.9) 100%
  );
  border: 2px solid var(--zs-emerald);
  border-radius: 12px;
  padding: 20px 28px;
  margin-bottom: 20px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.zs-server-url::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, 
    rgba(80, 200, 120, 0.1) 0%, 
    transparent 100%
  );
  opacity: 0;
  transition: opacity 0.3s ease;
}

.zs-server-url:hover {
  border-color: var(--zs-emerald);
  transform: translateY(-2px);
  box-shadow: 
    var(--zs-shadow-lg),
    0 0 40px rgba(80, 200, 120, 0.3),
    0 0 60px rgba(80, 200, 120, 0.2);
}

.zs-server-url:hover::before {
  opacity: 1;
}

.zs-server-url:active {
  transform: translateY(0);
}

.zs-server-url--hidden {
  display: none !important;
}

.zs-server-url__icon {
  font-size: 36px;
  filter: drop-shadow(0 0 10px rgba(80, 200, 120, 0.5));
  animation: zs-url-pulse 2s ease-in-out infinite;
}

@keyframes zs-url-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

.zs-server-url__wrapper {
  flex: 1;
  min-width: 0;
}

.zs-server-url__label {
  font-family: var(--zs-font-body);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: var(--zs-emerald);
  margin-bottom: 6px;
}

.zs-server-url__text {
  font-family: var(--zs-font-mono);
  font-size: 24px;
  font-weight: 600;
  color: var(--zs-text);
  text-shadow: 0 0 20px rgba(80, 200, 120, 0.3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.zs-server-url__browser {
  font-family: var(--zs-font-body);
  font-size: 12px;
  color: var(--zs-text-muted);
  letter-spacing: 0.5px;
  opacity: 0.8;
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.zs-server-url:hover .zs-server-url__browser {
  opacity: 1;
  transform: translateX(4px);
  color: var(--zs-emerald);
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* LOG VIEWER                                                                  */
/* ═══════════════════════════════════════════════════════════════════════════ */

.zs-log-viewer {
  flex: 1;
  background: linear-gradient(135deg, 
    rgba(0, 0, 0, 0.7) 0%, 
    rgba(5, 5, 8, 0.9) 100%
  );
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 16px;
  overflow-y: auto;
  font-family: var(--zs-font-mono);
  font-size: 12px;
  line-height: 1.6;
  box-shadow: inset 0 2px 20px rgba(0, 0, 0, 0.5);
}

.zs-log-viewer__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--zs-text-dim);
}

.zs-log-viewer__empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  color: rgba(201, 162, 39, 0.2);
  text-shadow: 0 0 30px rgba(201, 162, 39, 0.1);
}

.zs-log-viewer__empty-text {
  font-family: var(--zs-font-body);
  font-size: 14px;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* LOG ENTRIES                                                                 */
/* ═══════════════════════════════════════════════════════════════════════════ */

.zs-log-entry {
  padding: 4px 0;
  white-space: pre-wrap;
  word-break: break-all;
  border-left: 2px solid transparent;
  padding-left: 8px;
  margin-left: -8px;
}

.zs-log-entry--stdout {
  color: var(--zs-text-muted);
}

.zs-log-entry--stderr {
  color: var(--zs-ruby);
  border-left-color: var(--zs-ruby-dark);
  background: rgba(227, 24, 55, 0.05);
}

.zs-log-entry--system {
  color: var(--zs-gold);
  font-style: italic;
  border-bottom: 1px solid rgba(201, 162, 39, 0.15);
  padding-bottom: 8px;
  margin-bottom: 8px;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* SERVER LOG WINDOW - Industrial Luxury Obsidian                              */
/* ═══════════════════════════════════════════════════════════════════════════ */

.zs-log-window {
  position: absolute;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, 
    rgba(20, 24, 36, 0.98) 0%, 
    rgba(10, 13, 20, 0.99) 100%
  );
  border: 1px solid rgba(201, 162, 39, 0.3);
  border-radius: 8px;
  box-shadow: 
    0 8px 32px rgba(0, 0, 0, 0.7),
    0 0 1px rgba(201, 162, 39, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  overflow: hidden;
  z-index: 100;
  backdrop-filter: blur(12px);
  transition: box-shadow 0.2s ease, transform 0.15s ease;
}

.zs-log-window:hover {
  box-shadow: 
    0 12px 48px rgba(0, 0, 0, 0.8),
    0 0 2px rgba(201, 162, 39, 0.6),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.zs-log-window--hidden {
  display: none !important;
}

.zs-log-window--dragging {
  opacity: 0.9;
  cursor: grabbing;
}

.zs-log-window--resizing {
  opacity: 0.95;
}

.zs-log-window--minimized {
  height: auto !important;
}

.zs-log-window--minimized .inner,
.zs-log-window--minimized .zs-log-window__resize-handle {
  display: none;
}

.zs-log-window--maximized {
  left: 0 !important;
  top: 0 !important;
  width: 100% !important;
  height: 100% !important;
  border-radius: 0;
}

/* Override jsgui3 Window default styles */
.zs-log-window.window {
  background: linear-gradient(180deg, 
    rgba(20, 24, 36, 0.98) 0%, 
    rgba(10, 13, 20, 0.99) 100%
  );
}

.zs-log-window .relative {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* Title bar styling */
.zs-log-window .title.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: linear-gradient(180deg, 
    rgba(201, 162, 39, 0.15) 0%, 
    rgba(201, 162, 39, 0.05) 100%
  );
  border-bottom: 1px solid rgba(201, 162, 39, 0.3);
  cursor: grab;
  user-select: none;
}

.zs-log-window .title.bar:active {
  cursor: grabbing;
}

.zs-log-window .title.bar h2 {
  margin: 0;
  font-family: var(--zs-font-display);
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--zs-gold);
  text-shadow: 0 0 10px rgba(201, 162, 39, 0.4);
}

/* Window buttons */
.zs-log-window .button-group.right {
  display: flex;
  gap: 8px;
}

.zs-log-window .button-group button {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid rgba(201, 162, 39, 0.3);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.3);
  color: var(--zs-gold);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.zs-log-window .button-group button:hover {
  background: rgba(201, 162, 39, 0.2);
  border-color: var(--zs-gold);
  transform: scale(1.1);
}

.zs-log-window .button-group button:last-child:hover {
  background: rgba(227, 24, 55, 0.3);
  border-color: var(--zs-ruby);
  color: var(--zs-ruby);
}

/* Inner content area */
.zs-log-window .inner {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 12px;
}

.zs-log-window .inner .zs-log-viewer {
  flex: 1;
  margin: 0;
  border-radius: 4px;
}

/* Resize handle */
.zs-log-window__resize-handle {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  cursor: se-resize;
  background: linear-gradient(135deg, 
    transparent 50%, 
    rgba(201, 162, 39, 0.3) 50%
  );
  border-radius: 0 0 8px 0;
  transition: background 0.15s ease;
}

.zs-log-window__resize-handle:hover {
  background: linear-gradient(135deg, 
    transparent 50%, 
    rgba(201, 162, 39, 0.5) 50%
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* SCROLLBAR                                                                   */
/* ═══════════════════════════════════════════════════════════════════════════ */

::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: rgba(5, 5, 8, 0.5);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, var(--zs-gold-dim), #5a4a10);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, var(--zs-gold), var(--zs-gold-dim));
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* ANIMATIONS                                                                  */
/* ═══════════════════════════════════════════════════════════════════════════ */

@keyframes zs-fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.zs-server-item {
  animation: zs-fade-in 0.4s ease both;
  animation-delay: calc(var(--item-index, 0) * 50ms);
}
`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPORTS
  // ═══════════════════════════════════════════════════════════════════════════

  return {
    ServerItemControl,
    ServerListControl,
    LogEntryControl,
    LogViewerControl,
    ServerLogWindowControl,
    ControlButtonControl,
    ControlPanelControl,
    SidebarControl,
    ContentAreaControl,
    TitleBarControl,
    ZServerAppControl,
    buildZServerStyles
  };
}

module.exports = { createZServerControls };
