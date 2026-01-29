#!/usr/bin/env node
/**
 * place-hub-active-probe-gap-fill.js — Target only missing countries
 */
'use strict';

const path = require('path');
const Database = require('better-sqlite3');
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
const CONCURRENCY = parseInt(flags.concurrency || '5', 10); // Slower concurrency
const TIMEOUT = parseInt(flags.timeout || '10000', 10);

if (!HOST || !PATTERN) {
  console.error('Usage: node place-hub-active-probe-gap-fill.js --host <domain> --pattern </world/{slug}> [--apply]');
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
    
    // HEAD request
    let res = await fetch(url, { 
      method: 'HEAD', 
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (GapFillProbe/1.0)' }
    });
    
    clearTimeout(timeout);
    if (res.ok) return { url, finalUrl: res.url, status: res.status, ok: true };
    
    // Fallback to GET on 403/405/404 (some sites return 404 for HEAD but 200 for GET?) unlikely but 403/405 sure.
    if (!res.ok) {
        // Try GET
        const controller2 = new AbortController();
        const timeout2 = setTimeout(() => controller2.abort(), TIMEOUT);
        res = await fetch(url, {
            method: 'GET',
            redirect: 'follow',
            signal: controller2.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (GapFillProbe/1.0)' }
        });
        clearTimeout(timeout2);
        
        // Sometimes article pages return 200. We want HUB pages.
        // Heuristic: check if title or content looks like a hub?
        // For now just trust status 200.
        if (res.ok) return { url, finalUrl: res.url, status: res.status, ok: true };
    }
    
    return { url, status: res.status, ok: false };
  } catch (err) {
    return { url, error: err.message, ok: false };
  }
}

async function main() {
  const db = getDb(!APPLY);
  
  try {
    // 1. Identify missing countries
    console.log(`Identifying missing countries for ${HOST}...`);
    const missing = db.prepare(`
        SELECT p.id, pn.name, p.country_code as code
        FROM places p
        JOIN place_names pn ON pn.place_id = p.id
        WHERE p.kind = 'country'
          AND pn.is_preferred = 1
          AND pn.lang IN ('en', 'eng', 'und')
          AND p.id NOT IN (
            SELECT place_id FROM place_page_mappings WHERE host = ?
          )
    `).all(HOST.replace(/^www\./, ''));
    
    console.log(`Found ${missing.length} missing countries.`);

    // 2. Generate candidates
    const candidates = [];
    const seenUrls = new Set();
    
    for (const place of missing) {
      const slugs = [
        slugify(place.name),
        place.name.toLowerCase().replace(/\s+/g, '-'), // "New Zealand" -> "new-zealand"
        place.name.toLowerCase().replace(/\s+/g, ''),  // "New Zealand" -> "newzealand"
      ];
      // Special mappings for problematic ones
      if (place.name === "New Zealand") slugs.push("newzealand"); // already covered by remove space
      if (place.name === "Vietnam") slugs.push("viet-nam");
      
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
    
    console.log(`Generated ${candidates.length} candidates to probe.`);
    
    // 3. Probe
    const results = [];
    for (let i = 0; i < candidates.length; i += CONCURRENCY) {
      const batch = candidates.slice(i, i + CONCURRENCY);
      const promises = batch.map(c => probeUrl(c.url).then(res => ({ ...c, res })));
      
      const batchResults = await Promise.all(promises);
      for (const r of batchResults) {
        if (r.res.ok) {
            console.log(`✅ MATCH: ${r.place.name} -> ${r.res.finalUrl}`);
            results.push(r);
        } else {
            console.log(`❌ ${r.url} (${r.res.status || r.res.error})`);
        }
      }
    }
    
    // 4. Upsert
    if (results.length > 0) {
        if (APPLY) {
            const insert = db.prepare(`
                INSERT INTO place_page_mappings 
                  (place_id, host, url, page_kind, status, first_seen_at, evidence)
                VALUES (?, ?, ?, 'country-hub', 'verified', ?, ?)
                ON CONFLICT(place_id, host, page_kind) DO UPDATE SET
                  url = excluded.url,
                  evidence = excluded.evidence,
                  verified_at = excluded.first_seen_at
            `);
            // verified_at is set because we just verified it with active probe.
            // Wait, previous script used 'pending' and updated verified_at if status was 'verified'.
            // Here we verify it live, so status='verified'.
            
            const now = new Date().toISOString();
            const host = HOST.replace(/^www\./, '');
             const tx = db.transaction(() => {
                let count = 0;
                for (const r of results) {
                    const finalUrl = r.res.finalUrl || r.url;
                    const evidence = JSON.stringify({
                      source: 'gap-fill-probe',
                      pattern: PATTERN,
                      slug: r.slug,
                      probed_at: now
                    });
                    insert.run(r.place.id, host, finalUrl, now, evidence);
                    count++;
                }
                return count;
             });
             const c = tx();
             console.log(`Upserted ${c} records.`);
        } else {
            console.log(`Found ${results.length} matches. Run --apply to save.`);
        }
    }

  } finally {
    db.close();
  }
}

main().catch(console.error);
