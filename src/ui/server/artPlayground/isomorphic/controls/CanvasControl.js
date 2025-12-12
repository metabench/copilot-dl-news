"use strict";

const jsgui = require("../jsgui");
const { ComponentControl } = require("./ComponentControl");
const { SelectionHandlesControl } = require("./SelectionHandlesControl");
const { ListenerBag } = require("../../../../utils/listenerBag");

const { Control, String_Control } = jsgui;

const COLORS = ["#4A90D9", "#D94A4A", "#4AD94A", "#D9D94A", "#9B4AD9", "#4AD9D9", "#D94A9B"];
const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Canvas Control - Main SVG editing surface with selection & resize.
 */
class CanvasControl extends Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "div" });
    this.add_class("art-canvas");
    this.dom.attributes["data-jsgui-control"] = "art_canvas";
    
    this._tool = "select";
    this._components = new Map();
    this._selectedId = null;
    this._nextId = 1;
    this._dragState = null;
    this._resizeState = null;

    this._domListenerBag = null;
    this._boundOnMouseDown = null;
    this._boundOnMouseMove = null;
    this._boundOnMouseUp = null;

    // Default demo components (rendered during activate). Needed even in activation mode.
    this._pendingComponents = this._pendingComponents || [
      { id: "rect1", type: "rect", x: 100, y: 100, width: 150, height: 100, fill: "#4A90D9" },
      { id: "rect2", type: "rect", x: 300, y: 150, width: 120, height: 80, fill: "#D94A4A" },
      { id: "ellipse1", type: "ellipse", cx: 550, cy: 200, rx: 70, ry: 50, fill: "#4AD94A" }
    ];
    
    if (!spec.el) this.compose();
  }

  deactivate() {
    this._disposeDomListeners();
    this.__active = false;
  }
  
  compose() {
    const ctx = this.context;
    
    // SVG wrapper
    const wrapper = this._svgWrapper = new Control({ context: ctx, tagName: "div" });
    wrapper.add_class("art-canvas__svg-wrapper");
    wrapper.add(new String_Control({
      context: ctx,
      text: `<svg class="art-canvas__svg" xmlns="${SVG_NS}">
        <defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#E0E0E0" stroke-width="0.5"/>
        </pattern></defs>
        <rect class="art-canvas__grid" width="100%" height="100%" fill="url(#grid)"/>
        <g class="art-canvas__components"></g>
      </svg>`
    }));
    this.add(wrapper);
    
    // Selection handles
    const handles = this._selectionHandles = new SelectionHandlesControl({ context: ctx });
    handles.dom.attributes.style = "display: none;";
    this.add(handles);
    
  }
  
  activate() {
    if (this.__active) return;
    this.__active = true;

    const el = this.dom?.el;
    if (!el) return;

    // Activation path: reconnect key internal DOM references.
    if (!this._svgWrapper?.dom?.el) {
      const wrapperEl = el.querySelector(".art-canvas__svg-wrapper");
      if (wrapperEl) this._svgWrapper = { dom: { el: wrapperEl } };
    }

    if (!this._selectionHandles?.dom?.el) {
      const selectionEl = el.querySelector(".art-selection");
      if (selectionEl) {
        this._selectionHandles = selectionEl.__jsgui_control || new SelectionHandlesControl({ el: selectionEl, context: this.context });
        this._selectionHandles.dom = this._selectionHandles.dom || {};
        this._selectionHandles.dom.el = selectionEl;
        selectionEl.__jsgui_control = this._selectionHandles;
      }
    }

    this._svg = el.querySelector(".art-canvas__svg");
    this._componentsGroup = this._svg?.querySelector?.(".art-canvas__components");

    // Render pending components (client-only).
    this._pendingComponents?.forEach((c) => this._renderComponent(c));
    this._pendingComponents = null;

    this._selectionHandles?.activate?.();
    this._setupEvents();
  }
  
  _setupEvents() {
    if (!this._svg?.addEventListener) return;
    if (typeof document === "undefined") return;

    this._disposeDomListeners();
    this._domListenerBag = new ListenerBag();

    this._boundOnMouseDown = this._boundOnMouseDown || ((e) => this._onMouseDown(e));
    this._boundOnMouseMove = this._boundOnMouseMove || ((e) => this._onMouseMove(e));
    this._boundOnMouseUp = this._boundOnMouseUp || (() => this._onMouseUp());

    this._domListenerBag.on(this._svg, "mousedown", this._boundOnMouseDown);
    this._domListenerBag.on(document, "mousemove", this._boundOnMouseMove);
    this._domListenerBag.on(document, "mouseup", this._boundOnMouseUp);

    if (this._selectionHandles?.on) {
      this._selectionHandles.on("resize-start", (d) => this._startResize(d));
      this._selectionHandles.on("resize-move", (d) => this._doResize(d));
      this._selectionHandles.on("resize-end", () => this._endResize());
    }
  }

  _disposeDomListeners() {
    if (this._domListenerBag) {
      this._domListenerBag.dispose();
      this._domListenerBag = null;
    }
  }
  
  _onMouseDown(e) {
    if (this._tool !== "select") return;
    
    const compEl = e.target.closest("[data-component-id]");
    if (compEl) {
      const id = compEl.getAttribute("data-component-id");
      this._select(id);
      
      const rect = this._svg.getBoundingClientRect();
      const comp = this._components.get(id);
      this._dragState = {
        id, comp,
        startX: e.clientX - rect.left,
        startY: e.clientY - rect.top,
        origX: comp?.x,
        origY: comp?.y
      };
      e.preventDefault();
    } else if (e.target === this._svg || e.target.classList.contains("art-canvas__grid")) {
      this._deselectAll();
    }
  }
  
  _onMouseMove(e) {
    if (!this._dragState) return;
    const rect = this._svg.getBoundingClientRect();
    const dx = (e.clientX - rect.left) - this._dragState.startX;
    const dy = (e.clientY - rect.top) - this._dragState.startY;
    const comp = this._dragState.comp;
    if (comp) {
      comp.x = this._dragState.origX + dx;
      comp.y = this._dragState.origY + dy;
      this._updatePos(this._dragState.id);
      this._updateHandles();
    }
  }
  
  _onMouseUp() {
    if (this._dragState) {
      this.raise("selection-change", this._getSelectionData());
    }
    this._dragState = null;
  }
  
  _renderComponent({ id, type, ...data }) {
    if (typeof document === "undefined") return;
    if (!this._componentsGroup) return;

    let el;
    const set = (k, v) => el.setAttribute(k, v);
    
    if (type === "rect") {
      el = document.createElementNS(SVG_NS, "rect");
      set("x", data.x); set("y", data.y);
      set("width", data.width); set("height", data.height);
      set("fill", data.fill || "#4A90D9"); set("rx", "4");
      if (data.stroke !== undefined) set("stroke", data.stroke);
      this._components.set(id, { type, el, ...data });
    } else if (type === "ellipse") {
      el = document.createElementNS(SVG_NS, "ellipse");
      set("cx", data.cx); set("cy", data.cy);
      set("rx", data.rx); set("ry", data.ry);
      set("fill", data.fill || "#4AD94A");
      if (data.stroke !== undefined) set("stroke", data.stroke);
      this._components.set(id, {
        type, el,
        x: data.cx - data.rx, y: data.cy - data.ry,
        width: data.rx * 2, height: data.ry * 2,
        cx: data.cx, cy: data.cy, rx: data.rx, ry: data.ry,
        fill: data.fill
      });
    } else if (type === "text") {
      el = document.createElementNS(SVG_NS, "text");
      set("x", data.x); set("y", data.y);
      set("fill", data.fill || "#1A1A1A");
      set("font-size", data.fontSize || "16");
      if (data.stroke !== undefined) set("stroke", data.stroke);
      el.textContent = data.text || "Text";
      this._components.set(id, {
        type,
        el,
        x: data.x,
        y: data.y,
        width: 100,
        height: 24,
        text: data.text || "Text",
        fontSize: data.fontSize || "16",
        fill: data.fill,
        stroke: data.stroke
      });
    }
    
    if (el) {
      set("data-component-id", id);
      el.classList.add("art-canvas__component");
      this._componentsGroup.appendChild(el);
    }
  }
  
  _updatePos(id) {
    const c = this._components.get(id);
    if (!c) return;
    if (c.type === "rect") {
      c.el.setAttribute("x", c.x);
      c.el.setAttribute("y", c.y);
    } else if (c.type === "ellipse") {
      c.cx = c.x + c.width / 2;
      c.cy = c.y + c.height / 2;
      c.el.setAttribute("cx", c.cx);
      c.el.setAttribute("cy", c.cy);
    } else if (c.type === "text") {
      c.el.setAttribute("x", c.x);
      c.el.setAttribute("y", c.y);
    }
  }
  
  _select(id) {
    if (this._selectedId && this._selectedId !== id) {
      this._components.get(this._selectedId)?.el?.classList.remove("art-canvas__component--selected");
    }
    this._selectedId = id;
    const c = this._components.get(id);
    if (c?.el) {
      c.el.classList.add("art-canvas__component--selected");
      this._updateHandles();
      const hEl = this._selectionHandles.dom?.el;
      if (hEl) hEl.style.display = "block";
    }
    this.raise("selection-change", this._getSelectionData());
  }
  
  _deselectAll() {
    if (this._selectedId) {
      this._components.get(this._selectedId)?.el?.classList.remove("art-canvas__component--selected");
    }
    this._selectedId = null;
    const hEl = this._selectionHandles.dom?.el;
    if (hEl) hEl.style.display = "none";
    this.raise("selection-change", null);
  }
  
  /**
   * Get current selection data for external consumers.
   * @returns {object|null}
   */
  _getSelectionData() {
    if (!this._selectedId) return null;
    const c = this._components.get(this._selectedId);
    if (!c) return null;
    return {
      id: this._selectedId,
      type: c.type,
      x: c.x,
      y: c.y,
      width: c.width,
      height: c.height,
      fill: c.fill,
      stroke: c.stroke
    };
  }

  /**
   * Public: return current selection data (or null).
   * @returns {object|null}
   */
  getSelectionData() {
    return this._getSelectionData();
  }

  /**
   * Public: select a component by id.
   * @param {string} id
   */
  selectComponent(id) {
    this._select(id);
  }

  /**
   * Public: return the current layers list (topmost first).
   * @returns {Array<{id:string,type:string,name:string,selected:boolean}>}
   */
  getLayers() {
    if (!this._components) return [];
    const layers = [];
    this._components.forEach((comp, id) => {
      layers.push({
        id,
        type: comp.type,
        name: `${comp.type} ${id}`,
        selected: id === this._selectedId
      });
    });
    return layers.reverse();
  }
  
  _updateHandles() {
    const c = this._components.get(this._selectedId);
    if (!c) return;
    const svgRect = this._svg.getBoundingClientRect();
    const wrapRect = this._svgWrapper.dom?.el?.getBoundingClientRect() || svgRect;
    this._selectionHandles.updateBounds({
      x: c.x + (svgRect.left - wrapRect.left),
      y: c.y + (svgRect.top - wrapRect.top),
      width: c.width, height: c.height
    });
  }
  
  _startResize({ handle, mouseX, mouseY }) {
    const c = this._components.get(this._selectedId);
    if (!c) return;
    this._resizeState = { handle, origX: c.x, origY: c.y, origW: c.width, origH: c.height, startX: mouseX, startY: mouseY };
  }
  
  _doResize({ mouseX, mouseY }) {
    const r = this._resizeState;
    const c = this._components.get(this._selectedId);
    if (!r || !c) return;
    
    const dx = mouseX - r.startX, dy = mouseY - r.startY;
    let { origX: x, origY: y, origW: w, origH: h } = r;
    
    if (r.handle.includes("w")) { x += dx; w -= dx; }
    if (r.handle.includes("e")) { w += dx; }
    if (r.handle.includes("n")) { y += dy; h -= dy; }
    if (r.handle.includes("s")) { h += dy; }
    
    if (w < 20) { if (r.handle.includes("w")) x = r.origX + r.origW - 20; w = 20; }
    if (h < 20) { if (r.handle.includes("n")) y = r.origY + r.origH - 20; h = 20; }
    
    Object.assign(c, { x, y, width: w, height: h });
    
    if (c.type === "rect") {
      c.el.setAttribute("x", x); c.el.setAttribute("y", y);
      c.el.setAttribute("width", w); c.el.setAttribute("height", h);
    } else if (c.type === "ellipse") {
      c.rx = w / 2; c.ry = h / 2; c.cx = x + c.rx; c.cy = y + c.ry;
      c.el.setAttribute("cx", c.cx); c.el.setAttribute("cy", c.cy);
      c.el.setAttribute("rx", c.rx); c.el.setAttribute("ry", c.ry);
    }
    this._updateHandles();
  }
  
  _endResize() {
    if (this._resizeState) {
      this.raise("selection-change", this._getSelectionData());
    }
    this._resizeState = null;
  }
  
  // === Public API ===
  
  setTool(tool) {
    this._tool = tool;
    this.dom.el?.setAttribute?.("data-tool", tool);
  }
  
  addComponent(type) {
    const id = `comp${this._nextId++}`;
    const rand = () => 200 + Math.random() * 100;
    
    if (type === "rect") {
      this._renderComponent({ id, type, x: rand(), y: rand(), width: 120, height: 80, fill: this._randColor() });
    } else if (type === "ellipse") {
      const rx = 50 + Math.random() * 30, ry = 40 + Math.random() * 20;
      this._renderComponent({ id, type, cx: rand() + 50, cy: rand() + 50, rx, ry, fill: this._randColor() });
    } else if (type === "text") {
      this._renderComponent({ id, type, x: rand(), y: rand(), text: "New Text", fill: "#1A1A1A" });
    }
    this._select(id);
  }

  /**
   * Public: return a serialisable snapshot of a component (for undo/redo).
   * @param {string} id
   * @returns {object|null}
   */
  getComponentSnapshot(id) {
    const c = this._components.get(id);
    if (!c) return null;

    const fill = typeof c.fill === "string" ? c.fill : c.el?.getAttribute?.("fill");
    const stroke = typeof c.stroke === "string" ? c.stroke : c.el?.getAttribute?.("stroke");
    const fontSize = c.fontSize ?? c.el?.getAttribute?.("font-size");
    const text = c.text ?? c.el?.textContent;
    return {
      id,
      type: c.type,
      x: c.x,
      y: c.y,
      width: c.width,
      height: c.height,
      fill,
      stroke,
      text,
      fontSize
    };
  }

  _ensureNextIdAfterId(id) {
    if (typeof id !== "string") return;
    const m = /^comp(\d+)$/.exec(id);
    if (!m) return;
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n)) this._nextId = Math.max(this._nextId, n + 1);
  }

  /**
   * Public: create a component from a snapshot-like object.
   * If id is omitted, a new id is generated.
   * @param {object} data
   * @returns {string|null} id
   */
  createComponent(data = {}) {
    if (typeof document === "undefined") return null;
    if (!this._componentsGroup) return null;

    const type = data.type;
    if (!type) return null;

    const rand = () => 200 + Math.random() * 100;
    const id = data.id || `comp${this._nextId++}`;
    this._ensureNextIdAfterId(id);

    if (type === "rect") {
      this._renderComponent({
        id,
        type,
        x: data.x ?? rand(),
        y: data.y ?? rand(),
        width: data.width ?? 120,
        height: data.height ?? 80,
        fill: data.fill,
        stroke: data.stroke
      });
    } else if (type === "ellipse") {
      const width = data.width ?? (100 + Math.random() * 60);
      const height = data.height ?? (80 + Math.random() * 40);
      const x = data.x ?? rand();
      const y = data.y ?? rand();
      this._renderComponent({
        id,
        type,
        cx: x + width / 2,
        cy: y + height / 2,
        rx: width / 2,
        ry: height / 2,
        fill: data.fill,
        stroke: data.stroke
      });

      const c = this._components.get(id);
      if (c) {
        c.x = x;
        c.y = y;
        c.width = width;
        c.height = height;
        c.fill = data.fill ?? c.fill;
        c.stroke = data.stroke;
      }
    } else if (type === "text") {
      const x = data.x ?? rand();
      const y = data.y ?? rand();
      this._renderComponent({
        id,
        type,
        x,
        y,
        text: data.text ?? "New Text",
        fill: data.fill,
        stroke: data.stroke,
        fontSize: data.fontSize
      });
    } else {
      return null;
    }

    // Ensure any remaining fields are applied consistently.
    if (data.fill !== undefined || data.stroke !== undefined || data.x !== undefined || data.y !== undefined || data.width !== undefined || data.height !== undefined) {
      this.updateComponent(id, data);
    }

    this._select(id);
    return id;
  }

  /**
   * Public: remove a component by id and return its snapshot.
   * @param {string} id
   * @returns {object|null}
   */
  removeComponent(id) {
    if (!id) return null;
    const snap = this.getComponentSnapshot(id);
    const c = this._components.get(id);
    c?.el?.remove?.();
    this._components.delete(id);

    if (this._selectedId === id) {
      this._selectedId = null;
      const hEl = this._selectionHandles.dom?.el;
      if (hEl) hEl.style.display = "none";
      this.raise("selection-change", null);
    }

    return snap;
  }
  
  deleteSelected() {
    if (!this._selectedId) return;
    this.removeComponent(this._selectedId);
  }

  /**
   * Export the current SVG markup.
   * @returns {string} SVG markup (empty string if unavailable)
   */
  exportSvg() {
    const svgEl = this._svg || this.dom?.el?.querySelector?.(".art-canvas__svg");
    return svgEl?.outerHTML || "";
  }

  /**
   * Apply edited properties to the currently selected component.
   * @param {object} patch - Any of { x, y, width, height, fill, stroke }
   * @returns {boolean} true if applied
   */
  updateSelectedProperties(patch = {}) {
    if (!this._selectedId) return false;
    return this.updateComponent(this._selectedId, patch);
  }

  /**
   * Update a component and its SVG element.
   * @param {string} id
   * @param {object} patch
   * @returns {boolean}
   */
  updateComponent(id, patch = {}) {
    const c = this._components.get(id);
    if (!c) return false;

    const next = { ...patch };
    // Parse numeric fields when provided.
    ["x", "y", "width", "height"].forEach((k) => {
      if (next[k] === undefined) return;
      const n = typeof next[k] === "number" ? next[k] : parseFloat(String(next[k]).trim());
      if (!Number.isFinite(n)) delete next[k];
      else next[k] = n;
    });

    if (typeof next.fill === "string") c.fill = next.fill;
    if (typeof next.stroke === "string") c.stroke = next.stroke;
    if (typeof next.x === "number") c.x = next.x;
    if (typeof next.y === "number") c.y = next.y;
    if (typeof next.width === "number") c.width = Math.max(1, next.width);
    if (typeof next.height === "number") c.height = Math.max(1, next.height);

    // Apply attributes based on component type.
    if (c.type === "rect") {
      if (typeof c.x === "number") c.el.setAttribute("x", c.x);
      if (typeof c.y === "number") c.el.setAttribute("y", c.y);
      if (typeof c.width === "number") c.el.setAttribute("width", c.width);
      if (typeof c.height === "number") c.el.setAttribute("height", c.height);
      if (c.fill !== undefined) c.el.setAttribute("fill", c.fill);
      if (c.stroke !== undefined) c.el.setAttribute("stroke", c.stroke);
    } else if (c.type === "ellipse") {
      // Ellipse stored as box (x,y,width,height) plus derived center/radii.
      c.rx = c.width / 2;
      c.ry = c.height / 2;
      c.cx = c.x + c.rx;
      c.cy = c.y + c.ry;
      c.el.setAttribute("cx", c.cx);
      c.el.setAttribute("cy", c.cy);
      c.el.setAttribute("rx", c.rx);
      c.el.setAttribute("ry", c.ry);
      if (c.fill !== undefined) c.el.setAttribute("fill", c.fill);
      if (c.stroke !== undefined) c.el.setAttribute("stroke", c.stroke);
    } else if (c.type === "text") {
      if (typeof c.x === "number") c.el.setAttribute("x", c.x);
      if (typeof c.y === "number") c.el.setAttribute("y", c.y);
      if (c.fill !== undefined) c.el.setAttribute("fill", c.fill);
      if (c.stroke !== undefined) c.el.setAttribute("stroke", c.stroke);
    }

    if (this._selectedId === id) {
      this._updateHandles();
      this.raise("selection-change", this._getSelectionData());
    }

    return true;
  }
  
  _randColor() { return COLORS[Math.floor(Math.random() * COLORS.length)]; }
}

module.exports = { CanvasControl };
