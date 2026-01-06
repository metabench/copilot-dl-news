#!/usr/bin/env node
/**
 * place-hub-active-probe.js — Actively probe for place hubs using patterns
 * 
 * Usage:
 *   node tools/dev/place-hub-active-probe.js --host theguardian.com --pattern "/world/{slug}"
 *   node tools/dev/place-hub-active-probe.js --host bbc.com --pattern "/news/world/us_and_canada" --dry-run
 * 
 * Features:
 * - Load all countries/territories from gazetteer
 * - Generate candidate URLs using provided pattern
 * - Concurrency-limited probing (HEAD requests)
 * - Insert 'pending' mappings for found hubs
 */
'use strict';

const path = require('path');
const Database = require('better-sqlite3');
// node-fetch v3 is ESM-only
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { slugify } = require('../../src/tools/slugify');

// CLI args
const args = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
}

const HOST = flags.host;
const PATTERN = flags.pattern;
const APPLY = flags.apply || false;
const CONCURRENCY = parseInt(flags.concurrency || '10', 10);
const TIMEOUT = parseInt(flags.timeout || '5000', 10);

if (!HOST || !PATTERN) {
  console.error('Usage: node place-hub-active-probe.js --host <domain> --pattern </world/{slug}> [--apply]');
  process.exit(1);
}

function getDb(readonly = true) {
  const dbPath = path.resolve(__dirname, '..', '..', 'data', 'news.db');
  return new Database(dbPath, { readonly });
}

async function probeUrl(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT);
    
    // Try HEAD first
    const res = await fetch(url, { 
      method: 'HEAD', 
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HubProbe/1.0)'
      }
    });
    
    clearTimeout(timeout);
    
    if (res.ok) return { url, status: res.status, ok: true };
    if (res.status === 405 || res.status === 403) {
      // Some sites block HEAD, try GET
      const controller2 = new AbortController();
      const timeout2 = setTimeout(() => controller2.abort(), TIMEOUT);
      const res2 = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller2.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; HubProbe/1.0)'
        }
      });
      clearTimeout(timeout2);
      return { url, status: res2.status, ok: res2.ok };
    }
    
    return { url, status: res.status, ok: false };
  } catch (err) {
    return { url, error: err.message, ok: false };
  }
}

async function main() {
  const db = getDb(!APPLY);
  
  try {
    // 1. Load places
    console.log('Loading places from gazetteer...');
    const places = db.prepare(`
      SELECT pn.place_id, pn.name, pn.normalized, pn.lang, p.kind, p.country_code as code
      FROM place_names pn
      JOIN places p ON p.id = pn.place_id
      WHERE p.kind = 'country'
        AND pn.is_preferred = 1
        AND pn.lang IN ('en', 'eng', 'und')
    `).all();
    console.log(`Loaded ${places.length} places`);

    // 2. Generate candidates
    const candidates = [];
    const seenUrls = new Set();
    
    for (const place of places) {
      // Different plug strategies
      const slugs = [
        slugify(place.name),
        place.name.toLowerCase().replace(/\s+/g, '-'),
        place.name.toLowerCase().replace(/\s+/g, '_'),
        place.name.toLowerCase().replace(/\s+/g, ''),
      ];
      if (place.code) slugs.push(place.code.toLowerCase());

      const uniqueSlugs = [...new Set(slugs)];
      
      for (const slug of uniqueSlugs) {
        const pathStr = PATTERN.replace('{slug}', slug).replace('{code}', place.code?.toLowerCase() || slug);
        const url = `https://www.${HOST.replace(/^www\./, '')}${pathStr}`;
        
        if (!seenUrls.has(url)) {
          seenUrls.add(url);
          candidates.push({ place, url, slug });
        }
      }
    }
    
    console.log(`Generated ${candidates.length} candidate URLs for ${places.length} places`);
    
    // 3. Filter existing mappings to avoid redundant probing
    const existing = new Set(
      db.prepare('SELECT url FROM place_page_mappings WHERE host = ?').all(HOST.replace(/^www\./, '')).map(r => r.url)
    );
    
    const toProbe = candidates.filter(c => !existing.has(c.url));
    console.log(`Skipping ${candidates.length - toProbe.length} existing URLs. Probing ${toProbe.length} new candidates...`);
    
    // 4. Probe
    const results = [];
    // Simple concurrency queue
    for (let i = 0; i < toProbe.length; i += CONCURRENCY) {
      const batch = toProbe.slice(i, i + CONCURRENCY);
      const promises = batch.map(c => probeUrl(c.url).then(res => ({ ...c, res })));
      
      const batchResults = await Promise.all(promises);
      for (const r of batchResults) {
        if (flags.verbose) {
            console.log(`${r.url} -> ${r.ok ? 'OK' : 'FAIL'} (${r.res.status || r.res.error})`);
        } else {
            process.stdout.write(r.res.ok ? '✅' : '❌');
        }
        if (r.res.ok) {
          results.push(r);
        }
      }
    }
    console.log('\n');
    
    console.log(`Found ${results.length} valid hub URLs`);
    results.forEach(r => console.log(`  ${r.place.name}: ${r.url} (${r.res.status})`));
    
    // 5. Apply
    if (APPLY && results.length > 0) {
      const insert = db.prepare(`
        INSERT INTO place_page_mappings 
          (place_id, host, url, page_kind, status, first_seen_at, evidence)
        VALUES (?, ?, ?, 'country-hub', 'pending', ?, ?)
      `);
      
      const now = new Date().toISOString();
      const host = HOST.replace(/^www\./, '');
      
      const tx = db.transaction(() => {
        let count = 0;
        for (const r of results) {
          try {
            const evidence = JSON.stringify({
              source: 'place-hub-active-probe',
              pattern: PATTERN,
              status: r.res.status,
              probed_at: now
            });
            insert.run(r.place.place_id, host, r.url, now, evidence);
            count++;
          } catch (err) {
            console.error(`Failed to insert ${r.url}: ${err.message}`);
          }
        }
        return count;
      });
      
      const inserted = tx();
      console.log(`Inserted ${inserted} new mappings`);
    } else if (results.length > 0) {
      console.log(`\nRun with --apply to insert ${results.length} mappings`);
    }

  } finally {
    db.close();
  }
}

main().catch(console.error);
