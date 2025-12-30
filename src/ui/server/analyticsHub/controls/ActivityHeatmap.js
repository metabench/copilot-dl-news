'use strict';

/**
 * ActivityHeatmap - 7×24 grid visualization of crawl activity
 * 
 * Displays a heatmap showing article counts by hour of day
 * and day of week, with color intensity based on volume.
 */

const jsgui = require('jsgui3-html');

const StringControl = jsgui.String_Control;

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Get color for heat intensity
 * @param {number} value - Normalized value 0-1
 * @returns {string} CSS color
 */
function getHeatColor(value) {
  if (value === 0) return 'rgba(71, 85, 105, 0.3)'; // bg-card dim
  if (value < 0.2) return 'rgba(59, 130, 246, 0.3)'; // blue light
  if (value < 0.4) return 'rgba(59, 130, 246, 0.5)'; // blue medium
  if (value < 0.6) return 'rgba(59, 130, 246, 0.7)'; // blue strong
  if (value < 0.8) return 'rgba(34, 197, 94, 0.7)'; // green
  return 'rgba(234, 179, 8, 0.9)'; // yellow/gold for peak
}

class ActivityHeatmap extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   * @param {Array} spec.data - Array of {hour, dow, count} objects (7×24 = 168 cells)
   * @param {string} [spec.title='Activity Heatmap'] - Chart title
   */
  constructor(spec = {}) {
    super({ ...spec, tagName: 'div' });
    
    this.data = spec.data || [];
    this.title = spec.title || 'Activity Heatmap';
    
    this.add_class('activity-heatmap');
    this._compose();
  }

  _compose() {
    // Title
    const titleEl = new jsgui.Control({ context: this.context, tagName: 'h3' });
    titleEl.add_class('activity-heatmap__title');
    titleEl.add(new StringControl({ context: this.context, text: `🗓️ ${this.title}` }));
    this.add(titleEl);

    if (this.data.length === 0) {
      this._composeEmpty();
      return;
    }

    // Build grid data structure
    const grid = this._buildGrid();
    
    // Render heatmap
    const heatmap = new jsgui.Control({ context: this.context, tagName: 'div' });
    heatmap.add_class('activity-heatmap__grid');
    
    // Header row (hours)
    const headerRow = new jsgui.Control({ context: this.context, tagName: 'div' });
    headerRow.add_class('activity-heatmap__header-row');
    
    // Empty cell for day labels column
    const emptyCell = new jsgui.Control({ context: this.context, tagName: 'div' });
    emptyCell.add_class('activity-heatmap__day-label');
    emptyCell.add(new StringControl({ context: this.context, text: '' }));
    headerRow.add(emptyCell);
    
    // Hour labels (show every 3 hours)
    for (let h = 0; h < 24; h++) {
      const hourCell = new jsgui.Control({ context: this.context, tagName: 'div' });
      hourCell.add_class('activity-heatmap__hour-label');
      const label = h % 3 === 0 ? String(h).padStart(2, '0') : '';
      hourCell.add(new StringControl({ context: this.context, text: label }));
      headerRow.add(hourCell);
    }
    heatmap.add(headerRow);

    // Data rows (one per day of week)
    for (let dow = 0; dow < 7; dow++) {
      const dataRow = new jsgui.Control({ context: this.context, tagName: 'div' });
      dataRow.add_class('activity-heatmap__data-row');
      
      // Day label
      const dayLabel = new jsgui.Control({ context: this.context, tagName: 'div' });
      dayLabel.add_class('activity-heatmap__day-label');
      dayLabel.add(new StringControl({ context: this.context, text: DAY_NAMES[dow] }));
      dataRow.add(dayLabel);
      
      // Hour cells
      for (let h = 0; h < 24; h++) {
        const cellData = grid[dow][h];
        const cell = new jsgui.Control({ context: this.context, tagName: 'div' });
        cell.add_class('activity-heatmap__cell');
        cell.dom.attributes.style = `background-color: ${getHeatColor(cellData.normalized)};`;
        cell.dom.attributes.title = `${DAY_NAMES[dow]} ${h}:00 - ${cellData.count.toLocaleString()} articles`;
        dataRow.add(cell);
      }
      
      heatmap.add(dataRow);
    }
    
    this.add(heatmap);

    // Legend
    this._composeLegend();
    
    // Peak hours summary
    this._composePeakHours(grid);
  }

  _composeEmpty() {
    const empty = new jsgui.Control({ context: this.context, tagName: 'div' });
    empty.add_class('activity-heatmap__empty');
    empty.add(new StringControl({ 
      context: this.context, 
      text: 'No activity data available for this period' 
    }));
    this.add(empty);
  }

  _buildGrid() {
    // Initialize 7×24 grid
    const grid = [];
    for (let dow = 0; dow < 7; dow++) {
      grid[dow] = [];
      for (let h = 0; h < 24; h++) {
        grid[dow][h] = { count: 0, normalized: 0 };
      }
    }

    // Fill in data
    let maxCount = 0;
    for (const cell of this.data) {
      if (cell.dow >= 0 && cell.dow < 7 && cell.hour >= 0 && cell.hour < 24) {
        grid[cell.dow][cell.hour].count = cell.count;
        maxCount = Math.max(maxCount, cell.count);
      }
    }

    // Normalize for color scaling
    if (maxCount > 0) {
      for (let dow = 0; dow < 7; dow++) {
        for (let h = 0; h < 24; h++) {
          grid[dow][h].normalized = grid[dow][h].count / maxCount;
        }
      }
    }

    return grid;
  }

  _composeLegend() {
    const legend = new jsgui.Control({ context: this.context, tagName: 'div' });
    legend.add_class('activity-heatmap__legend');
    
    const items = [
      { color: 'rgba(71, 85, 105, 0.3)', label: 'No activity' },
      { color: 'rgba(59, 130, 246, 0.3)', label: 'Low' },
      { color: 'rgba(59, 130, 246, 0.7)', label: 'Medium' },
      { color: 'rgba(34, 197, 94, 0.7)', label: 'High' },
      { color: 'rgba(234, 179, 8, 0.9)', label: 'Peak' }
    ];

    for (const item of items) {
      const legendItem = new jsgui.Control({ context: this.context, tagName: 'span' });
      legendItem.add_class('activity-heatmap__legend-item');

      const swatch = new jsgui.Control({ context: this.context, tagName: 'span' });
      swatch.add_class('activity-heatmap__swatch');
      swatch.dom.attributes.style = `background-color: ${item.color};`;
      legendItem.add(swatch);

      legendItem.add(new StringControl({ context: this.context, text: item.label }));
      legend.add(legendItem);
    }

    this.add(legend);
  }

  _composePeakHours(grid) {
    // Find top 3 peak hours
    const allCells = [];
    for (let dow = 0; dow < 7; dow++) {
      for (let h = 0; h < 24; h++) {
        allCells.push({ dow, hour: h, count: grid[dow][h].count });
      }
    }
    allCells.sort((a, b) => b.count - a.count);
    const peaks = allCells.slice(0, 3).filter(c => c.count > 0);

    if (peaks.length === 0) return;

    const summary = new jsgui.Control({ context: this.context, tagName: 'div' });
    summary.add_class('activity-heatmap__peaks');
    
    const label = new jsgui.Control({ context: this.context, tagName: 'span' });
    label.add_class('activity-heatmap__peaks-label');
    label.add(new StringControl({ context: this.context, text: '🔥 Peak hours: ' }));
    summary.add(label);

    for (let i = 0; i < peaks.length; i++) {
      const peak = peaks[i];
      const peakText = `${DAY_NAMES[peak.dow]} ${peak.hour}:00 (${peak.count.toLocaleString()})`;
      
      const peakEl = new jsgui.Control({ context: this.context, tagName: 'span' });
      peakEl.add_class('activity-heatmap__peak');
      peakEl.add(new StringControl({ 
        context: this.context, 
        text: i < peaks.length - 1 ? `${peakText}, ` : peakText
      }));
      summary.add(peakEl);
    }

    this.add(summary);
  }
}

module.exports = { ActivityHeatmap, getHeatColor, DAY_NAMES };
