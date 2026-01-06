"use strict";

const jsgui = require("jsgui3-html");
const StringControl = jsgui.String_Control;

/**
 * DataExplorerTabs - Tabbed navigation with badge counts
 * 
 * Premium tab bar with:
 * - Badge counts (animated)
 * - Active state with gold underline
 * - Gemstone color variants for badges
 * - Smooth transitions
 * 
 * @example
 * const tabs = new DataExplorerTabs({
 *   context,
 *   tabs: [
 *     { id: "recent", label: "Recent", count: 42, active: true },
 *     { id: "queue", label: "Queue", count: 156, variant: "warning" },
 *     { id: "errors", label: "Errors", count: 3, variant: "error" }
 *   ],
 *   onTabClick: "switchTab(event)"
 * });
 */
class DataExplorerTabs extends jsgui.Control {
  /**
   * @param {Object} spec
   * @param {Array} spec.tabs - Tab definitions
   * @param {string} spec.tabs[].id - Tab identifier
   * @param {string} spec.tabs[].label - Display label
   * @param {number} [spec.tabs[].count] - Badge count
   * @param {boolean} [spec.tabs[].active] - Is active tab
   * @param {string} [spec.tabs[].variant] - success|warning|error|info
   * @param {string} [spec.onTabClick] - Click handler function name
   */
  constructor(spec = {}) {
    const context = spec.context || new jsgui.Page_Context();
    super({ context, tagName: "div" });

    this.add_class("dex-tabs");

    const tabs = spec.tabs || [];
    const onTabClick = spec.onTabClick;

    tabs.forEach(tab => {
      const tabEl = new jsgui.Control({ 
        context, 
        tagName: "button",
        class: "dex-tabs__tab"
      });
      
      tabEl.dom.attributes["data-tab"] = tab.id;
      tabEl.dom.attributes.type = "button";
      
      if (tab.active) {
        tabEl.add_class("dex-tabs__tab--active");
      }
      
      if (onTabClick) {
        tabEl.dom.attributes.onclick = `${onTabClick}`;
      }

      // Label
      const label = new jsgui.span({ context, class: "dex-tabs__label" });
      label.add(new StringControl({ context, text: tab.label }));
      tabEl.add(label);

      // Badge count
      if (tab.count !== undefined && tab.count !== null) {
        const badge = new jsgui.span({ context, class: "dex-tabs__badge" });
        
        const variant = tab.variant || (tab.active ? "success" : "default");
        badge.add_class(`dex-tabs__badge--${variant}`);
        
        const countText = tab.count > 999 ? "999+" : String(tab.count);
        badge.add(new StringControl({ context, text: countText }));
        tabEl.add(badge);
      }

      this.add(tabEl);
    });
  }
}

/**
 * CSS styles for DataExplorerTabs
 */
const DataExplorerTabsCSS = `
/* ═══════════════════════════════════════════════════════════════════════════════
   DATA EXPLORER TABS
   Tabbed navigation with badge counts
   ═══════════════════════════════════════════════════════════════════════════════ */

.dex-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: rgba(10, 13, 20, 0.5);
  border-radius: 8px;
  border: 1px solid rgba(51, 65, 85, 0.3);
}

.dex-tabs__tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  font-family: "Inter", system-ui, sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: #94a3b8;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.dex-tabs__tab:hover {
  color: #cbd5e1;
  background: rgba(30, 34, 46, 0.5);
}

.dex-tabs__tab--active {
  color: #50c878;
  background: rgba(80, 200, 120, 0.1);
  border-color: rgba(80, 200, 120, 0.3);
}

.dex-tabs__tab--active::after {
  content: "";
  position: absolute;
  bottom: -1px;
  left: 50%;
  transform: translateX(-50%);
  width: 60%;
  height: 2px;
  background: linear-gradient(90deg, transparent, #c9a227, transparent);
  border-radius: 1px;
}

.dex-tabs__label {
  white-space: nowrap;
}

/* Badges */
.dex-tabs__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 10px;
  transition: all 0.2s ease;
}

.dex-tabs__badge--default {
  background: rgba(100, 116, 139, 0.3);
  color: #94a3b8;
}

.dex-tabs__badge--success {
  background: rgba(80, 200, 120, 0.2);
  color: #50c878;
  box-shadow: 0 0 8px rgba(80, 200, 120, 0.2);
}

.dex-tabs__badge--warning {
  background: rgba(255, 200, 124, 0.2);
  color: #ffc87c;
  box-shadow: 0 0 8px rgba(255, 200, 124, 0.2);
}

.dex-tabs__badge--error {
  background: rgba(255, 107, 107, 0.2);
  color: #ff6b6b;
  box-shadow: 0 0 8px rgba(255, 107, 107, 0.2);
}

.dex-tabs__badge--info {
  background: rgba(111, 168, 220, 0.2);
  color: #6fa8dc;
  box-shadow: 0 0 8px rgba(111, 168, 220, 0.2);
}

/* Pulse animation for active badges */
@keyframes dex-badge-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

.dex-tabs__tab--active .dex-tabs__badge {
  animation: dex-badge-pulse 2s ease-in-out infinite;
}
`;

module.exports = {
  DataExplorerTabs,
  DataExplorerTabsCSS
};
