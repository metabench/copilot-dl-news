const Database = require('better-sqlite3');
const path = require('path');
const zlib = require('zlib');
const SkeletonHash = require('../src/analysis/structure/SkeletonHash');
const SkeletonDiff = require('../src/analysis/structure/SkeletonDiff');
const cheerio = require('cheerio');
const { createLayoutMasksQueries } = require('../src/db/sqlite/v1/queries/layoutMasks');

// ─────────────────────────────────────────────────────────────
// CLI Argument Parsing
// ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

function getArg(name, defaultValue) {
    const idx = args.indexOf(name);
    if (idx === -1) return defaultValue;
    return args[idx + 1];
}

function hasFlag(name) {
    return args.includes(name);
}

// Show help
if (hasFlag('--help') || hasFlag('-h')) {
    console.log(`
structure-miner - Analyze page layouts and cluster by structural similarity

USAGE:
  node tools/structure-miner.js [options]

OPTIONS:
  --limit <n>         Number of pages to analyze (default: 100)
  --domain <host>     Filter to pages from a specific domain (e.g., theguardian.com)
  --verbose           Show per-page processing output
  --json              Output results as JSON (for automation)
  --mask              Generate layout masks for top clusters
  --mask-samples <n>  Samples per mask (default: 5)
  --mask-limit <n>    Max masks to generate (default: 5)
  --db <path>         Database path (default: data/news.db)
  --help, -h          Show this help

EXAMPLES:
  # Analyze 500 pages, show clusters
  node tools/structure-miner.js --limit 500

  # Analyze Guardian pages only
  node tools/structure-miner.js --domain theguardian.com --limit 200

  # JSON output for automation
  node tools/structure-miner.js --limit 100 --json

  # Generate masks for clustering analysis
  node tools/structure-miner.js --limit 500 --mask --mask-limit 10
`);
    process.exit(0);
}

const dbPath = getArg('--db', 'data/news.db');
const limit = parseInt(getArg('--limit', '100'));
const domain = getArg('--domain', null);
const verbose = hasFlag('--verbose');
const jsonOutput = hasFlag('--json');
const maskMode = hasFlag('--mask');
const maskSamples = parseInt(getArg('--mask-samples', '5'));
const maskLimit = parseInt(getArg('--mask-limit', '5'));

function decompress(buffer, typeId) {
    if (!typeId || typeId === 1) return buffer;
    if (typeId >= 2 && typeId <= 5) return zlib.gunzipSync(buffer);
    if (typeId >= 6 && typeId <= 16) return zlib.brotliDecompressSync(buffer);
    if (typeId >= 17) throw new Error(`Compression type ${typeId} (Zstd) not supported`);
    return buffer;
}

function tableExists(db, name) {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
    return !!row;
}

function requireTable(db, name, { hint } = {}) {
    if (!tableExists(db, name)) {
        const extra = hint ? `\n\nHint: ${hint}` : '';
        throw new Error(`Required table missing: ${name}.${extra}`);
    }
}

async function main() {
    if (!jsonOutput) console.log(`Opening database: ${dbPath}`);
    const db = new Database(dbPath, { readonly: false });

    // Schema is expected to be managed canonically (schema:sync). Fail fast if missing.
    requireTable(db, 'layout_signatures', {
        hint: 'If this is a fresh DB, run the app once to initialize schema, or run: npm run schema:sync (after migrations).'
    });
    if (maskMode) {
        requireTable(db, 'layout_masks', {
            hint: 'Run: node tools/migrations/add-layout-templates-and-masks.js then npm run schema:sync'
        });
    }

    // Build query with optional domain filter
    let query;
    let queryParams;
    
    if (domain) {
        query = `
            SELECT hr.id, u.url, cs.content_blob, cs.compression_type_id
            FROM http_responses hr
            JOIN urls u ON u.id = hr.url_id
            JOIN content_storage cs ON cs.http_response_id = hr.id
            WHERE cs.content_blob IS NOT NULL
              AND u.url LIKE ?
            ORDER BY hr.fetched_at DESC
            LIMIT ?
        `;
        queryParams = [`%${domain}%`, limit];
    } else {
        query = `
            SELECT hr.id, u.url, cs.content_blob, cs.compression_type_id
            FROM http_responses hr
            JOIN urls u ON u.id = hr.url_id
            JOIN content_storage cs ON cs.http_response_id = hr.id
            WHERE cs.content_blob IS NOT NULL
            ORDER BY hr.fetched_at DESC
            LIMIT ?
        `;
        queryParams = [limit];
    }

    const stmt = db.prepare(query);
    const rows = stmt.all(...queryParams);

    if (!jsonOutput) {
        console.log(`Found ${rows.length} pages to analyze.${domain ? ` (domain: ${domain})` : ''}`);
    }

    const upsertStmt = db.prepare(`
        INSERT INTO layout_signatures (signature_hash, level, signature, first_seen_url, seen_count, last_seen_at)
        VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
        ON CONFLICT(signature_hash) DO UPDATE SET
            seen_count = seen_count + 1,
            last_seen_at = CURRENT_TIMESTAMP
    `);

    let processed = 0;
    const stats = { l1_new: 0, l1_existing: 0, l2_new: 0, l2_existing: 0 };
    const maskBuckets = new Map();

    db.transaction(() => {
        for (const row of rows) {
            let html;
            try {
                const buffer = decompress(row.content_blob, row.compression_type_id);
                html = buffer.toString('utf8');
            } catch (e) {
                console.error(`Error decompressing ${row.url}:`, e.message);
                continue;
            }
            
            // Level 1
            const l1 = SkeletonHash.compute(html, 1);
            if (l1.hash !== '0') {
                try {
                    const info = upsertStmt.run(l1.hash, 1, l1.signature, row.url);
                } catch (e) {
                    console.error(`Error saving L1 for ${row.url}:`, e.message);
                }
            }

            // Level 2
            const l2 = SkeletonHash.compute(html, 2);
            if (l2.hash !== '0') {
                try {
                    upsertStmt.run(l2.hash, 2, l2.signature, row.url);
                    if (maskMode) {
                        const bucket = maskBuckets.get(l2.hash) || { htmls: [], urls: [] };
                        if (bucket.htmls.length < maskSamples) {
                            bucket.htmls.push(html);
                            bucket.urls.push(row.url);
                        }
                        maskBuckets.set(l2.hash, bucket);
                    }
                } catch (e) {
                    console.error(`Error saving L2 for ${row.url}:`, e.message);
                }
            }

            processed++;
            if (verbose) console.log(`Processed ${row.url} -> L1:${l1.hash} L2:${l2.hash}`);
        }
    })();

    if (!jsonOutput) {
        console.log(`Processed ${processed} pages.`);
    }
    
    // Report top clusters
    const topL2 = db.prepare(`
        SELECT signature_hash, seen_count, first_seen_url 
        FROM layout_signatures 
        WHERE level = 2 
        ORDER BY seen_count DESC 
        LIMIT 10
    `).all();

    // Get total signature counts
    const totalL1 = db.prepare(`SELECT COUNT(*) as cnt FROM layout_signatures WHERE level = 1`).get().cnt;
    const totalL2 = db.prepare(`SELECT COUNT(*) as cnt FROM layout_signatures WHERE level = 2`).get().cnt;

    if (jsonOutput) {
        // JSON output for automation
        const result = {
            processed,
            domain: domain || null,
            limit,
            totals: { l1Signatures: totalL1, l2Signatures: totalL2 },
            topClusters: topL2.map(r => ({
                hash: r.signature_hash,
                count: r.seen_count,
                exampleUrl: r.first_seen_url
            }))
        };
        console.log(JSON.stringify(result, null, 2));
    } else {
        console.log(`\nSignature totals: L1=${totalL1}, L2=${totalL2}`);
        console.log('\nTop 10 Layout Clusters (Level 2):');
        topL2.forEach((r, i) => {
            console.log(`${i + 1}. Hash: ${r.signature_hash} | Count: ${r.seen_count} | Example: ${r.first_seen_url}`);
        });
    }

    if (maskMode) {
        const layoutMasks = createLayoutMasksQueries(db);
        const candidates = Array.from(maskBuckets.entries())
            .filter(([, bucket]) => bucket.htmls.length >= 2)
            .sort((a, b) => b[1].htmls.length - a[1].htmls.length)
            .slice(0, maskLimit);

        if (!jsonOutput) {
            console.log(`\nGenerating masks for ${candidates.length} signatures (limit ${maskLimit}, samples up to ${maskSamples}).`);
        }

        for (const [sigHash, bucket] of candidates) {
            try {
                const cheerioRoots = bucket.htmls.map(html => cheerio.load(html));
                const mask = SkeletonDiff.generateMask(cheerioRoots);
                layoutMasks.upsert({
                    signature_hash: sigHash,
                    mask_json: JSON.stringify(mask),
                    sample_count: bucket.htmls.length,
                    dynamic_nodes_count: mask.dynamicPaths.length
                });
                if (!jsonOutput) {
                    console.log(`- Mask stored for ${sigHash}: samples=${bucket.htmls.length}, dynamic=${mask.dynamicPaths.length}`);
                }
            } catch (e) {
                if (!jsonOutput) {
                    console.error(`Mask generation failed for ${sigHash}: ${e.message}`);
                }
            }
        }
    }

    db.close();
}

main().catch(console.error);
