'use strict';

const { Control } = require('../shared/jsgui');
const { el } = require('../shared/el');
const { of_type } = require('../shared/page-controls');
const { treeBoardModel } = require('../shared/tree-layout');

/**
 * Live_Strip — the SSE-fed status line.
 *
 * Semantics (cycles 157/158, after the owner rejected polling outright — "I
 * don't want 45s delays, I want changes shown immediately"):
 *   'activity' patches this strip in place and never touches the page;
 *   'cards'    re-applies live data through the page, and self-refreshes only
 *              when the tree's NODE SET changed, because the SSR'd board cannot
 *              restructure itself client-side. Scroll position is preserved.
 */
class Live_Strip extends Control {
  constructor(spec = {}) {
    spec.__type_name = spec.__type_name || 'live_strip';
    super({ ...spec, tagName: 'div' });
    this.add_class('ps-live');
    if (!spec.el) {
      const dot = el(this.context, 'span', 'ps-live__dot');
      dot.dom.attributes['data-live-dot'] = 'true';
      this.add(dot);
      const text = el(this.context, 'span', 'ps-live__text', 'connecting to live events…');
      text.dom.attributes['data-live-text'] = 'true';
      this.add(text);
    }
  }

  paint(s) {
    const root = this.dom.el;
    if (!root) return;
    const dot = root.querySelector('[data-live-dot]');
    const text = root.querySelector('[data-live-text]');
    const a = s.activity || s.agentActivity || {};
    if (dot) dot.className = 'ps-live__dot' + (a.idle ? ' ps-live__dot--idle' : ' ps-live__dot--busy');
    if (text) {
      text.textContent = a.idle
        ? `agent idle — ${a.reason || ''}`
        : `${(a.phase || 'working').toUpperCase()}${a.cycle ? ` (c${a.cycle})` : ''}: ${a.note || ''} · ${a.ageMinutes === 0 ? 'just now' : (a.ageMinutes + 'm ago')}`;
    }
  }

  activate() {
    if (this.__active) return;
    super.activate();
    // What the board ACTUALLY DREW. Not the same thing as the tech index: the
    // layout draws a foreign prerequisite once per band that needs it, and never
    // draws a root that nothing depends on. Measured on the live page: 54 node
    // elements, 46 distinct ids, index size 53 — so comparing the DOM against
    // the index could never match, `same` was always false, and EVERY cards
    // event force-reloaded the page the owner was reading. Including the reload
    // triggered by their own BEGIN RESEARCH click, since that appends to
    // data/agi-signals.jsonl and the watcher fires on data/.
    const ssrIds = new Set(
      [...document.querySelectorAll('.ps-tn[data-node-id]')].map((n) => n.getAttribute('data-node-id'))
    );
    const es = new EventSource('/api/events');
    const painter = (e) => { try { this.paint(JSON.parse(e.data)); } catch (_) {} };
    es.addEventListener('hello', painter);
    es.addEventListener('activity', painter);
    es.addEventListener('cards', (e) => {
      painter(e);
      fetch('/api/status', { cache: 'no-store' }).then((r) => r.json()).then((s) => {
        const page = of_type(this, 'status_widget');
        if (page && page._apply) page._apply(s);
        // Like for like: run the SAME pure layout the server composed the board
        // with, and compare the id sets it would draw now against the ones on
        // screen. A genuine promotion or a new tech changes this; a ledger or
        // signal write does not.
        const now = new Set(treeBoardModel(s.techTree).nodes.map((n) => n.id));
        const same = now.size === ssrIds.size && [...ssrIds].every((id) => now.has(id));
        if (!same) {
          try { sessionStorage.setItem('tp-scroll-restore', String(window.scrollY || 0)); } catch (_) {}
          location.reload();
        }
      }).catch(() => {});
    });
  }
}

Live_Strip.css = `
.ps-live { display: flex; align-items: center; gap: 8px; padding: 5px 10px; margin-bottom: 10px; background: #0d1014; border: 1px solid #1b1f26; border-radius: 5px; font-size: 11px; }
.ps-live__dot { width: 8px; height: 8px; border-radius: 50%; background: #6b675a; flex: none; }
.ps-live__dot--busy { background: #55a377; box-shadow: 0 0 6px #55a377; }
.ps-live__dot--idle { background: #4a4a4a; }
.ps-live__text { color: #8a8778; }
`;

module.exports = Live_Strip;
