"use strict";

const jsgui = require("../jsgui");
const { ComponentControl } = require("./ComponentControl");
const { SelectionHandlesControl } = require("./SelectionHandlesControl");

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
    
    if (!spec.el) this.compose();
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
    
    // Default test components
    this._pendingComponents = [
      { id: "rect1", type: "rect", x: 100, y: 100, width: 150, height: 100, fill: "#4A90D9" },
      { id: "rect2", type: "rect", x: 300, y: 150, width: 120, height: 80, fill: "#D94A4A" },
      { id: "ellipse1", type: "ellipse", cx: 550, cy: 200, rx: 70, ry: 50, fill: "#4AD94A" }
    ];
  }
  
  activate() {
    if (this.__active) return;
    this.__active = true;
    
    const el = this.dom.el;
    this._svg = el.querySelector(".art-canvas__svg");
    this._componentsGroup = this._svg.querySelector(".art-canvas__components");
    
    // Render pending
    this._pendingComponents?.forEach(c => this._renderComponent(c));
    this._pendingComponents = null;
    
    this._selectionHandles.activate?.();
    this._setupEvents();
  }
  
  _setupEvents() {
    this._svg.addEventListener("mousedown", (e) => this._onMouseDown(e));
    document.addEventListener("mousemove", (e) => this._onMouseMove(e));
    document.addEventListener("mouseup", () => this._onMouseUp());
    
    this._selectionHandles.on("resize-start", (d) => this._startResize(d));
    this._selectionHandles.on("resize-move", (d) => this._doResize(d));
    this._selectionHandles.on("resize-end", () => { this._resizeState = null; });
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
  
  _onMouseUp() { this._dragState = null; }
  
  _renderComponent({ id, type, ...data }) {
    let el;
    const set = (k, v) => el.setAttribute(k, v);
    
    if (type === "rect") {
      el = document.createElementNS(SVG_NS, "rect");
      set("x", data.x); set("y", data.y);
      set("width", data.width); set("height", data.height);
      set("fill", data.fill || "#4A90D9"); set("rx", "4");
      this._components.set(id, { type, el, ...data });
    } else if (type === "ellipse") {
      el = document.createElementNS(SVG_NS, "ellipse");
      set("cx", data.cx); set("cy", data.cy);
      set("rx", data.rx); set("ry", data.ry);
      set("fill", data.fill || "#4AD94A");
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
      el.textContent = data.text || "Text";
      this._components.set(id, { type, el, x: data.x, y: data.y, width: 100, height: 24, text: data.text || "Text", fill: data.fill });
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
  }
  
  _deselectAll() {
    if (this._selectedId) {
      this._components.get(this._selectedId)?.el?.classList.remove("art-canvas__component--selected");
    }
    this._selectedId = null;
    const hEl = this._selectionHandles.dom?.el;
    if (hEl) hEl.style.display = "none";
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
  
  deleteSelected() {
    if (!this._selectedId) return;
    this._components.get(this._selectedId)?.el?.remove();
    this._components.delete(this._selectedId);
    this._selectedId = null;
    const hEl = this._selectionHandles.dom?.el;
    if (hEl) hEl.style.display = "none";
  }
  
  _randColor() { return COLORS[Math.floor(Math.random() * COLORS.length)]; }
}

module.exports = { CanvasControl };
