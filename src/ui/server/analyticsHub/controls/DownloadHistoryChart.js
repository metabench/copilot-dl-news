'use strict';

/**
 * DownloadHistoryChart - Bar chart visualization for daily downloads over 128 days
 * 
 * Renders an SVG bar chart showing daily download counts with
 * WLILO theming, today highlighted in purple, and cumulative totals.
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

/**
 * Get daily download data for the last N days with gap filling
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} [days=128] - Number of days to fetch
 * @returns {Array<{day: string, count: number, cumulative: number}>}
 */
function getDailyDownloads(db, days = 128) {
  // Get all daily counts with running cumulative from all time
  const stmt = db.prepare(`
    WITH all_daily AS (
      SELECT 
        date(fetched_at) as day,
        COUNT(*) as count
      FROM http_responses
      WHERE http_status = 200 AND bytes_downloaded > 0
      GROUP BY date(fetched_at)
      ORDER BY day
    ),
    cumulative AS (
      SELECT 
        day,
        count,
        SUM(count) OVER (ORDER BY day) as cumulative
      FROM all_daily
    )
    SELECT * FROM cumulative
    ORDER BY day
  `);
  
  const allData = stmt.all();
  
  // Generate all dates in the range and fill gaps with last known cumulative
  const endDate = new Date();
  endDate.setHours(23, 59, 59, 999); // End of today to ensure today is included
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days + 1);
  startDate.setHours(0, 0, 0, 0);
  
  const result = [];
  let lastCumulative = 0;
  
  // Find starting cumulative (sum before our date range)
  for (const row of allData) {
    const rowDate = new Date(row.day);
    if (rowDate < startDate) {
      lastCumulative = row.cumulative;
    }
  }
  
  // Build daily data with gaps filled
  const dataMap = new Map(allData.map(r => [r.day, r]));
  
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dayStr = d.toISOString().split('T')[0];
    const row = dataMap.get(dayStr);
    
    if (row) {
      lastCumulative = row.cumulative;
      result.push({ day: dayStr, count: row.count, cumulative: row.cumulative });
    } else {
      result.push({ day: dayStr, count: 0, cumulative: lastCumulative });
    }
  }
  
  return result;
}

class DownloadHistoryChart extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   * @param {Database} [spec.db] - better-sqlite3 database instance
   * @param {Array} [spec.data] - Pre-computed data array (alternative to db)
   * @param {number} [spec.days=128] - Number of days to show
   * @param {number} [spec.width=900] - Chart width
   * @param {number} [spec.height=400] - Chart height
   * @param {string} [spec.title='Collection Inventory'] - Chart title
   * @param {boolean} [spec.wlilo=true] - Use WLILO dark theme
   */
  constructor(spec = {}) {
    super({ ...spec, tagName: 'div' });
    
    this.days = spec.days || 128;
    this.width = spec.width || 900;
    this.height = spec.height || 400;
    this.title = spec.title || 'Collection Inventory';
    this.wlilo = spec.wlilo !== false;
    
    // Get or compute data
    if (spec.data) {
      this.data = spec.data;
    } else if (spec.db) {
      this.data = getDailyDownloads(spec.db, this.days);
    } else {
      this.data = [];
    }
    
    // Padding for axes
    this.padding = { top: 50, right: 90, bottom: 70, left: 80 };
    
    this.add_class('download-history-chart');
    this._compose();
  }

  _compose() {
    // Container
    const container = new jsgui.Control({ context: this.context, tagName: 'div' });
    container.add_class('download-history-chart__container');
    
    if (this.data.length === 0) {
      this._composeEmpty(container);
    } else {
      const svg = this.wlilo ? this._renderWLILOSVG() : this._renderSimpleSVG();
      container.add(new StringControl({ context: this.context, text: svg }));
      
      // Summary stats
      this._composeSummary(container);
    }
    
    this.add(container);
  }

  _composeEmpty(container) {
    const empty = new jsgui.Control({ context: this.context, tagName: 'div' });
    empty.add_class('download-history-chart__empty');
    empty.add(new StringControl({ 
      context: this.context, 
      text: 'No download data available' 
    }));
    container.add(empty);
  }

  _renderSimpleSVG() {
    const { width, height, padding, data } = this;
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    
    const maxValue = Math.max(...data.map(d => d.cumulative), 1);
    const barWidth = chartWidth / data.length;
    
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" class="download-history-chart__svg">
  <style>
    .title { font: bold 16px sans-serif; }
    .axis-label { font: 10px sans-serif; }
    .bar-label { font: 8px sans-serif; }
    .grid { stroke: #ccc; stroke-width: 0.5; }
  </style>
  
  <rect width="${width}" height="${height}" fill="white"/>
  <text x="${width/2}" y="25" text-anchor="middle" class="title">Cumulative Downloads (Last ${data.length} Days)</text>
  
  <g transform="translate(${padding.left}, ${padding.top})">`;
    
    // Y-axis grid lines
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const y = chartHeight - (i / yTicks) * chartHeight;
      const value = Math.round((i / yTicks) * maxValue);
      svg += `
    <line x1="0" y1="${y}" x2="${chartWidth}" y2="${y}" class="grid"/>
    <text x="-8" y="${y + 3}" text-anchor="end" class="axis-label">${formatNumber(value)}</text>`;
    }
    
    // Bars
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      const barHeight = (d.cumulative / maxValue) * chartHeight;
      const x = i * barWidth;
      const y = chartHeight - barHeight;
      svg += `
    <rect x="${x + 1}" y="${y}" width="${barWidth - 2}" height="${barHeight}" fill="black"/>`;
    }
    
    // X-axis labels (every 14 days)
    for (let i = 0; i < data.length; i += 14) {
      const d = data[i];
      const x = i * barWidth + barWidth / 2;
      const label = d.day.slice(5); // MM-DD
      svg += `
    <text x="${x}" y="${chartHeight + 15}" text-anchor="middle" class="axis-label">${label}</text>`;
    }
    
    svg += `
  </g>
</svg>`;
    
    return svg;
  }

  _renderWLILOSVG() {
    const { width, height, padding, data } = this;
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    
    const maxValue = Math.max(...data.map(d => d.cumulative), 1);
    const barWidth = chartWidth / data.length;
    
    // WLILO color palette
    const colors = {
      bg: '#0a0a0f',
      bgGradient1: '#0a0a0f',
      bgGradient2: '#1a1a2e',
      accent: '#c9a227',      // Gold
      accentLight: '#e8d48a',
      accentDark: '#8b7320',
      bar: '#2a5a8a',         // Deep blue
      barHighlight: '#3a7ab0',
      text: '#e8e8e8',
      textMuted: '#888888',
      grid: 'rgba(255,255,255,0.08)',
      border: 'rgba(201,162,39,0.3)'
    };
    
    const today = new Date().toISOString().split('T')[0];
    
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" class="download-history-chart__svg" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="dlc-bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:${colors.bgGradient1}"/>
      <stop offset="100%" style="stop-color:${colors.bgGradient2}"/>
    </linearGradient>
    <linearGradient id="dlc-barGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:${colors.barHighlight}"/>
      <stop offset="100%" style="stop-color:${colors.bar}"/>
    </linearGradient>
    <linearGradient id="dlc-todayGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#9b59b6"/>
      <stop offset="100%" style="stop-color:#6c3483"/>
    </linearGradient>
    <linearGradient id="dlc-goldGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:${colors.accentDark}"/>
      <stop offset="50%" style="stop-color:${colors.accent}"/>
      <stop offset="100%" style="stop-color:${colors.accentDark}"/>
    </linearGradient>
    <filter id="dlc-glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="2" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  
  <style>
    .dlc-title { font: 600 18px 'Segoe UI', system-ui, sans-serif; fill: ${colors.text}; letter-spacing: 2px; }
    .dlc-subtitle { font: 300 11px 'Segoe UI', system-ui, sans-serif; fill: ${colors.textMuted}; letter-spacing: 1px; text-transform: uppercase; }
    .dlc-axis-label { font: 300 9px 'Segoe UI', system-ui, sans-serif; fill: ${colors.textMuted}; }
    .dlc-value-label { font: 600 10px 'Segoe UI', system-ui, sans-serif; fill: ${colors.accent}; }
    .dlc-final-value { font: 700 14px 'Segoe UI', system-ui, sans-serif; fill: ${colors.accent}; }
  </style>
  
  <rect width="${width}" height="${height}" fill="url(#dlc-bgGrad)"/>
  
  <!-- Decorative border -->
  <rect x="8" y="8" width="${width - 16}" height="${height - 16}" fill="none" stroke="${colors.border}" stroke-width="1" rx="4"/>
  
  <!-- Corner accents -->
  <path d="M 20 8 L 20 20 L 8 20" stroke="${colors.accent}" stroke-width="2" fill="none"/>
  <path d="M ${width - 20} 8 L ${width - 20} 20 L ${width - 8} 20" stroke="${colors.accent}" stroke-width="2" fill="none"/>
  <path d="M 20 ${height - 8} L 20 ${height - 20} L 8 ${height - 20}" stroke="${colors.accent}" stroke-width="2" fill="none"/>
  <path d="M ${width - 20} ${height - 8} L ${width - 20} ${height - 20} L ${width - 8} ${height - 20}" stroke="${colors.accent}" stroke-width="2" fill="none"/>
  
  <text x="${width/2}" y="32" text-anchor="middle" class="dlc-title">${this._escapeXml(this.title.toUpperCase())}</text>
  <text x="${width/2}" y="46" text-anchor="middle" class="dlc-subtitle">Cumulative Downloads · ${data.length} Day Archive</text>
  
  <g transform="translate(${padding.left}, ${padding.top})">`;
    
    // Y-axis grid lines
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const y = chartHeight - (i / yTicks) * chartHeight;
      const value = Math.round((i / yTicks) * maxValue);
      svg += `
    <line x1="0" y1="${y}" x2="${chartWidth}" y2="${y}" stroke="${colors.grid}" stroke-width="1"/>
    <text x="-12" y="${y + 3}" text-anchor="end" class="dlc-axis-label">${formatNumber(value)}</text>`;
    }
    
    // Y-axis line
    svg += `
    <line x1="0" y1="0" x2="0" y2="${chartHeight}" stroke="${colors.border}" stroke-width="1"/>`;
    
    // Bars
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      const barHeight = (d.cumulative / maxValue) * chartHeight;
      const x = i * barWidth;
      const y = chartHeight - barHeight;
      
      // Use purple gradient for today's bar
      const isToday = d.day === today;
      const fillGradient = isToday ? 'url(#dlc-todayGrad)' : 'url(#dlc-barGrad)';
      
      svg += `
    <rect x="${x + 0.5}" y="${y}" width="${Math.max(barWidth - 1, 1)}" height="${barHeight}" fill="${fillGradient}" opacity="0.9">
      <title>${formatDate(d.day)}: ${d.count.toLocaleString()} new / ${d.cumulative.toLocaleString()} total</title>
    </rect>`;
    }
    
    // X-axis line
    svg += `
    <line x1="0" y1="${chartHeight}" x2="${chartWidth}" y2="${chartHeight}" stroke="${colors.border}" stroke-width="1"/>`;
    
    // X-axis labels (every 14 days)
    for (let i = 0; i < data.length; i += 14) {
      const d = data[i];
      const x = i * barWidth + barWidth / 2;
      const label = d.day.slice(5); // MM-DD
      svg += `
    <text x="${x}" y="${chartHeight + 18}" text-anchor="middle" class="dlc-axis-label">${label}</text>`;
    }
    
    // Last date label
    const lastDay = data[data.length - 1];
    svg += `
    <text x="${chartWidth}" y="${chartHeight + 18}" text-anchor="middle" class="dlc-axis-label">${lastDay.day.slice(5)}</text>`;
    
    // Final value with glow
    const lastValue = lastDay.cumulative;
    const lastY = chartHeight - (lastValue / maxValue) * chartHeight;
    svg += `
    
    <line x1="${chartWidth}" y1="${lastY}" x2="${chartWidth + 15}" y2="${lastY}" stroke="${colors.accent}" stroke-width="1"/>
    <circle cx="${chartWidth}" cy="${lastY}" r="3" fill="${colors.accent}" filter="url(#dlc-glow)"/>
    <text x="${chartWidth + 20}" y="${lastY + 4}" class="dlc-final-value">${lastValue.toLocaleString()}</text>`;
    
    // Starting value
    const firstValue = data[0].cumulative;
    const firstY = chartHeight - (firstValue / maxValue) * chartHeight;
    svg += `
    <text x="-12" y="${firstY + 3}" text-anchor="end" class="dlc-value-label">${formatNumber(firstValue)}</text>`;
    
    svg += `
  </g>
  
  <text x="${width/2}" y="${height - 12}" text-anchor="middle" class="dlc-subtitle">Data Source: HTTP Response Archive</text>
</svg>`;
    
    return svg;
  }

  _escapeXml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  _composeSummary(container) {
    if (this.data.length === 0) return;

    const counts = this.data.map(d => d.count);
    const total = this.data[this.data.length - 1].cumulative;
    const periodTotal = counts.reduce((a, b) => a + b, 0);
    const avg = Math.round(periodTotal / counts.length);
    const max = Math.max(...counts);
    const activeDays = counts.filter(c => c > 0).length;

    const summary = new jsgui.Control({ context: this.context, tagName: 'div' });
    summary.add_class('download-history-chart__summary');

    const stats = [
      { label: 'Total Downloads', value: total.toLocaleString() },
      { label: `Last ${this.days} Days`, value: periodTotal.toLocaleString() },
      { label: 'Average/Day', value: avg.toLocaleString() },
      { label: 'Peak Day', value: max.toLocaleString() },
      { label: 'Active Days', value: `${activeDays}/${this.days}` }
    ];

    for (const stat of stats) {
      const item = new jsgui.Control({ context: this.context, tagName: 'span' });
      item.add_class('download-history-chart__stat');
      item.add(new StringControl({ 
        context: this.context, 
        text: `${stat.label}: ${stat.value}` 
      }));
      summary.add(item);
    }

    container.add(summary);
  }
}

// CSS for the chart
const DOWNLOAD_HISTORY_CHART_CSS = `
.download-history-chart {
  margin: 1rem 0;
}

.download-history-chart__container {
  background: var(--bg-card, #1a1a2e);
  border-radius: 8px;
  padding: 1rem;
  overflow: hidden;
}

.download-history-chart__svg {
  display: block;
  max-width: 100%;
  height: auto;
}

.download-history-chart__empty {
  padding: 2rem;
  text-align: center;
  color: var(--text-secondary, #888);
  font-style: italic;
}

.download-history-chart__summary {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem 2rem;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color, rgba(255,255,255,0.1));
}

.download-history-chart__stat {
  font-size: 0.85rem;
  color: var(--text-secondary, #94a3b8);
}

.download-history-chart__stat::before {
  content: '📊 ';
}
`;

module.exports = { 
  DownloadHistoryChart, 
  getDailyDownloads, 
  formatDate, 
  formatNumber,
  DOWNLOAD_HISTORY_CHART_CSS 
};
