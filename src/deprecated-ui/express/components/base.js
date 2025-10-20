/**
 * Component Library - Base Components
 * 
 * Reusable HTML components inspired by jsgui3's Control system.
 * Each component is a pure function: (spec, context) => HTML string
 */

/**
 * Page Layout Component
 * Base page wrapper with navigation and structure
 * Inspired by jsgui3's Active_HTML_Document pattern
 * 
 * @param {Object} spec - Page specification
 * @param {string} spec.title - Page title
 * @param {string} spec.content - Main page content HTML
 * @param {string} spec.bodyClass - Optional body CSS class
 * @param {Object} context - Render context with utilities
 * @returns {string} Complete HTML page
 */
function pageLayout(spec, context) {
  spec = spec || {};
  const { escapeHtml, renderNav } = context;
  
  const title = spec.title || 'Untitled Page';
  const content = spec.content || '';
  const bodyClass = spec.bodyClass || '';
  const nav = renderNav();
  
  return `<!doctype html>
<html>
<head>
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/styles/crawler.css">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body class="${escapeHtml(bodyClass)}">
  ${nav}
  <main>
    ${content}
  </main>
</body>
</html>`;
}

/**
 * Pill Component (Status Badge)
 * Reusable status indicator with variant styling
 * 
 * @param {Object} spec - Pill specification
 * @param {string} spec.text - Pill text content
 * @param {string} spec.variant - Style variant: 'good', 'bad', 'neutral', 'warning'
 * @param {Object} context - Render context
 * @returns {string} Pill HTML
 */
function pill(spec, context) {
  spec = spec || {};
  const { escapeHtml } = context;
  
  const text = spec.text || '';
  const variant = spec.variant || 'neutral';
  
  return `<span class="pill ${escapeHtml(variant)}"><code>${escapeHtml(text)}</code></span>`;
}

/**
 * Data Table Component
 * Consistent table rendering with headers, rows, and empty states
 * 
 * @param {Object} spec - Table specification
 * @param {Array<string>} spec.headers - Table header labels
 * @param {Array<Array<string>>} spec.rows - Table rows (array of cell arrays)
 * @param {string} spec.emptyMessage - Message to show when no rows
 * @param {string} spec.tableClass - Optional table CSS class
 * @param {Object} context - Render context
 * @returns {string} Table HTML
 */
function dataTable(spec, context) {
  spec = spec || {};
  const { escapeHtml } = context;
  
  const headers = spec.headers || [];
  const rows = spec.rows || [];
  const emptyMessage = spec.emptyMessage || 'No data available';
  const tableClass = spec.tableClass || '';
  
  if (rows.length === 0) {
    return `<p class="empty-state">${escapeHtml(emptyMessage)}</p>`;
  }
  
  const headerHtml = headers.map(h => `<th>${escapeHtml(h)}</th>`).join('');
  const rowsHtml = rows.map(row => {
    const cells = row.map(cell => `<td>${cell}</td>`).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  
  return `
<table class="${escapeHtml(tableClass)}">
  <thead>
    <tr>${headerHtml}</tr>
  </thead>
  <tbody>
    ${rowsHtml}
  </tbody>
</table>`;
}

/**
 * Form Field Component
 * Individual form field with label
 * 
 * @param {Object} spec - Field specification
 * @param {string} spec.type - Input type (text, number, select, etc.)
 * @param {string} spec.name - Field name
 * @param {string} spec.label - Field label text
 * @param {*} spec.value - Current field value
 * @param {Array<string>} spec.options - Options for select fields
 * @param {string} spec.placeholder - Placeholder text
 * @param {Object} context - Render context
 * @returns {string} Form field HTML
 */
function formField(spec, context) {
  spec = spec || {};
  const { escapeHtml } = context;
  
  const type = spec.type || 'text';
  const name = spec.name || '';
  const label = spec.label || '';
  const value = spec.value || '';
  const placeholder = spec.placeholder || '';
  
  if (type === 'select' && spec.options) {
    const optionsHtml = spec.options.map(opt => {
      const selected = opt === value ? 'selected' : '';
      return `<option value="${escapeHtml(opt)}" ${selected}>${escapeHtml(opt || 'any')}</option>`;
    }).join('');
    
    return `
<label>
  ${escapeHtml(label)}
  <select name="${escapeHtml(name)}">${optionsHtml}</select>
</label>`;
  }
  
  return `
<label>
  ${escapeHtml(label)}
  <input 
    type="${escapeHtml(type)}" 
    name="${escapeHtml(name)}" 
    value="${escapeHtml(String(value))}"
    ${placeholder ? `placeholder="${escapeHtml(placeholder)}"` : ''}
    ${type === 'number' ? 'min="1"' : ''}
  />
</label>`;
}

/**
 * Form Filters Component
 * Consistent filter form generation
 * 
 * @param {Object} spec - Form specification
 * @param {Array<Object>} spec.fields - Array of field specifications
 * @param {string} spec.action - Form action URL
 * @param {string} spec.method - Form method (GET/POST)
 * @param {string} spec.submitLabel - Submit button text
 * @param {Object} context - Render context
 * @returns {string} Form HTML
 */
function formFilters(spec, context) {
  spec = spec || {};
  const { escapeHtml } = context;
  
  const fields = spec.fields || [];
  const action = spec.action || '';
  const method = spec.method || 'GET';
  const submitLabel = spec.submitLabel || 'Apply Filters';
  
  const fieldsHtml = fields.map(fieldSpec => formField(fieldSpec, context)).join('');
  
  return `
<form method="${escapeHtml(method)}" action="${escapeHtml(action)}" class="filter-form">
  ${fieldsHtml}
  <button type="submit">${escapeHtml(submitLabel)}</button>
</form>`;
}

/**
 * Error Page Component
 * Standardized error display with consistent layout
 * 
 * @param {Object} spec - Error specification
 * @param {string} spec.message - Error message
 * @param {number} spec.status - HTTP status code
 * @param {Object} context - Render context
 * @returns {string} Error page HTML
 */
function errorPage(spec, context) {
  spec = spec || {};
  const { escapeHtml } = context;
  
  const message = spec.message || 'An error occurred';
  const status = spec.status || 500;
  
  const content = `
<div class="error-container">
  <h1>Error ${escapeHtml(String(status))}</h1>
  <pre>${escapeHtml(message)}</pre>
  <p><a href="/">Return to home page</a></p>
</div>`;
  
  return pageLayout({
    title: `Error ${status}`,
    content,
    bodyClass: 'error-page'
  }, context);
}

/**
 * Empty State Component
 * Consistent messaging when no data is available
 * 
 * @param {Object} spec - Empty state specification
 * @param {string} spec.title - Empty state title
 * @param {string} spec.message - Empty state message
 * @param {string} spec.icon - Optional icon/emoji
 * @param {Object} context - Render context
 * @returns {string} Empty state HTML
 */
function emptyState(spec, context) {
  spec = spec || {};
  const { escapeHtml } = context;
  
  const title = spec.title || 'No Data';
  const message = spec.message || 'No items to display';
  const icon = spec.icon || '📭';
  
  return `
<div class="empty-state">
  <div class="empty-state-icon">${escapeHtml(icon)}</div>
  <strong>${escapeHtml(title)}</strong>
  <p>${escapeHtml(message)}</p>
</div>`;
}

/**
 * Pagination Component
 * Navigation links for paginated content
 * 
 * @param {Object} spec - Pagination specification
 * @param {number} spec.currentPage - Current page number
 * @param {number} spec.totalPages - Total number of pages
 * @param {Function} spec.urlBuilder - Function that builds URL for page number
 * @param {Object} context - Render context
 * @returns {string} Pagination HTML
 */
function pagination(spec, context) {
  spec = spec || {};
  const { escapeHtml } = context;
  
  const currentPage = spec.currentPage || 1;
  const totalPages = spec.totalPages || 1;
  const urlBuilder = spec.urlBuilder || ((page) => `?page=${page}`);
  
  if (totalPages <= 1) return '';
  
  const links = [];
  
  // Previous link
  if (currentPage > 1) {
    links.push(`<a href="${escapeHtml(urlBuilder(currentPage - 1))}" class="pagination-link">← Previous</a>`);
  }
  
  // Page numbers
  for (let i = 1; i <= totalPages; i++) {
    if (i === currentPage) {
      links.push(`<span class="pagination-current">${i}</span>`);
    } else if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= 2) {
      links.push(`<a href="${escapeHtml(urlBuilder(i))}" class="pagination-link">${i}</a>`);
    } else if (Math.abs(i - currentPage) === 3) {
      links.push(`<span class="pagination-ellipsis">…</span>`);
    }
  }
  
  // Next link
  if (currentPage < totalPages) {
    links.push(`<a href="${escapeHtml(urlBuilder(currentPage + 1))}" class="pagination-link">Next →</a>`);
  }
  
  return `<div class="pagination">${links.join('')}</div>`;
}

/**
 * Key-Value Display Component
 * Consistent key-value pair rendering
 * 
 * @param {Object} spec - KV specification
 * @param {string} spec.key - Key label
 * @param {string} spec.value - Value content
 * @param {Object} context - Render context
 * @returns {string} Key-value HTML
 */
function kv(spec, context) {
  spec = spec || {};
  const { escapeHtml } = context;
  
  const key = spec.key || '';
  const value = spec.value || '';
  
  return `<div class="kv"><span class="k">${escapeHtml(key)}:</span> <span class="v">${value}</span></div>`;
}

module.exports = {
  pageLayout,
  pill,
  dataTable,
  formField,
  formFilters,
  errorPage,
  emptyState,
  pagination,
  kv
};
