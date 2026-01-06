const { createSQLiteDatabase } = require('../src/db/sqlite');
const db = createSQLiteDatabase('data/news.db');

const places = db.db.prepare(`
  SELECT pn.name, p.kind, p.population 
  FROM places p
  JOIN place_names pn ON p.canonical_name_id = pn.id
  WHERE p.country_code = 'CO' 
  ORDER BY p.population DESC 
  LIMIT 20
`).all();

console.log('Top Colombian Places:');
places.forEach(p => console.log(`${p.kind}: ${p.name}`));
