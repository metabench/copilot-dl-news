'use strict';

/**
 * controlFactory.js - Reusable jsgui3 control creation helpers
 * 
 * Provides DRY factory functions for common UI patterns:
 * - el() - Simple element creation
 * - createSection() - Section with emoji header
 * - createStatItem() - Value/label stat pairs
 * - createActionButton() - Styled action buttons
 * - formatNumber() / formatLabel() - Text formatting
 * 
 * @example
 *   const { el, createSection, formatLabel } = require('./helpers/controlFactory')(jsgui);
 *   
 *   const section = createSection(ctx, '📊', 'Statistics', 'stats-section');
 *   section.add(el(ctx, 'p', 'Some content', 'content-class'));
 */

/**
 * Create the factory bound to a jsgui instance
 * @param {Object} jsgui - The jsgui3 instance
 * @returns {Object} Factory functions
 */
function createControlFactory(jsgui) {
  if (!jsgui) {
    throw new Error('jsgui instance is required');
  }
  
  const { Control } = jsgui;
  
  // ─────────────────────────────────────────────────────────────────────────
  // Text Formatting Utilities
  // ─────────────────────────────────────────────────────────────────────────
  
  /**
   * Format a number with locale-aware thousands separators
   * @param {number|string} value - Value to format
   * @returns {string} Formatted string
   */
  function formatNumber(value) {
    if (typeof value === 'number') return value.toLocaleString();
    return String(value);
  }
  
  /**
   * Convert snake_case or camelCase key to Title Case label
   * @param {string} key - Key to format
   * @returns {string} Formatted label
   */
  function formatLabel(key) {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .trim()
      .replace(/\b\w/g, c => c.toUpperCase());
  }
  
  /**
   * Format bytes to human-readable size
   * @param {number} bytes - Byte count
   * @returns {string} Formatted size (e.g., "2.5 MB")
   */
  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const exp = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const value = bytes / (1024 ** exp);
    const fixed = value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2);
    return `${fixed} ${units[exp]}`;
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Element Creation Helpers
  // ─────────────────────────────────────────────────────────────────────────
  
  /**
   * Create a simple text element
   * @param {Object} context - jsgui context
   * @param {string} tagName - HTML tag
   * @param {string} [text] - Text content
   * @param {string} [className] - CSS class
   * @returns {Control}
   */
  function el(context, tagName, text, className) {
    const ctrl = new Control({ context, tagName });
    if (className) ctrl.add_class(className);
    if (text) ctrl.add(text);
    return ctrl;
  }
  
  /**
   * Create a div with optional class and content
   * @param {Object} context - jsgui context
   * @param {string} [className] - CSS class
   * @param {string} [text] - Text content
   * @returns {Control}
   */
  function div(context, className, text) {
    return el(context, 'div', text, className);
  }
  
  /**
   * Create a span with optional class and content
   * @param {Object} context - jsgui context
   * @param {string} [className] - CSS class
   * @param {string} [text] - Text content
   * @returns {Control}
   */
  function span(context, className, text) {
    return el(context, 'span', text, className);
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Composite Control Helpers
  // ─────────────────────────────────────────────────────────────────────────
  
  /**
   * Create a section with emoji header
   * @param {Object} context - jsgui context
   * @param {string} emoji - Section emoji
   * @param {string} title - Section title
   * @param {string} [className] - Section CSS class
   * @returns {Control}
   */
  function createSection(context, emoji, title, className) {
    const section = new Control({ context, tagName: 'section' });
    section.add_class(className || 'dashboard-section');
    section.add(el(context, 'h2', `${emoji} ${title}`));
    return section;
  }
  
  /**
   * Create a stat item (value + label pair)
   * @param {Object} context - jsgui context
   * @param {string} label - Stat label
   * @param {string|number} value - Stat value
   * @param {string} [className] - Container class
   * @returns {Control}
   */
  function createStatItem(context, label, value, className = 'stat-item') {
    const item = new Control({ context, tagName: 'div' });
    item.add_class(className);
    item.add(el(context, 'span', formatNumber(value), 'stat-value'));
    item.add(el(context, 'span', label, 'stat-label'));
    return item;
  }
  
  /**
   * Create an action button
   * @param {Object} context - jsgui context
   * @param {string} emoji - Button emoji
   * @param {string} label - Button text
   * @param {string} action - data-action attribute value
   * @param {string} variant - 'primary', 'secondary', or 'danger'
   * @param {boolean} [disabled] - Whether button is disabled
   * @returns {Control}
   */
  function createActionButton(context, emoji, label, action, variant, disabled = false) {
    const btn = new Control({ context, tagName: 'button' });
    btn.add_class('action-btn');
    btn.add_class(`btn-${variant}`);
    btn.dom.attributes['data-action'] = action;
    if (disabled) btn.dom.attributes.disabled = 'true';
    btn.add(`${emoji} ${label}`);
    return btn;
  }
  
  /**
   * Create a grid container
   * @param {Object} context - jsgui context
   * @param {string} [className] - Grid CSS class
   * @returns {Control}
   */
  function createGrid(context, className = 'grid') {
    return div(context, className);
  }
  
  /**
   * Create a badge element
   * @param {Object} context - jsgui context
   * @param {string} text - Badge text
   * @param {string} [variant] - Badge variant (e.g., 'success', 'warning', 'error')
   * @returns {Control}
   */
  function createBadge(context, text, variant) {
    const badge = span(context, 'badge', text);
    if (variant) badge.add_class(`badge-${variant}`);
    return badge;
  }
  
  // Return the factory API
  return {
    // Formatters
    formatNumber,
    formatLabel,
    formatBytes,
    
    // Element creators
    el,
    div,
    span,
    
    // Composite helpers
    createSection,
    createStatItem,
    createActionButton,
    createGrid,
    createBadge
  };
}

module.exports = createControlFactory;
