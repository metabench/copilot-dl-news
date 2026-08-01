'use strict';

/**
 * shared/page-controls — reach another control by walking the control tree.
 *
 * MEASURED (cycle 163, live browser): after client reattachment the control tree
 * is INTACT. The application control reported 10 restored children, `.parent`
 * set, and named descendants reachable by a plain recursive walk of
 * `content._arr` with their own children populated. `_ctrl_fields` is hydrated
 * too, so stock controls get their named children back for free (a reattached
 * `Panel` has `content_container`; a reattached `Data_Grid` has `table`).
 * `control-enh.js: pre_activate_content_controls` does all of this.
 *
 * That matters because the previous version of this file did NOT walk the tree.
 * It marked every control with a `data-ps-role` attribute, looked the element up
 * with `document.querySelector`, and mapped it back through
 * `context.map_controls` — an entire parallel addressing system, built on a
 * belief that the client tree was flat. That belief came from reading the
 * activation walker in `html-core.js`, whose parent-linking branches are empty,
 * and never checking. It was wrong. The markers are gone with it.
 *
 * What is genuinely NOT restored is anything a control assigned to ITSELF during
 * compose (`this.grid = grid`), because reattachment constructs down the
 * `spec.el` path and skips compose entirely. Resolve those lazily, here.
 */

const is_type = (c, type) => !!(c && c.__type_name === type);

const has_attribute = (c, name) =>
  !!(c && c.dom && c.dom.attributes && c.dom.attributes[name] !== undefined);

const children_of = (c) => (c && c.content && c.content._arr) || [];

/** The outermost control this one hangs from. */
function root_of(ctrl) {
  let c = ctrl;
  while (c && c.parent) c = c.parent;
  return c;
}

/** Depth-first search of a control's subtree. */
function descendant(ctrl, predicate) {
  let found = null;
  const walk = (c) => {
    if (found) return;
    for (const child of children_of(c)) {
      if (predicate(child)) { found = child; return; }
      walk(child);
    }
  };
  walk(ctrl);
  return found;
}

/**
 * The page's one control of a given type. Each of these is a singleton by
 * construction — one player bar, one signal log — so the type name IS the
 * address, and no marker attribute is needed to say so.
 */
function of_type(ctrl, type) {
  if (is_type(ctrl, type)) return ctrl;
  return descendant(root_of(ctrl), (c) => is_type(c, type));
}

/**
 * A control's own repaintable region, identified by the attribute it composed
 * itself with. Held directly when this control composed it; found by walking
 * when the page arrived as SSR markup and was reattached.
 */
function region(ctrl, attribute) {
  if (!ctrl._ps_region) ctrl._ps_region = descendant(ctrl, (c) => has_attribute(c, attribute));
  return ctrl._ps_region || null;
}

module.exports = { is_type, of_type, descendant, region, root_of };
