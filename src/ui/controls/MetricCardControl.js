"use strict";

/**
 * MetricCardControl
 *
 * Shared, themeable "metric card" control used for dashboards.
 * Intended to be reusable across apps (Data Explorer, goals dashboards, etc.).
 */

const jsgui = require("jsgui3-html");

const StringControl = jsgui.String_Control;

const CARD_VARIANTS = Object.freeze({
  DEFAULT: "default",
  PRIMARY: "primary",
  SUCCESS: "success",
  WARNING: "warning",
  DANGER: "danger"
});

class MetricCardControl extends jsgui.Control {
  /**
   * @param {Object} spec
   * @param {Object} spec.context
   * @param {string} spec.title
   * @param {string|number} [spec.value]
   * @param {string} [spec.subtitle]
   * @param {string} [spec.variant]
   * @param {string} [spec.href]
   */
  constructor(spec = {}) {
    super({
      ...spec,
      tagName: "div",
      __type_name: "metric_card"
    });

    this.add_class("metric-card");

    this.title = spec.title || "Card";
    this.value = spec.value;
    this.subtitle = spec.subtitle || null;
    this.variant = spec.variant || null;
    this.href = spec.href || null;

    if (this.variant) {
      this.add_class(`metric-card--${this.variant}`);
    }

    if (!spec.el) {
      this.compose();
    }
  }

  compose() {
    const header = new jsgui.Control({ context: this.context, tagName: "div" });
    header.add_class("metric-card__header");

    const title = new jsgui.Control({ context: this.context, tagName: "h3" });
    title.add_class("metric-card__title");

    if (this.href) {
      const link = new jsgui.Control({ context: this.context, tagName: "a" });
      link.add_class("metric-card__link");
      link.dom.attributes.href = this.href;
      link.add(new StringControl({ context: this.context, text: this.title }));
      title.add(link);
    } else {
      title.add(new StringControl({ context: this.context, text: this.title }));
    }

    header.add(title);
    this.add(header);

    const content = new jsgui.Control({ context: this.context, tagName: "div" });
    content.add_class("metric-card__content");

    if (this.value !== undefined) {
      const value = new jsgui.Control({ context: this.context, tagName: "span" });
      value.add_class("metric-card__value");
      value.add(new StringControl({ context: this.context, text: String(this.value) }));
      content.add(value);
    }

    if (this.subtitle) {
      const sub = new jsgui.Control({ context: this.context, tagName: "span" });
      sub.add_class("metric-card__subtitle");
      sub.add(new StringControl({ context: this.context, text: this.subtitle }));
      content.add(sub);
    }

    this.add(content);
  }
}

MetricCardControl.VARIANTS = CARD_VARIANTS;

module.exports = { MetricCardControl, CARD_VARIANTS };
