'use strict';

const { Control } = require('../shared/jsgui');
const { el } = require('../shared/el');
const { mark, region } = require('../shared/page-controls');
const { repaint } = require('../shared/activate-children');
const { branchCardModel, absorbedText } = require('../shared/models');

const BODY = '[data-ps-branches]';

/**
 * Branch_Cards — one card per tech-tree branch, plus the line recording how
 * many pre-tree research items were absorbed into the foundations.
 *
 * The cards deep-link to /tech/<key>, which 302s to the app's #branch= route:
 * the old URLs stayed alive through the migration, so anything the owner
 * bookmarked still lands in the right place.
 */
class Branch_Cards extends Control {
  constructor(spec = {}) {
    spec.__type_name = spec.__type_name || 'branch_cards';
    super({ ...spec, tagName: 'div' });
    mark(this, 'branch_cards');
    if (!spec.el) {
      const box = new Control({ context: this.context, tagName: 'div' });
      box.add_class('ps-branches');
      box.dom.attributes['data-ps-branches'] = 'true';
      this._ps_region = box;
      this.compose_body(box, spec.tree);
      this.add(box);
      this._absorbed = el(this.context, 'div', 'ps-tree__roots', absorbedText(spec.tree && spec.tree.absorbed));
      this._absorbed.dom.attributes['data-ps-absorbed'] = 'true';
      this.add(this._absorbed);
    }
  }

  compose_body(box, tree) {
    const ctx = this.context;
    for (const b of ((tree && tree.branches) || [])) {
      const m = branchCardModel(b);
      const card = el(ctx, 'a', 'ps-branch');
      card.dom.attributes.href = m.href;
      card.dom.attributes.style = `border-color:${m.color};`;
      card.add(el(ctx, 'div', 'ps-branch__t', m.title));
      card.add(el(ctx, 'div', 'ps-branch__tag', m.tagline));
      card.add(el(ctx, 'div', 'ps-branch__n', m.counts));
      box.add(card);
    }
  }

  set_tree(tree) {
    if (!tree || !Array.isArray(tree.branches)) return;
    repaint(region(this, BODY), (box) => this.compose_body(box, tree));
    const line = this.dom.el && this.dom.el.querySelector('[data-ps-absorbed]');
    if (line) line.textContent = absorbedText(tree.absorbed);
  }
}

Branch_Cards.css = `
.ps-branches { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
@media (max-width: 760px) { .ps-branches { grid-template-columns: 1fr; } }
.ps-branch { display: block; background: #101216; border: 2px solid #2e3440; border-radius: 6px; padding: 10px 12px; text-decoration: none; color: inherit; }
.ps-branch:hover { background: #14171c; box-shadow: 0 0 8px rgba(184,134,46,0.15); }
.ps-branch__t { font-size: 13px; font-weight: 600; letter-spacing: 0.08em; color: #e8e4d8; }
.ps-branch__tag { font-size: 10px; color: #8a8778; margin-top: 4px; }
.ps-branch__n { font-size: 9.5px; color: #6b675a; margin-top: 6px; font-variant-numeric: tabular-nums; }
.ps-tree__roots { font-size: 10px; color: #6b675a; border-top: 1px dashed #2e3440; padding-top: 6px; margin-top: 8px; }
`;

module.exports = Branch_Cards;
