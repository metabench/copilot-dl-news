#!/usr/bin/env node
/**
 * place-hub-active-probe-gap-fill.js — Target only missing countries
 */
'use strict';

const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');
const path = require('path');
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
  return openNewsCrawlerDb(dbPath, { readonly, fileMustExist: true });
}

function getDbApi() {
  const dbModule = resolveNewsCrawlerDbModule();
  const required = [
    'listMissingPreferredCountryPlacesForActiveHubProbe',
    'upsertPlaceHubActiveProbeMappings'
  ];
  for (const name of required) {
    if (typeof dbModule[name] !== 'function') {
      throw new Error(`news-crawler-db does not export ${name}. Build ../news-crawler-db first.`);
    }
  }
  return dbModule;
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
  const dbApi = getDbApi();
  
  try {
    // 1. Identify missing countries
    console.log(`Identifying missing countries for ${HOST}...`);
    const missing = dbApi.listMissingPreferredCountryPlacesForActiveHubProbe(db, HOST);
    
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
             const c = dbApi.upsertPlaceHubActiveProbeMappings(
                db,
                results.map((r) => ({
                    placeId: r.place.id,
                    url: r.url,
                    finalUrl: r.res.finalUrl || r.url,
                    slug: r.slug,
                    status: r.res.status
                })),
                HOST,
                {
                    source: 'gap-fill-probe',
                    pattern: PATTERN,
                    status: 'verified'
                }
             );
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
