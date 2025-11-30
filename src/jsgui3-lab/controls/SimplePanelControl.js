const jsgui = require('../utils/getJsgui');

/**
 * SimplePanelControl
 *
 * A minimal, reusable jsgui3 control that renders a titled panel with content.
 * Intended as a reference implementation for the lab and as a drop-in building
 * block for dashboards and editors.
 *
 * Usage (server-side):
 *   const panel = new SimplePanelControl({
 *     context,
 *     title: 'Example Panel',
 *     content: 'Hello from SimplePanelControl'
 *   });
 *   const html = panel.all_html_render();
 */
class SimplePanelControl extends jsgui.Control {
  constructor(spec = {}) {
    super({
      ...spec,
      tagName: 'div',
      __type_name: 'simple_panel'
    });

  this.title = spec.title || 'Panel';
  this.panelContent = spec.content || '';

    if (!spec.el) {
      this.compose();
    }
  }

  compose() {
    const { context } = this;

    this.add_class('simple-panel');

    const header = new jsgui.Control({ context, tagName: 'div' });
    header.add_class('simple-panel__header');
    header.add(this.title);

    const body = new jsgui.Control({ context, tagName: 'div' });
    body.add_class('simple-panel__body');

    if (typeof this.panelContent === 'string') {
      body.add(this.panelContent);
    } else if (this.panelContent instanceof jsgui.Control) {
      body.add(this.panelContent);
    }

    this.add(header);
    this.add(body);
  }
}

module.exports = SimplePanelControl;
