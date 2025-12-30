'use strict';

/**
 * SummaryCard - Metric display card for dashboard
 */

const jsgui = require('jsgui3-html');

const StringControl = jsgui.String_Control;

class SummaryCard extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   * @param {string} [spec.icon='📊'] - Emoji icon
   * @param {string|number} spec.value - Main value to display
   * @param {string} spec.label - Description label
   * @param {string} [spec.variant='default'] - Style variant (success, warning, danger)
   */
  constructor(spec = {}) {
    super({ ...spec, tagName: 'div' });
    this.icon = spec.icon || '📊';
    this.value = spec.value ?? '-';
    this.label = spec.label || '';
    this.variant = spec.variant || 'default';
    
    this.add_class('summary-card');
    if (this.variant !== 'default') {
      this.add_class(`summary-card--${this.variant}`);
    }
    
    this._compose();
  }

  _compose() {
    const icon = new jsgui.Control({ context: this.context, tagName: 'div' });
    icon.add_class('summary-card__icon');
    icon.add(new StringControl({ context: this.context, text: this.icon }));
    this.add(icon);

    const value = new jsgui.Control({ context: this.context, tagName: 'div' });
    value.add_class('summary-card__value');
    value.add(new StringControl({ context: this.context, text: String(this.value) }));
    this.add(value);

    const label = new jsgui.Control({ context: this.context, tagName: 'div' });
    label.add_class('summary-card__label');
    label.add(new StringControl({ context: this.context, text: this.label }));
    this.add(label);
  }
}

module.exports = { SummaryCard };
