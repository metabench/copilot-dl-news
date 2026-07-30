'use strict';

/**
 * activate_children — activate controls composed INTO an already-activated
 * parent (cycle 162, browser only).
 *
 * jsgui3 activates the control tree once, on page activation. Anything added
 * afterwards has its markup inserted but never receives activate(), so any
 * control that does work there — Data_Grid renders its rows from activate()
 * after browser reconstruction — renders empty. Walking the new subtree once is
 * the small, explicit price of composing controls at runtime.
 *
 * This walks content._arr, which IS populated for controls composed at runtime
 * (they were built by add()). It is deliberately NOT how a control finds a
 * collaborator that arrived as SSR markup — see shared/page-controls.js for why
 * that case needs the registry instead.
 */
function activate_children(ctrl) {
  if (typeof document === 'undefined') return;
  const walk = (c) => {
    if (!c || typeof c !== 'object') return;
    for (const child of (c.content && c.content._arr) || []) {
      try { if (child && !child.__active && typeof child.activate === 'function') child.activate(); } catch (_) {}
      walk(child);
    }
  };
  walk(ctrl);
}

/**
 * repaint — the framework's own re-render idiom (Chart_Base.render_chart does
 * exactly this): empty the region, compose fresh controls into it, activate
 * what was just added. No createElement, so escaping stays structural.
 */
function repaint(box, compose) {
  if (!box) return;
  box.clear();
  compose(box);
  activate_children(box);
}

module.exports = { activate_children, repaint };
