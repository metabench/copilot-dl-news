'use strict';

const { Control } = require('../shared/jsgui');
const { el } = require('../shared/el');

const SOURCES = 'sources: IMPROVEMENT_LEDGER stanzas · repo-scope.json · RESEARCH_BACKLOG states · roadmap.json · annotations.json — every number recountable · ';

/**
 * Status_Footer — where the numbers come from, the manual refresh, and when the
 * page last updated itself.
 *
 * The sources line is not decoration: every figure on this page is recountable
 * from those files, which is what makes the page auditable rather than a
 * dashboard that asserts things.
 */
class Status_Footer extends Control {
  constructor(spec = {}) {
    spec.__type_name = spec.__type_name || 'status_footer';
    super({ ...spec, tagName: 'footer' });
    this.add_class('ps-foot');
    if (!spec.el) {
      const ctx = this.context;
      this.add(SOURCES);
      const btn = el(ctx, 'button', 'ps-refresh', '↻ REFRESH');
      btn.dom.attributes['data-ps-refresh'] = 'true';
      this.add(btn);
      const stamp = el(ctx, 'span', 'ps-stamp', '');
      stamp.dom.attributes['data-ps-stamp'] = 'true';
      this.add(stamp);
    }
  }

  set_stamp(text) {
    const stamp = this.dom.el && this.dom.el.querySelector('[data-ps-stamp]');
    if (stamp) stamp.textContent = text;
  }
}

Status_Footer.css = `
.ps-foot { font-size: 10px; color: #6b675a; margin-top: 4px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.ps-refresh { background: #171a20; color: #b8862e; border: 2px solid #b8862e; border-radius: 4px; font-size: 10px; letter-spacing: 0.1em; padding: 4px 10px; cursor: pointer; }
.ps-refresh:hover { background: #b8862e; color: #0c0e11; }
.ps-stamp { color: #8a8778; font-variant-numeric: tabular-nums; }
`;

module.exports = Status_Footer;
