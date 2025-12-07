"use strict";

function createTitleBarControl(jsgui, { StringControl }) {
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

  return TitleBarControl;
}

module.exports = { createTitleBarControl };
