const { ensureDb } = require('../src/data/db/sqlite');

const db = ensureDb('data/news.db');

console.log('--- Deep Investigation: Duplicate Cluster Quality ---');

// 1. Find Clusters
const clusters = db.prepare(`
  SELECT 
    p.country_code, 
    p.kind, 
    pn.normalized, 
    COUNT(DISTINCT p.id) as count,
    GROUP_CONCAT(p.id) as ids_str
  FROM places p
  JOIN place_names pn ON p.id = pn.place_id
  WHERE p.country_code IS NOT NULL 
    AND pn.is_preferred = 1
  GROUP BY p.country_code, p.kind, pn.normalized
  HAVING count > 1
  ORDER BY count DESC
  LIMIT 50
`).all();

console.log(`Found ${clusters.length} clusters to analyze.`);

const scenarios = {
  one_ext_id: 0,      // Easy win
  multi_ext_id: 0,    // Conflict?
  no_ext_id: 0,       // Low info
  mixed_sources: 0,   // e.g. wikidata vs restcountries
  hierarchy_diff: 0   // One has parents/children, other doesn't
};

const detailedSamples = [];

for (const cluster of clusters) {
  const ids = cluster.ids_str.split(',').map(Number);
  
  // Get details for each ID in cluster
  const members = ids.map(id => {
    const info = db.prepare('SELECT id, source, kind FROM places WHERE id = ?').get(id);
    const extIds = db.prepare('SELECT COUNT(*) as c FROM place_external_ids WHERE place_id = ?').get(id).c;
    const attrs = db.prepare('SELECT COUNT(*) as c FROM place_attributes WHERE place_id = ?').get(id).c;
    const parents = db.prepare('SELECT COUNT(*) as c FROM place_hierarchy WHERE child_id = ?').get(id).c;
    const children = db.prepare('SELECT COUNT(*) as c FROM place_hierarchy WHERE parent_id = ?').get(id).c;
    
    return { ...info, extIds, attrs, parents, children };
  });

  // Analyze Scenario
  const withExt = members.filter(m => m.extIds > 0);
  const withHierarchy = members.filter(m => m.parents > 0 || m.children > 0);
  const sources = new Set(members.map(m => m.source));

  if (withExt.length === 1) scenarios.one_ext_id++;
  else if (withExt.length > 1) scenarios.multi_ext_id++;
  else scenarios.no_ext_id++;

  if (sources.size > 1) scenarios.mixed_sources++;
  if (withHierarchy.length > 0 && withHierarchy.length < members.length) scenarios.hierarchy_diff++;

  // Keep interesting samples
  if (detailedSamples.length < 5) {
    detailedSamples.push({
      name: cluster.normalized,
      country: cluster.country_code,
      members
    });
  } else if (withExt.length > 1 && detailedSamples.length < 8) {
     // Prioritize showing multi-ext-id conflicts
     detailedSamples.push({
      name: cluster.normalized + " (MULTI-EXT CONFLICT)",
      country: cluster.country_code,
      members
    });
  }
}

console.log('\n--- Scenario Statistics (Top 50 Clusters) ---');
console.table(scenarios);

console.log('\n--- Detailed Samples ---');
detailedSamples.forEach(s => {
  console.log(`\nCluster: ${s.name} (${s.country})`);
  console.table(s.members);
});
