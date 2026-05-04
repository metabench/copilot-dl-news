"use strict";

/**
 * CrawlSpeedometerControl - A real-time speedometer gauge for crawl operations
 * 
 * Features:
 * - SVG-based radial gauge (0-180° arc)
 * - Animated needle with smooth transitions
 * - Rolling speed calculation (URLs/sec)
 * - Stats panel: current speed, total, success rate
 * - Color zones (green/yellow/red) for rate limiting awareness
 * 
 * Usage:
 *   const speedometer = new CrawlSpeedometerControl({
 *     context: this.context,
 *     maxSpeed: 10,           // Max URLs/sec for full-scale
 *     label: 'Hub Discovery'
 *   });
 *   
 *   // Update from SSE or polling
 *   speedometer.update({
 *     speed: 5.2,        // Current URLs/sec
 *     total: 42,         // Total checked
 *     ok: 38,            // Successful
 *     failed: 4,         // Failed
 *     rateLimited: 0     // Rate limited count
 *   });
 */

/**
 * Create CrawlSpeedometerControl class with dependency injection
 * @param {object} jsgui - jsgui3 instance (jsgui3-html or jsgui3-client)
 * @returns {class} CrawlSpeedometerControl class
 */
function createCrawlSpeedometerControl(jsgui) {
  const StringControl = jsgui.String_Control;

  class CrawlSpeedometerControl extends jsgui.Control {
    /**
     * @param {object} spec
     * @param {object} spec.context - jsgui context
     * @param {number} [spec.maxSpeed=10] - Maximum speed (URLs/sec) for full scale
     * @param {string} [spec.label='Crawl'] - Label for the gauge
     * @param {number} [spec.gaugeSize=180] - Gauge diameter in pixels
     * @param {boolean} [spec.showStats=true] - Show stats panel below gauge
     */
    constructor(spec = {}) {
      // Don't pass gaugeSize to super - jsgui 'size' expects [width, height] array
      const { gaugeSize, size, ...restSpec } = spec;
      super({ ...restSpec, tagName: "div", __type_name: spec.__type_name || "crawl_speedometer" });
      
      this._maxSpeed = spec.maxSpeed || 10;
      this._label = spec.label || "Crawl";
      this._size = gaugeSize || size || 180;  // Use our own size property
      this._showStats = spec.showStats !== false;
      
      // State
      this._speed = 0;
      this._total = 0;
      this._ok = 0;
      this._failed = 0;
      this._rateLimited = 0;
      this._status = 'idle'; // 'idle', 'active', 'paused', 'complete'
      
      this.add_class("crawl-speedometer");
      
      if (!spec.el) {
        this.compose();
      }
    }

    compose() {
      // Main container
      const wrapper = new jsgui.Control({ context: this.context, tagName: "div" });
      wrapper.add_class("speedometer-wrapper");
      
      // SVG Gauge
      wrapper.add(this._createGaugeSvg());
      
      // Stats panel
      if (this._showStats) {
        wrapper.add(this._createStatsPanel());
      }
      
      this.add(wrapper);
    }

    _createGaugeSvg() {
      const size = this._size;
      const cx = size / 2;
      const cy = size / 2;
      const radius = (size / 2) - 15;
      
      const svg = new jsgui.Control({ context: this.context, tagName: "svg" });
      svg.add_class("speedometer-gauge");
      svg.dom.attributes.width = String(size);
      svg.dom.attributes.height = String(size);
      svg.dom.attributes.viewBox = `0 0 ${size} ${size}`;
      
      // Background arc (gray track)
      const bgArc = this._createArc(cx, cy, radius, 0, 180, "#2a2a3e", 12);
      svg.add(bgArc);
      
      // Color zones - green (0-60%), yellow (60-80%), red (80-100%)
      const greenArc = this._createArc(cx, cy, radius, 0, 108, "#2e8b57", 10);
      greenArc.add_class("zone-green");
      svg.add(greenArc);
      
      const yellowArc = this._createArc(cx, cy, radius, 108, 36, "#c9a227", 10);
      yellowArc.add_class("zone-yellow");
      svg.add(yellowArc);
      
      const redArc = this._createArc(cx, cy, radius, 144, 36, "#e31837", 10);
      redArc.add_class("zone-red");
      svg.add(redArc);
      
      // Speed tick marks
      for (let i = 0; i <= 10; i++) {
        const tickAngle = 180 + (i * 18); // 0-180° range
        const tickLength = i % 5 === 0 ? 8 : 4;
        svg.add(this._createTick(cx, cy, radius - 6, tickAngle, tickLength));
      }
      
      // Needle
      this._needle = this._createNeedle(cx, cy, radius - 20);
      svg.add(this._needle);
      
      // Center cap
      const cap = new jsgui.Control({ context: this.context, tagName: "circle" });
      cap.dom.attributes.cx = String(cx);
      cap.dom.attributes.cy = String(cy);
      cap.dom.attributes.r = "8";
      cap.dom.attributes.fill = "#c0c0c8";
      cap.add_class("speedometer-cap");
      svg.add(cap);
      
      // Speed label
      const speedLabel = new jsgui.Control({ context: this.context, tagName: "text" });
      speedLabel.dom.attributes.x = String(cx);
      speedLabel.dom.attributes.y = String(cy + 30);
      speedLabel.dom.attributes["text-anchor"] = "middle";
      speedLabel.add_class("speed-value");
      speedLabel.add(new StringControl({ context: this.context, text: "0.0" }));
      this._speedLabel = speedLabel;
      svg.add(speedLabel);
      
      // Unit label
      const unitLabel = new jsgui.Control({ context: this.context, tagName: "text" });
      unitLabel.dom.attributes.x = String(cx);
      unitLabel.dom.attributes.y = String(cy + 45);
      unitLabel.dom.attributes["text-anchor"] = "middle";
      unitLabel.add_class("speed-unit");
      unitLabel.add(new StringControl({ context: this.context, text: "URLs/sec" }));
      svg.add(unitLabel);
      
      // Title label
      const titleLabel = new jsgui.Control({ context: this.context, tagName: "text" });
      titleLabel.dom.attributes.x = String(cx);
      titleLabel.dom.attributes.y = "16";
      titleLabel.dom.attributes["text-anchor"] = "middle";
      titleLabel.add_class("speedometer-title");
      titleLabel.add(new StringControl({ context: this.context, text: this._label }));
      svg.add(titleLabel);
      
      return svg;
    }

    _createArc(cx, cy, radius, startAngle, arcAngle, color, strokeWidth) {
      // Convert to radians and calculate path
      const startRad = (180 + startAngle) * Math.PI / 180;
      const endRad = (180 + startAngle + arcAngle) * Math.PI / 180;
      
      const x1 = cx + radius * Math.cos(startRad);
      const y1 = cy + radius * Math.sin(startRad);
      const x2 = cx + radius * Math.cos(endRad);
      const y2 = cy + radius * Math.sin(endRad);
      
      const largeArc = arcAngle > 180 ? 1 : 0;
      
      const path = new jsgui.Control({ context: this.context, tagName: "path" });
      path.dom.attributes.d = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
      path.dom.attributes.fill = "none";
      path.dom.attributes.stroke = color;
      path.dom.attributes["stroke-width"] = String(strokeWidth);
      path.dom.attributes["stroke-linecap"] = "round";
      
      return path;
    }

    _createTick(cx, cy, radius, angle, length) {
      const rad = angle * Math.PI / 180;
      const x1 = cx + radius * Math.cos(rad);
      const y1 = cy + radius * Math.sin(rad);
      const x2 = cx + (radius - length) * Math.cos(rad);
      const y2 = cy + (radius - length) * Math.sin(rad);
      
      const line = new jsgui.Control({ context: this.context, tagName: "line" });
      line.dom.attributes.x1 = String(x1);
      line.dom.attributes.y1 = String(y1);
      line.dom.attributes.x2 = String(x2);
      line.dom.attributes.y2 = String(y2);
      line.dom.attributes.stroke = "#6b7280";
      line.dom.attributes["stroke-width"] = "2";
      line.add_class("speedometer-tick");
      
      return line;
    }

    _createNeedle(cx, cy, length) {
      const group = new jsgui.Control({ context: this.context, tagName: "g" });
      group.add_class("speedometer-needle");
      group.dom.attributes.transform = `rotate(180, ${cx}, ${cy})`;
      
      // Needle polygon
      const needle = new jsgui.Control({ context: this.context, tagName: "polygon" });
      const points = [
        `${cx - 3},${cy}`,
        `${cx + 3},${cy}`,
        `${cx + 1},${cy - length}`,
        `${cx - 1},${cy - length}`
      ].join(" ");
      needle.dom.attributes.points = points;
      needle.dom.attributes.fill = "#e31837";
      group.add(needle);
      
      return group;
    }

    _createStatsPanel() {
      const panel = new jsgui.Control({ context: this.context, tagName: "div" });
      panel.add_class("speedometer-stats");
      
      // Status indicator
      const statusRow = new jsgui.Control({ context: this.context, tagName: "div" });
      statusRow.add_class("stat-row");
      statusRow.add_class("stat-status");
      
      const statusDot = new jsgui.Control({ context: this.context, tagName: "span" });
      statusDot.add_class("status-dot");
      statusDot.add_class("status-idle");
      this._statusDot = statusDot;
      statusRow.add(statusDot);
      
      const statusText = new jsgui.Control({ context: this.context, tagName: "span" });
      statusText.add_class("status-text");
      statusText.add(new StringControl({ context: this.context, text: "Idle" }));
      this._statusText = statusText;
      statusRow.add(statusText);
      
      panel.add(statusRow);
      
      // Stats grid
      const grid = new jsgui.Control({ context: this.context, tagName: "div" });
      grid.add_class("stats-grid");
      
      grid.add(this._createStatItem("total", "Total", "0"));
      grid.add(this._createStatItem("ok", "OK", "0", "stat-ok"));
      grid.add(this._createStatItem("failed", "Failed", "0", "stat-failed"));
      grid.add(this._createStatItem("rate", "Rate %", "—"));
      
      panel.add(grid);
      
      return panel;
    }

    _createStatItem(key, label, value, extraClass = null) {
      const item = new jsgui.Control({ context: this.context, tagName: "div" });
      item.add_class("stat-item");
      if (extraClass) item.add_class(extraClass);
      
      const labelEl = new jsgui.Control({ context: this.context, tagName: "span" });
      labelEl.add_class("stat-label");
      labelEl.add(new StringControl({ context: this.context, text: label }));
      item.add(labelEl);
      
      const valueEl = new jsgui.Control({ context: this.context, tagName: "span" });
      valueEl.add_class("stat-value");
      valueEl.add(new StringControl({ context: this.context, text: value }));
      this[`_stat_${key}`] = valueEl;
      item.add(valueEl);
      
      return item;
    }

    /**
     * Update speedometer with new stats
     * @param {object} data
     * @param {number} [data.speed] - Current speed (URLs/sec)
     * @param {number} [data.total] - Total URLs checked
     * @param {number} [data.ok] - Successful checks
     * @param {number} [data.failed] - Failed checks
     * @param {number} [data.rateLimited] - Rate limited count
     * @param {string} [data.status] - 'idle', 'active', 'paused', 'complete'
     */
    update(data = {}) {
      if (typeof data.speed === 'number') this._speed = data.speed;
      if (typeof data.total === 'number') this._total = data.total;
      if (typeof data.ok === 'number') this._ok = data.ok;
      if (typeof data.failed === 'number') this._failed = data.failed;
      if (typeof data.rateLimited === 'number') this._rateLimited = data.rateLimited;
      if (data.status) this._status = data.status;
      
      this._render();
    }

    _render() {
      // Update needle rotation
      const speedRatio = Math.min(this._speed / this._maxSpeed, 1);
      const angle = 180 + (speedRatio * 180);
      const cx = this._size / 2;
      const cy = this._size / 2;
      
      if (this._needle) {
        const needleEl = this._el(this._needle);
        if (needleEl) {
          needleEl.setAttribute("transform", `rotate(${angle}, ${cx}, ${cy})`);
        } else {
          this._needle.dom.attributes.transform = `rotate(${angle}, ${cx}, ${cy})`;
        }
      }
      
      // Update speed label
      this._updateText(this._speedLabel, this._speed.toFixed(1));
      
      // Update stats
      this._updateText(this._stat_total, String(this._total));
      this._updateText(this._stat_ok, String(this._ok));
      this._updateText(this._stat_failed, String(this._failed));
      
      const successRate = this._total > 0 ? Math.round((this._ok / this._total) * 100) : 0;
      this._updateText(this._stat_rate, this._total > 0 ? `${successRate}%` : "—");
      
      // Update status
      this._updateStatus();
    }

    _updateText(ctrl, text) {
      if (!ctrl) return;
      const el = this._el(ctrl);
      if (el) {
        el.textContent = text;
      }
    }

    _updateStatus() {
      if (!this._statusDot || !this._statusText) return;
      
      const dotEl = this._el(this._statusDot);
      const textEl = this._el(this._statusText);
      
      const statusMap = {
        idle: { class: "status-idle", text: "Idle" },
        active: { class: "status-active", text: "Active" },
        paused: { class: "status-paused", text: "Paused" },
        complete: { class: "status-complete", text: "Complete" }
      };
      
      const info = statusMap[this._status] || statusMap.idle;
      
      if (dotEl) {
        dotEl.className = `status-dot ${info.class}`;
      }
      if (textEl) {
        textEl.textContent = info.text;
      }
    }

    /**
     * Set status directly
     * @param {string} status - 'idle', 'active', 'paused', 'complete'
     */
    setStatus(status) {
      this._status = status;
      this._updateStatus();
    }

    /**
     * Reset to initial state
     */
    reset() {
      this._speed = 0;
      this._total = 0;
      this._ok = 0;
      this._failed = 0;
      this._rateLimited = 0;
      this._status = 'idle';
      this._render();
    }

    /**
     * Safe element accessor
     */
    _el(ctrl = this) {
      return ctrl?.dom?.el || null;
    }

    activate() {
      if (this.__active) return;
      this.__active = true;
      // Initial render
      this._render();
    }
  }

  return CrawlSpeedometerControl;
}

// ═══════════════════════════════════════════════════════════════════════════
// CSS Styles for CrawlSpeedometerControl (Industrial Luxury Obsidian theme)
// ═══════════════════════════════════════════════════════════════════════════

const CRAWL_SPEEDOMETER_STYLES = `
/* Crawl Speedometer - Industrial Luxury Obsidian */
.crawl-speedometer {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  padding: 16px;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
}

.speedometer-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.speedometer-gauge {
  filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.3));
}

.speedometer-needle {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  transform-origin: center;
}

.speedometer-cap {
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
}

.speed-value {
  font-size: 24px;
  font-weight: 700;
  fill: #f0f4f8;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
}

.speed-unit {
  font-size: 10px;
  fill: #9ca3af;
  font-family: system-ui, sans-serif;
}

.speedometer-title {
  font-size: 11px;
  font-weight: 600;
  fill: #c9a227;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.speedometer-tick {
  opacity: 0.6;
}

/* Stats Panel */
.speedometer-stats {
  width: 100%;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.stat-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}

.stat-status {
  justify-content: center;
  margin-bottom: 8px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #4b5563;
}

.status-dot.status-idle { background: #4b5563; }
.status-dot.status-active { 
  background: #50c878; 
  box-shadow: 0 0 8px rgba(80, 200, 120, 0.6);
  animation: pulse 1.5s ease-in-out infinite;
}
.status-dot.status-paused { background: #c9a227; }
.status-dot.status-complete { background: #6fa8dc; }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.status-text {
  font-size: 11px;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 4px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
}

.stat-label {
  font-size: 9px;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.stat-value {
  font-size: 14px;
  font-weight: 600;
  color: #f0f4f8;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
}

.stat-item.stat-ok .stat-value { color: #50c878; }
.stat-item.stat-failed .stat-value { color: #e31837; }

/* Zone colors (for reference, rendered in SVG) */
.zone-green { opacity: 0.8; }
.zone-yellow { opacity: 0.8; }
.zone-red { opacity: 0.8; }
`;

module.exports = {
  createCrawlSpeedometerControl,
  CRAWL_SPEEDOMETER_STYLES
};
