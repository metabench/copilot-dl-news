const { ensureDb } = require('../src/data/db/sqlite');
const fs = require('fs');

const db = ensureDb('data/news.db');

// CLI Args
const args = process.argv.slice(2);
const MODE_SCAN = args.includes('--scan');
const MODE_RESOLVE = args.includes('--resolve');
const MODE_EXECUTE = args.includes('--execute');
const LIMIT_IDX = args.indexOf('--limit');
const LIMIT = LIMIT_IDX !== -1 ? parseInt(args[LIMIT_IDX + 1], 10) : -1;
const REPORT_IDX = args.indexOf('--report');
const REPORT_FILE = REPORT_IDX !== -1 ? args[REPORT_IDX + 1] : null;

if (!MODE_SCAN && !MODE_RESOLVE && !MODE_EXECUTE) {
  console.log(`
Usage: node tools/gazetteer-dedupe.js [options]

Options:
  --scan      Find and list duplicate clusters.
  --resolve   Analyze clusters and determine merge plan (Dry Run).
  --execute   Execute the merge plan (Modifies Database).
  --limit <n> Limit the number of clusters to process (default: all).
  --report <file> Export conflict report to Markdown file.
`);
  process.exit(0);
}

console.log(`--- Gazetteer Deduplication Tool (${MODE_EXECUTE ? 'EXECUTE' : 'DRY RUN'}) ---`);

// 1. Find Clusters
const findClusters = () => {
  console.log('Scanning for duplicate clusters...');
  return db.prepare(`
    SELECT 
      p.country_code, 
      pn.normalized, 
      COUNT(DISTINCT p.id) as count,
      GROUP_CONCAT(p.id) as ids_str
    FROM places p
    JOIN place_names pn ON p.id = pn.place_id
    WHERE p.country_code IS NOT NULL 
      AND pn.is_preferred = 1
      AND pn.normalized != ''
    GROUP BY p.country_code, pn.normalized
    HAVING count > 1
    ORDER BY count DESC
    LIMIT ?
  `).all(LIMIT);
};

// Helper: Haversine Distance (km)
const haversineDistance = (a, b) => {
  if (!a.lat || !a.lng || !b.lat || !b.lng) return 0;
  const toRad = x => x * Math.PI / 180;
  const R = 6371; 
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
  return R * c;
};

// 2. Gather Data for Candidates
const gatherCandidateData = (ids) => {
  return ids.map(id => {
    const info = db.prepare('SELECT id, source, kind, lat, lng FROM places WHERE id = ?').get(id);
    const extIds = db.prepare('SELECT COUNT(*) as c FROM place_external_ids WHERE place_id = ?').get(id).c;
    const attrs = db.prepare('SELECT COUNT(*) as c FROM place_attributes WHERE place_id = ?').get(id).c;
    
    // Get actual parent IDs for conflict checking
    const parents = db.prepare('SELECT parent_id FROM place_hierarchy WHERE child_id = ?').all(id).map(r => r.parent_id);
    const childrenCount = db.prepare('SELECT COUNT(*) as c FROM place_hierarchy WHERE parent_id = ?').get(id).c;
    
    return { 
      ...info, 
      extIds, 
      attrs, 
      parents, // Array of parent IDs
      childrenCount 
    };
  });
};

// 3. Guard: Check for Conflicts (Parent & Spatial & Ancestry)
const checkConflicts = (candidates) => {
  // A. Spatial Conflict Check (> 50km)
  const locs = candidates.filter(c => c.lat != null && c.lng != null);
  for (let i = 0; i < locs.length; i++) {
    for (let j = i + 1; j < locs.length; j++) {
      const dist = haversineDistance(locs[i], locs[j]);
      if (dist > 50) {
        return { type: 'spatial', message: `${dist.toFixed(1)}km apart`, ids: [locs[i].id, locs[j].id] };
      }
    }
  }

  // B. Ancestry Loop Check (Parent-Child Relationship)
  // If Candidate A is an ancestor of Candidate B, we cannot merge them (would create a cycle or merge parent into child).
  // We need to check if any candidate ID appears in the parent list of another candidate.
  // Note: c.parents is immediate parents. We might need recursive check? 
  // For now, let's check immediate parents. If A is parent of B, B.parents includes A.id.
  for (let i = 0; i < candidates.length; i++) {
    for (let j = 0; j < candidates.length; j++) {
      if (i === j) continue;
      const candA = candidates[i];
      const candB = candidates[j];
      if (candB.parents.includes(candA.id)) {
        return { type: 'ancestry', message: `ID ${candA.id} is parent of ID ${candB.id}`, ids: [candA.id, candB.id] };
      }
    }
  }

  // C. Parent Hierarchy Conflict Check
  // If candidates have DIFFERENT parents, they might be distinct entities (e.g. Springfield IL vs Springfield MA)
  // We only care if they HAVE parents. If one has no parents, it's not a conflict, just missing data.
  
  const parentSets = candidates
    .filter(c => c.parents.length > 0)
    .map(c => ({ id: c.id, parents: new Set(c.parents) }));

  if (parentSets.length < 2) return null; // 0 or 1 candidate with parents -> no conflict possible

  // Pairwise check: Every pair must satisfy the subset relationship
  // If Set A is not a subset of Set B AND Set B is not a subset of Set A, 
  // then they have divergent ancestry (e.g. {US, IL} vs {US, MA}).
  for (let i = 0; i < parentSets.length; i++) {
    for (let j = i + 1; j < parentSets.length; j++) {
      const setA = parentSets[i].parents;
      const setB = parentSets[j].parents;
      
      // Check if A is subset of B
      const aSubB = [...setA].every(val => setB.has(val));
      // Check if B is subset of A
      const bSubA = [...setB].every(val => setA.has(val));
      
      if (!aSubB && !bSubA) {
        // Divergent ancestry detected!
        // Get parent names for better reporting? (Requires DB lookup, maybe too slow/complex here)
        return { type: 'hierarchy', message: 'Divergent ancestry', ids: [parentSets[i].id, parentSets[j].id] };
      }
    }
  }
  return null;
};

// 4. Score Candidates
const scoreCandidate = (c) => {
  let score = 0;
  score += c.extIds * 50;          // Tier 1: Ext IDs (Richness)
  score += (c.parents.length + c.childrenCount) * 10; // Tier 2: Hierarchy
  score += c.attrs * 5;            // Tier 3: Attributes
  
  if (c.source === 'wikidata') score += 2; // Tier 4: Source
  else if (c.source === 'restcountries') score += 1;
  
  // Tier 5: Low ID is tiebreaker (handled in sort)
  return score;
};

// Main Logic
const clusters = findClusters();
console.log(`Found ${clusters.length} clusters.`);

if (MODE_SCAN) {
  clusters.forEach(c => {
    console.log(`[${c.country_code}] ${c.normalized} (${c.count} items) IDs: ${c.ids_str}`);
  });
  process.exit(0);
}

let resolvedCount = 0;
let skippedCount = 0;
let conflictCount = 0;
const conflicts = [];

const executeMerge = db.transaction((survivor, victims) => {
  const survivorId = survivor.id;
  
  for (const victim of victims) {
    const victimId = victim.id;
    
    // 1. Migrate External IDs
    db.prepare(`UPDATE OR IGNORE place_external_ids SET place_id = ? WHERE place_id = ?`).run(survivorId, victimId);
    
    // 2. Migrate Names
    db.prepare(`UPDATE OR IGNORE place_names SET place_id = ? WHERE place_id = ?`).run(survivorId, victimId);
    
    // 3. Migrate Hierarchy (As Child)
    db.prepare(`UPDATE OR IGNORE place_hierarchy SET child_id = ? WHERE child_id = ?`).run(survivorId, victimId);
    
    // 4. Migrate Hierarchy (As Parent)
    db.prepare(`UPDATE OR IGNORE place_hierarchy SET parent_id = ? WHERE parent_id = ?`).run(survivorId, victimId);
    
    // 5. Migrate Attributes
    db.prepare(`UPDATE OR IGNORE place_attributes SET place_id = ? WHERE place_id = ?`).run(survivorId, victimId);
    
    // 6. Delete Victim
    db.prepare(`DELETE FROM places WHERE id = ?`).run(victimId);
    
    // Cleanup leftovers (orphaned records that failed UPDATE OR IGNORE due to conflict)
    // We delete them because the survivor already has that data.
    db.prepare(`DELETE FROM place_external_ids WHERE place_id = ?`).run(victimId);
    db.prepare(`DELETE FROM place_names WHERE place_id = ?`).run(victimId);
    db.prepare(`DELETE FROM place_hierarchy WHERE child_id = ? OR parent_id = ?`).run(victimId, victimId);
    db.prepare(`DELETE FROM place_attributes WHERE place_id = ?`).run(victimId);
  }
});

for (const cluster of clusters) {
  const ids = [...new Set(cluster.ids_str.split(',').map(Number))];
  const candidates = gatherCandidateData(ids);
  
  // Guard
  const conflict = checkConflicts(candidates);
  if (conflict) {
    console.log(`[SKIP] Conflict detected for "${cluster.normalized}" (${cluster.country_code}). ${conflict.message}`);
    conflictCount++;
    if (REPORT_FILE) {
      conflicts.push({
        name: cluster.normalized,
        country: cluster.country_code,
        type: conflict.type,
        message: conflict.message,
        ids: conflict.ids
      });
    }
    continue;
  }

  // Score
  candidates.forEach(c => c.score = scoreCandidate(c));
  
  // Sort: Descending Score, then Ascending ID
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.id - b.id;
  });

  const survivor = candidates[0];
  const victims = candidates.slice(1);

  if (MODE_RESOLVE) {
    console.log(`\nCluster: "${cluster.normalized}" (${cluster.country_code})`);
    console.log(`  Survivor: ID ${survivor.id} (Score: ${survivor.score}) [Ext:${survivor.extIds}, Hier:${survivor.parents.length + survivor.childrenCount}]`);
    victims.forEach(v => {
      console.log(`  Victim:   ID ${v.id} (Score: ${v.score}) -> Merge into ${survivor.id}`);
    });
    resolvedCount++;
  }

  if (MODE_EXECUTE) {
    try {
      executeMerge(survivor, victims);
      console.log(`[MERGED] "${cluster.normalized}" (${cluster.country_code}): ${victims.length} merged into ${survivor.id}`);
      resolvedCount++;
    } catch (err) {
      console.error(`[ERROR] Failed to merge "${cluster.normalized}": ${err.message}`);
      skippedCount++;
    }
  }
}

console.log('\n--- Summary ---');
console.log(`Processed: ${clusters.length}`);
console.log(`Resolved/Merged: ${resolvedCount}`);
console.log(`Conflicts (Skipped): ${conflictCount}`);
if (MODE_EXECUTE) console.log(`Errors: ${skippedCount}`);

if (REPORT_FILE && conflicts.length > 0) {
  const reportContent = `# Gazetteer Deduplication Conflicts Report
Generated: ${new Date().toISOString()}

| Name | Country | Type | Message | IDs |
|------|---------|------|---------|-----|
${conflicts.map(c => `| ${c.name} | ${c.country} | ${c.type} | ${c.message} | ${c.ids.join(', ')} |`).join('\n')}
`;
  fs.writeFileSync(REPORT_FILE, reportContent);
  console.log(`\nConflict report written to ${REPORT_FILE}`);
}
