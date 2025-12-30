'use strict';

/**
 * ConfidenceHistogram - Bar chart of confidence score distribution
 * 
 * Renders a horizontal bar chart showing the distribution of
 * extraction confidence scores across buckets.
 */

const jsgui = require('jsgui3-html');

const StringControl = jsgui.String_Control;

/**
 * Get color for confidence bucket
 * @param {number} min - Bucket minimum
 * @returns {string} CSS color
 */
function getBucketColor(min) {
  if (min >= 0.8) return '#22c55e'; // green
  if (min >= 0.6) return '#84cc16'; // lime
  if (min >= 0.5) return '#eab308'; // yellow
  if (min >= 0.3) return '#f97316'; // orange
  return '#ef4444'; // red
}

class ConfidenceHistogram extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   * @param {Array} spec.buckets - Histogram bucket data
   * @param {number} [spec.maxBarWidth=100] - Maximum bar width percentage
   * @param {boolean} [spec.showLabels=true] - Show bucket labels
   */
  constructor(spec = {}) {
    super({ ...spec, tagName: 'div' });
    
    this.buckets = spec.buckets || [];
    this.maxBarWidth = spec.maxBarWidth || 100;
    this.showLabels = spec.showLabels !== false;
    
    this.add_class('confidence-histogram');
    this._compose();
  }

  _compose() {
    // Title
    const title = new jsgui.Control({ context: this.context, tagName: 'h3' });
    title.add_class('confidence-histogram__title');
    title.add(new StringControl({ context: this.context, text: '📊 Confidence Distribution' }));
    this.add(title);

    if (this.buckets.length === 0) {
      this._composeEmpty();
      return;
    }

    // Find max count for scaling
    const maxCount = Math.max(...this.buckets.map(b => b.count), 1);
    const totalCount = this.buckets.reduce((sum, b) => sum + b.count, 0);

    // Chart container
    const chart = new jsgui.Control({ context: this.context, tagName: 'div' });
    chart.add_class('confidence-histogram__chart');

    for (const bucket of this.buckets) {
      const row = this._composeBucketRow(bucket, maxCount, totalCount);
      chart.add(row);
    }

    this.add(chart);

    // Legend
    this._composeLegend();
  }

  _composeEmpty() {
    const empty = new jsgui.Control({ context: this.context, tagName: 'div' });
    empty.add_class('confidence-histogram__empty');
    empty.add(new StringControl({ 
      context: this.context, 
      text: 'No confidence data available' 
    }));
    this.add(empty);
  }

  _composeBucketRow(bucket, maxCount, totalCount) {
    const row = new jsgui.Control({ context: this.context, tagName: 'div' });
    row.add_class('confidence-histogram__row');

    // Label
    const label = new jsgui.Control({ context: this.context, tagName: 'div' });
    label.add_class('confidence-histogram__label');
    label.add(new StringControl({ 
      context: this.context, 
      text: `${bucket.min.toFixed(1)}-${bucket.max.toFixed(1)}` 
    }));
    row.add(label);

    // Bar container
    const barContainer = new jsgui.Control({ context: this.context, tagName: 'div' });
    barContainer.add_class('confidence-histogram__bar-container');

    // Bar
    const barWidth = maxCount > 0 
      ? (bucket.count / maxCount * this.maxBarWidth) 
      : 0;
    
    const bar = new jsgui.Control({ context: this.context, tagName: 'div' });
    bar.add_class('confidence-histogram__bar');
    bar.dom.attributes.style = `width: ${barWidth}%; background-color: ${getBucketColor(bucket.min)};`;
    bar.dom.attributes.title = `${bucket.count} articles (${bucket.percent.toFixed(1)}%)`;
    
    barContainer.add(bar);
    row.add(barContainer);

    // Count/percent
    const stats = new jsgui.Control({ context: this.context, tagName: 'div' });
    stats.add_class('confidence-histogram__stats');
    stats.add(new StringControl({ 
      context: this.context, 
      text: `${bucket.count.toLocaleString()} (${bucket.percent.toFixed(1)}%)` 
    }));
    row.add(stats);

    return row;
  }

  _composeLegend() {
    const legend = new jsgui.Control({ context: this.context, tagName: 'div' });
    legend.add_class('confidence-histogram__legend');

    const items = [
      { color: '#22c55e', label: 'Excellent (≥0.8)' },
      { color: '#84cc16', label: 'Good (0.6-0.8)' },
      { color: '#eab308', label: 'Fair (0.5-0.6)' },
      { color: '#f97316', label: 'Low (0.3-0.5)' },
      { color: '#ef4444', label: 'Poor (<0.3)' }
    ];

    for (const item of items) {
      const legendItem = new jsgui.Control({ context: this.context, tagName: 'span' });
      legendItem.add_class('confidence-histogram__legend-item');

      const swatch = new jsgui.Control({ context: this.context, tagName: 'span' });
      swatch.add_class('confidence-histogram__swatch');
      swatch.dom.attributes.style = `background-color: ${item.color};`;
      legendItem.add(swatch);

      legendItem.add(new StringControl({ context: this.context, text: item.label }));
      legend.add(legendItem);
    }

    this.add(legend);
  }
}

module.exports = { ConfidenceHistogram, getBucketColor };
