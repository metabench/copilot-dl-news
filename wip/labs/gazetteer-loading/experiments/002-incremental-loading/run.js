/**
 * Incremental Loading Experiment
 * 
 * Hypothesis: Loading places incrementally with progress events provides
 * better observability than batch loading, with minimal performance overhead.
 * 
 * Method: Load places in batches with instrumentation and compare to batch load.
 */
'use strict';

const EventEmitter = require('events');
const path = require('path');
const { openDatabase } = require('../../../../src/db/sqlite/v1');

/**
 * Observable gazetteer loader that emits progress events
 */
class ObservableGazetteerLoader extends EventEmitter {
  constructor(db) {
    super();
    this.db = db;
    this.matchers = {
      nameMap: new Map(),
      slugMap: new Map(),
      placeIndex: new Map()
    };
  }
  
  /**
   * Normalize name for matching
   */
  normalizeName(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  /**
   * Create slug from name
   */
  slugify(value) {
    return this.normalizeName(value)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  
  /**
   * Load all places with progress events
   */
  async load(options = {}) {
    const { batchSize = 500 } = options;
    
    this.emit('start', { phase: 'counting' });
    
    // Count total places
    const countRow = this.db.prepare(`
      SELECT COUNT(*) as count FROM places WHERE status = 'current' OR status IS NULL
    `).get();
    const total = countRow.count;
    
    this.emit('progress', { phase: 'counting', processed: 0, total, message: `Found ${total} places` });
    
    // Load in batches
    let offset = 0;
    let processed = 0;
    const startTime = Date.now();
    
    while (offset < total) {
      const batch = this.db.prepare(`
        SELECT 
          p.id AS place_id,
          p.kind,
          p.country_code,
          p.population,
          pn.name,
          pn.normalized AS norm
        FROM place_names pn
        JOIN places p ON p.id = pn.place_id
        WHERE (p.status = 'current' OR p.status IS NULL)
          AND (pn.lang IS NULL OR pn.lang = 'en')
        ORDER BY p.id
        LIMIT ? OFFSET ?
      `).all(batchSize, offset);
      
      for (const row of batch) {
        this.processRow(row);
        processed++;
      }
      
      offset += batchSize;
      
      const elapsedMs = Date.now() - startTime;
      const rate = processed / (elapsedMs / 1000);
      
      this.emit('progress', {
        phase: 'loading',
        processed,
        total,
        percent: Math.round((processed / total) * 100),
        rate: Math.round(rate),
        elapsedMs
      });
    }
    
    // Finalize
    this.emit('progress', { phase: 'finalizing', processed, total });
    this.finalize();
    
    const totalMs = Date.now() - startTime;
    
    this.emit('complete', {
      processed,
      total,
      durationMs: totalMs,
      placeCount: this.matchers.placeIndex.size,
      nameMapSize: this.matchers.nameMap.size,
      slugMapSize: this.matchers.slugMap.size
    });
    
    return this.matchers;
  }
  
  processRow(row) {
    const id = row.place_id;
    
    // Get or create place record
    let record = this.matchers.placeIndex.get(id);
    if (!record) {
      record = {
        id,
        place_id: id,
        kind: row.kind,
        country_code: row.country_code,
        population: Number(row.population) || 0,
        names: new Set(),
        slugs: new Set(),
        name: null
      };
      this.matchers.placeIndex.set(id, record);
    }
    
    // Add name
    const name = String(row.name || '').trim();
    if (name) {
      record.names.add(name);
      if (!record.name) record.name = name;
      
      // Add to nameMap
      const key = this.normalizeName(row.norm || name);
      if (key) {
        if (!this.matchers.nameMap.has(key)) {
          this.matchers.nameMap.set(key, []);
        }
        this.matchers.nameMap.get(key).push(record);
      }
      
      // Add to slugMap
      const slug = this.slugify(name);
      if (slug) {
        record.slugs.add(slug);
        if (!this.matchers.slugMap.has(slug)) {
          this.matchers.slugMap.set(slug, []);
        }
        this.matchers.slugMap.get(slug).push(record);
      }
    }
  }
  
  finalize() {
    // Add canonical slugs and synonyms
    for (const record of this.matchers.placeIndex.values()) {
      const canonicalSlug = record.name ? this.slugify(record.name) : null;
      if (canonicalSlug) {
        record.canonicalSlug = canonicalSlug;
        record.slugs.add(canonicalSlug);
      }
    }
  }
}

async function run() {
  console.log('┌ Experiment 002: Incremental Loading ═══════════════════════════');
  console.log('│');
  
  const dbPath = path.resolve(__dirname, '../../../../data/news.db');
  const db = openDatabase(dbPath, { readonly: true, fileMustExist: true });
  
  const loader = new ObservableGazetteerLoader(db);
  
  // Track progress
  let lastProgress = null;
  loader.on('progress', (p) => {
    if (p.phase === 'loading' && p.percent % 10 === 0 && p.percent !== lastProgress) {
      console.log(`│  Loading: ${p.percent}% (${p.processed}/${p.total}) - ${p.rate} places/sec`);
      lastProgress = p.percent;
    }
  });
  
  loader.on('complete', (stats) => {
    console.log('│');
    console.log('├ Results ════════════════════════════════════════════════════════');
    console.log(`│  Duration: ${stats.durationMs}ms`);
    console.log(`│  Places: ${stats.placeCount}`);
    console.log(`│  Name entries: ${stats.nameMapSize}`);
    console.log(`│  Slug entries: ${stats.slugMapSize}`);
    console.log(`│  Throughput: ${Math.round(stats.processed / (stats.durationMs / 1000))} places/sec`);
    console.log('│');
    console.log('└══════════════════════════════════════════════════════════════════');
  });
  
  const matchers = await loader.load({ batchSize: 1000 });
  
  db.close();
  
  return matchers;
}

if (require.main === module) {
  run().catch(console.error);
}

module.exports = { run, ObservableGazetteerLoader };
