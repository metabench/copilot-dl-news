"use strict";

const { getBodyControl } = require("./controlUtils");

function createCrawlTypeSelectorControl(jsgui) {
  const StringControl = jsgui.String_Control;

  class CrawlTypeSelectorControl extends jsgui.Control {
    constructor(spec = {}) {
      super({ ...spec, tagName: "div" });
      this.add_class("cw-type-selector");
      this._crawlTypes = spec.crawlTypes || [];
      this._selectedType = spec.selectedType || "standard";
      this._onTypeChange = spec.onTypeChange || null;
      if (!spec.el) this.compose();
    }

    compose() {
      this._display = new jsgui.Control({ context: this.context, tagName: "button" });
      this._display.add_class("cw-type-selector__display");

      const type = this._crawlTypes.find((t) => t.id === this._selectedType) || { icon: "🕷️", label: "Standard" };

      this._displayIcon = new jsgui.Control({ context: this.context, tagName: "span" });
      this._displayIcon.add_class("cw-type-selector__icon");
      this._displayIcon.add(new StringControl({ context: this.context, text: type.icon }));

      this._displayLabel = new jsgui.Control({ context: this.context, tagName: "span" });
      this._displayLabel.add_class("cw-type-selector__label");
      this._displayLabel.add(new StringControl({ context: this.context, text: type.label }));

      const arrow = new jsgui.Control({ context: this.context, tagName: "span" });
      arrow.add_class("cw-type-selector__arrow");
      arrow.add(new StringControl({ context: this.context, text: "▾" }));

      this._display.add(this._displayIcon);
      this._display.add(this._displayLabel);
      this._display.add(arrow);
      this.add(this._display);

      this._dropdown = new jsgui.Control({ context: this.context, tagName: "div" });
      this._dropdown.add_class("cw-type-selector__dropdown");
      this._dropdown.dom.attributes.style = "display: none;";

      this._crawlTypes.forEach((crawlType) => {
        const option = new jsgui.Control({ context: this.context, tagName: "button" });
        option.add_class("cw-type-selector__option");
        option.dom.attributes["data-type"] = crawlType.id;

        const icon = new jsgui.Control({ context: this.context, tagName: "span" });
        icon.add(new StringControl({ context: this.context, text: crawlType.icon }));

        const label = new jsgui.Control({ context: this.context, tagName: "span" });
        label.add(new StringControl({ context: this.context, text: crawlType.label }));

        option.add(icon);
        option.add(label);
        this._dropdown.add(option);
      });

      this.add(this._dropdown);
    }

    setTypes(types) {
      this._crawlTypes = types;
      this._rebuildDropdown();
    }

    _rebuildDropdown() {
      const dropdownEl = this._el(this._dropdown);
      if (!dropdownEl) return;

      dropdownEl.innerHTML = "";

      this._crawlTypes.forEach((crawlType) => {
        const option = new jsgui.Control({ context: this.context, tagName: "button" });
        option.add_class("cw-type-selector__option");
        option.dom.attributes["data-type"] = crawlType.id;

        const icon = new jsgui.Control({ context: this.context, tagName: "span" });
        icon.add(new StringControl({ context: this.context, text: crawlType.icon }));
        option.add(icon);

        const label = new jsgui.Control({ context: this.context, tagName: "span" });
        label.add(new StringControl({ context: this.context, text: crawlType.label }));
        option.add(label);

        option.on("click", () => {
          this._selectedType = crawlType.id;
          this._updateDisplay(crawlType);
          dropdownEl.style.display = "none";
          if (this._onTypeChange) {
            this._onTypeChange(crawlType.id);
          }
        });

        this._dropdown.add(option);
      });

      if (this._crawlTypes.length > 0) {
        const currentType = this._crawlTypes.find((t) => t.id === this._selectedType);
        if (!currentType) {
          this._selectedType = this._crawlTypes[0].id;
        }
        const displayType = currentType || this._crawlTypes[0];
        this._updateDisplay(displayType);
      }
    }

    getSelectedType() {
      return this._selectedType;
    }

    _el(ctrl = this) {
      return ctrl?.dom?.el || null;
    }

    _updateDisplay(type) {
      const iconEl = this._el(this._displayIcon);
      const labelEl = this._el(this._displayLabel);
      if (iconEl) iconEl.textContent = type.icon;
      if (labelEl) labelEl.textContent = type.label;
    }

    activate() {
      if (this.__active) return;
      super.activate();

      const dropdownEl = this._el(this._dropdown);

      console.log("[TypeSelector] activate - display:", !!this._display, "dropdownEl:", !!dropdownEl);

      this._display?.on("click", (e) => {
        e.stopPropagation();
        if (!dropdownEl) return;
        const isOpen = dropdownEl.style.display !== "none";
        dropdownEl.style.display = isOpen ? "none" : "block";
      });

      const bodyCtrl = getBodyControl(this.context);
      const handleBodyClick = (evt) => {
        const target = evt?.target;
        if (!dropdownEl) return;
        const displayEl = this._el(this._display);
        if (dropdownEl.contains(target)) return;
        if (displayEl && displayEl.contains && displayEl.contains(target)) return;
        dropdownEl.style.display = "none";
      };

      if (bodyCtrl?.on) {
        bodyCtrl.on("click", handleBodyClick);
      } else {
        const bodyEl = bodyCtrl?.dom?.el || bodyCtrl || this.context?.document?.body;
        if (bodyEl?.addEventListener) {
          bodyEl.addEventListener("click", handleBodyClick);
        }
      }
    }
  }

  return CrawlTypeSelectorControl;
}

module.exports = { createCrawlTypeSelectorControl };
