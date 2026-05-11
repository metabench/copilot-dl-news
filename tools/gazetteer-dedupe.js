#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../src/db/openNewsCrawlerDb');

function printUsage() {
  console.log(`
Usage: node tools/gazetteer-dedupe.js [options]

Options:
  --scan       Find and list duplicate clusters.
  --resolve    Analyze clusters and determine merge plan (dry run).
  --execute    Execute the merge plan.
  --limit <n>  Limit the number of clusters to process (default: all).
  --report <file> Export conflict report to Markdown file.
  --db <file>  Database path (default: data/news.db).
`);
}

function parseArgs(argv = process.argv.slice(2)) {
  const limitIndex = argv.indexOf('--limit');
  const reportIndex = argv.indexOf('--report');
  const dbIndex = argv.indexOf('--db');

  return {
    scan: argv.includes('--scan'),
    resolve: argv.includes('--resolve'),
    execute: argv.includes('--execute'),
    limit: limitIndex !== -1 ? parseInt(argv[limitIndex + 1], 10) : -1,
    reportFile: reportIndex !== -1 ? argv[reportIndex + 1] : null,
    dbPath: dbIndex !== -1 ? argv[dbIndex + 1] : 'data/news.db'
  };
}

function getDedupeApi() {
  const dbModule = resolveNewsCrawlerDbModule();
  const required = [
    'listGazetteerDuplicateClusters',
    'getGazetteerDedupeCandidates',
    'mergeGazetteerDedupePlaces'
  ];

  for (const name of required) {
    if (typeof dbModule[name] !== 'function') {
      throw new Error(`news-crawler-db does not export ${name}. Build ../news-crawler-db first.`);
    }
  }

  return dbModule;
}

function haversineDistance(a, b) {
  if (!a.lat || !a.lng || !b.lat || !b.lng) return 0;
  const toRad = x => x * Math.PI / 180;
  const radiusKm = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return radiusKm * c;
}

function checkConflicts(candidates) {
  const locs = candidates.filter(c => c.lat != null && c.lng != null);
  for (let i = 0; i < locs.length; i += 1) {
    for (let j = i + 1; j < locs.length; j += 1) {
      const dist = haversineDistance(locs[i], locs[j]);
      if (dist > 50) {
        return { type: 'spatial', message: `${dist.toFixed(1)}km apart`, ids: [locs[i].id, locs[j].id] };
      }
    }
  }

  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = 0; j < candidates.length; j += 1) {
      if (i === j) continue;
      const candA = candidates[i];
      const candB = candidates[j];
      if (candB.parents.includes(candA.id)) {
        return { type: 'ancestry', message: `ID ${candA.id} is parent of ID ${candB.id}`, ids: [candA.id, candB.id] };
      }
    }
  }

  const parentSets = candidates
    .filter(c => c.parents.length > 0)
    .map(c => ({ id: c.id, parents: new Set(c.parents) }));

  if (parentSets.length < 2) return null;

  for (let i = 0; i < parentSets.length; i += 1) {
    for (let j = i + 1; j < parentSets.length; j += 1) {
      const setA = parentSets[i].parents;
      const setB = parentSets[j].parents;
      const aSubB = [...setA].every(val => setB.has(val));
      const bSubA = [...setB].every(val => setA.has(val));
      if (!aSubB && !bSubA) {
        return { type: 'hierarchy', message: 'Divergent ancestry', ids: [parentSets[i].id, parentSets[j].id] };
      }
    }
  }

  return null;
}

function scoreCandidate(c) {
  let score = 0;
  score += c.extIds * 50;
  score += (c.parents.length + c.childrenCount) * 10;
  score += c.attrs * 5;

  if (c.source === 'wikidata') score += 2;
  else if (c.source === 'restcountries') score += 1;

  return score;
}

function buildConflictReport(conflicts) {
  return `# Gazetteer Deduplication Conflicts Report
Generated: ${new Date().toISOString()}

| Name | Country | Type | Message | IDs |
|------|---------|------|---------|-----|
${conflicts.map(c => `| ${c.name} | ${c.country} | ${c.type} | ${c.message} | ${c.ids.join(', ')} |`).join('\n')}
`;
}

async function closeDb(db) {
  if (db && typeof db.close === 'function') {
    await db.close();
  }
}

async function main() {
  const options = parseArgs();
  if (!options.scan && !options.resolve && !options.execute) {
    printUsage();
    return;
  }

  const api = getDedupeApi();
  const db = openNewsCrawlerDb(options.dbPath);

  try {
    console.log(`--- Gazetteer Deduplication Tool (${options.execute ? 'EXECUTE' : 'DRY RUN'}) ---`);
    console.log('Scanning for duplicate clusters...');

    const clusters = api.listGazetteerDuplicateClusters(db, { limit: options.limit });
    console.log(`Found ${clusters.length} clusters.`);

    if (options.scan) {
      clusters.forEach(c => {
        console.log(`[${c.country_code}] ${c.normalized} (${c.count} items) IDs: ${c.ids_str}`);
      });
      return;
    }

    let resolvedCount = 0;
    let skippedCount = 0;
    let conflictCount = 0;
    const conflicts = [];

    for (const cluster of clusters) {
      const ids = [...new Set(cluster.ids_str.split(',').map(Number))];
      const candidates = api.getGazetteerDedupeCandidates(db, ids);

      const conflict = checkConflicts(candidates);
      if (conflict) {
        console.log(`[SKIP] Conflict detected for "${cluster.normalized}" (${cluster.country_code}). ${conflict.message}`);
        conflictCount += 1;
        if (options.reportFile) {
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

      candidates.forEach(c => {
        c.score = scoreCandidate(c);
      });

      candidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.id - b.id;
      });

      const survivor = candidates[0];
      const victims = candidates.slice(1);

      if (options.resolve) {
        console.log(`\nCluster: "${cluster.normalized}" (${cluster.country_code})`);
        console.log(`  Survivor: ID ${survivor.id} (Score: ${survivor.score}) [Ext:${survivor.extIds}, Hier:${survivor.parents.length + survivor.childrenCount}]`);
        victims.forEach(v => {
          console.log(`  Victim:   ID ${v.id} (Score: ${v.score}) -> Merge into ${survivor.id}`);
        });
        resolvedCount += 1;
      }

      if (options.execute) {
        try {
          api.mergeGazetteerDedupePlaces(db, survivor.id, victims.map(v => v.id));
          console.log(`[MERGED] "${cluster.normalized}" (${cluster.country_code}): ${victims.length} merged into ${survivor.id}`);
          resolvedCount += 1;
        } catch (err) {
          console.error(`[ERROR] Failed to merge "${cluster.normalized}": ${err.message}`);
          skippedCount += 1;
        }
      }
    }

    console.log('\n--- Summary ---');
    console.log(`Processed: ${clusters.length}`);
    console.log(`Resolved/Merged: ${resolvedCount}`);
    console.log(`Conflicts (Skipped): ${conflictCount}`);
    if (options.execute) console.log(`Errors: ${skippedCount}`);

    if (options.reportFile && conflicts.length > 0) {
      fs.writeFileSync(options.reportFile, buildConflictReport(conflicts));
      console.log(`\nConflict report written to ${options.reportFile}`);
    }
  } finally {
    await closeDb(db);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  haversineDistance,
  checkConflicts,
  scoreCandidate,
  buildConflictReport,
  main
};
