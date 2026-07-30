'use strict';

const { Control, Active_HTML_Document } = require('../shared/jsgui');
const Status_Widget = require('./Status_Widget');

/**
 * Project_Status_Page — the document jsgui3-server publishes.
 *
 * Server({Ctrl}) renders one activated webpage per server: one publisher, one
 * bundle, published at boot. Four separately-SSR'd pages would mean four
 * publishers and four boot-time bundles, so the shape that fits the framework
 * is one application control with client-side view state and hash deep links —
 * which is what the /tech/* redirects land on.
 */
class Project_Status_Page extends Active_HTML_Document {
  constructor(spec = {}) {
    spec.__type_name = spec.__type_name || 'project_status_page';
    super(spec);
    if (!spec.el) {
      this.title = 'Project Status — news-crawler ecosystem';
      // Tab identity. Guarded: only if this document control exposes head.
      try {
        if (this.head) {
          const icon = new Control({ context: this.context, tagName: 'link' });
          Object.assign(icon.dom.attributes, { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' });
          this.head.add(icon);
        }
      } catch (_) { /* head not exposed by this jsgui3 version — favicon.ico route still serves */ }
      const get = Project_Status_Page.get_status;
      const status = typeof get === 'function' ? get() : null;
      this.body.add(new Status_Widget({ context: this.context, status }));
    }
  }
}

// Injected by server.js before rendering; stays null in the browser bundle.
Project_Status_Page.get_status = null;

module.exports = Project_Status_Page;
