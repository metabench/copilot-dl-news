/**
 * @fileoverview Isomorphic Property Editor for Background Task Configuration
 * 
 * Renders a compact, Visual Studio-style property editor that dynamically
 * generates form fields based on task parameter schemas.
 * 
 * Works in both Node.js (server-side rendering) and browser (client-side).
 * Uses lang-tools patterns for consistency.
 */

const { each, tof, is_defined, is_array } = (() => {
  // Isomorphic require/import handling
  if (typeof require !== 'undefined') {
    return require('lang-tools');
  } else if (typeof window !== 'undefined' && window.langTools) {
    return window.langTools;
  }
  // Fallback implementations
  return {
    each: (obj, fn) => {
      if (Array.isArray(obj)) obj.forEach(fn);
      else if (obj) Object.keys(obj).forEach(k => fn(obj[k], k));
    },
    tof: (x) => typeof x,
    is_defined: (x) => x !== undefined && x !== null,
    is_array: (x) => Array.isArray(x)
  };
})();

/**
 * Property field types supported by the editor
 */
const FieldType = {
  STRING: 'string',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
  SELECT: 'select',
  MULTISELECT: 'multiselect',
  PATH: 'path',
  JSON: 'json'
};

/**
 * Escape HTML to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Render a single property field based on its schema
 * @param {Object} field - Field schema definition
 * @param {string} field.name - Field name/key
 * @param {string} field.label - Human-readable label
 * @param {string} field.type - Field type (from FieldType)
 * @param {*} field.default - Default value
 * @param {string} [field.description] - Help text
 * @param {boolean} [field.required] - Whether field is required
 * @param {Array} [field.options] - Options for select/multiselect
 * @param {number} [field.min] - Min value for numbers
 * @param {number} [field.max] - Max value for numbers
 * @param {*} [value] - Current value
 * @returns {string} HTML string for the field
 */
function renderField(field, value) {
  const currentValue = is_defined(value) ? value : field.default;
  const fieldId = `prop-${field.name}`;
  const requiredAttr = field.required ? ' required' : '';
  const requiredMark = field.required ? '<span class="prop-required">*</span>' : '';
  
  let inputHtml = '';
  
  switch (field.type) {
    case FieldType.STRING:
      inputHtml = `<input 
        type="text" 
        id="${fieldId}" 
        name="${escapeHtml(field.name)}" 
        value="${escapeHtml(currentValue || '')}"
        class="prop-input prop-input--text"
        ${field.placeholder ? `placeholder="${escapeHtml(field.placeholder)}"` : ''}
        ${requiredAttr}
      />`;
      break;
      
    case FieldType.NUMBER:
      inputHtml = `<input 
        type="number" 
        id="${fieldId}" 
        name="${escapeHtml(field.name)}" 
        value="${escapeHtml(currentValue || '')}"
        class="prop-input prop-input--number"
        ${is_defined(field.min) ? `min="${field.min}"` : ''}
        ${is_defined(field.max) ? `max="${field.max}"` : ''}
        ${field.step ? `step="${field.step}"` : ''}
        ${requiredAttr}
      />`;
      break;
      
    case FieldType.BOOLEAN:
      const checked = currentValue === true ? ' checked' : '';
      inputHtml = `<label class="prop-checkbox">
        <input 
          type="checkbox" 
          id="${fieldId}" 
          name="${escapeHtml(field.name)}"
          value="true"
          ${checked}
        />
        <span class="prop-checkbox-label">${field.label}</span>
      </label>`;
      break;
      
    case FieldType.SELECT:
      const options = field.options || [];
      const optionsHtml = options.map(opt => {
        const optValue = tof(opt) === 'object' ? opt.value : opt;
        const optLabel = tof(opt) === 'object' ? opt.label : opt;
        const selected = currentValue === optValue ? ' selected' : '';
        return `<option value="${escapeHtml(optValue)}"${selected}>${escapeHtml(optLabel)}</option>`;
      }).join('');
      
      inputHtml = `<select 
        id="${fieldId}" 
        name="${escapeHtml(field.name)}"
        class="prop-input prop-input--select"
        ${requiredAttr}
      >${optionsHtml}</select>`;
      break;
      
    case FieldType.MULTISELECT:
      const multiOptions = field.options || [];
      const selectedValues = is_array(currentValue) ? currentValue : [];
      const checkboxesHtml = multiOptions.map((opt, idx) => {
        const optValue = tof(opt) === 'object' ? opt.value : opt;
        const optLabel = tof(opt) === 'object' ? opt.label : opt;
        const isChecked = selectedValues.includes(optValue) ? ' checked' : '';
        return `
          <label class="prop-checkbox prop-checkbox--inline">
            <input 
              type="checkbox" 
              name="${escapeHtml(field.name)}" 
              value="${escapeHtml(optValue)}"
              ${isChecked}
            />
            <span>${escapeHtml(optLabel)}</span>
          </label>
        `;
      }).join('');
      
      inputHtml = `<div class="prop-multiselect">${checkboxesHtml}</div>`;
      break;
      
    case FieldType.PATH:
      inputHtml = `<input 
        type="text" 
        id="${fieldId}" 
        name="${escapeHtml(field.name)}" 
        value="${escapeHtml(currentValue || '')}"
        class="prop-input prop-input--path"
        ${field.placeholder ? `placeholder="${escapeHtml(field.placeholder)}"` : ''}
        ${requiredAttr}
      />`;
      break;
      
    case FieldType.JSON:
      const jsonValue = tof(currentValue) === 'string' 
        ? currentValue 
        : JSON.stringify(currentValue, null, 2);
      inputHtml = `<textarea 
        id="${fieldId}" 
        name="${escapeHtml(field.name)}"
        class="prop-input prop-input--json"
        rows="4"
        ${requiredAttr}
      >${escapeHtml(jsonValue || '')}</textarea>`;
      break;
      
    default:
      inputHtml = `<input 
        type="text" 
        id="${fieldId}" 
        name="${escapeHtml(field.name)}" 
        value="${escapeHtml(currentValue || '')}"
        class="prop-input"
      />`;
  }
  
  // For boolean, label is part of the input
  const labelHtml = field.type === FieldType.BOOLEAN ? '' : `
    <label for="${fieldId}" class="prop-label">
      ${escapeHtml(field.label)}${requiredMark}
    </label>
  `;
  
  const descriptionHtml = field.description ? `
    <div class="prop-description">${escapeHtml(field.description)}</div>
  ` : '';
  
  return `
    <div class="prop-field prop-field--${field.type}" data-field-name="${escapeHtml(field.name)}">
      ${labelHtml}
      <div class="prop-input-wrapper">
        ${inputHtml}
      </div>
      ${descriptionHtml}
    </div>
  `;
}

/**
 * Render complete property editor
 * @param {Object} schema - Property editor schema
 * @param {string} schema.taskType - Task type identifier
 * @param {string} schema.title - Editor title
 * @param {string} [schema.description] - Editor description
 * @param {Array} schema.fields - Array of field definitions
 * @param {Object} [values] - Current values
 * @param {Object} [options] - Rendering options
 * @returns {string} HTML string for the complete editor
 */
function renderPropertyEditor(schema, values = {}, options = {}) {
  const {
    showTitle = true,
    showSubmit = true,
    submitLabel = 'Start Task',
    cancelLabel = 'Cancel',
    formId = 'property-editor-form'
  } = options;
  
  const titleHtml = showTitle && schema.title ? `
    <div class="prop-editor-header">
      <h3 class="prop-editor-title">${escapeHtml(schema.title)}</h3>
      ${schema.description ? `<p class="prop-editor-description">${escapeHtml(schema.description)}</p>` : ''}
    </div>
  ` : '';
  
  const fieldsHtml = schema.fields.map(field => 
    renderField(field, values[field.name])
  ).join('');
  
  const actionsHtml = showSubmit ? `
    <div class="prop-editor-actions">
      <button type="submit" class="prop-button prop-button--primary">
        ${escapeHtml(submitLabel)}
      </button>
      <button type="button" class="prop-button prop-button--cancel" data-action="cancel">
        ${escapeHtml(cancelLabel)}
      </button>
    </div>
  ` : '';
  
  return `
    <div class="prop-editor" data-task-type="${escapeHtml(schema.taskType)}">
      ${titleHtml}
      <form id="${formId}" class="prop-editor-form" data-task-type="${escapeHtml(schema.taskType)}">
        <div class="prop-editor-fields">
          ${fieldsHtml}
        </div>
        ${actionsHtml}
      </form>
    </div>
  `;
}

/**
 * Extract form values from DOM (client-side only)
 * @param {HTMLFormElement} form - Form element
 * @returns {Object} Form values
 */
function extractFormValues(form) {
  if (typeof window === 'undefined') {
    throw new Error('extractFormValues can only be called in browser');
  }
  
  const formData = new FormData(form);
  const values = {};
  
  // Get all field definitions from the form
  const fields = Array.from(form.querySelectorAll('[data-field-name]'));
  
  each(fields, (fieldEl) => {
    const fieldName = fieldEl.dataset.fieldName;
    const input = fieldEl.querySelector('input, select, textarea');
    
    if (!input) return;
    
    const fieldType = fieldEl.classList.contains('prop-field--boolean') ? 'boolean' :
                      fieldEl.classList.contains('prop-field--number') ? 'number' :
                      fieldEl.classList.contains('prop-field--multiselect') ? 'multiselect' :
                      fieldEl.classList.contains('prop-field--json') ? 'json' :
                      'string';
    
    if (fieldType === 'boolean') {
      values[fieldName] = input.checked;
    } else if (fieldType === 'number') {
      const val = input.value;
      values[fieldName] = val === '' ? null : Number(val);
    } else if (fieldType === 'multiselect') {
      const checkboxes = fieldEl.querySelectorAll('input[type="checkbox"]:checked');
      values[fieldName] = Array.from(checkboxes).map(cb => cb.value);
    } else if (fieldType === 'json') {
      try {
        values[fieldName] = JSON.parse(input.value);
      } catch (e) {
        values[fieldName] = input.value; // Keep as string if invalid JSON
      }
    } else {
      values[fieldName] = input.value;
    }
  });
  
  return values;
}

/**
 * Validate form values against schema
 * @param {Object} values - Form values to validate
 * @param {Object} schema - Property editor schema
 * @returns {Object} { valid: boolean, errors: Array }
 */
function validateValues(values, schema) {
  const errors = [];
  
  each(schema.fields, (field) => {
    const value = values[field.name];
    
    // Required check
    if (field.required && !is_defined(value)) {
      errors.push({
        field: field.name,
        message: `${field.label} is required`
      });
    }
    
    // Type checks
    if (is_defined(value)) {
      if (field.type === FieldType.NUMBER && tof(value) !== 'number') {
        errors.push({
          field: field.name,
          message: `${field.label} must be a number`
        });
      }
      
      // Range checks for numbers
      if (field.type === FieldType.NUMBER && tof(value) === 'number') {
        if (is_defined(field.min) && value < field.min) {
          errors.push({
            field: field.name,
            message: `${field.label} must be at least ${field.min}`
          });
        }
        if (is_defined(field.max) && value > field.max) {
          errors.push({
            field: field.name,
            message: `${field.label} must be at most ${field.max}`
          });
        }
      }
    }
  });
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// Export for Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FieldType,
    renderField,
    renderPropertyEditor,
    extractFormValues,
    validateValues,
    escapeHtml
  };
} else if (typeof window !== 'undefined') {
  window.PropertyEditor = {
    FieldType,
    renderField,
    renderPropertyEditor,
    extractFormValues,
    validateValues,
    escapeHtml
  };
}
