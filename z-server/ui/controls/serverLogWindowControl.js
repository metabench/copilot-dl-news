"use strict";

function createServerLogWindowControl(jsgui, { LogViewerControl }) {
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
      
      if (this.ctrl_inner) {
        this._logViewer = new LogViewerControl({
          context: this.context,
          showEmpty: true
        });
        this.ctrl_inner.add(this._logViewer);
      }
      
      const resizeHandle = new jsgui.div({ context: this.context, class: "zs-log-window__resize-handle" });
      this.add(resizeHandle);
      this._resizeHandle = resizeHandle;
      
      if (!this._visible) {
        this.add_class("zs-log-window--hidden");
      }
    }

    activate() {
      if (super.activate) {
        super.activate();
      }
      
      if (!this.dom.el) return;
      
      const el = this.dom.el;
      
      el.style.position = "absolute";
      el.style.left = `${this._position.x}px`;
      el.style.top = `${this._position.y}px`;
      el.style.width = `${this._size.width}px`;
      el.style.height = `${this._size.height}px`;
      
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
      
      if (this.title_bar && this.title_bar.dom.el) {
        this._setupDragging(this.title_bar.dom.el, el);
      }
      
      if (this._resizeHandle && this._resizeHandle.dom.el) {
        this._setupResizing(this._resizeHandle.dom.el, el);
      }
      
      el.addEventListener("mousedown", () => this.bringToFront());
      
      if (this._logViewer) {
        this._logViewer.activate();
      }
    }

    _setupDragging(titleEl, windowEl) {
      let isDragging = false;
      let dragStart = { x: 0, y: 0 };
      let posStart = { x: 0, y: 0 };
      
      titleEl.addEventListener("mousedown", (e) => {
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
        if (btn) btn.textContent = "\u2295";
      } else {
        el.classList.remove("zs-log-window--minimized");
        if (btn) btn.textContent = "\u2296";
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
        if (btn) btn.textContent = "\u25f1";
      } else {
        this._position = this._savedPos || this._position;
        this._size = this._savedSize || this._size;
        el.classList.remove("zs-log-window--maximized");
        el.style.left = `${this._position.x}px`;
        el.style.top = `${this._position.y}px`;
        el.style.width = `${this._size.width}px`;
        el.style.height = `${this._size.height}px`;
        if (btn) btn.textContent = "\u2295";
      }
    }

    show(serverName) {
      if (serverName) {
        this._serverName = serverName;
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

  return ServerLogWindowControl;
}

module.exports = { createServerLogWindowControl };
