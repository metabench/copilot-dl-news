'use strict';
// Diagnose + repair content_storage compression-integrity issues. Read-only by
// default (safe while the app runs); --apply mutates (app must be STOPPED).
//
// Two classes of db_compressed rows are broken:
//   A) LOST-TYPE: content_blob IS compressed but compression_type_id IS NULL.
//      The read path keys decompression on compression_type_id, so these can't
//      be read. RECOVERABLE: detect the algorithm by decompressing and matching
//      the result length to uncompressed_size, then restore compression_type_id
//      to that algorithm's canonical type. (~94.8k gzip rows found 2026-07-19.)
//   B) RAW-BLOB: compression_type_id set (brotli) but content_blob is RAW HTML
//      (the CompressionTask compressAndStore bug, fixed in 89be0bb6/264e0843 —
//      found ~0 at scale). RECOVERABLE: compress the raw blob in place.
//
//   Diagnose (read-only):   node tools/dev-bridge/checks/repair-compressed-content.js --sample 2000
//   Repair (app STOPPED):   node tools/dev-bridge/checks/repair-compressed-content.js --limit 500 --apply
//   Resume:                 ... --after <lastId> --limit 500 --apply
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const Database = require(path.join(ROOT, '..', 'news-crawler-db', 'node_modules', 'better-sqlite3'));
const { compress, decompress } = require(path.join(ROOT, 'src', 'shared', 'utils', 'CompressionFacade'));
const { updateContentStorageCompressionCleanupResult } = require('news-crawler-db');

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  return dflt;
};
const APPLY = process.argv.includes('--apply');
const SAMPLE = parseInt(arg('--sample', '0'), 10);
const LIMIT = parseInt(arg('--limit', SAMPLE ? '0' : '2000'), 10);
const AFTER = parseInt(arg('--after', '0'), 10);

const dlen = (d) => (d == null ? 0 : (d.length || d.byteLength || String(d).length));

function looksLikeRawText(buf) {
  if (!buf || !buf.length) return false;
  const n = Math.min(buf.length, 2048);
  let printable = 0;
  for (let i = 0; i < n; i++) {
    const b = buf[i];
    if (b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127) || b >= 160) printable++;
  }
  const head = buf.toString('utf8', 0, 512).toLowerCase();
  return printable / n > 0.9 && (head.includes('<') || head.includes('http') || printable / n > 0.98);
}

// Detect the algorithm of a compressed blob by matching the decompressed length
// to the expected uncompressed_size (a strong correctness signal).
function detectAlgorithm(buf, expectedLen) {
  for (const alg of ['gzip', 'brotli', 'zstd']) {
    try {
      const d = decompress(buf, alg);
      if (d && dlen(d) > 0 && (expectedLen == null || dlen(d) === expectedLen)) return alg;
    } catch (_) { /* try next */ }
  }
  return null;
}

(async () => {
  const db = new Database(path.join(ROOT, 'data', 'news.db'), { readonly: !APPLY, fileMustExist: true });
  try {
    // Canonical type per algorithm (level is irrelevant to decompression; the
    // read path only uses ct.algorithm). Pick a mid preset that exists.
    const canonical = {};
    for (const [alg, name] of [['gzip', 'gzip_6'], ['brotli', 'brotli_6'], ['zstd', 'zstd_3']]) {
      const t = db.prepare('SELECT id FROM compression_types WHERE name = ?').get(name);
      if (t) canonical[alg] = t.id;
    }

    const total = db.prepare("SELECT COUNT(*) c FROM content_storage WHERE storage_type='db_compressed'").get().c;
    const nullTypeTotal = db.prepare("SELECT COUNT(*) c FROM content_storage WHERE storage_type='db_compressed' AND compression_type_id IS NULL").get().c;
    const rows = SAMPLE
      ? db.prepare(`SELECT id, content_blob, compression_type_id, uncompressed_size FROM content_storage
                    WHERE storage_type='db_compressed' ORDER BY RANDOM() LIMIT ?`).all(SAMPLE)
      : db.prepare(`SELECT id, content_blob, compression_type_id, uncompressed_size FROM content_storage
                    WHERE storage_type='db_compressed' AND id > ? ORDER BY id ASC LIMIT ?`).all(AFTER, LIMIT);

    let ok = 0, lostTypeRecoverable = 0, rawBlobRecoverable = 0, unrecoverable = 0, empty = 0;
    let restoredType = 0, recompressed = 0, failed = 0, lastId = 0;
    const algCount = {};

    for (const r of rows) {
      lastId = r.id;
      const blob = r.content_blob;
      if (!blob || !blob.length) { empty++; continue; }
      const alg = r.compression_type_id
        ? (db.prepare('SELECT algorithm FROM compression_types WHERE id = ?').get(r.compression_type_id) || {}).algorithm
        : null;

      if (r.compression_type_id) {
        // Has a type — does it decompress?
        let good = false;
        try { good = dlen(decompress(blob, alg)) > 0; } catch (_) { good = false; }
        if (good) { ok++; continue; }
        // Type set but decompress fails — CompressionTask raw-blob bug?
        if (looksLikeRawText(blob)) {
          rawBlobRecoverable++;
          if (APPLY) {
            try {
              const ct = db.prepare('SELECT algorithm, level, window_bits, block_bits FROM compression_types WHERE id = ?').get(r.compression_type_id);
              const res = compress(blob, { algorithm: ct.algorithm, level: ct.level, windowBits: ct.window_bits, blockBits: ct.block_bits });
              updateContentStorageCompressionCleanupResult(db, { id: r.id, compressionTypeId: r.compression_type_id, contentBlob: res.compressed, compressedSize: res.compressedSize, compressionRatio: res.ratio });
              if (dlen(decompress(db.prepare('SELECT content_blob FROM content_storage WHERE id=?').get(r.id).content_blob, ct.algorithm)) > 0) recompressed++; else failed++;
            } catch (_) { failed++; }
          }
        } else { unrecoverable++; }
      } else {
        // NULL type — LOST-TYPE. Detect algorithm by round-trip-length match.
        const detected = detectAlgorithm(blob, r.uncompressed_size);
        if (detected && canonical[detected]) {
          lostTypeRecoverable++;
          algCount[detected] = (algCount[detected] || 0) + 1;
          if (APPLY) {
            try {
              db.prepare('UPDATE content_storage SET compression_type_id = ? WHERE id = ?').run(canonical[detected], r.id);
              if (dlen(decompress(blob, detected)) > 0) restoredType++; else failed++;
            } catch (_) { failed++; }
          }
        } else { unrecoverable++; }
      }
    }

    const scanned = rows.length;
    const est = (n) => SAMPLE && scanned ? ` (~${(n / scanned * 100).toFixed(1)}% -> ~${Math.round(n / scanned * total)} of all)` : '';
    console.log(`db_compressed total: ${total} (NULL compression_type_id: ${nullTypeTotal}) | scanned ${SAMPLE ? 'random sample' : 'sequential from id ' + AFTER}: ${scanned}${SAMPLE ? '' : ' up to id ' + lastId}`);
    console.log(`  OK: ${ok}`);
    console.log(`  LOST-TYPE recoverable (restore compression_type_id): ${lostTypeRecoverable}${est(lostTypeRecoverable)}  by-alg=${JSON.stringify(algCount)}`);
    console.log(`  RAW-BLOB recoverable (recompress in place): ${rawBlobRecoverable}${est(rawBlobRecoverable)}`);
    console.log(`  UNRECOVERABLE: ${unrecoverable} | empty blob: ${empty}`);
    if (APPLY) console.log(`  APPLIED -> type restored: ${restoredType}, recompressed: ${recompressed}, failed: ${failed}. Resume with --after ${lastId}`);
    else console.log(`  (diagnosis only — pass --apply with the app STOPPED. Sequential resume: --after ${lastId})`);
  } finally { db.close(); }
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
