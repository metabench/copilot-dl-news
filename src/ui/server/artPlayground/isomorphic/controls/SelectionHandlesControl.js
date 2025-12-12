"use strict";

const jsgui = require("../jsgui");
const { Control } = jsgui;
const { ListenerBag } = require("../../../../utils/listenerBag");

const HANDLE_SIZE = 8;
const POSITIONS = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/**
 * Selection Handles - 8 resize handles around selected component.
 * @fires resize-start {{ handle, mouseX, mouseY }}
 * @fires resize-move {{ handle, mouseX, mouseY }}
 * @fires resize-end
 */
class SelectionHandlesControl extends Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "div" });
    this.add_class("art-selection");
    this.dom.attributes["data-jsgui-control"] = "art_selection";
    this._bounds = { x: 0, y: 0, width: 100, height: 100 };
    this._handles = {};

    this._domListenerBag = null;
    this._activeResizeBag = null;
    this._boundHandleDown = {};
    if (!spec.el) this.compose();
  }

  deactivate() {
    this._disposeDomListeners();
    this.__active = false;
  }
  
  compose() {
    const ctx = this.context;
    
    // Outline
    const outline = this._outline = new Control({ context: ctx, tagName: "div" });
    outline.add_class("art-selection__outline");
    this.add(outline);
    
    // 8 handles
    POSITIONS.forEach(pos => {
      const h = this._handles[pos] = new Control({ context: ctx, tagName: "div" });
      h.add_class("art-selection__handle");
      h.add_class(`art-selection__handle--${pos}`);
      h.dom.attributes["data-handle"] = pos;
      this.add(h);
    });
  }
  
  activate() {
    if (this.__active) return;
    this.__active = true;

    // Activation path: when constructed with { el }, compose() was skipped,
    // so we must reconnect handle element references from the DOM.
    if (this.dom?.el && (!this._handles || Object.keys(this._handles).length === 0)) {
      const root = this.dom.el;
      this._outline = this._outline || { dom: { el: root.querySelector(".art-selection__outline") } };
      this._handles = this._handles || {};
      POSITIONS.forEach((pos) => {
        this._handles[pos] = this._handles[pos] || { dom: { el: root.querySelector(`[data-handle="${pos}"]`) } };
      });
    }

    this._setupHandleEvents();
  }

  _setupHandleEvents() {
    if (typeof document === "undefined") return;

    this._disposeDomListeners();
    this._domListenerBag = new ListenerBag();

    Object.entries(this._handles).forEach(([pos, handle]) => {
      const el = handle.dom?.el;
      if (!el?.addEventListener) return;

      const bound = this._boundHandleDown[pos] || ((e) => this._onHandleMouseDown(pos, e));
      this._boundHandleDown[pos] = bound;
      this._domListenerBag.on(el, "mousedown", bound);
    });
  }

  _onHandleMouseDown(pos, e) {
    e?.stopPropagation?.();
    this.raise("resize-start", { handle: pos, mouseX: e.clientX, mouseY: e.clientY });

    if (typeof document === "undefined") return;

    if (this._activeResizeBag) {
      this._activeResizeBag.dispose();
      this._activeResizeBag = null;
    }

    const resizeBag = new ListenerBag();
    this._activeResizeBag = resizeBag;

    const onMove = (ev) => {
      this.raise("resize-move", { handle: pos, mouseX: ev.clientX, mouseY: ev.clientY });
    };

    const onUp = () => {
      this.raise("resize-end");
      if (this._activeResizeBag === resizeBag) {
        resizeBag.dispose();
        this._activeResizeBag = null;
      }
    };

    resizeBag.on(document, "mousemove", onMove);
    resizeBag.on(document, "mouseup", onUp);
  }

  _disposeDomListeners() {
    if (this._domListenerBag) {
      this._domListenerBag.dispose();
      this._domListenerBag = null;
    }
    if (this._activeResizeBag) {
      this._activeResizeBag.dispose();
      this._activeResizeBag = null;
    }
  }
  
  updateBounds({ x, y, width, height }) {
    this._bounds = { x, y, width, height };
    const half = HANDLE_SIZE / 2;
    
    // Outline
    const s = this._outline.dom?.el?.style;
    if (s) Object.assign(s, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` });
    
    // Handles
    const setPos = (pos, l, t) => {
      const hs = this._handles[pos]?.dom?.el?.style;
      if (hs) Object.assign(hs, { left: `${l}px`, top: `${t}px` });
    };
    setPos("nw", x - half, y - half);
    setPos("ne", x + width - half, y - half);
    setPos("se", x + width - half, y + height - half);
    setPos("sw", x - half, y + height - half);
    setPos("n", x + width / 2 - half, y - half);
    setPos("s", x + width / 2 - half, y + height - half);
    setPos("w", x - half, y + height / 2 - half);
    setPos("e", x + width - half, y + height / 2 - half);
  }
}

module.exports = { SelectionHandlesControl };
