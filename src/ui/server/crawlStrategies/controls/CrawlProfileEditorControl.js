'use strict';

const jsgui = require('jsgui3-html');
const { BaseAppControl } = require('../../shared/BaseAppControl');

// Simple helper to make elements
function makeEl(ctx, tag, className, attrs) {
  const el = new jsgui.Control({ context: ctx, tagName: tag });
  if (className) el.add_class(className);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      el.dom.attributes[key] = value;
    }
  }
  return el;
}

function text(ctx, str) {
  return new jsgui.String_Control({ context: ctx, text: str });
}

/**
 * CrawlProfileEditorControl
 * 
 * Form-based editor for crawler profiles with dynamic form generation
 * from operation schemas.
 * 
 * Props:
 * - profile: The profile object being edited (or null for new)
 * - operations: Array of available operations (with optionSchema)
 * - basePath: Base URL path for links
 * - apiBase: API base path for save/load
 */
class CrawlProfileEditorControl extends BaseAppControl {
  constructor(spec = {}) {
    super({
      ...spec,
      appName: 'Profile Editor',
      appClass: 'crawl-profile-editor',
      title: spec.profile ? `Edit: ${spec.profile.label}` : '🆕 New Profile',
      subtitle: 'Configure crawl operation settings'
    });

    this.basePath = spec.basePath || '/crawl-strategies';
    this.apiBase = spec.apiBase || '/api/crawler-profiles';
    this.profile = spec.profile || null;
    this.operations = spec.operations || [];
    this.selectedOperationName = spec.profile?.operationName || (this.operations[0]?.name || '');

    if (!spec.el) {
      this.compose();
    }
  }

  composeMainContent() {
    const ctx = this.context;
    const root = makeEl(ctx, 'div', 'page', {
      'data-testid': 'profile-editor',
      'data-profile-id': this.profile?.id || '',
      'data-api-base': this.apiBase
    });

    root.add(this._composeStyles());
    root.add(this._composeClientScript());
    root.add(this._composeForm());

    this.mainContainer.add(root);
  }

  _composeStyles() {
    const ctx = this.context;
    const styleEl = makeEl(ctx, 'style');
    styleEl.add(text(ctx, `
.profile-form {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 800px;
}

.form-section {
  background: var(--surface, #fff);
  border: 1px solid var(--border, #e0e0e0);
  border-radius: 12px;
  padding: 20px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 16px 0;
  color: var(--text-primary, #1a1a1a);
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-title .icon {
  font-size: 18px;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.form-grid.single-column {
  grid-template-columns: 1fr;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-field.full-width {
  grid-column: 1 / -1;
}

.field-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary, #1a1a1a);
}

.field-hint {
  font-size: 11px;
  color: var(--text-secondary, #666);
  margin-top: 2px;
}

.field-input {
  font-size: 14px;
  padding: 10px 12px;
  border: 1px solid var(--border, #ddd);
  border-radius: 8px;
  background: var(--input-bg, #fff);
  color: var(--text-primary, #1a1a1a);
  transition: border-color 0.15s, box-shadow 0.15s;
}

.field-input:focus {
  outline: none;
  border-color: var(--primary, #0066cc);
  box-shadow: 0 0 0 3px rgba(0, 102, 204, 0.1);
}

.field-input[type="number"] {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.field-select {
  font-size: 14px;
  padding: 10px 12px;
  border: 1px solid var(--border, #ddd);
  border-radius: 8px;
  background: var(--input-bg, #fff);
  color: var(--text-primary, #1a1a1a);
  cursor: pointer;
}

.field-checkbox-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
}

.field-checkbox {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.checkbox-label {
  font-size: 14px;
  color: var(--text-primary, #1a1a1a);
  cursor: pointer;
}

.range-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.range-input {
  flex: 1;
  height: 6px;
  cursor: pointer;
}

.range-value {
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: var(--text-secondary, #666);
  min-width: 60px;
  text-align: right;
}

.options-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.options-category {
  margin-top: 12px;
}

.options-category:first-child {
  margin-top: 0;
}

.category-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, #666);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.form-actions {
  display: flex;
  gap: 12px;
  padding-top: 8px;
}

.btn {
  padding: 12px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: background-color 0.15s, transform 0.1s;
}

.btn:active {
  transform: scale(0.98);
}

.btn-primary {
  background: var(--primary, #0066cc);
  color: white;
}

.btn-primary:hover {
  background: var(--primary-hover, #0052a3);
}

.btn-secondary {
  background: var(--surface-alt, #f5f5f5);
  color: var(--text-primary, #1a1a1a);
  border: 1px solid var(--border, #ddd);
}

.btn-secondary:hover {
  background: var(--surface-hover, #eee);
}

.status-bar {
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 13px;
  display: none;
}

.status-bar.success {
  display: block;
  background: #dcfce7;
  color: #166534;
  border: 1px solid #bbf7d0;
}

.status-bar.error {
  display: block;
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

.advanced-toggle {
  font-size: 12px;
  color: var(--primary, #0066cc);
  cursor: pointer;
  user-select: none;
  margin-top: 8px;
}

.advanced-options {
  display: none;
  padding-top: 12px;
  border-top: 1px solid var(--border, #eee);
  margin-top: 12px;
}

.advanced-options.visible {
  display: block;
}
`));
    return styleEl;
  }

  _composeClientScript() {
    const ctx = this.context;
    const scriptEl = makeEl(ctx, 'script');
    scriptEl.add(text(ctx, `
(function() {
  // Wait for DOM ready
  document.addEventListener('DOMContentLoaded', function() {
    // Advanced options toggle
    const toggleEl = document.querySelector('[data-toggle-advanced]');
    const advancedEl = document.querySelector('[data-advanced-options]');
    
    if (toggleEl && advancedEl) {
      toggleEl.addEventListener('click', function() {
        const isVisible = advancedEl.classList.contains('visible');
        if (isVisible) {
          advancedEl.classList.remove('visible');
          toggleEl.textContent = '▶ Show advanced options';
        } else {
          advancedEl.classList.add('visible');
          toggleEl.textContent = '▼ Hide advanced options';
        }
      });
    }

    // Range slider value updates
    document.querySelectorAll('.range-input').forEach(function(range) {
      const valueEl = range.parentElement.querySelector('.range-value');
      if (valueEl) {
        range.addEventListener('input', function() {
          valueEl.textContent = range.value;
        });
      }
    });

    // Form submission handling
    const form = document.querySelector('[data-profile-form]');
    const statusBar = document.querySelector('[data-status]');
    
    if (form) {
      form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        // Show saving status
        if (statusBar) {
          statusBar.textContent = 'Saving...';
          statusBar.className = 'status-bar info';
        }
        
        const formData = new FormData(form);
        const data = {};
        const options = {};
        
        for (const [key, value] of formData.entries()) {
          if (key.startsWith('options.')) {
            const optKey = key.replace('options.', '');
            options[optKey] = value;
          } else {
            data[key] = value;
          }
        }
        
        // Handle checkboxes (unchecked ones aren't in FormData)
        form.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
          if (cb.name.startsWith('options.')) {
            const optKey = cb.name.replace('options.', '');
            options[optKey] = cb.checked;
          }
        });
        
        data.options = options;
        
        try {
          const apiBase = document.querySelector('[data-api-base]')?.dataset.apiBase || '';
          const profileId = document.querySelector('[data-profile-id]')?.dataset.profileId;
          const isNew = !profileId;
          const method = isNew ? 'POST' : 'PUT';
          const url = isNew ? apiBase : apiBase + '/' + profileId;
          
          const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
          
          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Save failed');
          }
          
          if (statusBar) {
            statusBar.textContent = '✅ Saved successfully!';
            statusBar.className = 'status-bar success';
          }
          
          // Redirect back to profiles list
          setTimeout(function() {
            window.location.href = window.location.pathname.replace(/\\/profiles\\/.*/, '/profiles');
          }, 1500);
        } catch (err) {
          if (statusBar) {
            statusBar.textContent = '❌ ' + err.message;
            statusBar.className = 'status-bar error';
          }
        }
      });
    }

    // Delete button handling
    const deleteBtn = document.querySelector('[data-delete-btn]');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async function() {
        if (!confirm('Delete this profile?')) return;
        
        if (statusBar) {
          statusBar.textContent = 'Deleting...';
          statusBar.className = 'status-bar info';
        }
        
        try {
          const apiBase = document.querySelector('[data-api-base]')?.dataset.apiBase || '';
          const profileId = document.querySelector('[data-profile-id]')?.dataset.profileId;
          
          const res = await fetch(apiBase + '/' + profileId, { method: 'DELETE' });
          if (!res.ok) throw new Error('Delete failed');
          
          window.location.href = window.location.pathname.replace(/\\/profiles\\/.*/, '/profiles');
        } catch (err) {
          if (statusBar) {
            statusBar.textContent = '❌ ' + err.message;
            statusBar.className = 'status-bar error';
          }
        }
      });
    }
  });
})();
`));
    return scriptEl;
  }

  _composeForm() {
    const ctx = this.context;
    const form = makeEl(ctx, 'form', 'profile-form', {
      'data-profile-form': '1',
      method: 'post',
      action: this.apiBase
    });

    // Status bar
    const status = makeEl(ctx, 'div', 'status-bar', { 'data-status': '1' });
    form.add(status);

    // Basic info section
    form.add(this._composeBasicInfoSection());

    // Operation selection section
    form.add(this._composeOperationSection());

    // Operation options section (dynamic based on selected operation)
    form.add(this._composeOptionsSection());

    // Actions
    form.add(this._composeActionsSection());

    return form;
  }

  _composeBasicInfoSection() {
    const ctx = this.context;
    const section = makeEl(ctx, 'div', 'form-section');

    const title = makeEl(ctx, 'h3', 'section-title');
    title.add(makeEl(ctx, 'span', 'icon').add(text(ctx, '📝')));
    title.add(text(ctx, 'Profile Details'));
    section.add(title);

    const grid = makeEl(ctx, 'div', 'form-grid');

    // ID field
    grid.add(this._makeTextField({
      name: 'id',
      label: 'Profile ID',
      value: this.profile?.id || '',
      placeholder: 'my-crawl-profile',
      hint: 'Unique identifier (no spaces)',
      required: true,
      readonly: !!this.profile // Can't change ID of existing profile
    }));

    // Label field
    grid.add(this._makeTextField({
      name: 'label',
      label: 'Display Name',
      value: this.profile?.label || '',
      placeholder: 'My Crawl Profile',
      hint: 'Human-readable name',
      required: true
    }));

    // Start URL field
    grid.add(this._makeTextField({
      name: 'startUrl',
      label: 'Start URL',
      value: this.profile?.startUrl || '',
      placeholder: 'https://example.com',
      hint: 'Initial URL to begin crawling',
      fullWidth: true,
      type: 'url'
    }));

    // Description field
    grid.add(this._makeTextField({
      name: 'description',
      label: 'Description',
      value: this.profile?.description || '',
      placeholder: 'Describe what this profile is for...',
      hint: 'Optional description',
      fullWidth: true,
      multiline: true
    }));

    section.add(grid);
    return section;
  }

  _composeOperationSection() {
    const ctx = this.context;
    const section = makeEl(ctx, 'div', 'form-section');

    const title = makeEl(ctx, 'h3', 'section-title');
    title.add(makeEl(ctx, 'span', 'icon').add(text(ctx, '🕷️')));
    title.add(text(ctx, 'Crawl Operation'));
    section.add(title);

    const grid = makeEl(ctx, 'div', 'form-grid single-column');

    // Operation select
    const field = makeEl(ctx, 'div', 'form-field');
    const label = makeEl(ctx, 'label', 'field-label', { for: 'operationName' });
    label.add(text(ctx, 'Operation'));
    field.add(label);

    const select = makeEl(ctx, 'select', 'field-select', {
      id: 'operationName',
      name: 'operationName',
      'data-operation-select': '1'
    });

    // Group by category
    const byCategory = {};
    for (const op of this.operations) {
      const cat = op.category || 'other';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(op);
    }

    const categoryLabels = {
      'article-crawl': '📰 Article Crawling',
      'discovery': '🔍 Site Discovery',
      'hub-discovery': '🗺️ Hub Discovery',
      'hub-management': '🏗️ Hub Management',
      'history': '📜 History'
    };

    for (const [cat, ops] of Object.entries(byCategory)) {
      const optgroup = makeEl(ctx, 'optgroup', '', {
        label: categoryLabels[cat] || cat
      });
      for (const op of ops) {
        const option = makeEl(ctx, 'option', '', { value: op.name });
        if (op.name === this.selectedOperationName) {
          option.dom.attributes.selected = 'selected';
        }
        option.add(text(ctx, `${op.icon || '❓'} ${op.label}`));
        optgroup.add(option);
      }
      select.add(optgroup);
    }

    field.add(select);

    // Show selected operation description
    const selectedOp = this.operations.find(o => o.name === this.selectedOperationName);
    if (selectedOp?.description) {
      const hint = makeEl(ctx, 'div', 'field-hint');
      hint.add(text(ctx, selectedOp.description));
      field.add(hint);
    }

    grid.add(field);
    section.add(grid);
    return section;
  }

  _composeOptionsSection() {
    const ctx = this.context;
    const section = makeEl(ctx, 'div', 'form-section', { 'data-options-section': '1' });

    const title = makeEl(ctx, 'h3', 'section-title');
    title.add(makeEl(ctx, 'span', 'icon').add(text(ctx, '⚙️')));
    title.add(text(ctx, 'Configuration Options'));
    section.add(title);

    const selectedOp = this.operations.find(o => o.name === this.selectedOperationName);
    const optionSchema = selectedOp?.optionSchema || {};
    const overrides = this.profile?.overrides || {};

    // Group options by category
    const byCategory = {};
    const advancedOptions = [];

    for (const [key, schema] of Object.entries(optionSchema)) {
      if (schema.advanced) {
        advancedOptions.push({ key, schema });
      } else {
        const cat = schema.category || 'general';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push({ key, schema });
      }
    }

    const categoryOrder = ['behavior', 'limits', 'performance', 'discovery', 'storage', 'logging', 'general'];
    const categoryLabels = {
      'behavior': 'Behavior',
      'limits': 'Limits',
      'performance': 'Performance',
      'discovery': 'Discovery',
      'storage': 'Storage',
      'logging': 'Logging',
      'general': 'General'
    };

    const optionsGroup = makeEl(ctx, 'div', 'options-group');

    for (const cat of categoryOrder) {
      const options = byCategory[cat];
      if (!options || options.length === 0) continue;

      const catDiv = makeEl(ctx, 'div', 'options-category');
      const catLabel = makeEl(ctx, 'div', 'category-label');
      catLabel.add(text(ctx, categoryLabels[cat] || cat));
      catDiv.add(catLabel);

      const grid = makeEl(ctx, 'div', 'form-grid');
      for (const { key, schema } of options) {
        const value = overrides[key] !== undefined ? overrides[key] : schema.default;
        grid.add(this._makeOptionField(key, schema, value));
      }
      catDiv.add(grid);
      optionsGroup.add(catDiv);
    }

    section.add(optionsGroup);

    // Advanced options toggle
    if (advancedOptions.length > 0) {
      const toggle = makeEl(ctx, 'div', 'advanced-toggle', { 'data-toggle-advanced': '1' });
      toggle.add(text(ctx, '▶ Show advanced options'));
      section.add(toggle);

      const advDiv = makeEl(ctx, 'div', 'advanced-options', { 'data-advanced-options': '1' });
      const advGrid = makeEl(ctx, 'div', 'form-grid');
      for (const { key, schema } of advancedOptions) {
        const value = overrides[key] !== undefined ? overrides[key] : schema.default;
        advGrid.add(this._makeOptionField(key, schema, value));
      }
      advDiv.add(advGrid);
      section.add(advDiv);
    }

    return section;
  }

  _composeActionsSection() {
    const ctx = this.context;
    const actions = makeEl(ctx, 'div', 'form-actions');

    const saveBtn = makeEl(ctx, 'button', 'btn btn-primary', {
      type: 'submit',
      'data-save-btn': '1'
    });
    saveBtn.add(text(ctx, this.profile ? '💾 Save Changes' : '✨ Create Profile'));
    actions.add(saveBtn);

    const cancelLink = makeEl(ctx, 'a', 'btn btn-secondary', {
      href: `${this.basePath}/profiles`
    });
    cancelLink.add(text(ctx, 'Cancel'));
    actions.add(cancelLink);

    if (this.profile) {
      const deleteBtn = makeEl(ctx, 'button', 'btn btn-secondary', {
        type: 'button',
        'data-delete-btn': '1',
        style: 'margin-left: auto; color: #991b1b;'
      });
      deleteBtn.add(text(ctx, '🗑️ Delete'));
      actions.add(deleteBtn);
    }

    return actions;
  }

  _makeTextField({ name, label, value, placeholder, hint, required, readonly, fullWidth, type, multiline }) {
    const ctx = this.context;
    const field = makeEl(ctx, 'div', `form-field${fullWidth ? ' full-width' : ''}`);

    const labelEl = makeEl(ctx, 'label', 'field-label', { for: name });
    labelEl.add(text(ctx, label + (required ? ' *' : '')));
    field.add(labelEl);

    if (multiline) {
      const textarea = makeEl(ctx, 'textarea', 'field-input', {
        id: name,
        name: name,
        placeholder: placeholder || '',
        rows: '3'
      });
      if (required) textarea.dom.attributes.required = 'required';
      if (readonly) textarea.dom.attributes.readonly = 'readonly';
      if (value) textarea.add(text(ctx, value));
      field.add(textarea);
    } else {
      const input = makeEl(ctx, 'input', 'field-input', {
        type: type || 'text',
        id: name,
        name: name,
        value: value || '',
        placeholder: placeholder || ''
      });
      if (required) input.dom.attributes.required = 'required';
      if (readonly) input.dom.attributes.readonly = 'readonly';
      field.add(input);
    }

    if (hint) {
      const hintEl = makeEl(ctx, 'div', 'field-hint');
      hintEl.add(text(ctx, hint));
      field.add(hintEl);
    }

    return field;
  }

  _makeOptionField(key, schema, value) {
    const ctx = this.context;

    switch (schema.type) {
      case 'boolean':
        return this._makeBooleanField(key, schema, value);
      case 'enum':
        return this._makeEnumField(key, schema, value);
      case 'number':
        return this._makeNumberField(key, schema, value);
      default:
        return this._makeGenericField(key, schema, value);
    }
  }

  _makeBooleanField(key, schema, value) {
    const ctx = this.context;
    const field = makeEl(ctx, 'div', 'form-field');

    const row = makeEl(ctx, 'div', 'field-checkbox-row');

    const checkbox = makeEl(ctx, 'input', 'field-checkbox', {
      type: 'checkbox',
      id: `override_${key}`,
      name: `override_${key}`,
      'data-option-key': key,
      'data-option-type': 'boolean'
    });
    if (value === true) {
      checkbox.dom.attributes.checked = 'checked';
    }
    row.add(checkbox);

    const label = makeEl(ctx, 'label', 'checkbox-label', { for: `override_${key}` });
    label.add(text(ctx, schema.label || key));
    row.add(label);

    field.add(row);

    if (schema.description) {
      const hint = makeEl(ctx, 'div', 'field-hint');
      hint.add(text(ctx, schema.description));
      field.add(hint);
    }

    return field;
  }

  _makeEnumField(key, schema, value) {
    const ctx = this.context;
    const field = makeEl(ctx, 'div', 'form-field');

    const label = makeEl(ctx, 'label', 'field-label', { for: `override_${key}` });
    label.add(text(ctx, schema.label || key));
    field.add(label);

    const select = makeEl(ctx, 'select', 'field-select', {
      id: `override_${key}`,
      name: `override_${key}`,
      'data-option-key': key,
      'data-option-type': 'enum'
    });

    for (const opt of (schema.options || [])) {
      const option = makeEl(ctx, 'option', '', { value: String(opt.value) });
      if (opt.value === value) {
        option.dom.attributes.selected = 'selected';
      }
      option.add(text(ctx, opt.label + (opt.description ? ` — ${opt.description}` : '')));
      select.add(option);
    }

    field.add(select);

    if (schema.description) {
      const hint = makeEl(ctx, 'div', 'field-hint');
      hint.add(text(ctx, schema.description));
      field.add(hint);
    }

    return field;
  }

  _makeNumberField(key, schema, value) {
    const ctx = this.context;
    const field = makeEl(ctx, 'div', 'form-field');

    const label = makeEl(ctx, 'label', 'field-label', { for: `override_${key}` });
    label.add(text(ctx, schema.label || key));
    field.add(label);

    // Use range slider for numbers with min/max
    if (schema.min !== undefined && schema.max !== undefined) {
      const row = makeEl(ctx, 'div', 'range-row');

      const range = makeEl(ctx, 'input', 'range-input', {
        type: 'range',
        id: `override_${key}`,
        name: `override_${key}`,
        'data-option-key': key,
        'data-option-type': 'number',
        min: String(schema.min),
        max: String(schema.max),
        step: String(schema.step || 1),
        value: String(value)
      });
      row.add(range);

      const valueDisplay = makeEl(ctx, 'span', 'range-value', {
        'data-range-value': key
      });
      valueDisplay.add(text(ctx, String(value)));
      row.add(valueDisplay);

      field.add(row);
    } else {
      const input = makeEl(ctx, 'input', 'field-input', {
        type: 'number',
        id: `override_${key}`,
        name: `override_${key}`,
        'data-option-key': key,
        'data-option-type': 'number',
        value: String(value)
      });
      if (schema.min !== undefined) input.dom.attributes.min = String(schema.min);
      if (schema.max !== undefined) input.dom.attributes.max = String(schema.max);
      if (schema.step !== undefined) input.dom.attributes.step = String(schema.step);
      field.add(input);
    }

    if (schema.description) {
      const hint = makeEl(ctx, 'div', 'field-hint');
      hint.add(text(ctx, schema.description));
      field.add(hint);
    }

    return field;
  }

  _makeGenericField(key, schema, value) {
    const ctx = this.context;
    const field = makeEl(ctx, 'div', 'form-field');

    const label = makeEl(ctx, 'label', 'field-label', { for: `override_${key}` });
    label.add(text(ctx, schema.label || key));
    field.add(label);

    const input = makeEl(ctx, 'input', 'field-input', {
      type: 'text',
      id: `override_${key}`,
      name: `override_${key}`,
      'data-option-key': key,
      'data-option-type': 'string',
      value: value != null ? String(value) : ''
    });
    field.add(input);

    if (schema.description) {
      const hint = makeEl(ctx, 'div', 'field-hint');
      hint.add(text(ctx, schema.description));
      field.add(hint);
    }

    return field;
  }
}

module.exports = { CrawlProfileEditorControl };
