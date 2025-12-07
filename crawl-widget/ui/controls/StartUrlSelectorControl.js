"use strict";

const { getBodyControl } = require("./controlUtils");

function createStartUrlSelectorControl(jsgui) {
  const StringControl = jsgui.String_Control;

  class StartUrlSelectorControl extends jsgui.Control {
    constructor(spec = {}) {
      super({ ...spec, tagName: "div" });
      this.add_class("cw-url-selector");
      this._sources = spec.sources || [];
      this._selectedUrl = spec.selectedUrl || "";
      this._onUrlChange = spec.onUrlChange || null;
      this._api = spec.api || null;
      if (!spec.el) this.compose();
    }

    compose() {
      this._display = new jsgui.Control({ context: this.context, tagName: "button" });
      this._display.add_class("cw-url-selector__display");

      this._displayFavicon = new jsgui.Control({ context: this.context, tagName: "img" });
      this._displayFavicon.add_class("cw-url-selector__favicon");
      this._displayFavicon.dom.attributes.src = "";
      this._displayFavicon.dom.attributes.alt = "";
      this._displayFavicon.dom.attributes.style = "display: none;";

      this._displayIcon = new jsgui.Control({ context: this.context, tagName: "span" });
      this._displayIcon.add_class("cw-url-selector__icon");
      this._displayIcon.add(new StringControl({ context: this.context, text: "🌐" }));

      this._displayLabel = new jsgui.Control({ context: this.context, tagName: "span" });
      this._displayLabel.add_class("cw-url-selector__label");
      this._displayLabel.add(new StringControl({ context: this.context, text: "Select a website..." }));

      const arrow = new jsgui.Control({ context: this.context, tagName: "span" });
      arrow.add_class("cw-url-selector__arrow");
      arrow.add(new StringControl({ context: this.context, text: "▾" }));

      this._display.add(this._displayFavicon);
      this._display.add(this._displayIcon);
      this._display.add(this._displayLabel);
      this._display.add(arrow);
      this.add(this._display);

      this._dropdown = new jsgui.Control({ context: this.context, tagName: "div" });
      this._dropdown.add_class("cw-url-selector__dropdown");
      this._dropdown.dom.attributes.style = "display: none;";
      this.add(this._dropdown);
    }

    setSources(sources) {
      this._sources = sources;
      this._rebuildDropdown();
    }

    _rebuildDropdown() {
      const dropdownEl = this._el(this._dropdown);
      if (dropdownEl) {
        dropdownEl.innerHTML = "";
      }

      if (this._dropdown?.__arr_subcontrols) {
        this._dropdown.__arr_subcontrols.length = 0;
      }

      this._sources.forEach((source) => {
        const option = new jsgui.Control({ context: this.context, tagName: "button" });
        option.add_class("cw-url-selector__option");
        option.dom.attributes["data-url"] = source.url;
        option.dom.attributes["data-id"] = source.id;

        if (source.faviconUrl) {
          const img = new jsgui.Control({ context: this.context, tagName: "img" });
          img.add_class("cw-url-selector__option-favicon");
          img.dom.attributes.src = source.faviconUrl;
          img.dom.attributes.alt = "";
          option.add(img);
        } else {
          const icon = new jsgui.Control({ context: this.context, tagName: "span" });
          icon.add_class("cw-url-selector__option-icon");
          icon.add(new StringControl({ context: this.context, text: source.icon || "🌐" }));
          option.add(icon);
        }

        const label = new jsgui.Control({ context: this.context, tagName: "span" });
        label.add_class("cw-url-selector__option-label");
        label.add(new StringControl({ context: this.context, text: source.label }));
        option.add(label);

        option.on("click", () => {
          this._selectedUrl = source.url;
          this._updateDisplay(source);
          if (dropdownEl) dropdownEl.style.display = "none";
          if (this._onUrlChange) {
            this._onUrlChange(source.url, source);
          }
        });

        this._dropdown.add(option);
      });

      if (this._sources.length > 0) {
        const currentSource = this._sources.find((s) => s.url === this._selectedUrl);
        if (currentSource) {
          this._updateDisplay(currentSource);
        }
      }
    }

    getSelectedUrl() {
      return this._selectedUrl;
    }

    _el(ctrl = this) {
      return ctrl?.dom?.el || null;
    }

    _updateDisplay(source) {
      const faviconEl = this._el(this._displayFavicon);
      const iconEl = this._el(this._displayIcon);
      const labelEl = this._el(this._displayLabel);

      if (source?.faviconUrl && faviconEl) {
        faviconEl.src = source.faviconUrl;
        faviconEl.style.display = "inline-block";
        if (iconEl) iconEl.style.display = "none";
      } else {
        if (faviconEl) faviconEl.style.display = "none";
        if (iconEl) {
          iconEl.style.display = "inline-block";
          iconEl.textContent = source?.icon || "🌐";
        }
      }

      if (labelEl && source) labelEl.textContent = source.label;
    }

    activate() {
      if (this.__active) return;
      super.activate();

      const displayEl = this._el(this._display);
      const dropdownEl = this._el(this._dropdown);

      console.log("[UrlSelector] activate - displayEl:", !!displayEl, "dropdownEl:", !!dropdownEl);

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
        if (dropdownEl.contains(target)) return;
        const display = this._el(this._display);
        if (display && display.contains && display.contains(target)) return;
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

      if (this._api?.fetchMissingFavicons) {
        this._api.fetchMissingFavicons().then((result) => {
          if (result.fetched > 0 && this._api?.getNewsSources) {
            this._api.getNewsSources().then((res) => {
              if (res.success) {
                this.setSources(res.sources);
              }
            });
          }
        });
      }
    }
  }

  return StartUrlSelectorControl;
}

module.exports = { createStartUrlSelectorControl };
