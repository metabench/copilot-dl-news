'use strict';

/**
 * PeriodSelector - Radio button group for selecting time periods
 * 
 * Renders a button group for 7d/30d/90d period selection
 * with URL parameter support for shareable links.
 */

const jsgui = require('jsgui3-html');

const StringControl = jsgui.String_Control;

const DEFAULT_PERIODS = [
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '90 Days' }
];

class PeriodSelector extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   * @param {string} [spec.selected='30d'] - Currently selected period
   * @param {Array} [spec.periods] - Available periods
   * @param {string} [spec.baseUrl='/'] - Base URL for links
   */
  constructor(spec = {}) {
    super({ ...spec, tagName: 'div' });
    
    this.selected = spec.selected || '30d';
    this.periods = spec.periods || DEFAULT_PERIODS;
    this.baseUrl = spec.baseUrl || '/';
    
    this.add_class('period-selector');
    this._compose();
  }

  _compose() {
    const label = new jsgui.Control({ context: this.context, tagName: 'span' });
    label.add_class('period-selector__label');
    label.add(new StringControl({ context: this.context, text: '📅 Period: ' }));
    this.add(label);

    const group = new jsgui.Control({ context: this.context, tagName: 'div' });
    group.add_class('period-selector__group');

    for (const period of this.periods) {
      const isSelected = period.value === this.selected;
      const btn = new jsgui.Control({ context: this.context, tagName: 'a' });
      btn.add_class('period-selector__btn');
      if (isSelected) {
        btn.add_class('period-selector__btn--active');
      }
      btn.dom.attributes.href = `${this.baseUrl}?period=${period.value}`;
      btn.add(new StringControl({ context: this.context, text: period.label }));
      group.add(btn);
    }

    this.add(group);
  }
}

module.exports = { PeriodSelector, DEFAULT_PERIODS };
