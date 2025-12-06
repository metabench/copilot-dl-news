/**
 * @fileoverview ResizableControl - An isomorphic control that provides resize handles
 * for its content or a target control.
 * 
 * Wraps content in a container with 8 resize handles. Handles resizing logic including
 * minimum dimensions and position updates (for top/left resizing).
 * 
 * ## Key Features
 * - **8-Direction Resizing**: Supports N, S, E, W, NE, NW, SE, SW handles
 * - **Isomorphic**: Renders handles server-side, activates logic client-side
 * - **Events**: Emits `resize-start`, `resize`, `resize-end`
 * - **Constraints**: Supports min/max width/height
 * 
 * @module shared/isomorphic/controls/interactive/ResizableControl
 * @requires jsgui3-html
 */

const jsgui = require('jsgui3-html');
const { Control } = jsgui;
const drag_like_events = require('jsgui3-html/control_mixins/drag_like_events');

class ResizableControl extends Control {
  constructor(spec = {}) {
    spec.tagName = spec.tagName || 'div';
    super(spec);
    
    this.handles = spec.handles || ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
    this.minWidth = spec.minWidth || 20;
    this.minHeight = spec.minHeight || 20;
    this.handleSize = spec.handleSize || 8;
    
    this.__type_name = 'resizable_control';
    
    // State
    this.isResizing = false;
    this._initialRect = null;
  }

  get class_name() {
    return 'resizable_control';
  }

  compose() {
    this.add_class('resizable-control');
    this.style.position = 'absolute'; // Usually needs absolute to be resizable/movable
    
    // Create handles
    this.handles.forEach(dir => {
      const handle = new Control({
        context: this.context,
        tagName: 'div'
      });
      handle.add_class(`resize-handle handle-${dir}`);
      handle.style.position = 'absolute';
      handle.style.width = `${this.handleSize}px`;
      handle.style.height = `${this.handleSize}px`;
      handle.style.zIndex = 100;
      
      // Position handles
      this._positionHandle(handle, dir);
      
      this.add(handle);
      this._handles = this._handles || {};
      this._handles[dir] = handle;
    });
    
    // Server-side state
    this.on('server-pre-render', () => {
      this._fields = this._fields || {};
      this._fields.handles = this.handles;
      this._fields.minWidth = this.minWidth;
      this._fields.minHeight = this.minHeight;
    });
  }

  _positionHandle(handle, dir) {
    const half = -this.handleSize / 2;
    
    // Vertical pos
    if (dir.includes('n')) handle.style.top = `${half}px`;
    else if (dir.includes('s')) handle.style.bottom = `${half}px`;
    else handle.style.top = `calc(50% + ${half}px)`;
    
    // Horizontal pos
    if (dir.includes('w')) handle.style.left = `${half}px`;
    else if (dir.includes('e')) handle.style.right = `${half}px`;
    else handle.style.left = `calc(50% + ${half}px)`;
    
    // Cursor
    let cursor = `${dir}-resize`;
    handle.style.cursor = cursor;
  }

  activate() {
    super.activate();
    
    // Restore state
    if (this._fields) {
      this.minWidth = this._fields.minWidth || this.minWidth;
      this.minHeight = this._fields.minHeight || this.minHeight;
    }
    
    // Activate handles
    if (this._handles) {
      Object.entries(this._handles).forEach(([dir, handle]) => {
        // Apply drag_like_events mixin
        drag_like_events(handle);
        
        handle.on('dragstart', (e) => this._onResizeStart(dir, e));
        handle.on('drag', (e) => this._onResize(dir, e));
        handle.on('dragend', (e) => this._onResizeEnd(dir, e));
      });
    }
  }

  _onResizeStart(dir, e) {
    this.isResizing = true;
    this.add_class('resizing');
    
    // Capture initial state
    const style = window.getComputedStyle(this.dom.el);
    this._initialRect = {
      width: parseFloat(style.width),
      height: parseFloat(style.height),
      left: parseFloat(style.left),
      top: parseFloat(style.top)
    };
    
    this.raise('resize-start', { dir, startRect: {...this._initialRect} });
  }

  _onResize(dir, e) {
    if (!this.isResizing || !this._initialRect) return;
    
    const dx = e.info.offset[0];
    const dy = e.info.offset[1];
    
    let newW = this._initialRect.width;
    let newH = this._initialRect.height;
    let newL = this._initialRect.left;
    let newT = this._initialRect.top;
    
    // Horizontal resizing
    if (dir.includes('e')) {
      newW = Math.max(this.minWidth, this._initialRect.width + dx);
    } else if (dir.includes('w')) {
      const w = Math.max(this.minWidth, this._initialRect.width - dx);
      const deltaW = w - this._initialRect.width;
      // Only move left if width actually changed (and didn't hit min)
      if (w !== this._initialRect.width) {
        newW = w;
        newL = this._initialRect.left - deltaW; // Move left by the amount width grew
        // Actually, if we drag left, dx is negative. width grows. left moves left (negative).
        // If we drag right (dx positive), width shrinks. left moves right (positive).
        // So newL = initialLeft + (initialWidth - newWidth) ?
        // Or simpler: newL = initialLeft + dx, but constrained by minWidth.
        
        // Let's stick to: newW = initialW - dx.
        // If newW < minW, newW = minW.
        // The effective dx used is (initialW - newW).
        // newL = initialL + (initialW - newW).
        newL = this._initialRect.left + (this._initialRect.width - newW);
      }
    }
    
    // Vertical resizing
    if (dir.includes('s')) {
      newH = Math.max(this.minHeight, this._initialRect.height + dy);
    } else if (dir.includes('n')) {
      const h = Math.max(this.minHeight, this._initialRect.height - dy);
      if (h !== this._initialRect.height) {
        newH = h;
        newT = this._initialRect.top + (this._initialRect.height - newH);
      }
    }
    
    // Apply changes
    this.style.width = `${newW}px`;
    this.style.height = `${newH}px`;
    this.style.left = `${newL}px`;
    this.style.top = `${newT}px`;
    
    this.raise('resize', { 
      width: newW, 
      height: newH,
      left: newL,
      top: newT
    });
  }

  _onResizeEnd(dir, e) {
    this.isResizing = false;
    this.remove_class('resizing');
    this._initialRect = null;
    
    this.raise('resize-end', { dir });
  }
}

module.exports = ResizableControl;
