const { ensureDb } = require('../src/data/db/sqlite');

const db = ensureDb('data/news.db');

console.log('--- Investigation: Duplicates by Name/Country/Kind ---');
const exactDuplicates = db.prepare(`
  SELECT 
    p.country_code, 
    p.kind, 
    pn.normalized, 
    COUNT(DISTINCT p.id) as count,
    GROUP_CONCAT(p.id) as ids
  FROM places p
  JOIN place_names pn ON p.id = pn.place_id
  WHERE p.country_code IS NOT NULL 
    AND pn.is_preferred = 1
  GROUP BY p.country_code, p.kind, pn.normalized
  HAVING count > 1
  ORDER BY count DESC
  LIMIT 20
`).all();

console.table(exactDuplicates);

console.log('\n--- Investigation: Vaduz Specifics ---');
const vaduzIds = [439, 1002533];
const vaduzDetails = db.prepare(`
  SELECT p.id, p.kind, p.source, pe.source as ext_source, pe.ext_id
  FROM places p
  LEFT JOIN place_external_ids pe ON p.id = pe.place_id
  WHERE p.id IN (?, ?)
`).all(...vaduzIds);

console.table(vaduzDetails);

console.log('\n--- Investigation: Duplicates by Name/Country (Ignoring Kind) ---');
const kindDuplicates = db.prepare(`
  SELECT 
    p.country_code, 
    pn.normalized, 
    COUNT(DISTINCT p.kind) as kind_count,
    GROUP_CONCAT(DISTINCT p.kind) as kinds,
    GROUP_CONCAT(p.id) as ids
  FROM places p
  JOIN place_names pn ON p.id = pn.place_id
  WHERE p.country_code IS NOT NULL 
    AND pn.is_preferred = 1
  GROUP BY p.country_code, pn.normalized
  HAVING COUNT(DISTINCT p.id) > 1
  ORDER BY kind_count DESC
  LIMIT 20
`).all();

console.table(kindDuplicates);
