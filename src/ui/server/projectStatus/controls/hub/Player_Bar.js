'use strict';

const { Control, Progress_Bar } = require('../shared/jsgui');
const { el } = require('../shared/el');
const { mark } = require('../shared/page-controls');
const { repaint } = require('../shared/activate-children');
const { xpLabelText } = require('../shared/models');

/**
 * Player_Bar — the header: what this page is, the running total of verified
 * improvements, and progress toward the next milestone.
 *
 * The bar is a stock Progress_Bar, which brings role="progressbar" and
 * aria-valuenow with it — accessibility the hand-built div never had.
 */
class Player_Bar extends Control {
  constructor(spec = {}) {
    spec.__type_name = spec.__type_name || 'player_bar';
    super({ ...spec, tagName: 'header' });
    this.add_class('ps-player');
    mark(this, 'player_bar');
    if (!spec.el) this.compose(spec.player);
  }

  compose(p) {
    if (!p) return;
    const ctx = this.context;
    this.add(el(ctx, 'div', 'ps-studio', 'PROJECT STATUS — news-crawler ecosystem'));
    const lvl = el(ctx, 'div', 'ps-level');
    lvl.add(el(ctx, 'span', 'ps-level__num', String(p.xpTotal)));
    lvl.add(el(ctx, 'span', 'ps-level__title', 'verified improvements'));
    this.add(lvl);
    this.add(new Progress_Bar({ context: ctx, value: p.xpInLevel, max: p.xpPerLevel }));
    this.add(el(ctx, 'div', 'ps-xp__label', xpLabelText(p)));
  }

  set_player(p) {
    repaint(this, (box) => box.compose(p));
  }
}

Player_Bar.css = `
.ps-player { border: 2px solid #2e3440; background: #171a20; border-radius: 8px; padding: 14px 18px; }
.ps-studio { font-size: 13px; letter-spacing: 0.18em; color: #8a8778; }
.ps-level { display: flex; align-items: baseline; gap: 12px; margin-top: 4px; }
.ps-level__num { font-size: 26px; font-weight: 700; color: #b8862e; font-variant-numeric: tabular-nums; }
.ps-level__title { font-size: 15px; letter-spacing: 0.08em; text-transform: uppercase; }
.ps-player .jsgui-progress, .ps-player .progress-bar { margin-top: 8px; }
.ps-xp__label { margin-top: 6px; font-size: 11px; color: #8a8778; font-variant-numeric: tabular-nums; }
`;

module.exports = Player_Bar;
