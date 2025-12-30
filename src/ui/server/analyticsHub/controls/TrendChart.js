'use strict';

/**
 * TrendChart - Line chart visualization for article counts over time
 * 
 * Renders an SVG line chart showing daily article counts with
 * axis labels and hover tooltips.
 */

const jsgui = require('jsgui3-html');

const StringControl = jsgui.String_Control;

/**
 * Format date for display
 * @param {string} dateStr - ISO date string
 * @param {boolean} [short=false] - Use short format
 * @returns {string}
 */
function formatDate(dateStr, short = false) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (short) {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric' 
  });
}

/**
 * Format number with abbreviation
 * @param {number} num - Number to format
 * @returns {string}
 */
function formatNumber(num) {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return String(num);
}

class TrendChart extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   * @param {Array} spec.data - Array of {day, count} objects
   * @param {number} [spec.width=800] - Chart width
   * @param {number} [spec.height=300] - Chart height
   * @param {string} [spec.title='Article Trends'] - Chart title
   */
  constructor(spec = {}) {
    super({ ...spec, tagName: 'div' });
    
    this.data = spec.data || [];
    this.width = spec.width || 800;
    this.height = spec.height || 300;
    this.title = spec.title || 'Article Trends';
    
    // Padding for axes
    this.padding = { top: 20, right: 30, bottom: 40, left: 60 };
    
    this.add_class('trend-chart');
    this._compose();
  }

  _compose() {
    // Title
    const titleEl = new jsgui.Control({ context: this.context, tagName: 'h3' });
    titleEl.add_class('trend-chart__title');
    titleEl.add(new StringControl({ context: this.context, text: `📈 ${this.title}` }));
    this.add(titleEl);

    if (this.data.length === 0) {
      this._composeEmpty();
      return;
    }

    // SVG container
    const container = new jsgui.Control({ context: this.context, tagName: 'div' });
    container.add_class('trend-chart__container');
    
    const svg = this._renderSVG();
    container.add(new StringControl({ context: this.context, text: svg }));
    this.add(container);

    // Summary stats
    this._composeSummary();
  }

  _composeEmpty() {
    const empty = new jsgui.Control({ context: this.context, tagName: 'div' });
    empty.add_class('trend-chart__empty');
    empty.add(new StringControl({ 
      context: this.context, 
      text: 'No trend data available for this period' 
    }));
    this.add(empty);
  }

  _renderSVG() {
    const { width, height, padding, data } = this;
    
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    
    // Calculate scales
    const counts = data.map(d => d.count);
    const maxCount = Math.max(...counts, 1);
    const minCount = 0;
    
    // Generate points
    const points = data.map((d, i) => {
      const x = padding.left + (i / Math.max(data.length - 1, 1)) * chartWidth;
      const y = padding.top + chartHeight - ((d.count - minCount) / (maxCount - minCount)) * chartHeight;
      return { x, y, day: d.day, count: d.count };
    });

    // Build SVG
    let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="trend-chart__svg">`;
    
    // Background
    svg += `<rect x="0" y="0" width="${width}" height="${height}" fill="var(--bg-card, #334155)"/>`;
    
    // Grid lines
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const y = padding.top + (i / gridLines) * chartHeight;
      svg += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="var(--border-color, #475569)" stroke-opacity="0.3"/>`;
      
      // Y-axis labels
      const value = Math.round(maxCount - (i / gridLines) * maxCount);
      svg += `<text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" fill="var(--text-secondary, #94a3b8)" font-size="11">${formatNumber(value)}</text>`;
    }

    // Area fill
    if (points.length > 1) {
      let areaPath = `M ${points[0].x} ${padding.top + chartHeight}`;
      points.forEach(p => { areaPath += ` L ${p.x} ${p.y}`; });
      areaPath += ` L ${points[points.length - 1].x} ${padding.top + chartHeight} Z`;
      svg += `<path d="${areaPath}" fill="var(--accent-blue, #3b82f6)" fill-opacity="0.2"/>`;
    }

    // Line path
    if (points.length > 1) {
      let linePath = `M ${points[0].x} ${points[0].y}`;
      for (let i = 1; i < points.length; i++) {
        linePath += ` L ${points[i].x} ${points[i].y}`;
      }
      svg += `<path d="${linePath}" fill="none" stroke="var(--accent-blue, #3b82f6)" stroke-width="2.5"/>`;
    }

    // Data points
    points.forEach((p, i) => {
      svg += `<circle cx="${p.x}" cy="${p.y}" r="4" fill="var(--accent-blue, #3b82f6)" stroke="var(--bg-primary, #0f172a)" stroke-width="1.5">`;
      svg += `<title>${formatDate(p.day)}: ${p.count.toLocaleString()} articles</title>`;
      svg += `</circle>`;
    });

    // X-axis labels (show ~7 labels max)
    const labelInterval = Math.ceil(data.length / 7);
    data.forEach((d, i) => {
      if (i % labelInterval === 0 || i === data.length - 1) {
        const x = padding.left + (i / Math.max(data.length - 1, 1)) * chartWidth;
        svg += `<text x="${x}" y="${height - 10}" text-anchor="middle" fill="var(--text-secondary, #94a3b8)" font-size="11">${formatDate(d.day, true)}</text>`;
      }
    });

    // Y-axis label
    svg += `<text x="15" y="${height / 2}" text-anchor="middle" fill="var(--text-secondary, #94a3b8)" font-size="11" transform="rotate(-90, 15, ${height / 2})">Articles</text>`;

    svg += '</svg>';
    return svg;
  }

  _composeSummary() {
    if (this.data.length === 0) return;

    const counts = this.data.map(d => d.count);
    const total = counts.reduce((a, b) => a + b, 0);
    const avg = Math.round(total / counts.length);
    const max = Math.max(...counts);
    const min = Math.min(...counts);

    const summary = new jsgui.Control({ context: this.context, tagName: 'div' });
    summary.add_class('trend-chart__summary');

    const stats = [
      { label: 'Total', value: total.toLocaleString() },
      { label: 'Average/Day', value: avg.toLocaleString() },
      { label: 'Peak', value: max.toLocaleString() },
      { label: 'Low', value: min.toLocaleString() }
    ];

    for (const stat of stats) {
      const item = new jsgui.Control({ context: this.context, tagName: 'span' });
      item.add_class('trend-chart__stat');
      item.add(new StringControl({ 
        context: this.context, 
        text: `${stat.label}: ${stat.value}` 
      }));
      summary.add(item);
    }

    this.add(summary);
  }
}

module.exports = { TrendChart, formatDate, formatNumber };
