'use strict';

const { Panel, Control } = require('../shared/jsgui');
const { el } = require('../shared/el');
const { mark, region } = require('../shared/page-controls');
const { repaint } = require('../shared/activate-children');

const BODY = '[data-ps-party]';

/**
 * Modules_Panel — one card per repo in the ecosystem: what it is, whether it is
 * active, and its condition (red when something needs attention).
 */
class Modules_Panel extends Panel {
  constructor(spec = {}) {
    spec.__type_name = spec.__type_name || 'modules_panel';
    const party = spec.party || [];
    super({ ...spec, title: `MODULES — ${party.length}` });
    this.add_class('ps-panel');
    mark(this, 'modules_panel');
    if (!spec.el) {
      const body = new Control({ context: this.context, tagName: 'div' });
      body.add_class('ps-party');
      body.dom.attributes['data-ps-party'] = 'true';
      this._ps_region = body;
      this.compose_body(body, party);
      this.add(body);
    }
  }

  compose_body(box, party) {
    const ctx = this.context;
    for (const m of (party || [])) {
      const card = el(ctx, 'div', `ps-card${m.danger ? ' ps-card--danger' : ''}`);
      card.dom.attributes['data-ps-card'] = m.name;
      card.add(el(ctx, 'div', 'ps-card__name', m.name));
      card.add(el(ctx, 'div', 'ps-card__role', m.role));
      const meta = el(ctx, 'div', 'ps-card__meta');
      meta.add(el(ctx, 'span', `ps-badge${m.status === 'ACTIVE' ? '' : ' ps-badge--dim'}`, m.status));
      meta.add(el(ctx, 'span', `ps-cond${m.danger ? ' ps-cond--danger' : ''}`,
        m.danger ? `⚠ ${m.condition}` : m.condition));
      card.add(meta);
      if (m.lastCommit) card.add(el(ctx, 'div', 'ps-card__commit', `last commit ${m.lastCommit}`));
      box.add(card);
    }
  }

  set_party(party) {
    repaint(region(this, BODY), (box) => this.compose_body(box, party));
  }
}

Modules_Panel.css = `
.ps-party { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
.ps-card { border: 2px solid #2e3440; border-radius: 6px; padding: 8px 10px; background: #12151a; }
.ps-card--danger { border-color: #b34d4d; }
.ps-card__name { font-size: 12px; font-weight: 700; }
.ps-card__role { font-size: 10px; color: #8a8778; min-height: 24px; margin: 2px 0 6px; }
.ps-card__meta { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.ps-badge { font-size: 9px; letter-spacing: 0.1em; padding: 2px 6px; border-radius: 3px; background: #55a377; color: #0c0e11; font-weight: 700; }
.ps-badge--dim { background: #2e3440; color: #b9b4a4; }
.ps-cond { font-size: 10px; color: #8a8778; }
.ps-cond--danger { color: #b34d4d; font-weight: 700; }
.ps-card__commit { font-size: 9px; color: #6b675a; margin-top: 5px; }
`;

module.exports = Modules_Panel;
