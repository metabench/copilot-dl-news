/**
 * Crawl Profile Editor - jsgui3 Client Controls
 * 
 * Lab experiment: Full jsgui3 stack with automatic CSS extraction,
 * client activation, and data model bindings.
 */
'use strict';

const jsgui = require('jsgui3-client');
const { controls, Control, Data_Object } = jsgui;

// Import Active_HTML_Document from jsgui3-server
const Active_HTML_Document = require('jsgui3-server/controls/Active_HTML_Document');

// ─────────────────────────────────────────────────────────────
// Form Field Control - Reusable labeled field
// ─────────────────────────────────────────────────────────────

class Form_Field extends Control {
  constructor(spec = {}) {
    spec.__type_name = spec.__type_name || 'form_field';
    super(spec);
    this.add_class('form-field');
    
    this.label = spec.label || '';
    this.hint = spec.hint || null;
    this.fieldType = spec.fieldType || 'text';
    this.fullWidth = spec.fullWidth || false;
    
    if (this.fullWidth) {
      this.add_class('form-field--full');
    }
    
    if (!spec.el) {
      this.compose_form_field();
    }
  }
  
  compose_form_field() {
    const { context } = this;
    
    // Label
    const labelEl = new Control({ context, tag_name: 'label' });
    labelEl.add_class('form-field__label');
    labelEl.add(this.label);
    this.add(labelEl);
    
    // Hint (optional)
    if (this.hint) {
      const hintEl = new Control({ context, tag_name: 'span' });
      hintEl.add_class('form-field__hint');
      hintEl.add(this.hint);
      this.add(hintEl);
    }
    
    // Input container (subclasses add the actual input)
    this.inputContainer = new Control({ context, tag_name: 'div' });
    this.inputContainer.add_class('form-field__input');
    this.add(this.inputContainer);
    
    this.labelEl = labelEl;
  }
}

Form_Field.scss = `
.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-field--full {
  grid-column: 1 / -1;
}

.form-field__label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary, #1a1a1a);
}

.form-field__hint {
  font-size: 11px;
  color: var(--text-secondary, #666);
}

.form-field__input input,
.form-field__input select,
.form-field__input textarea {
  width: 100%;
  font-size: 14px;
  padding: 10px 12px;
  border: 1px solid var(--border, #ddd);
  border-radius: 8px;
  background: var(--input-bg, #fff);
  color: var(--text-primary, #1a1a1a);
  transition: border-color 0.15s, box-shadow 0.15s;
}

.form-field__input input:focus,
.form-field__input select:focus {
  outline: none;
  border-color: var(--primary, #0066cc);
  box-shadow: 0 0 0 3px rgba(0, 102, 204, 0.1);
}
`;

// ─────────────────────────────────────────────────────────────
// Text Field Control
// ─────────────────────────────────────────────────────────────

class Text_Field extends Form_Field {
  constructor(spec = {}) {
    spec.__type_name = spec.__type_name || 'text_field';
    super(spec);
    
    this.placeholder = spec.placeholder || '';
    this.value = spec.value || '';
    this.inputName = spec.name || '';
    this.required = spec.required || false;
    
    if (!spec.el) {
      this.compose_text_input();
    }
  }
  
  compose_text_input() {
    const { context } = this;
    
    const input = new Control({ context, tag_name: 'input' });
    input.dom.attributes.type = 'text';
    input.dom.attributes.placeholder = this.placeholder;
    input.dom.attributes.value = this.value;
    if (this.inputName) input.dom.attributes.name = this.inputName;
    if (this.required) input.dom.attributes.required = 'required';
    
    this.inputContainer.add(input);
    this.input = input;
  }
  
  get_value() {
    if (this.input && this.input.dom && this.input.dom.el) {
      return this.input.dom.el.value;
    }
    return this.value;
  }
  
  set_value(val) {
    this.value = val;
    if (this.input && this.input.dom && this.input.dom.el) {
      this.input.dom.el.value = val;
    }
  }
  
  activate() {
    if (!this.__active) {
      super.activate();
      
      if (this.input && this.input.dom && this.input.dom.el) {
        this.input.dom.el.addEventListener('input', () => {
          this.value = this.input.dom.el.value;
          this.raise('change', { value: this.value });
        });
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Select Field Control
// ─────────────────────────────────────────────────────────────

class Select_Field extends Form_Field {
  constructor(spec = {}) {
    spec.__type_name = spec.__type_name || 'select_field';
    super(spec);
    
    this.options = spec.options || []; // [{ value, label }]
    this.value = spec.value || '';
    this.inputName = spec.name || '';
    
    if (!spec.el) {
      this.compose_select();
    }
  }
  
  compose_select() {
    const { context } = this;
    
    const select = new Control({ context, tag_name: 'select' });
    if (this.inputName) select.dom.attributes.name = this.inputName;
    
    for (const opt of this.options) {
      const option = new Control({ context, tag_name: 'option' });
      option.dom.attributes.value = opt.value;
      if (opt.value === this.value) {
        option.dom.attributes.selected = 'selected';
      }
      option.add(opt.label);
      select.add(option);
    }
    
    this.inputContainer.add(select);
    this.select = select;
  }
  
  get_value() {
    if (this.select && this.select.dom && this.select.dom.el) {
      return this.select.dom.el.value;
    }
    return this.value;
  }
  
  set_value(val) {
    this.value = val;
    if (this.select && this.select.dom && this.select.dom.el) {
      this.select.dom.el.value = val;
    }
  }
  
  activate() {
    if (!this.__active) {
      super.activate();
      
      if (this.select && this.select.dom && this.select.dom.el) {
        this.select.dom.el.addEventListener('change', () => {
          this.value = this.select.dom.el.value;
          this.raise('change', { value: this.value });
        });
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Number Field Control (with range slider)
// ─────────────────────────────────────────────────────────────

class Number_Field extends Form_Field {
  constructor(spec = {}) {
    spec.__type_name = spec.__type_name || 'number_field';
    super(spec);
    
    this.min = spec.min ?? 0;
    this.max = spec.max ?? 100;
    this.step = spec.step ?? 1;
    this.value = spec.value ?? this.min;
    this.inputName = spec.name || '';
    this.showSlider = spec.showSlider !== false;
    
    if (!spec.el) {
      this.compose_number_input();
    }
  }
  
  compose_number_input() {
    const { context } = this;
    
    const row = new Control({ context, tag_name: 'div' });
    row.add_class('number-field__row');
    
    if (this.showSlider) {
      const range = new Control({ context, tag_name: 'input' });
      range.add_class('number-field__range');
      range.dom.attributes.type = 'range';
      range.dom.attributes.min = this.min;
      range.dom.attributes.max = this.max;
      range.dom.attributes.step = this.step;
      range.dom.attributes.value = this.value;
      if (this.inputName) range.dom.attributes.name = this.inputName;
      row.add(range);
      this.rangeInput = range;
    }
    
    const valueDisplay = new Control({ context, tag_name: 'span' });
    valueDisplay.add_class('number-field__value');
    valueDisplay.add(String(this.value));
    row.add(valueDisplay);
    
    this.inputContainer.add(row);
    this.valueDisplay = valueDisplay;
  }
  
  get_value() {
    return this.value;
  }
  
  set_value(val) {
    this.value = val;
    if (this.rangeInput && this.rangeInput.dom && this.rangeInput.dom.el) {
      this.rangeInput.dom.el.value = val;
    }
    if (this.valueDisplay && this.valueDisplay.dom && this.valueDisplay.dom.el) {
      this.valueDisplay.dom.el.textContent = String(val);
    }
  }
  
  activate() {
    if (!this.__active) {
      super.activate();
      
      if (this.rangeInput && this.rangeInput.dom && this.rangeInput.dom.el) {
        this.rangeInput.dom.el.addEventListener('input', () => {
          this.value = Number(this.rangeInput.dom.el.value);
          if (this.valueDisplay && this.valueDisplay.dom && this.valueDisplay.dom.el) {
            this.valueDisplay.dom.el.textContent = String(this.value);
          }
          this.raise('change', { value: this.value });
        });
      }
    }
  }
}

Number_Field.scss = `
.number-field__row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.number-field__range {
  flex: 1;
  height: 6px;
  cursor: pointer;
}

.number-field__value {
  min-width: 60px;
  text-align: right;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  color: var(--text-secondary, #666);
}
`;

// ─────────────────────────────────────────────────────────────
// Checkbox Field Control
// ─────────────────────────────────────────────────────────────

class Checkbox_Field extends Control {
  constructor(spec = {}) {
    spec.__type_name = spec.__type_name || 'checkbox_field';
    super(spec);
    this.add_class('checkbox-field');
    
    this.label = spec.label || '';
    this.checked = spec.checked || false;
    this.inputName = spec.name || '';
    
    if (!spec.el) {
      this.compose_checkbox();
    }
  }
  
  compose_checkbox() {
    const { context } = this;
    
    const checkbox = new Control({ context, tag_name: 'input' });
    checkbox.add_class('checkbox-field__input');
    checkbox.dom.attributes.type = 'checkbox';
    if (this.inputName) checkbox.dom.attributes.name = this.inputName;
    if (this.checked) checkbox.dom.attributes.checked = 'checked';
    this.add(checkbox);
    
    const label = new Control({ context, tag_name: 'label' });
    label.add_class('checkbox-field__label');
    label.add(this.label);
    this.add(label);
    
    this.checkbox = checkbox;
    this.labelEl = label;
  }
  
  get_value() {
    if (this.checkbox && this.checkbox.dom && this.checkbox.dom.el) {
      return this.checkbox.dom.el.checked;
    }
    return this.checked;
  }
  
  set_value(val) {
    this.checked = !!val;
    if (this.checkbox && this.checkbox.dom && this.checkbox.dom.el) {
      this.checkbox.dom.el.checked = this.checked;
    }
  }
  
  activate() {
    if (!this.__active) {
      super.activate();
      
      if (this.checkbox && this.checkbox.dom && this.checkbox.dom.el) {
        this.checkbox.dom.el.addEventListener('change', () => {
          this.checked = this.checkbox.dom.el.checked;
          this.raise('change', { value: this.checked });
        });
      }
    }
  }
}

Checkbox_Field.scss = `
.checkbox-field {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
}

.checkbox-field__input {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.checkbox-field__label {
  font-size: 14px;
  color: var(--text-primary, #1a1a1a);
  cursor: pointer;
}
`;

// ─────────────────────────────────────────────────────────────
// Form Section Control
// ─────────────────────────────────────────────────────────────

class Form_Section extends Control {
  constructor(spec = {}) {
    spec.__type_name = spec.__type_name || 'form_section';
    super(spec);
    this.add_class('form-section');
    
    this.title = spec.title || '';
    this.icon = spec.icon || '';
    this.collapsible = spec.collapsible || false;
    this.collapsed = spec.collapsed || false;
    
    if (this.collapsible) {
      this.add_class('form-section--collapsible');
    }
    if (this.collapsed) {
      this.add_class('form-section--collapsed');
    }
    
    if (!spec.el) {
      this.compose_section();
    }
  }
  
  compose_section() {
    const { context } = this;
    
    // Header
    const header = new Control({ context, tag_name: 'div' });
    header.add_class('form-section__header');
    
    const titleEl = new Control({ context, tag_name: 'h3' });
    titleEl.add_class('form-section__title');
    if (this.icon) {
      const iconEl = new Control({ context, tag_name: 'span' });
      iconEl.add_class('form-section__icon');
      iconEl.add(this.icon);
      titleEl.add(iconEl);
    }
    titleEl.add(this.title);
    header.add(titleEl);
    
    if (this.collapsible) {
      const toggle = new Control({ context, tag_name: 'button' });
      toggle.add_class('form-section__toggle');
      toggle.dom.attributes.type = 'button';
      toggle.add(this.collapsed ? '▼ Show' : '▲ Hide');
      header.add(toggle);
      this.toggleBtn = toggle;
    }
    
    this.add(header);
    this.header = header;
    
    // Content
    const content = new Control({ context, tag_name: 'div' });
    content.add_class('form-section__content');
    this.add(content);
    this.content = content;
  }
  
  toggle() {
    this.collapsed = !this.collapsed;
    if (this.collapsed) {
      this.add_class('form-section--collapsed');
    } else {
      this.remove_class('form-section--collapsed');
    }
    if (this.toggleBtn && this.toggleBtn.dom && this.toggleBtn.dom.el) {
      this.toggleBtn.dom.el.textContent = this.collapsed ? '▼ Show' : '▲ Hide';
    }
  }
  
  activate() {
    if (!this.__active) {
      super.activate();
      
      if (this.collapsible && this.toggleBtn && this.toggleBtn.dom && this.toggleBtn.dom.el) {
        this.toggleBtn.dom.el.addEventListener('click', () => this.toggle());
      }
    }
  }
}

Form_Section.scss = `
.form-section {
  background: var(--surface, #fff);
  border: 1px solid var(--border, #e0e0e0);
  border-radius: 12px;
  padding: 20px;
}

.form-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.form-section__title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary, #1a1a1a);
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-section__icon {
  font-size: 18px;
}

.form-section__toggle {
  padding: 6px 12px;
  border: 1px solid var(--border, #ddd);
  border-radius: 6px;
  background: var(--surface, #fff);
  color: var(--text-secondary, #666);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.form-section__toggle:hover {
  background: var(--surface-hover, #f5f5f5);
}

.form-section__content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  transition: max-height 0.3s ease-out, opacity 0.2s ease-out;
}

.form-section--collapsed .form-section__content {
  max-height: 0;
  opacity: 0;
  overflow: hidden;
  margin: 0;
  padding: 0;
}

.form-section--collapsible .form-section__header {
  cursor: pointer;
}
`;

// ─────────────────────────────────────────────────────────────
// Profile Editor Control - Main Editor
// ─────────────────────────────────────────────────────────────

class Profile_Editor extends Control {
  constructor(spec = {}) {
    spec.__type_name = spec.__type_name || 'profile_editor';
    super(spec);
    this.add_class('profile-editor');
    
    this.profile = spec.profile || null;
    this.operations = spec.operations || [];
    this.apiBase = spec.apiBase || '/api/crawler-profiles';
    
    // Initialize form state in data model
    const dataModel = this.data && this.data.model;
    if (dataModel) {
      dataModel.set('id', this.profile?.id || '');
      dataModel.set('label', this.profile?.label || '');
      dataModel.set('startUrl', this.profile?.startUrl || '');
      dataModel.set('operationName', this.profile?.operationName || (this.operations[0]?.name || ''));
      dataModel.set('options', this.profile?.options || {});
    }
    
    if (!spec.el) {
      this.compose_editor();
    }
  }
  
  compose_editor() {
    const { context } = this;
    const isNew = !this.profile;
    
    // Form wrapper
    const form = new Control({ context, tag_name: 'form' });
    form.add_class('profile-editor__form');
    form.dom.attributes.method = 'post';
    form.dom.attributes.action = this.apiBase;
    
    // Status bar
    const status = new Control({ context, tag_name: 'div' });
    status.add_class('profile-editor__status');
    form.add(status);
    this.statusBar = status;
    
    // Basic Info Section
    const basicSection = new Form_Section({
      context,
      title: 'Basic Information',
      icon: '📋'
    });
    
    const idField = new Text_Field({
      context,
      label: 'Profile ID',
      hint: 'Unique identifier (lowercase, hyphens)',
      name: 'id',
      value: this.profile?.id || '',
      placeholder: 'my-crawl-profile',
      required: true
    });
    basicSection.content.add(idField);
    this.idField = idField;
    
    const labelField = new Text_Field({
      context,
      label: 'Display Label',
      name: 'label',
      value: this.profile?.label || '',
      placeholder: 'My Crawl Profile'
    });
    basicSection.content.add(labelField);
    this.labelField = labelField;
    
    const startUrlField = new Text_Field({
      context,
      label: 'Start URL',
      hint: 'Initial URL to begin crawling',
      name: 'startUrl',
      value: this.profile?.startUrl || '',
      placeholder: 'https://example.com',
      fullWidth: true
    });
    basicSection.content.add(startUrlField);
    this.startUrlField = startUrlField;
    
    // Operation select
    const operationOptions = this.operations.map(op => ({
      value: op.name,
      label: `${op.icon || '🕷️'} ${op.label || op.name}`
    }));
    
    const operationField = new Select_Field({
      context,
      label: 'Crawl Operation',
      hint: 'Select the crawl strategy to use',
      name: 'operationName',
      value: this.profile?.operationName || (this.operations[0]?.name || ''),
      options: operationOptions,
      fullWidth: true
    });
    basicSection.content.add(operationField);
    this.operationField = operationField;
    
    form.add(basicSection);
    
    // Options Section (from operation schema)
    const optionsSection = new Form_Section({
      context,
      title: 'Operation Options',
      icon: '⚙️'
    });
    
    this._composeOperationOptions(optionsSection.content);
    form.add(optionsSection);
    this.optionsSection = optionsSection;
    
    // Advanced Section (collapsible)
    const advancedSection = new Form_Section({
      context,
      title: 'Advanced Options',
      icon: '🔧',
      collapsible: true,
      collapsed: true
    });
    
    this._composeAdvancedOptions(advancedSection.content);
    form.add(advancedSection);
    this.advancedSection = advancedSection;
    
    // Actions
    const actions = new Control({ context, tag_name: 'div' });
    actions.add_class('profile-editor__actions');
    
    const saveBtn = new Control({ context, tag_name: 'button' });
    saveBtn.add_class('profile-editor__btn');
    saveBtn.add_class('profile-editor__btn--primary');
    saveBtn.dom.attributes.type = 'submit';
    saveBtn.add(isNew ? '✨ Create Profile' : '💾 Save Changes');
    actions.add(saveBtn);
    this.saveBtn = saveBtn;
    
    const cancelBtn = new Control({ context, tag_name: 'a' });
    cancelBtn.add_class('profile-editor__btn');
    cancelBtn.add_class('profile-editor__btn--secondary');
    cancelBtn.dom.attributes.href = '/crawl-strategies/profiles';
    cancelBtn.add('Cancel');
    actions.add(cancelBtn);
    
    if (!isNew) {
      const deleteBtn = new Control({ context, tag_name: 'button' });
      deleteBtn.add_class('profile-editor__btn');
      deleteBtn.add_class('profile-editor__btn--danger');
      deleteBtn.dom.attributes.type = 'button';
      deleteBtn.add('🗑️ Delete');
      actions.add(deleteBtn);
      this.deleteBtn = deleteBtn;
    }
    
    form.add(actions);
    this.add(form);
    this.form = form;
  }
  
  _composeOperationOptions(container) {
    const { context } = this;
    const selectedOp = this.operations.find(op => 
      op.name === (this.profile?.operationName || this.operations[0]?.name)
    );
    
    if (!selectedOp || !selectedOp.optionSchema) {
      const placeholder = new Control({ context, tag_name: 'p' });
      placeholder.add_class('profile-editor__placeholder');
      placeholder.add('Select an operation to see available options');
      container.add(placeholder);
      return;
    }
    
    const schema = selectedOp.optionSchema;
    const currentOptions = this.profile?.options || {};
    
    for (const [key, def] of Object.entries(schema)) {
      const value = currentOptions[key] ?? def.default;
      
      if (def.type === 'boolean') {
        const field = new Checkbox_Field({
          context,
          label: def.description || key,
          name: `options.${key}`,
          checked: !!value
        });
        container.add(field);
      } else if (def.type === 'number' || def.type === 'integer') {
        const field = new Number_Field({
          context,
          label: def.description || key,
          hint: def.minimum !== undefined ? `${def.minimum} - ${def.maximum || '∞'}` : null,
          name: `options.${key}`,
          min: def.minimum ?? 0,
          max: def.maximum ?? 10000,
          step: def.type === 'integer' ? 1 : 0.1,
          value: value ?? def.default ?? 0
        });
        container.add(field);
      } else if (def.enum) {
        const field = new Select_Field({
          context,
          label: def.description || key,
          name: `options.${key}`,
          value: value ?? def.default ?? '',
          options: def.enum.map(v => ({ value: v, label: v }))
        });
        container.add(field);
      } else {
        const field = new Text_Field({
          context,
          label: def.description || key,
          name: `options.${key}`,
          value: value ?? def.default ?? '',
          placeholder: def.example || ''
        });
        container.add(field);
      }
    }
  }
  
  _composeAdvancedOptions(container) {
    const { context } = this;
    
    const retryField = new Number_Field({
      context,
      label: 'Max Retries',
      hint: 'Number of retry attempts on failure',
      name: 'options.maxRetries',
      min: 0,
      max: 10,
      value: this.profile?.options?.maxRetries ?? 3
    });
    container.add(retryField);
    
    const timeoutField = new Number_Field({
      context,
      label: 'Request Timeout (ms)',
      hint: 'Timeout for individual requests',
      name: 'options.timeout',
      min: 1000,
      max: 60000,
      step: 1000,
      value: this.profile?.options?.timeout ?? 30000
    });
    container.add(timeoutField);
    
    const respectRobotsField = new Checkbox_Field({
      context,
      label: 'Respect robots.txt',
      name: 'options.respectRobotsTxt',
      checked: this.profile?.options?.respectRobotsTxt ?? true
    });
    container.add(respectRobotsField);
  }
  
  showStatus(message, type = 'info') {
    if (this.statusBar && this.statusBar.dom && this.statusBar.dom.el) {
      this.statusBar.dom.el.textContent = message;
      this.statusBar.dom.el.className = `profile-editor__status profile-editor__status--${type}`;
    }
  }
  
  async save() {
    this.showStatus('Saving...', 'info');
    
    try {
      const formData = this.collectFormData();
      const method = this.profile ? 'PUT' : 'POST';
      const url = this.profile 
        ? `${this.apiBase}/${this.profile.id}` 
        : this.apiBase;
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      if (!res.ok) {
        throw new Error(`Save failed: ${res.status}`);
      }
      
      const result = await res.json();
      this.showStatus('✅ Saved successfully!', 'success');
      
      // Redirect after short delay
      setTimeout(() => {
        window.location.href = '/crawl-strategies/profiles';
      }, 1000);
      
    } catch (err) {
      this.showStatus(`❌ ${err.message}`, 'error');
    }
  }
  
  collectFormData() {
    return {
      id: this.idField?.get_value() || '',
      label: this.labelField?.get_value() || '',
      startUrl: this.startUrlField?.get_value() || '',
      operationName: this.operationField?.get_value() || '',
      options: {} // TODO: Collect from option fields
    };
  }
  
  activate() {
    if (!this.__active) {
      super.activate();
      
      // Handle form submission
      if (this.form && this.form.dom && this.form.dom.el) {
        this.form.dom.el.addEventListener('submit', (e) => {
          e.preventDefault();
          this.save();
        });
      }
      
      // Handle delete
      if (this.deleteBtn && this.deleteBtn.dom && this.deleteBtn.dom.el) {
        this.deleteBtn.dom.el.addEventListener('click', async () => {
          if (confirm('Delete this profile?')) {
            try {
              const res = await fetch(`${this.apiBase}/${this.profile.id}`, { method: 'DELETE' });
              if (res.ok) {
                window.location.href = '/crawl-strategies/profiles';
              }
            } catch (err) {
              this.showStatus(`❌ Delete failed: ${err.message}`, 'error');
            }
          }
        });
      }
    }
  }
}

Profile_Editor.scss = `
.profile-editor {
  max-width: 800px;
  margin: 0 auto;
  padding: 24px;
}

.profile-editor__form {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.profile-editor__status {
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
  display: none;
}

.profile-editor__status:not(:empty) {
  display: block;
}

.profile-editor__status--info {
  background: var(--info-bg, #e3f2fd);
  color: var(--info-text, #1565c0);
}

.profile-editor__status--success {
  background: var(--success-bg, #e8f5e9);
  color: var(--success-text, #2e7d32);
}

.profile-editor__status--error {
  background: var(--error-bg, #ffebee);
  color: var(--error-text, #c62828);
}

.profile-editor__placeholder {
  grid-column: 1 / -1;
  text-align: center;
  color: var(--text-secondary, #666);
  padding: 24px;
}

.profile-editor__actions {
  display: flex;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border, #eee);
}

.profile-editor__btn {
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.profile-editor__btn:active {
  transform: scale(0.98);
}

.profile-editor__btn--primary {
  background: var(--primary, #0066cc);
  color: white;
  border: none;
}

.profile-editor__btn--primary:hover {
  background: var(--primary-hover, #0052a3);
}

.profile-editor__btn--secondary {
  background: var(--surface, #fff);
  color: var(--text-primary, #1a1a1a);
  border: 1px solid var(--border, #ddd);
}

.profile-editor__btn--secondary:hover {
  background: var(--surface-hover, #f5f5f5);
}

.profile-editor__btn--danger {
  background: var(--danger-bg, #ffebee);
  color: var(--danger-text, #c62828);
  border: 1px solid var(--danger-border, #ef9a9a);
  margin-left: auto;
}

.profile-editor__btn--danger:hover {
  background: var(--danger-hover, #ffcdd2);
}
`;

// ─────────────────────────────────────────────────────────────
// Profile Editor App - Full Page Document
// ─────────────────────────────────────────────────────────────

class Profile_Editor_App extends Active_HTML_Document {
  constructor(spec = {}) {
    spec.__type_name = spec.__type_name || 'profile_editor_app';
    super(spec);
    const { context } = this;
    
    if (typeof this.body.add_class === 'function') {
      this.body.add_class('profile-editor-app');
    }
    
    this.profile = spec.profile || null;
    this.operations = spec.operations || [];
    this.apiBase = spec.apiBase || '/api/crawler-profiles';
    
    if (!spec.el) {
      this.compose_app();
    }
  }
  
  compose_app() {
    const { context } = this;
    
    // Header
    const header = new Control({ context, tag_name: 'header' });
    header.add_class('app-header');
    
    const title = new Control({ context, tag_name: 'h1' });
    title.add_class('app-header__title');
    title.add(this.profile ? `✏️ Edit: ${this.profile.label}` : '🆕 New Profile');
    header.add(title);
    
    const subtitle = new Control({ context, tag_name: 'p' });
    subtitle.add_class('app-header__subtitle');
    subtitle.add('Configure crawl operation settings');
    header.add(subtitle);
    
    // Navigation
    const nav = new Control({ context, tag_name: 'nav' });
    nav.add_class('app-nav');
    
    const backLink = new Control({ context, tag_name: 'a' });
    backLink.dom.attributes.href = '/crawl-strategies/profiles';
    backLink.add('← Back to Profiles');
    nav.add(backLink);
    
    header.add(nav);
    this.body.add(header);
    
    // Main editor
    const editor = new Profile_Editor({
      context,
      profile: this.profile,
      operations: this.operations,
      apiBase: this.apiBase
    });
    this.body.add(editor);
    this.editor = editor;
  }
}

Profile_Editor_App.css = `
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg, #f5f5f5);
  color: var(--text-primary, #1a1a1a);
  line-height: 1.5;
}

.app-header {
  background: var(--surface, #fff);
  border-bottom: 1px solid var(--border, #e0e0e0);
  padding: 24px;
  margin-bottom: 24px;
}

.app-header__title {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 4px;
}

.app-header__subtitle {
  color: var(--text-secondary, #666);
  font-size: 0.9rem;
}

.app-nav {
  margin-top: 16px;
}

.app-nav a {
  color: var(--primary, #0066cc);
  text-decoration: none;
}

.app-nav a:hover {
  text-decoration: underline;
}
`;

// Export controls
controls.Form_Field = Form_Field;
controls.Text_Field = Text_Field;
controls.Select_Field = Select_Field;
controls.Number_Field = Number_Field;
controls.Checkbox_Field = Checkbox_Field;
controls.Form_Section = Form_Section;
controls.Profile_Editor = Profile_Editor;
controls.Profile_Editor_App = Profile_Editor_App;

module.exports = jsgui;
