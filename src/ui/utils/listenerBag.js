"use strict";

/**
 * Small helper to bind DOM-style event listeners and dispose them as a group.
 *
 * Intended for jsgui3 controls that bind `document` or other long-lived targets
 * during activation but need a reliable teardown path.
 */
class ListenerBag {
  constructor() {
    this._active = true;
    /** @type {Array<{ target: any, type: string, handler: Function, options?: any }>} */
    this._bindings = [];
  }

  /**
   * @param {object} target Object supporting addEventListener/removeEventListener.
   * @param {string} type
   * @param {Function} handler
   * @param {any} [options]
   */
  on(target, type, handler, options) {
    if (!this._active) return;
    if (!target?.addEventListener || !target?.removeEventListener) return;
    if (typeof type !== "string") return;
    if (typeof handler !== "function") return;

    target.addEventListener(type, handler, options);
    this._bindings.push({ target, type, handler, options });
  }

  dispose() {
    if (!this._active) return;
    this._active = false;

    for (const { target, type, handler, options } of this._bindings) {
      try {
        target.removeEventListener(type, handler, options);
      } catch (e) {
        // ignore
      }
    }

    this._bindings.length = 0;
  }
}

module.exports = { ListenerBag };
