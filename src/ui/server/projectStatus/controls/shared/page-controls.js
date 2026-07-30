'use strict';

/**
 * shared/page-controls — reach another control on this page, after reattachment.
 *
 * MEASURED CONSTRAINT (cycle 163, read from jsgui3-html/html-core/html-core.js).
 * Client reattachment builds a FLAT registry: every element carrying
 * data-jsgui-id is turned into a control and stored in context.map_controls by
 * that id. The two branches in that loop that would link parent to child are
 * empty:
 *
 *     var ctrl = new Cstr(ctrl_spec);
 *     if (parent_jsgui_id) { if (map_controls[parent_jsgui_id]) { } }
 *
 * So in the browser a reattached control has NO parent and an EMPTY
 * content._arr. Anything a control assigned to itself during compose
 * (`this.grid = grid`) is undefined once the page is live — reattachment
 * constructs it down the `spec.el` path, which skips compose entirely. That is
 * exactly why the SIGNAL LOG never refreshed: Signal_Log.activate() stashed
 * `this.grid`, which was always undefined, so every _apply silently updated
 * nothing and the panel showed the boot-time SSR snapshot until a restart.
 *
 * context.map_controls IS the framework's own per-page registry, so the honest
 * way to reach a collaborator is: mark it in the markup at compose time, find
 * its element, look the control up. No module-level mutables (which are worse
 * than wrong — they are shared by every page the process renders), and no
 * ordering assumptions: html-core constructs EVERY control before activating
 * ANY of them, so a role is resolvable from inside any activate().
 */

const ROLE_ATTR = 'data-ps-role';

/** Mark a control as the page's one X, at compose time. */
function mark(ctrl, role) {
  ctrl.dom.attributes[ROLE_ATTR] = role;
  return ctrl;
}

/** The control that owns this element, via the page's control registry. */
function ctrl_of(context, el) {
  const id = el && el.getAttribute && el.getAttribute('data-jsgui-id');
  if (!id) return null;
  const map = context && context.map_controls;
  return (map && map[id]) || null;
}

/** The page's control for a role, or null (server-side, or not composed). */
function role_ctrl(ctrl, role) {
  if (typeof document === 'undefined') return null;
  return ctrl_of(ctrl.context, document.querySelector(`[${ROLE_ATTR}="${role}"]`));
}

/** The control behind the first element matching a CSS selector. */
function query_ctrl(ctrl, selector) {
  if (typeof document === 'undefined') return null;
  return ctrl_of(ctrl.context, document.querySelector(selector));
}

/**
 * A control's own repaintable region. Held directly when this control composed
 * it (server, or a runtime rebuild); looked up through the registry when the
 * page arrived as SSR markup and was reattached.
 */
function region(ctrl, selector) {
  if (!ctrl._ps_region) ctrl._ps_region = query_ctrl(ctrl, selector);
  return ctrl._ps_region || null;
}

module.exports = { ROLE_ATTR, mark, ctrl_of, role_ctrl, query_ctrl, region };
