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

      this._scanVisibility = spec.scanVisibility && typeof spec.scanVisibility === "object" ? spec.scanVisibility : null;
      this._onChangeScanVisibility = spec.onChangeScanVisibility || null;
      
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

      this._filtersWrap = new jsgui.div({ context: ctx, class: "zs-sidebar__filters" });
      const filtersTitle = new jsgui.div({ context: ctx, class: "zs-sidebar__filters-title" });
      filtersTitle.add(new StringControl({ context: ctx, text: "Show:" }));
      this._filtersWrap.add(filtersTitle);

      this._filterCheckboxes = {};
      const addFilter = (key, labelText) => {
        const row = new jsgui.div({ context: ctx, class: "zs-sidebar__filter" });
        const label = new jsgui.Control({ context: ctx, tagName: "label", class: "zs-sidebar__filter-label" });
        const checkbox = new jsgui.Control({ context: ctx, tagName: "input", class: `zs-sidebar__filter-checkbox zs-sidebar__filter-checkbox--${key}` });
        checkbox.dom.attributes.type = "checkbox";
        checkbox.dom.attributes["data-filter-key"] = key;
        const text = new jsgui.span({ context: ctx, class: "zs-sidebar__filter-text" });
        text.add(new StringControl({ context: ctx, text: labelText }));

        label.add(checkbox);
        label.add(text);
        row.add(label);
        this._filtersWrap.add(row);

        this._filterCheckboxes[key] = checkbox;
      };

      addFilter("ui", "UI servers");
      addFilter("labs", "Lab experiments");
      addFilter("api", "API/back-end");
      addFilter("tools", "Tools");
      addFilter("tests", "Tests");
      addFilter("checks", "Checks");
      addFilter("other", "Other");

      header.add(this._filtersWrap);
      this.add(header);
      
      this._serverList = new ServerListControl({
        context: ctx,
        servers: this._servers,
        onSelect: (s) => this._onSelect && this._onSelect(s),
        onOpenUrl: (url) => this._onOpenUrl && this._onOpenUrl(url)
      });
      this.add(this._serverList);

      this.setScanVisibility(this._scanVisibility);
    }

    setServers(servers) {
      this._servers = servers;
      this._serverList.setServers(servers);
    }

    setScanVisibility(visibility) {
      this._scanVisibility = visibility && typeof visibility === "object" ? visibility : null;
      if (!this._filterCheckboxes) return;

      for (const [key, checkbox] of Object.entries(this._filterCheckboxes)) {
        const enabled = this._scanVisibility && this._scanVisibility[key] === true;
        if (enabled) {
          checkbox.dom.attributes.checked = "checked";
        } else {
          delete checkbox.dom.attributes.checked;
        }
      }

      if (this.dom.el) {
        for (const key of Object.keys(this._filterCheckboxes)) {
          const el = this.dom.el.querySelector(`.zs-sidebar__filter-checkbox--${key}`);
          if (el) el.checked = this._scanVisibility && this._scanVisibility[key] === true;
        }
      }
    }

    updateServerStatus(filePath, running) {
      this._serverList.updateServerStatus(filePath, running);
    }

    setServerRunningUrl(filePath, url) {
      this._serverList.setServerRunningUrl(filePath, url);
    }

    activate() {
      this._serverList.activate();

      if (this.dom.el) {
        const checkboxes = this.dom.el.querySelectorAll(".zs-sidebar__filter-checkbox");
        for (const checkbox of checkboxes) {
          if (checkbox.__zsBound) continue;
          checkbox.__zsBound = true;

          checkbox.addEventListener("change", () => {
            const key = checkbox.getAttribute("data-filter-key");
            if (!key) return;
            const enabled = checkbox.checked === true;

            if (!this._scanVisibility || typeof this._scanVisibility !== "object") {
              this._scanVisibility = {};
            }
            this._scanVisibility[key] = enabled;

            if (this._onChangeScanVisibility) {
              this._onChangeScanVisibility({ ...this._scanVisibility });
            }
          });
        }
      }
    }
  }

  return SidebarControl;
}

module.exports = { createSidebarControl };
