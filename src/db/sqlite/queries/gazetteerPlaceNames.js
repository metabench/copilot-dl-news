/**
 * Gazetteer place names query functions
 */

/**
 * Get all place names (canonical and alternate) for place hub verification
 * @param {import('better-sqlite3').Database} db
 * @returns {Set<string>} Set of lowercase place names
 */
function getAllPlaceNames(db) {
  const placeNames = new Set();
  
  try {
    const rows = db.prepare(`
      SELECT name 
      FROM place_names
    `).all();
    
    rows.forEach(row => {
      if (row.name) {
        placeNames.add(row.name.toLowerCase());
      }
    });
  } catch (err) {
    console.error('Failed to load gazetteer place names:', err.message);
  }
  
  return placeNames;
}

module.exports = {
  getAllPlaceNames
};
