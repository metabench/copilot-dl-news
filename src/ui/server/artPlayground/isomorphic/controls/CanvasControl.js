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
      { id: "rect1", type: "rect", x: 100, y: 100, width: 150, height: 100, fill: "#4A90D9" },
      { id: "rect2", type: "rect", x: 300, y: 150, width: 120, height: 80, fill: "#D94A4A" },
      { id: "ellipse1", type: "ellipse", cx: 550, cy: 200, rx: 70, ry: 50, fill: "#4AD94A" }
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
    
    if (type === "rect") {
      el = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      el.setAttribute("x", data.x);
      el.setAttribute("y", data.y);
      el.setAttribute("width", data.width);
      el.setAttribute("height", data.height);
      el.setAttribute("fill", data.fill || "#4A90D9");
      el.setAttribute("rx", "4");
      
      // Store component data
      this._components.set(id, {
        type: "rect",
        el: el,
        x: data.x,
        y: data.y,
        width: data.width,
        height: data.height,
        fill: data.fill
      });
    } else if (type === "ellipse") {
      el = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
      el.setAttribute("cx", data.cx);
      el.setAttribute("cy", data.cy);
      el.setAttribute("rx", data.rx);
      el.setAttribute("ry", data.ry);
      el.setAttribute("fill", data.fill || "#4AD94A");
      
      // Store with x/y as center for consistency
      this._components.set(id, {
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
        fill: data.fill
      });
    } else if (type === "text") {
      el = document.createElementNS("http://www.w3.org/2000/svg", "text");
      el.setAttribute("x", data.x);
      el.setAttribute("y", data.y);
      el.setAttribute("fill", data.fill || "#1A1A1A");
      el.setAttribute("font-size", data.fontSize || "16");
      el.textContent = data.text || "Text";
      
      this._components.set(id, {
        type: "text",
        el: el,
        x: data.x,
        y: data.y,
        width: 100,
        height: 24,
        text: data.text || "Text",
        fill: data.fill
      });
    }
    
    if (el) {
      el.setAttribute("data-component-id", id);
      el.classList.add("art-canvas__component");
      this._componentsGroup.appendChild(el);
    }
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
    this._selectedId = null;
    
    // Hide selection handles
    const handlesEl = this._selectionHandles.dom.el || this._selectionHandles.dom;
    if (handlesEl && handlesEl.style) {
      handlesEl.style.display = "none";
    }
  }
  
  _randomColor() {
    const colors = ["#4A90D9", "#D94A4A", "#4AD94A", "#D9D94A", "#9B4AD9", "#4AD9D9", "#D94A9B"];
    return colors[Math.floor(Math.random() * colors.length)];
  }
}

module.exports = { CanvasControl };
