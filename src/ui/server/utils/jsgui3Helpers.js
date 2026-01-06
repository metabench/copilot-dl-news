'use strict';

/**
 * jsgui3 SSR Helpers
 * 
 * jsgui3 Control does NOT automatically render the 'text' property from the constructor.
 * Text content must be added as a Text_Node child. These helpers simplify the pattern.
 */

const jsgui = require('jsgui3-html');

/**
 * Add text content to a control using Text_Node
 * @param {jsgui.Page_Context} ctx - jsgui context
 * @param {jsgui.Control} parent - Parent control to add text to
 * @param {string} text - Text content
 * @returns {jsgui.Control} The parent control (for chaining)
 */
function addText(ctx, parent, text) {
  parent.add(new jsgui.Text_Node({ context: ctx, text: String(text) }));
  return parent;
}

/**
 * Create a Control with text content
 * @param {jsgui.Page_Context} ctx - jsgui context
 * @param {string} tagName - HTML tag name (e.g., 'div', 'span', 'td')
 * @param {string} text - Text content
 * @param {Object} options - Optional style and attr objects
 * @returns {jsgui.Control} The created control with text
 */
function makeTextEl(ctx, tagName, text, options = {}) {
  const el = new jsgui.Control({
    context: ctx,
    tagName,
    style: options.style,
    attr: options.attr
  });
  if (text !== undefined && text !== null && text !== '') {
    addText(ctx, el, text);
  }
  return el;
}

/**
 * Create a link (<a>) with text content
 * @param {jsgui.Page_Context} ctx - jsgui context
 * @param {string} text - Link text
 * @param {string} href - Link URL
 * @param {Object} style - Optional style object
 * @returns {jsgui.Control} The created <a> control
 */
function makeLink(ctx, text, href, style = {}) {
  return makeTextEl(ctx, 'a', text, {
    attr: { href },
    style: { color: '#0066cc', textDecoration: 'none', ...style }
  });
}

/**
 * Create a button with text content
 * @param {jsgui.Page_Context} ctx - jsgui context
 * @param {string} text - Button text
 * @param {Object} options - id, type, style
 * @returns {jsgui.Control} The created button control
 */
function makeButton(ctx, text, options = {}) {
  return makeTextEl(ctx, 'button', text, {
    attr: { id: options.id, type: options.type || 'button' },
    style: options.style
  });
}

/**
 * Create a table cell (<td>) with text content
 * @param {jsgui.Page_Context} ctx - jsgui context
 * @param {string} text - Cell text
 * @param {Object} style - Optional style object
 * @returns {jsgui.Control} The created <td> control
 */
function makeTd(ctx, text, style = {}) {
  const defaultStyle = { padding: '6px', borderBottom: '1px solid #eee' };
  return makeTextEl(ctx, 'td', text, { style: { ...defaultStyle, ...style } });
}

/**
 * Create a table header cell (<th>) with text content
 * @param {jsgui.Page_Context} ctx - jsgui context
 * @param {string} text - Header text
 * @param {Object} style - Optional style object
 * @returns {jsgui.Control} The created <th> control
 */
function makeTh(ctx, text, style = {}) {
  const defaultStyle = {
    textAlign: 'left',
    padding: '8px',
    borderBottom: '2px solid #ddd',
    background: '#f5f5f5'
  };
  return makeTextEl(ctx, 'th', text, { style: { ...defaultStyle, ...style } });
}

module.exports = {
  addText,
  makeTextEl,
  makeLink,
  makeButton,
  makeTd,
  makeTh
};
