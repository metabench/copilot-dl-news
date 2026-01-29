// Shared helpers for constructing DOM instances.
// Now delegates to domFactory.js for multi-engine support.
const { createDom, createSilentVirtualConsole } = require('./domFactory');

function createJsdom(html = '', options = {}) {
  // Maintain backward compatibility by forcing 'jsdom' engine
  // unless explicitly overridden in options (which shouldn't happen in legacy calls)
  return createDom(html, { ...options, engine: 'jsdom' });
}

module.exports = {
  createSilentVirtualConsole,
  createJsdom,
  createDom // Export createDom for consumers who want to choose
};
