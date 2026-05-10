/**
 * Continent data for place hub tracking
 * 
 * Continents are a specific type of place hub (geographic regions).
 * The hierarchy is: Continent > Country > Region > City
 */

const CONTINENTS = [
  { name: 'Africa', code: 'AF', slug: 'africa' },
  { name: 'Antarctica', code: 'AN', slug: 'antarctica' },
  { name: 'Asia', code: 'AS', slug: 'asia' },
  { name: 'Europe', code: 'EU', slug: 'europe' },
  { name: 'North America', code: 'NA', slug: 'north-america' },
  { name: 'Oceania', code: 'OC', slug: 'oceania' },
  { name: 'South America', code: 'SA', slug: 'south-america' }
];

/**
 * Get all continent names (lowercase for matching)
 * @returns {Set<string>} Set of continent names in lowercase
 */
function getContinentNames() {
  return new Set(CONTINENTS.map(c => c.name.toLowerCase()));
}

/**
 * Get continent by name (case-insensitive)
 * @param {string} name - Continent name
 * @returns {Object|null} Continent object or null
 */
function getContinentByName(name) {
  if (!name) return null;
  const normalized = name.toLowerCase().trim();
  return CONTINENTS.find(c => c.name.toLowerCase() === normalized) || null;
}

/**
 * Get continent by slug
 * @param {string} slug - Continent slug
 * @returns {Object|null} Continent object or null
 */
function getContinentBySlug(slug) {
  if (!slug) return null;
  const normalized = slug.toLowerCase().trim();
  return CONTINENTS.find(c => c.slug === normalized) || null;
}

module.exports = {
  CONTINENTS,
  getContinentNames,
  getContinentByName,
  getContinentBySlug
};
