/**
 * @fileoverview ConnectorControl - An isomorphic SVG connector line between two points or controls.
 * 
 * Designed to work within a CanvasControl's SVG layer. Connects two anchors (controls or points)
 * and updates automatically when they move.
 * 
 * ## Key Features
 * - **Dynamic Updates**: Listens to source/target move events
 * - **Path Types**: Straight, Curved (Bezier), Orthogonal (Manhattan)
 * - **Styling**: Configurable color, width, dash style
 * - **Markers**: Arrowheads (start/end) support (via SVG markers - TODO)
 * 
 * @module shared/isomorphic/controls/interactive/ConnectorControl
 * @requires jsgui3-html
 */

const jsgui = require('jsgui3-html');
const { Control } = jsgui;

class ConnectorControl extends Control {
  /**
   * Creates a new ConnectorControl.
   * 
   * @param {Object} spec - Configuration options
   * @param {Control|Object} spec.source - Source control or {x, y} point
   * @param {Control|Object} spec.target - Target control or {x, y} point
   * @param {string} [spec.type='straight'] - 'straight', 'curved', 'orthogonal'
   * @param {string} [spec.color='#000000'] - Stroke color
   * @param {number} [spec.width=2] - Stroke width
   * @param {string} [spec.tagName='path'] - SVG tag name
   */
  constructor(spec = {}) {
    spec.tagName = spec.tagName || 'path';
    super(spec);

    this.source = spec.source;
    this.target = spec.target;
    this.type = spec.type || 'straight';
    this.color = spec.color || '#000000';
    this.strokeWidth = spec.width || 2;
    
    this.__type_name = 'connector_control';
  }

  get class_name() {
    return 'connector_control';
  }

  compose() {
    // Set SVG attributes
    this.dom.attributes.stroke = this.color;
    this.dom.attributes['stroke-width'] = this.strokeWidth;
    this.dom.attributes.fill = 'none';
    
    // Calculate initial path if possible
    this.updatePath();
    
    // Server-side state preservation
    this.on('server-pre-render', () => {
      this._fields = this._fields || {};
      // We can't easily serialize control references, so we might need IDs
      // For now, assume client-side re-linking or static points
      if (this.source && this.source._id) this._fields.sourceId = this.source._id();
      if (this.target && this.target._id) this._fields.targetId = this.target._id();
      this._fields.type = this.type;
      this._fields.color = this.color;
      this._fields.strokeWidth = this.strokeWidth;
    });
  }

  activate() {
    super.activate();
    
    // Restore state
    if (this._fields) {
      this.type = this._fields.type || this.type;
      this.color = this._fields.color || this.color;
      this.strokeWidth = this._fields.strokeWidth || this.strokeWidth;
      
      // Re-link controls by ID if needed (requires context.map_controls)
      if (this._fields.sourceId && this.context.map_controls) {
        this.source = this.context.map_controls.get(this._fields.sourceId);
      }
      if (this._fields.targetId && this.context.map_controls) {
        this.target = this.context.map_controls.get(this._fields.targetId);
      }
    }
    
    this._bindEvents();
    this.updatePath();
  }

  _bindEvents() {
    const bindAnchor = (anchor) => {
      if (anchor && anchor.on) {
        // Listen for drag/move events
        anchor.on('drag', () => this.updatePath());
        anchor.on('dragend', () => this.updatePath());
        anchor.on('change', () => this.updatePath()); // Generic change
        
        // If it's a DraggableControl, it might emit specific events
        anchor.on('drag-move', () => this.updatePath());
      }
    };

    bindAnchor(this.source);
    bindAnchor(this.target);
  }

  /**
   * Gets the center point of an anchor (Control or Point).
   * @param {Control|Object} anchor 
   * @returns {{x: number, y: number}}
   */
  _getAnchorPoint(anchor) {
    if (!anchor) return { x: 0, y: 0 };

    // If it's a Control
    if (anchor.dom && anchor.dom.el) {
      // Client-side with DOM
      // We need position relative to the Canvas (parent's parent usually)
      // But simpler: use style.left/top if absolute, or offsetLeft/Top
      
      // Assuming absolute positioning in Canvas
      const x = parseInt(anchor.style.left || 0);
      const y = parseInt(anchor.style.top || 0);
      const w = anchor.dom.el.offsetWidth || 0;
      const h = anchor.dom.el.offsetHeight || 0;
      
      return {
        x: x + w / 2,
        y: y + h / 2
      };
    } else if (anchor.pos) {
        // Server-side or abstract control with pos property
        const x = anchor.pos[0] || 0;
        const y = anchor.pos[1] || 0;
        // Try to guess size or default to 0 center offset
        const w = anchor.size ? anchor.size[0] : 0;
        const h = anchor.size ? anchor.size[1] : 0;
        return {
            x: x + w / 2,
            y: y + h / 2
        };
    }

    // If it's a point {x, y}
    if (typeof anchor.x === 'number') return anchor;
    
    return { x: 0, y: 0 };
  }

  updatePath() {
    const p1 = this._getAnchorPoint(this.source);
    const p2 = this._getAnchorPoint(this.target);
    
    let d = '';
    
    if (this.type === 'straight') {
      d = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
    } else if (this.type === 'curved') {
      // Simple Bezier curve
      const dx = p2.x - p1.x;
      // Control points
      const c1x = p1.x + dx * 0.5;
      const c1y = p1.y;
      const c2x = p2.x - dx * 0.5;
      const c2y = p2.y;
      
      d = `M ${p1.x} ${p1.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
    } else if (this.type === 'orthogonal') {
      // Manhattan routing (simple)
      const midX = (p1.x + p2.x) / 2;
      d = `M ${p1.x} ${p1.y} L ${midX} ${p1.y} L ${midX} ${p2.y} L ${p2.x} ${p2.y}`;
    }
    
    if (this.dom) {
        this.dom.attributes.d = d;
        // If client-side, update DOM directly for performance
        if (this.dom.el) {
            this.dom.el.setAttribute('d', d);
        }
    }
  }
}

module.exports = ConnectorControl;
