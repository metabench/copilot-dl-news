"use strict";

const jsgui = require("../jsgui");
const { ComponentControl } = require("./ComponentControl");
const { SelectionHandlesControl } = require("./SelectionHandlesControl");

/**
 * Canvas Control
 * 
 * The main editing surface containing:
 * - SVG canvas for components
 * - Selection handles overlay
 * - Mouse interaction handling
 */
class CanvasControl extends jsgui.Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "div" });
    this.add_class("art-canvas");
    this.dom.attributes["data-jsgui-control"] = "art_canvas";
    
    this._tool = "select";
    this._components = new Map(); // id -> ComponentControl
    this._selectedId = null;
    this._nextId = 1;
    
    // Drag state
    this._dragState = null;
    
    if (!spec.el) {
      this._build();
    }
  }
  
  _build() {
    // Create SVG element for the canvas
    // Using a wrapper div + SVG inside
    this._svgWrapper = new jsgui.Control({ context: this.context, tagName: "div" });
    this._svgWrapper.add_class("art-canvas__svg-wrapper");
    
    // SVG content using String_Control for raw HTML output (jsgui doesn't have native SVG support)
    const svgContent = new jsgui.String_Control({
      context: this.context,
      text: `<svg class="art-canvas__svg" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#E0E0E0" stroke-width="0.5"/>
          </pattern>
          <filter id="luxGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#C9A227" flood-opacity="0.35"/>
          </filter>
        </defs>
        <rect class="art-canvas__grid" width="100%" height="100%" fill="url(#grid)"/>
        <g class="art-canvas__components"></g>
      </svg>`
    });
    this._svgWrapper.add(svgContent);
    
    this.add(this._svgWrapper);
    
    // Selection handles overlay (positioned absolutely over SVG)
    this._selectionHandles = new SelectionHandlesControl({ context: this.context });
    // Hide initially via style
    this._selectionHandles.dom.attributes.style = "display: none;";
    this.add(this._selectionHandles);
    
    // Add some default components for testing
    this._addDefaultComponents();
  }
  
  _addDefaultComponents() {
    // These will be rendered client-side after activation
    this._pendingComponents = [
      { id: "rect1", type: "rect", x: 100, y: 100, width: 150, height: 100, fill: "#4A90D9", opacity: 0.95 },
      { id: "rect2", type: "rect", x: 300, y: 150, width: 120, height: 80, fill: "#C9A227", stroke: "#0F0F0F", strokeWidth: 2 },
      { id: "ellipse1", type: "ellipse", cx: 550, cy: 200, rx: 70, ry: 50, fill: "#2D2D2D", opacity: 0.85, glow: true }
    ];
  }
  
  activate() {
    super.activate();
    
    // Get DOM element reference
    const el = this.dom.el || this.dom;
    
    // Get SVG element references
    this._svg = el.querySelector(".art-canvas__svg");
    this._componentsGroup = this._svg.querySelector(".art-canvas__components");
    
    // Render pending components
    if (this._pendingComponents) {
      this._pendingComponents.forEach(comp => this._renderComponent(comp));
      this._pendingComponents = null;
    }
    
    // Activate selection handles
    if (this._selectionHandles.activate) {
      this._selectionHandles.activate();
    }
    
    // Setup event listeners
    this._setupEventListeners();
  }
  
  _setupEventListeners() {
    // Click on canvas to select/deselect
    this._svg.addEventListener("mousedown", (e) => this._handleMouseDown(e));
    document.addEventListener("mousemove", (e) => this._handleMouseMove(e));
    document.addEventListener("mouseup", (e) => this._handleMouseUp(e));
    
    // Selection handle events
    this._selectionHandles.on("resize-start", (data) => this._startResize(data));
    this._selectionHandles.on("resize-move", (data) => this._doResize(data));
    this._selectionHandles.on("resize-end", () => this._endResize());
  }
  
  _handleMouseDown(e) {
    if (this._tool !== "select") return;
    
    const target = e.target;
    const componentEl = target.closest("[data-component-id]");
    
    if (componentEl) {
      const id = componentEl.getAttribute("data-component-id");
      this._selectComponent(id);
      
      // Start drag
      const rect = this._svg.getBoundingClientRect();
      this._dragState = {
        type: "move",
        id: id,
        startX: e.clientX - rect.left,
        startY: e.clientY - rect.top,
        component: this._components.get(id)
      };
      
      if (this._dragState.component) {
        this._dragState.origX = this._dragState.component.x;
        this._dragState.origY = this._dragState.component.y;
      }
      
      e.preventDefault();
    } else if (target === this._svg || target.classList.contains("art-canvas__grid")) {
      // Clicked on empty space - deselect
      this._deselectAll();
    }
  }
  
  _handleMouseMove(e) {
    if (!this._dragState) return;
    
    const rect = this._svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (this._dragState.type === "move") {
      const dx = x - this._dragState.startX;
      const dy = y - this._dragState.startY;
      
      const comp = this._dragState.component;
      if (comp) {
        comp.x = this._dragState.origX + dx;
        comp.y = this._dragState.origY + dy;
        this._updateComponentPosition(this._dragState.id);
        this._updateSelectionHandles();
        this._emitSelectionChange();
      }
    }
  }
  
  _handleMouseUp(e) {
    if (this._dragState) {
      this._dragState = null;
    }
  }
  
  _renderComponent(data) {
    const { id, type } = data;
    let el;
    let compRecord;
    
    if (type === "rect") {
      el = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      el.setAttribute("x", data.x);
      el.setAttribute("y", data.y);
      el.setAttribute("width", data.width);
      el.setAttribute("height", data.height);
      el.setAttribute("fill", data.fill || "#4A90D9");
      el.setAttribute("rx", "4");
      
      compRecord = {
        type: "rect",
        el: el,
        x: data.x,
        y: data.y,
        width: data.width,
        height: data.height,
        fill: data.fill || "#4A90D9"
      };
    } else if (type === "ellipse") {
      el = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
      el.setAttribute("cx", data.cx);
      el.setAttribute("cy", data.cy);
      el.setAttribute("rx", data.rx);
      el.setAttribute("ry", data.ry);
      el.setAttribute("fill", data.fill || "#4AD94A");
      
      compRecord = {
        type: "ellipse",
        el: el,
        x: data.cx - data.rx,
        y: data.cy - data.ry,
        width: data.rx * 2,
        height: data.ry * 2,
        cx: data.cx,
        cy: data.cy,
        rx: data.rx,
        ry: data.ry,
        fill: data.fill || "#4AD94A"
      };
    } else if (type === "text") {
      el = document.createElementNS("http://www.w3.org/2000/svg", "text");
      el.setAttribute("x", data.x);
      el.setAttribute("y", data.y);
      el.setAttribute("fill", data.fill || "#1A1A1A");
      el.setAttribute("font-size", data.fontSize || "16");
      el.textContent = data.text || "Text";
      
      compRecord = {
        type: "text",
        el: el,
        x: data.x,
        y: data.y,
        width: 100,
        height: 24,
        text: data.text || "Text",
        fill: data.fill || "#1A1A1A"
      };
    }
    
    if (compRecord) {
      compRecord.opacity = data.opacity !== undefined ? data.opacity : 1;
      compRecord.stroke = data.stroke || null;
      compRecord.strokeWidth = data.strokeWidth || 0;
      compRecord.glow = !!data.glow;
      compRecord.shadowDepth = data.shadowDepth || 0;
      compRecord.cornerRadius = data.cornerRadius !== undefined ? data.cornerRadius : 4;
      compRecord.blendMode = data.blendMode || "normal";
      this._components.set(id, compRecord);
      this._applyVisualAttributes(compRecord);
    }
    
    if (el) {
      el.setAttribute("data-component-id", id);
      el.classList.add("art-canvas__component");
      this._componentsGroup.appendChild(el);
    }
  }

  _applyVisualAttributes(comp) {
    if (!comp || !comp.el) return;
    if (comp.fill) {
      comp.el.setAttribute("fill", comp.fill);
    }
    const opacity = comp.opacity !== undefined ? comp.opacity : 1;
    comp.el.setAttribute("opacity", opacity);
    if (comp.stroke) {
      comp.el.setAttribute("stroke", comp.stroke);
      comp.el.setAttribute("stroke-width", comp.strokeWidth || 1);
    } else {
      comp.el.removeAttribute("stroke");
      comp.el.removeAttribute("stroke-width");
    }
    
    // Corner radius (for rects)
    if (comp.type === "rect") {
      const rx = comp.cornerRadius !== undefined ? comp.cornerRadius : 4;
      comp.el.setAttribute("rx", rx);
      comp.el.setAttribute("ry", rx);
    }
    
    // Blend mode
    if (comp.blendMode && comp.blendMode !== "normal") {
      comp.el.style.mixBlendMode = comp.blendMode;
    } else {
      comp.el.style.mixBlendMode = "";
    }
    
    // Filter effects (glow and shadow)
    const filters = [];
    if (comp.glow) {
      filters.push("url(#luxGlow)");
    }
    if (comp.shadowDepth && comp.shadowDepth > 0) {
      // Create dynamic shadow filter if not exists
      this._ensureShadowFilter(comp.shadowDepth);
      filters.push(`url(#shadowDepth${Math.round(comp.shadowDepth * 100)})`);
    }
    if (filters.length > 0) {
      comp.el.setAttribute("filter", filters.join(" "));
    } else {
      comp.el.removeAttribute("filter");
    }
  }

  _ensureShadowFilter(depth) {
    const filterId = `shadowDepth${Math.round(depth * 100)}`;
    if (this._svg.querySelector(`#${filterId}`)) return;
    
    const defs = this._svg.querySelector("defs");
    if (!defs) return;
    
    const filter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
    filter.setAttribute("id", filterId);
    filter.setAttribute("x", "-50%");
    filter.setAttribute("y", "-50%");
    filter.setAttribute("width", "200%");
    filter.setAttribute("height", "200%");
    
    const dropShadow = document.createElementNS("http://www.w3.org/2000/svg", "feDropShadow");
    dropShadow.setAttribute("dx", "0");
    dropShadow.setAttribute("dy", Math.round(4 + depth * 12));
    dropShadow.setAttribute("stdDeviation", Math.round(4 + depth * 16));
    dropShadow.setAttribute("flood-color", "#000000");
    dropShadow.setAttribute("flood-opacity", (0.15 + depth * 0.35).toFixed(2));
    
    filter.appendChild(dropShadow);
    defs.appendChild(filter);
  }
  
  _updateComponentPosition(id) {
    const comp = this._components.get(id);
    if (!comp) return;
    
    const el = comp.el;
    
    if (comp.type === "rect") {
      el.setAttribute("x", comp.x);
      el.setAttribute("y", comp.y);
    } else if (comp.type === "ellipse") {
      comp.cx = comp.x + comp.width / 2;
      comp.cy = comp.y + comp.height / 2;
      el.setAttribute("cx", comp.cx);
      el.setAttribute("cy", comp.cy);
    } else if (comp.type === "text") {
      el.setAttribute("x", comp.x);
      el.setAttribute("y", comp.y);
    }
  }
  
  _selectComponent(id) {
    // Deselect previous
    if (this._selectedId && this._selectedId !== id) {
      const prevComp = this._components.get(this._selectedId);
      if (prevComp && prevComp.el) {
        prevComp.el.classList.remove("art-canvas__component--selected");
      }
    }
    
    this._selectedId = id;
    const comp = this._components.get(id);
    
    if (comp && comp.el) {
      comp.el.classList.add("art-canvas__component--selected");
      this._updateSelectionHandles();
      
      // Show selection handles
      const handlesEl = this._selectionHandles.dom.el || this._selectionHandles.dom;
      if (handlesEl && handlesEl.style) {
        handlesEl.style.display = "block";
      }
    }

    this._emitSelectionChange();
  }
  
  _deselectAll() {
    if (this._selectedId) {
      const comp = this._components.get(this._selectedId);
      if (comp && comp.el) {
        comp.el.classList.remove("art-canvas__component--selected");
      }
    }
    this._selectedId = null;
    
    // Hide selection handles
    const handlesEl = this._selectionHandles.dom.el || this._selectionHandles.dom;
    if (handlesEl && handlesEl.style) {
      handlesEl.style.display = "none";
    }

    this._emitSelectionChange();
  }
  
  _updateSelectionHandles() {
    if (!this._selectedId) return;
    
    const comp = this._components.get(this._selectedId);
    if (!comp) return;
    
    // Get bounding box relative to canvas
    const svgRect = this._svg.getBoundingClientRect();
    const wrapperEl = this._svgWrapper.dom.el || this._svgWrapper.dom;
    const wrapperRect = wrapperEl.getBoundingClientRect();
    
    // Calculate position relative to wrapper
    const offsetX = svgRect.left - wrapperRect.left;
    const offsetY = svgRect.top - wrapperRect.top;
    
    this._selectionHandles.updateBounds({
      x: comp.x + offsetX,
      y: comp.y + offsetY,
      width: comp.width,
      height: comp.height
    });
  }

  _serializeSelection() {
    if (!this._selectedId) return null;
    const comp = this._components.get(this._selectedId);
    if (!comp) return null;
    return {
      id: this._selectedId,
      type: comp.type,
      x: comp.x,
      y: comp.y,
      width: comp.width,
      height: comp.height,
      fill: comp.fill,
      stroke: comp.stroke,
      strokeWidth: comp.strokeWidth,
      opacity: comp.opacity !== undefined ? comp.opacity : 1,
      glow: !!comp.glow,
      shadowDepth: comp.shadowDepth || 0,
      cornerRadius: comp.cornerRadius !== undefined ? comp.cornerRadius : 4,
      blendMode: comp.blendMode || "normal"
    };
  }

  _emitSelectionChange() {
    this.raise("selection-change", this._serializeSelection());
  }
  
  _startResize(data) {
    if (!this._selectedId) return;
    
    const comp = this._components.get(this._selectedId);
    if (!comp) return;
    
    this._resizeState = {
      handle: data.handle,
      origX: comp.x,
      origY: comp.y,
      origWidth: comp.width,
      origHeight: comp.height,
      startMouseX: data.mouseX,
      startMouseY: data.mouseY
    };
  }
  
  _doResize(data) {
    if (!this._resizeState || !this._selectedId) return;
    
    const comp = this._components.get(this._selectedId);
    if (!comp) return;
    
    const dx = data.mouseX - this._resizeState.startMouseX;
    const dy = data.mouseY - this._resizeState.startMouseY;
    const handle = this._resizeState.handle;
    
    let newX = this._resizeState.origX;
    let newY = this._resizeState.origY;
    let newWidth = this._resizeState.origWidth;
    let newHeight = this._resizeState.origHeight;
    
    // Handle resize based on which handle is being dragged
    if (handle.includes("w")) {
      newX = this._resizeState.origX + dx;
      newWidth = this._resizeState.origWidth - dx;
    }
    if (handle.includes("e")) {
      newWidth = this._resizeState.origWidth + dx;
    }
    if (handle.includes("n")) {
      newY = this._resizeState.origY + dy;
      newHeight = this._resizeState.origHeight - dy;
    }
    if (handle.includes("s")) {
      newHeight = this._resizeState.origHeight + dy;
    }
    
    // Enforce minimum size
    if (newWidth < 20) {
      if (handle.includes("w")) newX = this._resizeState.origX + this._resizeState.origWidth - 20;
      newWidth = 20;
    }
    if (newHeight < 20) {
      if (handle.includes("n")) newY = this._resizeState.origY + this._resizeState.origHeight - 20;
      newHeight = 20;
    }
    
    // Update component
    comp.x = newX;
    comp.y = newY;
    comp.width = newWidth;
    comp.height = newHeight;
    
    // Update SVG element
    if (comp.type === "rect") {
      comp.el.setAttribute("x", newX);
      comp.el.setAttribute("y", newY);
      comp.el.setAttribute("width", newWidth);
      comp.el.setAttribute("height", newHeight);
    } else if (comp.type === "ellipse") {
      comp.rx = newWidth / 2;
      comp.ry = newHeight / 2;
      comp.cx = newX + comp.rx;
      comp.cy = newY + comp.ry;
      comp.el.setAttribute("cx", comp.cx);
      comp.el.setAttribute("cy", comp.cy);
      comp.el.setAttribute("rx", comp.rx);
      comp.el.setAttribute("ry", comp.ry);
    }
    
    this._updateSelectionHandles();
    this._emitSelectionChange();
  }
  
  _endResize() {
    this._resizeState = null;
  }
  
  // Public API
  
  setTool(toolName) {
    this._tool = toolName;
    const el = this.dom.el || this.dom;
    if (el && el.setAttribute) {
      el.setAttribute("data-tool", toolName);
    }
  }
  
  addComponent(type) {
    const id = `comp${this._nextId++}`;
    
    // Add at a default position
    if (type === "rect") {
      this._renderComponent({
        id,
        type: "rect",
        x: 200 + Math.random() * 100,
        y: 200 + Math.random() * 100,
        width: 120,
        height: 80,
        fill: this._randomColor()
      });
    } else if (type === "ellipse") {
      const rx = 50 + Math.random() * 30;
      const ry = 40 + Math.random() * 20;
      this._renderComponent({
        id,
        type: "ellipse",
        cx: 250 + Math.random() * 100,
        cy: 250 + Math.random() * 100,
        rx,
        ry,
        fill: this._randomColor()
      });
    } else if (type === "text") {
      this._renderComponent({
        id,
        type: "text",
        x: 200 + Math.random() * 100,
        y: 200 + Math.random() * 100,
        text: "New Text",
        fill: "#1A1A1A"
      });
    }
    
    // Select the new component
    this._selectComponent(id);
  }
  
  deleteSelected() {
    if (!this._selectedId) return;
    
    const comp = this._components.get(this._selectedId);
    if (comp && comp.el) {
      comp.el.remove();
    }
    
    this._components.delete(this._selectedId);
    this._deselectAll();
  }
  
  updateSelectedProperties(patch = {}) {
    if (!this._selectedId) return;
    const comp = this._components.get(this._selectedId);
    if (!comp) return;

    if (patch.fill) {
      comp.fill = patch.fill;
      comp.el.setAttribute("fill", patch.fill);
    }
    if (patch.opacity !== undefined) {
      const clamped = Math.min(1, Math.max(0.2, patch.opacity));
      comp.opacity = clamped;
    }
    if (patch.stroke !== undefined) {
      comp.stroke = patch.stroke || null;
    }
    if (patch.strokeWidth !== undefined) {
      comp.strokeWidth = patch.strokeWidth;
    }
    if (patch.glow !== undefined) {
      comp.glow = !!patch.glow;
    }
    if (patch.shadowDepth !== undefined) {
      comp.shadowDepth = patch.shadowDepth;
    }
    if (patch.cornerRadius !== undefined) {
      comp.cornerRadius = patch.cornerRadius;
    }
    if (patch.blendMode !== undefined) {
      comp.blendMode = patch.blendMode;
    }

    this._applyVisualAttributes(comp);
    this._emitSelectionChange();
  }

  _randomColor() {
    const colors = ["#F2EFE6", "#C9A227", "#2D2D2D", "#4A90D9", "#4AD9B3", "#9B7B4B"];
    return colors[Math.floor(Math.random() * colors.length)];
  }
}

module.exports = { CanvasControl };
