'use strict';

const { Panel } = require('../shared/jsgui');
const { el } = require('../shared/el');
const { mark } = require('../shared/page-controls');

/**
 * Milestones_Panel — the achievements row. Earned from the ledger, so the set
 * only ever grows; it needs no live repaint, only a fresh page.
 */
class Milestones_Panel extends Panel {
  constructor(spec = {}) {
    spec.__type_name = spec.__type_name || 'milestones_panel';
    super({ ...spec, title: 'MILESTONES' });
    this.add_class('ps-panel');
    mark(this, 'milestones_panel');
    if (!spec.el) {
      const ctx = this.context;
      const row = el(ctx, 'div', 'ps-ach');
      for (const a of (spec.achievements || [])) {
        const badge = el(ctx, 'div', 'ps-ach__badge');
        badge.add(el(ctx, 'div', 'ps-ach__icon', a.icon));
        badge.add(el(ctx, 'div', 'ps-ach__label', a.label));
        badge.add(el(ctx, 'div', 'ps-ach__detail', a.detail));
        row.add(badge);
      }
      this.add(row);
    }
  }
}

Milestones_Panel.css = `
.ps-ach { display: flex; gap: 10px; flex-wrap: wrap; }
.ps-ach__badge { border: 2px solid #b8862e; border-radius: 6px; padding: 8px 12px; background: #12151a; min-width: 150px; }
.ps-ach__icon { font-size: 18px; color: #b8862e; }
.ps-ach__label { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; }
.ps-ach__detail { font-size: 10px; color: #8a8778; }
`;

module.exports = Milestones_Panel;
