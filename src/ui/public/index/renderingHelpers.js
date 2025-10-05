/**
 * Rendering Helper Functions
 * Pure functions for UI rendering with no side effects.
 * Uses lang-tools for compact, readable syntax.
 */

const { tof, is_defined, is_array } = require('lang-tools');

/**
 * Compact JSON details for display, truncating if too long.
 * @param {*} details - Any value to display
 * @returns {string} Compacted string representation
 */
export function compactDetails(details) {
  if (!is_defined(details)) return '';
  if (tof(details) === 'string') return details;
  try {
    const json = JSON.stringify(details, null, 2) || '';
    return json.length > 400 ? json.slice(0, 400) + '…' : json;
  } catch (_) {
    return '';
  }
}

/**
 * Format feature key into human-readable name.
 * Converts snake_case, kebab-case, and camelCase to Title Case.
 * @param {string} key - Feature key to format
 * @returns {string} Formatted feature name
 */
export function formatFeatureName(key) {
  if (!is_defined(key)) return 'Unknown feature';
  const str = String(key);
  const spaced = str
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Extract numeric value from entry (handles objects with .value property).
 * @param {number|object|*} entry - Entry to extract number from
 * @returns {number} Extracted number or 0
 */
export function numericValue(entry) {
  if (entry == null) return 0;
  if (tof(entry) === 'number' && Number.isFinite(entry)) return entry;
  if (tof(entry) === 'object' && is_defined(entry.value)) {
    const n = Number(entry.value);
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(entry);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Extract description text from entry object.
 * @param {object} entry - Entry with description or category
 * @returns {string} Description text or empty string
 */
export function describeEntry(entry) {
  if (!is_defined(entry) || tof(entry) !== 'object') return '';
  if (is_defined(entry.description)) return String(entry.description);
  if (is_defined(entry.category)) return String(entry.category);
  return '';
}

/**
 * Render feature flags as DOM list (impure: modifies DOM).
 * @param {object} features - Feature flags object
 * @param {HTMLElement} containerEl - Container element to render into
 */
export function renderFeatureFlags(features, containerEl) {
  if (!is_defined(containerEl)) return;
  
  containerEl.innerHTML = '';
  containerEl.setAttribute('role', 'list');
  
  const t = tof(features);
  const entries = (t === 'object' && !is_array(features))
    ? Object.entries(features)
    : [];
  
  if (!entries.length) {
    const span = document.createElement('span');
    span.className = 'muted';
    span.textContent = 'No advanced feature flags configured.';
    containerEl.appendChild(span);
    return;
  }
  
  entries.sort(([a], [b]) => a.localeCompare(b));
  
  for (const [key, value] of entries) {
    const row = document.createElement('div');
    row.className = 'feature-flags__row';
    row.setAttribute('role', 'listitem');
    
    const badge = document.createElement('span');
    badge.className = value ? 'badge badge-ok' : 'badge badge-neutral';
    badge.textContent = value ? 'On' : 'Off';
    row.appendChild(badge);
    
    const label = document.createElement('span');
    label.textContent = formatFeatureName(key);
    row.appendChild(label);
    
    containerEl.appendChild(row);
  }
}

/**
 * Render analysis status section (impure: modifies DOM).
 * @param {string} summary - Summary text
 * @param {object} options - Options object
 * @param {Array} options.metrics - Array of metric objects
 * @param {boolean} options.muted - Whether to show muted styling
 * @param {object} elements - DOM elements object
 * @param {HTMLElement} elements.statusEl - Main status element
 * @param {HTMLElement} elements.summaryEl - Summary text element
 * @param {HTMLElement} elements.metricsEl - Metrics list element
 */
export function renderAnalysisStatus(summary, options, elements) {
  if (!is_defined(elements) || !is_defined(elements.statusEl)) return;
  
  const {
    metrics = [],
    muted = false
  } = options || {};
  
  const summaryText = summary || 'No analysis runs yet.';
  
  if (is_defined(elements.summaryEl)) {
    elements.summaryEl.textContent = summaryText;
  } else {
    const metricsText = metrics.length
      ? ' · ' + metrics.map((entry) => `${entry.label}: ${entry.value}`).join(' · ')
      : '';
    elements.statusEl.textContent = summaryText + metricsText;
  }
  
  if (is_defined(elements.metricsEl)) {
    elements.metricsEl.textContent = '';
    if (metrics.length) {
      for (const entry of metrics) {
        if (!is_defined(entry) || !is_defined(entry.label) || entry.value == null) continue;
        
        const li = document.createElement('li');
        li.className = 'analysis-status__metric';
        
        const label = document.createElement('span');
        label.className = 'analysis-status__metric-label';
        label.textContent = entry.label;
        
        const value = document.createElement('span');
        value.className = 'analysis-status__metric-value';
        value.textContent = entry.value;
        if (is_defined(entry.title)) value.title = entry.title;
        
        li.appendChild(label);
        li.appendChild(value);
        elements.metricsEl.appendChild(li);
      }
    }
  }
  
  elements.statusEl.classList.toggle('muted', muted || (!summary && !metrics.length));
}

/**
 * Render priority bonuses list (impure: modifies DOM).
 * @param {object} queueConfig - Queue configuration object
 * @param {HTMLElement} containerEl - Container element to render into
 */
export function renderPriorityBonuses(queueConfig, containerEl) {
  if (!is_defined(containerEl)) return;
  
  containerEl.innerHTML = '';
  containerEl.setAttribute('role', 'list');
  
  const bonuses = (is_defined(queueConfig) && tof(queueConfig) === 'object')
    ? queueConfig.bonuses
    : null;
  const entries = (is_defined(bonuses) && tof(bonuses) === 'object')
    ? Object.entries(bonuses)
    : [];
  
  if (!entries.length) {
    const span = document.createElement('span');
    span.className = 'muted';
    span.textContent = 'No priority bonuses configured.';
    containerEl.appendChild(span);
    return;
  }
  
  entries.sort((a, b) => numericValue(b[1]) - numericValue(a[1]));
  const subset = entries.slice(0, 4);
  
  for (const [key, raw] of subset) {
    const val = numericValue(raw);
    
    const row = document.createElement('div');
    row.className = 'priority-list__row';
    row.setAttribute('role', 'listitem');
    
    const head = document.createElement('div');
    head.className = 'priority-list__head';
    
    const badge = document.createElement('span');
    badge.className = 'badge badge-neutral';
    badge.textContent = `+${val}`;
    head.appendChild(badge);
    
    const label = document.createElement('strong');
    label.textContent = formatFeatureName(key);
    head.appendChild(label);
    
    row.appendChild(head);
    
    const desc = describeEntry(raw);
    if (desc) {
      const detail = document.createElement('span');
      detail.className = 'priority-list__detail muted';
      detail.textContent = desc;
      row.appendChild(detail);
    }
    
    containerEl.appendChild(row);
  }
}

/**
 * Render priority weights list (impure: modifies DOM).
 * @param {object} queueConfig - Queue configuration object
 * @param {HTMLElement} containerEl - Container element to render into
 */
export function renderPriorityWeights(queueConfig, containerEl) {
  if (!is_defined(containerEl)) return;
  
  containerEl.innerHTML = '';
  containerEl.setAttribute('role', 'list');
  
  const weights = (is_defined(queueConfig) && tof(queueConfig) === 'object')
    ? queueConfig.weights
    : null;
  const entries = (is_defined(weights) && tof(weights) === 'object')
    ? Object.entries(weights)
    : [];
  
  if (!entries.length) {
    const span = document.createElement('span');
    span.className = 'muted';
    span.textContent = 'No queue weights configured.';
    containerEl.appendChild(span);
    return;
  }
  
  entries.sort((a, b) => numericValue(a[1]) - numericValue(b[1]));
  const subset = entries.slice(0, 4);
  
  for (const [key, raw] of subset) {
    const val = numericValue(raw);
    
    const row = document.createElement('div');
    row.className = 'priority-list__row';
    row.setAttribute('role', 'listitem');
    
    const head = document.createElement('div');
    head.className = 'priority-list__head';
    
    const badge = document.createElement('span');
    badge.className = 'badge badge-neutral';
    badge.textContent = `${val}`;
    head.appendChild(badge);
    
    const label = document.createElement('strong');
    label.textContent = formatFeatureName(key);
    head.appendChild(label);
    
    row.appendChild(head);
    
    const desc = describeEntry(raw);
    if (desc) {
      const detail = document.createElement('span');
      detail.className = 'priority-list__detail muted';
      detail.textContent = desc;
      row.appendChild(detail);
    }
    
    containerEl.appendChild(row);
  }
}

/**
 * Render structure summary panel (impure: modifies DOM).
 * @param {object} structure - Structure summary object
 * @param {object} elements - DOM elements object
 * @param {HTMLElement} elements.panel - Panel container
 * @param {HTMLElement} elements.navPages - Nav pages counter
 * @param {HTMLElement} elements.articlesSkipped - Articles skipped counter
 * @param {HTMLElement} elements.topSections - Top sections list
 * @param {HTMLElement} elements.updated - Updated timestamp
 * @param {function} formatNumber - Number formatter function
 * @param {function} formatRelativeTime - Relative time formatter function
 * @returns {object|null} Structure summary or null
 */
export function renderStructureSummary(structure, elements, formatNumber, formatRelativeTime) {
  if (!is_defined(elements) || !is_defined(elements.panel)) return null;
  
  const lastStructureSummary = (is_defined(structure) && tof(structure) === 'object')
    ? { ...structure }
    : null;
  
  if (!is_defined(structure) || tof(structure) !== 'object') {
    elements.panel.dataset.hasData = '0';
    
    if (is_defined(elements.navPages)) elements.navPages.textContent = '0';
    if (is_defined(elements.articlesSkipped)) elements.articlesSkipped.textContent = '0';
    
    if (is_defined(elements.topSections)) {
      elements.topSections.textContent = '';
      const emptyItem = document.createElement('li');
      emptyItem.className = 'structure-list__empty';
      emptyItem.textContent = 'No sections discovered yet.';
      elements.topSections.appendChild(emptyItem);
    }
    
    if (is_defined(elements.updated)) {
      elements.updated.textContent = 'Awaiting crawl activity…';
    }
    
    if (elements.panel.dataset.active === '1') {
      elements.panel.style.display = '';
    }
    
    return lastStructureSummary;
  }
  
  elements.panel.dataset.hasData = '1';
  elements.panel.style.display = '';
  
  if (is_defined(elements.navPages)) {
    elements.navPages.textContent = formatNumber(structure.navPagesVisited || 0);
  }
  
  if (is_defined(elements.articlesSkipped)) {
    elements.articlesSkipped.textContent = formatNumber(structure.articleCandidatesSkipped || 0);
  }
  
  if (is_defined(elements.topSections)) {
    elements.topSections.textContent = '';
    const frag = document.createDocumentFragment();
    const entries = tof(structure.topSections) === 'array' ? structure.topSections : [];
    
    if (entries.length) {
      for (const entry of entries) {
        if (!is_defined(entry)) continue;
        
        const li = document.createElement('li');
        
        const name = document.createElement('span');
        name.textContent = entry.section || '/';
        
        const count = document.createElement('span');
        count.className = 'structure-list__count';
        count.textContent = formatNumber(entry.count || 0);
        
        li.appendChild(name);
        li.appendChild(count);
        frag.appendChild(li);
      }
    } else {
      const emptyItem = document.createElement('li');
      emptyItem.className = 'structure-list__empty';
      emptyItem.textContent = 'No sections discovered yet.';
      frag.appendChild(emptyItem);
    }
    
    elements.topSections.appendChild(frag);
  }
  
  if (is_defined(elements.updated)) {
    const updatedLabel = is_defined(structure.updatedAt)
      ? `Updated ${formatRelativeTime(structure.updatedAt)}`
      : 'Updated just now';
    elements.updated.textContent = updatedLabel;
  }
  
  return lastStructureSummary;
}
