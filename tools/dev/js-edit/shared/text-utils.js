/**
 * Normalizes text for fuzzy comparison by collapsing whitespace.
 * @param {string} text 
 * @returns {string}
 */
function normalizeText(text) {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
}

module.exports = {
  normalizeText
};
