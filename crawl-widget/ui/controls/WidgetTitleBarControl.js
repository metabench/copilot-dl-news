"use strict";

function createWidgetTitleBarControl(jsgui) {
  const StringControl = jsgui.String_Control;

  class WidgetTitleBarControl extends jsgui.Control {
    constructor(spec = {}) {
      super({ ...spec, tagName: "header" });
      this.add_class("cw-title-bar");
      this._api = spec.api || null;
      this._onToggleTools = spec.onToggleTools || null;
      if (!spec.el) this.compose();
    }

    compose() {
      const controls = new jsgui.Control({ context: this.context, tagName: "div" });
      controls.add_class("cw-title-bar__controls");

      this._minimizeBtn = new jsgui.Control({ context: this.context, tagName: "button" });
      this._minimizeBtn.add_class("cw-title-bar__btn");
      this._minimizeBtn.add_class("cw-title-bar__btn--minimize");
      this._minimizeBtn.dom.attributes.title = "Minimize";
      this._minimizeBtn.add(new StringControl({ context: this.context, text: "─" }));

      this._toolsBtn = new jsgui.Control({ context: this.context, tagName: "button" });
      this._toolsBtn.add_class("cw-title-bar__btn");
      this._toolsBtn.add_class("cw-title-bar__btn--tools");
      this._toolsBtn.dom.attributes.title = "Tools";
      this._toolsBtn.add(new StringControl({ context: this.context, text: "🔍" }));

      this._closeBtn = new jsgui.Control({ context: this.context, tagName: "button" });
      this._closeBtn.add_class("cw-title-bar__btn");
      this._closeBtn.add_class("cw-title-bar__btn--close");
      this._closeBtn.dom.attributes.title = "Close";
      this._closeBtn.add(new StringControl({ context: this.context, text: "×" }));

      controls.add(this._toolsBtn);
      controls.add(this._minimizeBtn);
      controls.add(this._closeBtn);
      this.add(controls);

      const title = new jsgui.Control({ context: this.context, tagName: "span" });
      title.add_class("cw-title-bar__title");
      title.add(new StringControl({ context: this.context, text: "CRAWL // WIDGET" }));
      this.add(title);
    }

    _el(ctrl = this) {
      return ctrl?.dom?.el || null;
    }

    activate() {
      if (this.__active) return;
      super.activate();

      console.log("[TitleBar] activate - minimizeBtn:", !!this._minimizeBtn, "closeBtn:", !!this._closeBtn);

      this._minimizeBtn?.on("click", () => {
        console.log("[TitleBar] Minimize clicked");
        if (this._api?.minimizeWidget) {
          this._api.minimizeWidget();
        }
      });

      this._toolsBtn?.on("click", () => {
        if (typeof this._onToggleTools === "function") {
          this._onToggleTools();
        }
      });

      this._closeBtn?.on("click", () => {
        console.log("[TitleBar] Close clicked");
        if (this._api?.closeWidget) {
          this._api.closeWidget();
        }
      });
    }
  }

  return WidgetTitleBarControl;
}

module.exports = { createWidgetTitleBarControl };
