'use strict';

const { Control, Stat_Card } = require('../shared/jsgui');
const { repaint } = require('../shared/activate-children');
const { CHIP_DEFS } = require('../shared/models');

/**
 * Stat_Chips — the row of headline numbers, one stock Stat_Card each.
 *
 * CHIP_DEFS is shared with nothing else in this file on purpose: the same
 * definition drives the server compose and this control's repaint, so the two
 * cannot drift into labelling the same number differently.
 */
class Stat_Chips extends Control {
  constructor(spec = {}) {
    spec.__type_name = spec.__type_name || 'stat_chips';
    super({ ...spec, tagName: 'div' });
    this.add_class('ps-chips');
    if (!spec.el) this.compose(spec.stats);
  }

  compose(stats) {
    if (!stats) return;
    for (const def of CHIP_DEFS) {
      const card = new Stat_Card({ context: this.context, value: def.fmt(stats), label: def.label });
      card.dom.attributes['data-ps-chip'] = def.key;
      this.add(card);
    }
  }

  set_stats(stats) {
    repaint(this, (box) => box.compose(stats));
  }
}

Stat_Chips.css = `
.ps-chips { display: flex; gap: 10px; margin: 14px 0; flex-wrap: wrap; }
.ps-chips .stat-card, .ps-chips .jsgui-stat-card { border: 2px solid #2e3440; background: #171a20; border-radius: 6px; padding: 8px 14px; min-width: 108px; }
.ps-chips .stat-card-value { font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; color: #e8e4d8; }
.ps-chips .stat-card-label { font-size: 10px; color: #8a8778; text-transform: uppercase; letter-spacing: 0.06em; }
`;

module.exports = Stat_Chips;
