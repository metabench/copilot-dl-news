#!/usr/bin/env node
/**
 * ingest-discovered-hubs.js — Ingest discovered hubs from JSON files into DB
 * 
 * Usage:
 *   node tools/dev/ingest-discovered-hubs.js
 *   node tools/dev/ingest-discovered-hubs.js --dir tmp/discovery
 *   node tools/dev/ingest-discovered-hubs.js --apply
 */
'use strict';

const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const help = args.includes('--help');
const apply = args.includes('--apply');
const dirArg = args.indexOf('--dir');
const INPUT_DIR = dirArg !== -1 ? args[dirArg + 1] : path.resolve(__dirname, '../../tmp/discovery');

if (help) {
    console.log(`
Usage: node tools/dev/ingest-discovered-hubs.js [options]

Ingests .json hub discovery files into place_page_mappings table.

Options:
  --dir <path>     Directory containing .json files (default: tmp/discovery)
  --apply          Actually insert into database (default: dry-run)
  --help           Show this help
`);
    process.exit(0);
}

function getDb(readonly = true) {
    const dbPath = path.resolve(__dirname, '..', '..', 'data', 'news.db');
    return openNewsCrawlerDb(dbPath, { readonly, fileMustExist: true });
}

function getDbApi() {
    const dbModule = resolveNewsCrawlerDbModule();
    const required = [
        'listPlaceNamesForDiscoveredHubIngest',
        'listPlacePageMappingKeysForHost',
        'insertVerifiedDiscoveredPlaceHubMappings'
    ];
    for (const name of required) {
        if (typeof dbModule[name] !== 'function') {
            throw new Error(`news-crawler-db does not export ${name}. Build ../news-crawler-db first.`);
        }
    }
    return dbModule;
}

function simpleSlugify(text) {
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')           // Replace spaces with -
        .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
        .replace(/\-\-+/g, '-')         // Replace multiple - with single -
        .replace(/^-+/, '')             // Trim - from start of text
        .replace(/-+$/, '');            // Trim - from end of text
}

function loadPlaceIndex(db, dbApi) {
    console.log('Loading place names...');
    const index = new Map(); // normalized_name -> { id, name, kind, lang }
    const rows = dbApi.listPlaceNamesForDiscoveredHubIngest(db);

    for (const row of rows) {
        const norm = row.normalized || simpleSlugify(row.name);
        
        // Key 1: Normalized name (e.g. "france")
        if (!index.has(norm)) index.set(norm, row);
        
        // Key 2: Link text variation (e.g. "France")
        const lowerName = row.name.toLowerCase();
        if (!index.has(lowerName)) index.set(lowerName, row);
    }
    
    console.log(`Indexed ${index.size} place name variants.`);
    return index;
}

function processFile(filePath, db, dbApi, placeIndex, stats) {
    const content = fs.readFileSync(filePath, 'utf8');
    let data;
    try {
        data = JSON.parse(content);
    } catch (e) {
        console.error(`Skipping invalid JSON: ${filePath}`);
        return;
    }

    if (!data.hubs || !Array.isArray(data.hubs)) return;
    
    // Determine host from finalUrl or filename
    let host = '';
    if (data.finalUrl) {
        try {
            host = new URL(data.finalUrl).hostname.replace(/^www\./, '');
        } catch(e) {}
    }
    if (!host) {
        host = path.basename(filePath, '.json').replace(/^www\./, '');
    }

    // Filter existing mappings
    const existingMappings = new Set(dbApi.listPlacePageMappingKeysForHost(db, host));

    const candidates = [];
    
    for (const hub of data.hubs) {
        // hub: { url, text, path }
        // Attempt to match hub.text to a place
        if (!hub.text) continue;

        // Try exact text match
        const lowerText = hub.text.trim().toLowerCase();
        let match = placeIndex.get(lowerText);

        // Try path-based match if text fails (/world/france -> france)
        if (!match && hub.path) {
            const parts = hub.path.split('/').filter(Boolean);
            const slug = parts[parts.length - 1];
            // remove file extensions
            const cleanSlug = slug.replace(/\.(html|htm|php)$/, '');
            
            // Try slug exact
            match = placeIndex.get(cleanSlug.toLowerCase());
            
            // Try slug un-hyphenated (south-africa -> south africa)
            if (!match) {
                match = placeIndex.get(cleanSlug.replace(/-/g, ' '));
            }
        }

        if (match) {
            const pageKind = 'country-hub'; // Default for now
            const key = `${match.place_id}:${host}:${pageKind}`;
            
            if (existingMappings.has(key)) {
                stats.skipped++;
            } else {
                candidates.push({
                    place_id: match.place_id,
                    host: host,
                    url: hub.url,
                    text: hub.text,
                    place_name: match.name,
                    place_kind: match.kind,
                    page_kind: pageKind
                });
            }
        } else {
            stats.unmatched++;
        }
    }

    // Dedup candidates by (place_id, host) logic locally
    const uniqueCandidates = [];
    const seenLocal = new Set();
    
    for (const c of candidates) {
        const key = `${c.place_id}:${c.host}:${c.page_kind}`;
        if (!seenLocal.has(key)) {
            seenLocal.add(key);
            uniqueCandidates.push(c);
        }
    }

    if (uniqueCandidates.length > 0) {
        console.log(`\nHost: ${host} - Found ${uniqueCandidates.length} new mappings`);
        
        if (apply) {
            const result = dbApi.insertVerifiedDiscoveredPlaceHubMappings(db, uniqueCandidates);
            stats.inserted += result.inserted;
            stats.skipped += result.skipped;
        } else {
            // Dry run output
            for (const c of uniqueCandidates.slice(0, 5)) {
                console.log(`  + [${c.place_kind}] ${c.place_name} -> ${c.url} ("${c.text}")`);
            }
            if (uniqueCandidates.length > 5) console.log(`  ... and ${uniqueCandidates.length - 5} more`);
            stats.pending += uniqueCandidates.length;
        }
    }
}

async function main() {
    if (!fs.existsSync(INPUT_DIR)) {
        console.error(`Input directory not found: ${INPUT_DIR}`);
        process.exit(1);
    }

    const db = getDb(!apply);
    const dbApi = getDbApi();
    const placeIndex = loadPlaceIndex(db, dbApi);
    
    const stats = { inserted: 0, skipped: 0, unmatched: 0, pending: 0 };
    
    const files = fs.readdirSync(INPUT_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_'));
    console.log(`Scanning ${files.length} files in ${INPUT_DIR}...\n`);

    for (const file of files) {
        processFile(path.join(INPUT_DIR, file), db, dbApi, placeIndex, stats);
    }

    console.log('\n' + '='.repeat(40));
    console.log('Ingestion Summary');
    console.log('='.repeat(40));
    console.log(`Files Processed: ${files.length}`);
    console.log(`Matches Found:   ${stats.inserted + stats.pending + stats.skipped}`);
    console.log(`  Skipped (Old): ${stats.skipped}`);
    console.log(`  Inserted:      ${stats.inserted}`);
    console.log(`  Pending (Dry): ${stats.pending}`);
    console.log(`Unmatched Hubs:  ${stats.unmatched}`);
    
    if (!apply && stats.pending > 0) {
        console.log('\n💡 Run with --apply to insert pending records.');
    }
}

main();
