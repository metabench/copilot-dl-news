'use strict';

/**
 * RegressionAlerts - Warning cards for quality drops
 * 
 * Displays alert cards for domains that have experienced
 * significant drops in extraction quality.
 */

const jsgui = require('jsgui3-html');

const StringControl = jsgui.String_Control;

/**
 * Get severity level based on drop percentage
 * @param {number} dropPercent - Percentage drop
 * @returns {string} Severity level
 */
function getSeverity(dropPercent) {
  if (dropPercent >= 30) return 'critical';
  if (dropPercent >= 15) return 'warning';
  return 'info';
}

/**
 * Get emoji for severity
 * @param {string} severity - Severity level
 * @returns {string} Emoji
 */
function getSeverityEmoji(severity) {
  switch (severity) {
    case 'critical': return '🚨';
    case 'warning': return '⚠️';
    default: return 'ℹ️';
  }
}

class RegressionAlerts extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   * @param {Array} spec.regressions - Array of regression objects
   * @param {number} [spec.maxDisplay=10] - Maximum alerts to display
   */
  constructor(spec = {}) {
    super({ ...spec, tagName: 'div' });
    
    this.regressions = spec.regressions || [];
    this.maxDisplay = spec.maxDisplay || 10;
    
    this.add_class('regression-alerts');
    this._compose();
  }

  _compose() {
    // Title
    const titleRow = new jsgui.Control({ context: this.context, tagName: 'div' });
    titleRow.add_class('regression-alerts__header');
    
    const title = new jsgui.Control({ context: this.context, tagName: 'h3' });
    title.add_class('regression-alerts__title');
    title.add(new StringControl({ context: this.context, text: '📉 Quality Regressions' }));
    titleRow.add(title);

    if (this.regressions.length > 0) {
      const count = new jsgui.Control({ context: this.context, tagName: 'span' });
      count.add_class('regression-alerts__count');
      count.add(new StringControl({ 
        context: this.context, 
        text: `${this.regressions.length} detected` 
      }));
      titleRow.add(count);
    }

    this.add(titleRow);

    if (this.regressions.length === 0) {
      this._composeEmpty();
      return;
    }

    // Alert cards
    const cards = new jsgui.Control({ context: this.context, tagName: 'div' });
    cards.add_class('regression-alerts__cards');

    const displayRegressions = this.regressions.slice(0, this.maxDisplay);
    for (const regression of displayRegressions) {
      const card = this._composeCard(regression);
      cards.add(card);
    }

    this.add(cards);

    // Show more indicator
    if (this.regressions.length > this.maxDisplay) {
      const more = new jsgui.Control({ context: this.context, tagName: 'div' });
      more.add_class('regression-alerts__more');
      more.add(new StringControl({ 
        context: this.context, 
        text: `+${this.regressions.length - this.maxDisplay} more regressions` 
      }));
      this.add(more);
    }
  }

  _composeEmpty() {
    const empty = new jsgui.Control({ context: this.context, tagName: 'div' });
    empty.add_class('regression-alerts__empty');
    
    const icon = new jsgui.Control({ context: this.context, tagName: 'span' });
    icon.add_class('regression-alerts__success-icon');
    icon.add(new StringControl({ context: this.context, text: '✅' }));
    empty.add(icon);
    
    const text = new jsgui.Control({ context: this.context, tagName: 'p' });
    text.add(new StringControl({ 
      context: this.context, 
      text: 'No quality regressions detected in the past week' 
    }));
    empty.add(text);
    
    this.add(empty);
  }

  _composeCard(regression) {
    const severity = getSeverity(regression.dropPercent);
    const emoji = getSeverityEmoji(severity);

    const card = new jsgui.Control({ context: this.context, tagName: 'div' });
    card.add_class('regression-alert');
    card.add_class(`regression-alert--${severity}`);

    // Icon
    const iconWrapper = new jsgui.Control({ context: this.context, tagName: 'div' });
    iconWrapper.add_class('regression-alert__icon');
    iconWrapper.add(new StringControl({ context: this.context, text: emoji }));
    card.add(iconWrapper);

    // Content
    const content = new jsgui.Control({ context: this.context, tagName: 'div' });
    content.add_class('regression-alert__content');

    // Domain name
    const domain = new jsgui.Control({ context: this.context, tagName: 'div' });
    domain.add_class('regression-alert__domain');
    
    const domainLink = new jsgui.Control({ context: this.context, tagName: 'a' });
    domainLink.dom.attributes.href = `/domain/${encodeURIComponent(regression.host)}`;
    domainLink.add(new StringControl({ context: this.context, text: regression.host }));
    domain.add(domainLink);
    
    content.add(domain);

    // Drop indicator
    const dropRow = new jsgui.Control({ context: this.context, tagName: 'div' });
    dropRow.add_class('regression-alert__drop');
    
    const dropValue = new jsgui.Control({ context: this.context, tagName: 'span' });
    dropValue.add_class('regression-alert__drop-value');
    dropValue.add(new StringControl({ 
      context: this.context, 
      text: `-${regression.dropPercent.toFixed(1)}%` 
    }));
    dropRow.add(dropValue);

    const dropLabel = new jsgui.Control({ context: this.context, tagName: 'span' });
    dropLabel.add_class('regression-alert__drop-label');
    dropLabel.add(new StringControl({ context: this.context, text: ' confidence drop' }));
    dropRow.add(dropLabel);

    content.add(dropRow);

    // Details
    const details = new jsgui.Control({ context: this.context, tagName: 'div' });
    details.add_class('regression-alert__details');

    const prevAvg = (regression.previousAvg * 100).toFixed(1);
    const currAvg = (regression.currentAvg * 100).toFixed(1);
    
    details.add(new StringControl({ 
      context: this.context, 
      text: `${prevAvg}% → ${currAvg}% • ${regression.articleCount} articles` 
    }));
    
    content.add(details);
    card.add(content);

    // Action button
    const action = new jsgui.Control({ context: this.context, tagName: 'div' });
    action.add_class('regression-alert__action');
    
    const actionLink = new jsgui.Control({ context: this.context, tagName: 'a' });
    actionLink.dom.attributes.href = `/domain/${encodeURIComponent(regression.host)}`;
    actionLink.add_class('regression-alert__action-link');
    actionLink.add(new StringControl({ context: this.context, text: 'Investigate →' }));
    action.add(actionLink);
    
    card.add(action);

    return card;
  }
}

module.exports = { RegressionAlerts, getSeverity, getSeverityEmoji };
