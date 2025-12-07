"use strict";

function createSidebarControl(jsgui, { ServerListControl, StringControl }) {
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
      
      const header = new jsgui.div({ context: ctx, class: "zs-sidebar__header" });
      const title = new jsgui.h2({ context: ctx, class: "zs-sidebar__title" });
      title.add(new StringControl({ context: ctx, text: "\u25c8 Servers" }));
      header.add(title);
      this.add(header);
      
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

  return SidebarControl;
}

module.exports = { createSidebarControl };
