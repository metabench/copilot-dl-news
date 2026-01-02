'use strict';

const jsgui = require('jsgui3-html');

class SubAppFrame extends jsgui.Control {
  constructor(spec = {}) {
    super({
      ...spec,
      tagName: 'iframe',
      __type_name: 'sub_app_frame'
    });

    this.src = spec.src;
    this.title = spec.title;
    this.loading = spec.loading || 'lazy';

    if (!spec.el) {
      this.compose();
    }
  }

  compose() {
    this.add_class('app-embed');

    if (this.src) {
      this.dom.attributes.src = this.src;
    }

    if (this.title) {
      this.dom.attributes.title = this.title;
    }

    if (this.loading) {
      this.dom.attributes.loading = this.loading;
    }
  }

  render() {
    return this.all_html_render();
  }
}

module.exports = { SubAppFrame };
