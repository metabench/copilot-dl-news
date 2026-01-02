'use strict';

const jsgui = require('jsgui3-html');

class SubAppPlaceholder extends jsgui.Control {
  constructor(spec = {}) {
    super({
      ...spec,
      tagName: 'div',
      __type_name: 'sub_app_placeholder'
    });

    this.title = spec.title || 'Coming soon';
    this.subtitle = spec.subtitle || null;

    if (!spec.el) {
      this.compose();
    }
  }

  compose() {
    this.add_class('app-placeholder');

    const { context } = this;

    const titleP = new jsgui.Control({ context, tagName: 'p' });
    titleP.add(this.title);
    this.add(titleP);

    if (this.subtitle) {
      const sub = new jsgui.Control({ context, tagName: 'div' });
      sub.add_class('error');
      sub.add(this.subtitle);
      this.add(sub);
    }
  }

  render() {
    return this.all_html_render();
  }
}

module.exports = { SubAppPlaceholder };
