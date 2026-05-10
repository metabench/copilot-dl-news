'use strict';

const jsgui = require('jsgui3-html');

const BATCH_PRESET_OPTIONS = Object.freeze([
  { value: 'news-10', label: 'news-10', sites: '10', pages: '1000' },
  { value: 'news-5', label: 'news-5', sites: '5', pages: '1000' },
  { value: 'smoke-2', label: 'smoke-2', sites: '2', pages: '25' }
]);

class CrawlBatchLauncherControl extends jsgui.Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: spec.tagName || 'section' });
    this.__type_name = 'crawl_batch_launcher_control';
  }

  compose() {
    const context = this.context;
    this.dom.attributes.class = 'crawl-batch';
    this.dom.attributes['data-crawl-batch-launcher'] = 'true';
    this.dom.attributes['data-screenshot-subject'] = 'crawl-status-batch-launcher';

    const header = this.add(new jsgui.Control({ context, tagName: 'div' }));
    header.dom.attributes.class = 'crawl-batch-header';
    header.add(this._text('h2', 'Batch launch'));

    const metrics = header.add(new jsgui.Control({ context, tagName: 'div' }));
    metrics.dom.attributes.class = 'crawl-batch-metrics';
    metrics.add(this._metric('sites', '0'));
    metrics.add(this._metric('accepted', '0'));
    metrics.add(this._metric('failed', '0'));

    const form = this.add(new jsgui.Control({ context, tagName: 'form' }));
    form.dom.attributes.id = 'crawl-batch-form';
    form.dom.attributes.class = 'crawl-batch-form';

    const grid = form.add(new jsgui.Control({ context, tagName: 'div' }));
    grid.dom.attributes.class = 'crawl-batch-grid';

    grid.add(this._selectField('Preset', 'crawl-batch-preset', BATCH_PRESET_OPTIONS, 'news-10'));
    grid.add(this._numberField('Max pages', 'crawl-batch-max-pages', '1000', '1'));
    grid.add(this._numberField('Max depth', 'crawl-batch-max-depth', '6', '1'));
    grid.add(this._numberField('Concurrency', 'crawl-batch-concurrency', '5', '1'));

    const actions = grid.add(new jsgui.Control({ context, tagName: 'div' }));
    actions.dom.attributes.class = 'crawl-batch-actions';
    const button = actions.add(new jsgui.Control({ context, tagName: 'button' }));
    button.dom.attributes.type = 'submit';
    button.dom.attributes.id = 'crawl-batch-start';
    button.add('Start 10 x 1000');

    const status = this.add(new jsgui.Control({ context, tagName: 'div' }));
    status.dom.attributes.id = 'crawl-batch-status';
    status.dom.attributes.class = 'crawl-batch-status';
    status.dom.attributes['data-crawl-batch-status'] = 'true';
    status.add('Ready.');
  }

  _text(tagName, text) {
    const control = new jsgui.Control({ context: this.context, tagName });
    control.add(text);
    return control;
  }

  _metric(name, initialValue) {
    const item = new jsgui.Control({ context: this.context, tagName: 'div' });
    item.dom.attributes.class = 'crawl-batch-metric';
    const value = item.add(new jsgui.Control({ context: this.context, tagName: 'span' }));
    value.dom.attributes['data-crawl-batch-stat'] = name;
    value.add(initialValue);
    const label = item.add(new jsgui.Control({ context: this.context, tagName: 'small' }));
    label.add(name);
    return item;
  }

  _selectField(labelText, id, options, selectedValue) {
    const field = new jsgui.Control({ context: this.context, tagName: 'div' });
    field.dom.attributes.class = 'start-field';
    const label = field.add(new jsgui.Control({ context: this.context, tagName: 'label' }));
    label.dom.attributes.for = id;
    label.add(labelText);
    const select = field.add(new jsgui.Control({ context: this.context, tagName: 'select' }));
    select.dom.attributes.id = id;
    for (const optionSpec of options) {
      const option = select.add(new jsgui.Control({ context: this.context, tagName: 'option' }));
      option.dom.attributes.value = optionSpec.value;
      if (optionSpec.value === selectedValue) option.dom.attributes.selected = 'selected';
      option.add(`${optionSpec.label} (${optionSpec.sites} x ${optionSpec.pages})`);
    }
    return field;
  }

  _numberField(labelText, id, value, min) {
    const field = new jsgui.Control({ context: this.context, tagName: 'div' });
    field.dom.attributes.class = 'start-field';
    const label = field.add(new jsgui.Control({ context: this.context, tagName: 'label' }));
    label.dom.attributes.for = id;
    label.add(labelText);
    const input = field.add(new jsgui.Control({ context: this.context, tagName: 'input' }));
    input.dom.attributes.id = id;
    input.dom.attributes.type = 'number';
    input.dom.attributes.min = min;
    input.dom.attributes.value = value;
    return field;
  }
}

module.exports = { CrawlBatchLauncherControl };
