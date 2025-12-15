"use strict";

function createLogControls(jsgui, { StringControl }) {
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
        icon.add(new StringControl({ context: this.context, text: "\u25c8" }));
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
      if (this.dom.el) {
        this.dom.el.innerHTML = this.all_html_render_inner();
      }
      this._scrollToBottom();
    }

    addLog(type, data) {
      this._logs.push({ type, data });
      
      if (this._logs.length === 1) {
        this._renderLogs();
        if (this.dom.el) {
          this.dom.el.innerHTML = this.all_html_render_inner();
        }
      } else {
        const entry = new LogEntryControl({
          context: this.context,
          type,
          text: data
        });
        this.add(entry);
        
        if (this.dom.el) {
          const entryHtml = entry.all_html_render();
          this.dom.el.insertAdjacentHTML('beforeend', entryHtml);
        }
      }
      this._scrollToBottom();
    }

    _scrollToBottom() {
      if (this.dom.el) {
        this.dom.el.scrollTop = this.dom.el.scrollHeight;
      }
    }

    activate() {
      if (super.activate) super.activate();
      if (!this.dom.el) return;
      
      this.dom.el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this._showContextMenu(e.clientX, e.clientY);
      });
    }

    _showContextMenu(x, y) {
      // Remove any existing menus
      document.querySelectorAll('.zs-context-menu').forEach(el => el.remove());
      
      // Select all text
      const range = document.createRange();
      range.selectNodeContents(this.dom.el);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      
      // Create menu
      const menu = document.createElement('div');
      menu.className = 'zs-context-menu';
      menu.style.left = `${x}px`;
      menu.style.top = `${y}px`;
      
      const copyItem = document.createElement('div');
      copyItem.className = 'zs-context-menu__item';
      copyItem.innerHTML = '<span class="zs-context-menu__item-icon">📋</span> Copy';
      
      copyItem.addEventListener('click', () => {
        const text = this.dom.el.innerText;
        navigator.clipboard.writeText(text).then(() => {
          // Optional: visual feedback
        });
        menu.remove();
      });
      
      menu.appendChild(copyItem);
      document.body.appendChild(menu);
      
      // Close on click elsewhere
      const closeHandler = (e) => {
        if (!menu.contains(e.target)) {
          menu.remove();
          document.removeEventListener('click', closeHandler);
          document.removeEventListener('contextmenu', closeHandler);
        }
      };
      
      setTimeout(() => {
        document.addEventListener('click', closeHandler);
        document.addEventListener('contextmenu', closeHandler);
      }, 0);
    }

    clear() {
      while (this.content && this.content.length > 0) {
        this.content.pop();
      }
    }
  }

  return { LogEntryControl, LogViewerControl };
}

module.exports = { createLogControls };
