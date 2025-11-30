"use strict";

const jsgui = require("../jsgui");

/**
 * Selection Handles Control
 * 
 * Displays resize handles around selected component:
 * - 8 handles: 4 corners + 4 edges
 * - Visual feedback on hover
 * - Emits resize events
 */
class SelectionHandlesControl extends jsgui.Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "div" });
    this.add_class("art-selection");
    this.dom.attributes["data-jsgui-control"] = "art_selection";
    
    this._bounds = { x: 0, y: 0, width: 100, height: 100 };
    this._handles = {};
    this._activeHandle = null;
    
    if (!spec.el) {
      this._build();
    }
  }
  
  _build() {
    // Selection outline
    this._outline = new jsgui.Control({ context: this.context, tagName: "div" });
    this._outline.add_class("art-selection__outline");
    this.add(this._outline);
    
    // Create 8 handles
    const handlePositions = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
    
    handlePositions.forEach(pos => {
      const handle = new jsgui.Control({ context: this.context, tagName: "div" });
      handle.add_class("art-selection__handle");
      handle.add_class(`art-selection__handle--${pos}`);
      handle.dom.attributes["data-handle"] = pos;
      this._handles[pos] = handle;
      this.add(handle);
    });
  }
  
  activate() {
    super.activate();
    
    // Setup handle drag events
    Object.entries(this._handles).forEach(([pos, handle]) => {
      const el = handle.dom.el || handle.dom;
      if (!el || typeof el.addEventListener !== 'function') return;
      
      el.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        this._activeHandle = pos;
        
        this.raise("resize-start", {
          handle: pos,
          mouseX: e.clientX,
          mouseY: e.clientY
        });
        
        // Track mouse movement
        const onMove = (moveEvent) => {
          this.raise("resize-move", {
            handle: pos,
            mouseX: moveEvent.clientX,
            mouseY: moveEvent.clientY
          });
        };
        
        const onUp = () => {
          this._activeHandle = null;
          this.raise("resize-end");
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
        };
        
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
    });
  }
  
  /**
   * Update handle positions based on component bounds
   */
  updateBounds(bounds) {
    this._bounds = bounds;
    
    const { x, y, width, height } = bounds;
    
    // Update outline position
    const outlineEl = this._outline.dom.el || this._outline.dom;
    if (outlineEl && outlineEl.style) {
      outlineEl.style.left = `${x}px`;
      outlineEl.style.top = `${y}px`;
      outlineEl.style.width = `${width}px`;
      outlineEl.style.height = `${height}px`;
    }
    
    // Update handle positions
    const handleSize = 8;
    const half = handleSize / 2;
    
    // Corner handles
    this._setHandlePos("nw", x - half, y - half);
    this._setHandlePos("ne", x + width - half, y - half);
    this._setHandlePos("se", x + width - half, y + height - half);
    this._setHandlePos("sw", x - half, y + height - half);
    
    // Edge handles
    this._setHandlePos("n", x + width / 2 - half, y - half);
    this._setHandlePos("s", x + width / 2 - half, y + height - half);
    this._setHandlePos("w", x - half, y + height / 2 - half);
    this._setHandlePos("e", x + width - half, y + height / 2 - half);
  }
  
  _setHandlePos(pos, left, top) {
    const handle = this._handles[pos];
    if (handle) {
      const el = handle.dom.el || handle.dom;
      if (el && el.style) {
        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
      }
    }
  }
}

module.exports = { SelectionHandlesControl };
