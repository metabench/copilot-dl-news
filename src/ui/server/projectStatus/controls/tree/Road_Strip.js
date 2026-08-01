'use strict';

const { Control } = require('../shared/jsgui');
const { el } = require('../shared/el');
const { repaint } = require('../shared/activate-children');
const { roadCardModels } = require('../shared/models');

/**
 * Road_Strip — PATH AHEAD: what is being worked on now, what comes next, and
 * the fog beyond it. Horizontal, arrow-separated, scrolls when it overflows.
 */
class Road_Strip extends Control {
  constructor(spec = {}) {
    spec.__type_name = spec.__type_name || 'road_strip';
    super({ ...spec, tagName: 'div' });
    this.add_class('ps-road');
    if (!spec.el) this.compose(spec.status);
  }

  compose(s) {
    if (!s) return;
    const ctx = this.context;
    roadCardModels(s).forEach((c, i) => {
      if (i > 0) this.add(el(ctx, 'div', 'ps-road__arrow', '→'));
      const card = el(ctx, 'div', c.cls);
      card.add(el(ctx, 'div', 'ps-road__top', c.top));
      card.add(el(ctx, 'div', 'ps-road__main', c.main));
      if (c.sub) card.add(el(ctx, 'div', 'ps-road__sub', c.sub));
      this.add(card);
    });
  }

  set_status(s) {
    if (!s || !s.roadmap) return;
    repaint(this, (box) => box.compose(s));
  }
}

Road_Strip.css = `
.ps-road { display: flex; align-items: stretch; gap: 8px; overflow-x: auto; padding: 4px 0 10px; }
.ps-road__card { flex: 0 0 auto; min-width: 180px; max-width: 250px; background: #101216; border: 2px solid #2e3440; border-radius: 6px; padding: 8px 10px; }
.ps-road__card--now { border-color: #b8862e; box-shadow: 0 0 0 1px rgba(184,134,46,0.35); }
.ps-road__card--future { border-style: dashed; opacity: 0.55; }
.ps-road__top { font-size: 9px; letter-spacing: 0.14em; color: #8a8778; margin-bottom: 4px; }
.ps-road__main { font-size: 12px; font-weight: 600; color: #e8e4d8; }
.ps-road__sub { font-size: 10px; color: #8a8778; margin-top: 4px; }
.ps-road__arrow { align-self: center; color: #b8862e; font-size: 16px; flex: 0 0 auto; }
`;

module.exports = Road_Strip;
