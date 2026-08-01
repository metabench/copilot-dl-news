'use strict';

const { Panel } = require('../shared/jsgui');
const { el } = require('../shared/el');

/**
 * History_Panel — the committed progress SVG, drawn from the same ledger the
 * numbers above come from. It is a file on disk regenerated at the end of each
 * cycle, so a refresh has to bust the cache to show the new picture.
 */
class History_Panel extends Panel {
  constructor(spec = {}) {
    spec.__type_name = spec.__type_name || 'history_panel';
    super({ ...spec, title: 'HISTORY' });
    this.add_class('ps-panel');
    if (!spec.el) {
      const img = el(this.context, 'img', 'ps-history__img');
      Object.assign(img.dom.attributes, {
        src: '/progress.svg',
        alt: 'Cycle history: cumulative verified improvements and defects caught, rendered from the ledger',
        'data-ps-history': 'true'
      });
      this.add(img);
    }
  }

  bust(stamp) {
    const img = this.dom.el && this.dom.el.querySelector('[data-ps-history]');
    if (img) img.src = `/progress.svg?t=${stamp}`;
  }
}

History_Panel.css = `
.ps-history__img { display: block; width: 100%; height: auto; border: 2px solid #2e3440; border-radius: 6px; background: #101216; }
`;

module.exports = History_Panel;
