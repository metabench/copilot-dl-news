"use strict";

function createServerListControl(jsgui, { ServerItemControl }) {
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
      if (this._selectedFile && this._itemControls.has(this._selectedFile)) {
        this._itemControls.get(this._selectedFile).setSelected(false);
      }
      
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
      
      if (this.dom.el) {
        console.log("[ServerList] DOM element exists, updating directly");
        this.dom.el.innerHTML = '';
        
        this._itemControls.forEach((item) => {
          item.register_this_and_subcontrols();
          const itemHtml = item.all_html_render();
          this.dom.el.insertAdjacentHTML('beforeend', itemHtml);
          const itemEl = this.dom.el.querySelector('[data-jsgui-id="' + item._id() + '"]');
          if (itemEl) {
            item.dom.el = itemEl;
            this.context.map_els[item._id()] = itemEl;
            if (item.rec_desc_ensure_ctrl_el_refs) {
              item.rec_desc_ensure_ctrl_el_refs(itemEl);
            }
          }
        });
        
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

  return ServerListControl;
}

module.exports = { createServerListControl };
