"use strict";

const jsgui = require("jsgui3-html");
const StringControl = jsgui.String_Control;

/**
 * DataExplorerPanel - Base panel with WLILO styling and SVG corner decorations
 * 
 * A premium panel container with:
 * - SVG corner accents (gold luxury decorations)
 * - Gradient header with title/subtitle
 * - Optional action buttons in header
 * - Smooth shadow and border treatments
 * 
 * @example
 * const panel = new DataExplorerPanel({
 *   context,
 *   title: "📊 Data Explorer",
 *   subtitle: "Browse downloaded content",
 *   icon: "📊",
 *   actions: [
 *     { label: "⚙️ Settings", onClick: "openSettings()" }
 *   ]
 * });
 */
class DataExplorerPanel extends jsgui.Control {
  /**
   * @param {Object} spec
   * @param {string} spec.title - Panel title
   * @param {string} [spec.subtitle] - Optional subtitle
   * @param {string} [spec.icon] - Optional emoji icon
   * @param {Array} [spec.actions] - Header action buttons
   * @param {string} [spec.variant] - gold|emerald|sapphire|ruby (default: gold)
   * @param {boolean} [spec.corners=true] - Show SVG corner decorations
   */
  constructor(spec = {}) {
    const context = spec.context || new jsgui.Page_Context();
    super({ context, tagName: "div" });

    this.add_class("dex-panel");
    
    const variant = spec.variant || "gold";
    this.add_class(`dex-panel--${variant}`);

    // SVG corner decorations
    if (spec.corners !== false) {
      this.add(this._buildCornerSVG(context));
    }

    // Header
    if (spec.title) {
      this.add(this._buildHeader(context, spec));
    }

    // Body container (content added here)
    this._body = new jsgui.div({ context, class: "dex-panel__body" });
    this.add(this._body);
  }

  /**
   * Add content to the panel body
   */
  addContent(control) {
    this._body.add(control);
    return this;
  }

  /**
   * Add footer section
   */
  addFooter(context, content) {
    const footer = new jsgui.div({ context, class: "dex-panel__footer" });
    if (typeof content === "string") {
      footer.add(new StringControl({ context, text: content }));
    } else {
      footer.add(content);
    }
    this.add(footer);
    return footer;
  }

  _buildCornerSVG(context) {
    const svg = new jsgui.Control({ context, tagName: "div" });
    svg.add_class("dex-panel__corners");
    
    // Inline SVG for corner accents (positioned absolutely)
    const svgHtml = `
      <svg class="dex-corner dex-corner--tl" width="24" height="24" viewBox="0 0 24 24">
        <path d="M 2 22 L 2 2 L 22 2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
        <circle cx="2" cy="2" r="2" fill="currentColor"/>
      </svg>
      <svg class="dex-corner dex-corner--tr" width="24" height="24" viewBox="0 0 24 24">
        <path d="M 22 22 L 22 2 L 2 2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
        <circle cx="22" cy="2" r="2" fill="currentColor"/>
      </svg>
      <svg class="dex-corner dex-corner--bl" width="24" height="24" viewBox="0 0 24 24">
        <path d="M 2 2 L 2 22 L 22 22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
        <circle cx="2" cy="22" r="2" fill="currentColor"/>
      </svg>
      <svg class="dex-corner dex-corner--br" width="24" height="24" viewBox="0 0 24 24">
        <path d="M 22 2 L 22 22 L 2 22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
        <circle cx="22" cy="22" r="2" fill="currentColor"/>
      </svg>
    `;
    
    // Use raw HTML insertion
    svg.dom.attributes["data-corners"] = "true";
    svg._inner_html = svgHtml;
    
    return svg;
  }

  _buildHeader(context, spec) {
    const header = new jsgui.div({ context, class: "dex-panel__header" });
    
    // Title area
    const titleArea = new jsgui.div({ context, class: "dex-panel__title-area" });
    
    if (spec.icon) {
      const icon = new jsgui.span({ context, class: "dex-panel__icon" });
      icon.add(new StringControl({ context, text: spec.icon }));
      titleArea.add(icon);
    }
    
    const titleWrap = new jsgui.div({ context, class: "dex-panel__title-wrap" });
    
    const title = new jsgui.Control({ context, tagName: "h2", class: "dex-panel__title" });
    title.add(new StringControl({ context, text: spec.title }));
    titleWrap.add(title);
    
    if (spec.subtitle) {
      const subtitle = new jsgui.div({ context, class: "dex-panel__subtitle" });
      subtitle.add(new StringControl({ context, text: spec.subtitle }));
      titleWrap.add(subtitle);
    }
    
    titleArea.add(titleWrap);
    header.add(titleArea);
    
    // Actions area
    if (spec.actions && spec.actions.length > 0) {
      const actions = new jsgui.div({ context, class: "dex-panel__actions" });
      
      spec.actions.forEach(action => {
        const btn = new jsgui.Control({ 
          context, 
          tagName: "button", 
          class: "dex-btn dex-btn--ghost" 
        });
        if (action.onClick) {
          btn.dom.attributes.onclick = action.onClick;
        }
        if (action.id) {
          btn.dom.attributes.id = action.id;
        }
        btn.add(new StringControl({ context, text: action.label }));
        actions.add(btn);
      });
      
      header.add(actions);
    }
    
    return header;
  }
}

/**
 * CSS styles for DataExplorerPanel
 */
const DataExplorerPanelCSS = `
/* ═══════════════════════════════════════════════════════════════════════════════
   DATA EXPLORER PANEL
   Premium panel with SVG corner decorations
   ═══════════════════════════════════════════════════════════════════════════════ */

.dex-panel {
  position: relative;
  background: linear-gradient(180deg, 
    rgba(20, 24, 36, 0.95) 0%, 
    rgba(15, 20, 32, 0.98) 50%,
    rgba(10, 13, 20, 1) 100%
  );
  border-radius: 12px;
  border: 1px solid rgba(51, 65, 85, 0.6);
  box-shadow: 
    0 4px 24px rgba(0, 0, 0, 0.4),
    0 0 1px rgba(201, 162, 39, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.03);
  overflow: hidden;
}

/* Gold variant (default) */
.dex-panel--gold {
  --dex-accent: #c9a227;
  --dex-accent-dim: #8b7500;
  --dex-accent-glow: rgba(201, 162, 39, 0.2);
}

/* Emerald variant */
.dex-panel--emerald {
  --dex-accent: #50c878;
  --dex-accent-dim: #2e8b57;
  --dex-accent-glow: rgba(80, 200, 120, 0.2);
}

/* Sapphire variant */
.dex-panel--sapphire {
  --dex-accent: #6fa8dc;
  --dex-accent-dim: #0f52ba;
  --dex-accent-glow: rgba(111, 168, 220, 0.2);
}

/* Ruby variant */
.dex-panel--ruby {
  --dex-accent: #ff6b6b;
  --dex-accent-dim: #e31837;
  --dex-accent-glow: rgba(255, 107, 107, 0.2);
}

/* SVG Corner Decorations */
.dex-panel__corners {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 10;
  color: var(--dex-accent);
  opacity: 0.7;
}

.dex-corner {
  position: absolute;
  width: 20px;
  height: 20px;
  filter: drop-shadow(0 0 4px var(--dex-accent-glow));
  transition: opacity 0.3s ease;
}

.dex-corner--tl { top: 4px; left: 4px; }
.dex-corner--tr { top: 4px; right: 4px; }
.dex-corner--bl { bottom: 4px; left: 4px; }
.dex-corner--br { bottom: 4px; right: 4px; }

.dex-panel:hover .dex-corner {
  opacity: 1;
}

/* Header */
.dex-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: linear-gradient(90deg, 
    rgba(10, 13, 20, 0.8) 0%,
    rgba(20, 24, 36, 0.6) 50%,
    rgba(10, 13, 20, 0.8) 100%
  );
  border-bottom: 1px solid rgba(51, 65, 85, 0.5);
  position: relative;
}

.dex-panel__header::after {
  content: "";
  position: absolute;
  bottom: 0;
  left: 20px;
  right: 20px;
  height: 1px;
  background: linear-gradient(90deg, 
    transparent 0%,
    var(--dex-accent-dim) 20%,
    var(--dex-accent) 50%,
    var(--dex-accent-dim) 80%,
    transparent 100%
  );
  opacity: 0.5;
}

.dex-panel__title-area {
  display: flex;
  align-items: center;
  gap: 12px;
}

.dex-panel__icon {
  font-size: 24px;
  line-height: 1;
}

.dex-panel__title-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dex-panel__title {
  margin: 0;
  font-family: Georgia, "Playfair Display", serif;
  font-size: 18px;
  font-weight: 600;
  color: var(--dex-accent);
  letter-spacing: 0.02em;
}

.dex-panel__subtitle {
  font-size: 12px;
  color: #94a3b8;
  letter-spacing: 0.5px;
}

.dex-panel__actions {
  display: flex;
  gap: 8px;
}

/* Body */
.dex-panel__body {
  padding: 20px;
}

.dex-panel__body--flush {
  padding: 0;
}

/* Footer */
.dex-panel__footer {
  padding: 12px 20px;
  background: rgba(10, 13, 20, 0.6);
  border-top: 1px solid rgba(51, 65, 85, 0.5);
  font-size: 12px;
  color: #64748b;
}

/* ═══════════════════════════════════════════════════════════════════════════════
   BUTTONS
   ═══════════════════════════════════════════════════════════════════════════════ */

.dex-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 16px;
  font-family: "Inter", system-ui, sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: #cbd5e1;
  background: rgba(20, 24, 36, 0.8);
  border: 1px solid rgba(51, 65, 85, 0.6);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.dex-btn:hover {
  background: rgba(30, 34, 46, 0.9);
  border-color: var(--dex-accent-dim);
  color: var(--dex-accent);
}

.dex-btn:active {
  transform: scale(0.98);
}

.dex-btn--ghost {
  background: transparent;
  border-color: transparent;
}

.dex-btn--ghost:hover {
  background: rgba(201, 162, 39, 0.1);
  border-color: transparent;
}

.dex-btn--primary {
  background: linear-gradient(180deg, var(--dex-accent) 0%, var(--dex-accent-dim) 100%);
  border-color: var(--dex-accent);
  color: #0a0d14;
  font-weight: 600;
}

.dex-btn--primary:hover {
  box-shadow: 0 0 16px var(--dex-accent-glow);
  color: #0a0d14;
}

.dex-btn--small {
  padding: 4px 10px;
  font-size: 11px;
}

.dex-btn--icon {
  padding: 6px;
  min-width: 32px;
}
`;

module.exports = {
  DataExplorerPanel,
  DataExplorerPanelCSS
};
