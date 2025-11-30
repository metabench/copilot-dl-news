const jsgui = require('../utils/getJsgui');

class ActivationHarnessControl extends jsgui.Control {
  constructor(spec = {}) {
    super({
      ...spec,
      tagName: 'div',
      __type_name: 'activation_harness'
    });

    this.log = [];
    this.message = spec.message || 'Trigger Event';

    if (!spec.el) {
      this.compose();
    } else if (spec.el) {
      this.dom = this.dom || {};
      this.dom.el = spec.el;
      this._hydrateReferences(spec.el);
    }
  }

  compose() {
    const { context } = this;

    this.add_class('activation-harness');

    const button = new jsgui.Control({ context, tagName: 'button' });
    button.add_class('activation-harness__trigger');
    button.dom.attributes['data-role'] = 'primary-button';
    button.add(this.message);

    const status = new jsgui.Control({ context, tagName: 'div' });
    status.add_class('activation-harness__status');
    status.dom.attributes['data-role'] = 'status';
    status.add('Idle');

    this.buttonControl = button;
    this.statusControl = status;

    this.add(button);
    this.add(status);
  }

  _hydrateReferences(rootEl) {
    if (!rootEl) return;
    const doc = rootEl.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if (!doc) return;
    this.buttonEl = rootEl.querySelector('[data-role="primary-button"]');
    this.statusEl = rootEl.querySelector('[data-role="status"]');
  }

  _log(kind, detail) {
    this.log.push({
      kind,
      detail,
      timestamp: Date.now()
    });
  }

  activate() {
    if (this.__active) return;
    this.__active = true;

    this._hydrateReferences(this.dom?.el);

    const buttonEl = this.buttonEl || this.buttonControl?.dom?.el;
    const statusEl = this.statusEl || this.statusControl?.dom?.el;

    if (buttonEl) {
      this._handleClick = (event) => {
        this._log('dom-event', { type: 'click' });
        if (statusEl) {
          statusEl.textContent = 'Clicked';
        }
        if (typeof this.raise === 'function') {
          this.raise('button-click', { eventType: 'click' });
        }
      };
      buttonEl.addEventListener('click', this._handleClick);
    }
  }

  deactivate() {
    if (!this.__active) return;
    this.__active = false;

    const buttonEl = this.buttonControl?.dom?.el;
    this._hydrateReferences(this.dom?.el);
    const resolvedButton = this.buttonEl || buttonEl;
    if (resolvedButton && this._handleClick) {
      resolvedButton.removeEventListener('click', this._handleClick);
    }
    this._handleClick = null;
    this._log('deactivate', {});
  }
}

module.exports = ActivationHarnessControl;
