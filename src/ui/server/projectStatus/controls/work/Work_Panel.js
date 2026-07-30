'use strict';

const { Panel, Control } = require('../shared/jsgui');
const { el } = require('../shared/el');
const { mark, region } = require('../shared/page-controls');
const { repaint } = require('../shared/activate-children');
const { owedText, recentText, signalText, activityLines } = require('../shared/models');

const BODY = '[data-ps-work-body]';

/**
 * Work_Panel — what is being worked on, what is owed, what the agent is doing
 * right now, and what is waiting on the owner.
 *
 * The whole body recomposes from controls on every refresh. It used to be six
 * document.createElement loops in the page's _apply; a list that rebuilds
 * itself belongs to the control that owns the list, not to the page.
 */
class Work_Panel extends Panel {
  constructor(spec = {}) {
    spec.__type_name = spec.__type_name || 'work_panel';
    super({ ...spec, title: 'WORK' });
    this.add_class('ps-panel');
    mark(this, 'work_panel');
    if (!spec.el) {
      const body = new Control({ context: this.context, tagName: 'div' });
      body.dom.attributes['data-ps-work-body'] = 'true';
      this._ps_region = body;
      this.compose_body(body, spec.status);
      this.add(body);
    }
  }

  compose_body(box, s) {
    if (!s) return;
    const ctx = this.context;
    const tag = (t) => box.add(el(ctx, 'div', 'ps-quest-tag', t));

    tag('CURRENT FOCUS');
    box.add(el(ctx, 'div', 'ps-quest-main', `cycle ${s.mainQuest.cycle}: ${s.mainQuest.label}`));

    tag('FOLLOW-UPS OWED');
    if ((s.sideQuests || []).length) {
      for (const q of s.sideQuests) box.add(el(ctx, 'div', 'ps-quest-item', owedText(q)));
    } else {
      box.add(el(ctx, 'div', 'ps-quest-item ps-muted', 'none — all clear'));
    }

    for (const line of activityLines(s.agentActivity)) {
      box.add(el(ctx, 'div', 'ps-quest-item ps-activity-line', line));
    }
    for (const sig of (s.pendingSignals || [])) {
      box.add(el(ctx, 'div', 'ps-quest-item ps-signal-line', signalText(sig)));
    }

    // Blinks: this is the one line on the page that is waiting on the owner.
    box.add(el(ctx, 'div', 'ps-quest-tag ps-blink', 'AWAITING OWNER DECISION'));
    for (const p of (s.playerInput || [])) box.add(el(ctx, 'div', 'ps-quest-item ps-input', p));

    tag('RECENT CYCLES');
    for (const r of (s.recent || [])) {
      box.add(el(ctx, 'div', `ps-quest-item${r.correction ? ' ps-retcon' : ''}`, recentText(r)));
    }
  }

  set_status(s) {
    repaint(region(this, BODY), (box) => this.compose_body(box, s));
  }
}

Work_Panel.css = `
.ps-quest-tag { font-size: 10px; letter-spacing: 0.14em; color: #8a8778; margin: 10px 0 4px; }
.ps-quest-tag.ps-blink { color: #b34d4d; animation: ps-blink 1.4s steps(2) infinite; }
@keyframes ps-blink { 50% { opacity: 0.35; } }
.ps-quest-main { font-size: 13px; color: #e8e4d8; border-left: 3px solid #b8862e; padding-left: 8px; }
.ps-quest-item { font-size: 12px; color: #b9b4a4; padding: 2px 0 2px 8px; }
.ps-quest-item.ps-input { color: #e8e4d8; border-left: 3px solid #b34d4d; margin: 2px 0; }
.ps-quest-item.ps-retcon { color: #b34d4d; }
.ps-muted { color: #6b675a; font-style: italic; }
.ps-signal-line { color: #9fd4ec; border-left: 2px solid #4d9ec8; padding-left: 8px; }
.ps-activity-line { color: #8fd0a8; border-left: 2px solid #55a377; padding-left: 8px; }
`;

module.exports = Work_Panel;
