/**
 * src/db/sqlite/v1/UtilityFunctions.js
 *
 * Utility functions for database operations.
 * Separated from main NewsDatabase class to reduce complexity.
 */

function slugifyCountryName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\band\b/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeHostVariants(host) {
  const base = String(host || '').trim().toLowerCase();
  if (!base) return [];
  const variants = new Set([base]);
  if (base.startsWith('www.')) {
    variants.add(base.replace(/^www\./, ''));
  } else {
    variants.add(`www.${base}`);
  }
  return Array.from(variants);
}

function buildInClausePlaceholders(values) {
  return values.map(() => '?').join(', ');
}

function safeParseJson(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (_) { return value; }
}

module.exports = {
  slugifyCountryName,
  normalizeHostVariants,
  buildInClausePlaceholders,
  safeParseJson
};