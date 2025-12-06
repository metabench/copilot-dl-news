const Database = require('better-sqlite3');
const path = require('path');
const zlib = require('zlib');
const SkeletonHash = require('../src/analysis/structure/SkeletonHash');
const SkeletonDiff = require('../src/analysis/structure/SkeletonDiff');
const cheerio = require('cheerio');
const { createLayoutMasksQueries } = require('../src/db/sqlite/v1/queries/layoutMasks');

// Simple arg parsing if utils not available
const args = process.argv.slice(2);
const dbPath = 'data/news.db';
const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : 100;
const verbose = args.includes('--verbose');
const maskMode = args.includes('--mask');
const maskSamples = args.includes('--mask-samples') ? parseInt(args[args.indexOf('--mask-samples') + 1]) : 5;
const maskLimit = args.includes('--mask-limit') ? parseInt(args[args.indexOf('--mask-limit') + 1]) : 5;

function decompress(buffer, typeId) {
    if (!typeId || typeId === 1) return buffer;
    if (typeId >= 2 && typeId <= 5) return zlib.gunzipSync(buffer);
    if (typeId >= 6 && typeId <= 16) return zlib.brotliDecompressSync(buffer);
    if (typeId >= 17) throw new Error(`Compression type ${typeId} (Zstd) not supported`);
    return buffer;
}

async function main() {
    console.log(`Opening database: ${dbPath}`);
    const db = new Database(dbPath, { readonly: false });

    // Ensure table exists (in case migration didn't run)
    db.exec(`
        CREATE TABLE IF NOT EXISTS layout_signatures (
            signature_hash TEXT PRIMARY KEY,
            level INTEGER NOT NULL,
            signature TEXT NOT NULL,
            first_seen_url TEXT,
            seen_count INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_layout_signatures_level ON layout_signatures(level);

        CREATE TABLE IF NOT EXISTS layout_masks (
            signature_hash TEXT PRIMARY KEY,
            mask_json TEXT NOT NULL,
            sample_count INTEGER DEFAULT 0,
            dynamic_nodes_count INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (signature_hash) REFERENCES layout_signatures(signature_hash) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_layout_masks_signature ON layout_masks(signature_hash);
    `);

    // Fetch recent HTML responses
    // Join with urls to get the URL string
    const query = `
        SELECT hr.id, u.url, cs.content_blob, cs.compression_type_id
        FROM http_responses hr
        JOIN urls u ON u.id = hr.url_id
        JOIN content_storage cs ON cs.http_response_id = hr.id
        WHERE cs.content_blob IS NOT NULL
        ORDER BY hr.fetched_at DESC
        LIMIT ?
    `;

    const stmt = db.prepare(query);
    const rows = stmt.all(limit);

    console.log(`Found ${rows.length} pages to analyze.`);

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

    console.log(`Processed ${processed} pages.`);
    
    // Report top clusters
    const topL2 = db.prepare(`
        SELECT signature_hash, seen_count, first_seen_url 
        FROM layout_signatures 
        WHERE level = 2 
        ORDER BY seen_count DESC 
        LIMIT 5
    `).all();

    console.log('\nTop 5 Layout Clusters (Level 2):');
    topL2.forEach(r => {
        console.log(`- Hash: ${r.signature_hash} | Count: ${r.seen_count} | Example: ${r.first_seen_url}`);
    });

    if (maskMode) {
        const layoutMasks = createLayoutMasksQueries(db);
        const candidates = Array.from(maskBuckets.entries())
            .filter(([, bucket]) => bucket.htmls.length >= 2)
            .sort((a, b) => b[1].htmls.length - a[1].htmls.length)
            .slice(0, maskLimit);

        console.log(`\nGenerating masks for ${candidates.length} signatures (limit ${maskLimit}, samples up to ${maskSamples}).`);

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
                console.log(`- Mask stored for ${sigHash}: samples=${bucket.htmls.length}, dynamic=${mask.dynamicPaths.length}`);
            } catch (e) {
                console.error(`Mask generation failed for ${sigHash}: ${e.message}`);
            }
        }
    }
}

main().catch(console.error);
