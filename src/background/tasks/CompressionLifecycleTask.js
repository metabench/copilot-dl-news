/**
 * Age-Based Compression Lifecycle Background Task
 *
 * Recompresses stored content in place by age tier:
 *   - hot  (< hotMaxAgeDays, default 7):   left uncompressed (db_inline)
 *   - warm ([hot, warm) days, default 7-30): brotli_6
 *   - cold (>= warm days, default 30+):    brotli_11
 *
 * SAFETY:
 *   - dryRun defaults TRUE — an accidental trigger counts rows and writes
 *     nothing. Only an explicit dryRun:false mutates.
 *   - maxRows caps the total rows touched across all tiers (default 1000;
 *     0 = unlimited) so a single run cannot walk the whole ~28GB DB.
 *   - batchSize + delayMs throttle; signal.aborted is honoured in both loops.
 *
 * CORRECTNESS: compresses IN PLACE via CompressionFacade.compress + ncdb's
 * updateContentStorageCompressionCleanupResult (rewrites content_blob with the
 * compressed bytes and flips storage_type). It must NOT use compressAndStore,
 * which INSERTs a NEW content_storage row and returns its id — the old code
 * did that, discarded the id, and flipped the ORIGINAL row's storage_type to
 * db_compressed while leaving content_blob as raw HTML, making every processed
 * row unreadable (the read path brotli-decompresses raw bytes and throws).
 * content_sha256/uncompressed_size describe the UNCOMPRESSED content and are
 * intentionally left unchanged by the helper.
 */

const { compress, getCompressionType } = require('../../shared/utils/CompressionFacade');
const { updateContentStorageCompressionCleanupResult } = require('news-crawler-db');
const { tof } = require('lang-tools');

class CompressionLifecycleTask {
  constructor(options) {
    this.db = options.db;
    this.taskId = options.taskId;
    this.config = options.config || {};
    this.signal = options.signal;
    this.onProgress = options.onProgress;
    this.onError = options.onError;

    // Tier boundaries. The property editor emits FLAT scalars, so read flat
    // keys (a nested config.ageStrategy object never arrives from the UI).
    const hotMaxAgeDays = Number.isFinite(this.config.hotMaxAgeDays) ? this.config.hotMaxAgeDays : 7;
    const warmMaxAgeDays = Number.isFinite(this.config.warmMaxAgeDays) ? this.config.warmMaxAgeDays : 30;

    // Explicit, contiguous, non-overlapping age windows (in days-old). No
    // Infinity: cold is simply "older than the warm boundary", no upper bound.
    //   hot : [0, hot)    -> never compressed (compression: null)
    //   warm: [hot, warm) -> brotli_6
    //   cold: [warm, ∞)   -> brotli_11
    this.tiers = [
      { name: 'hot', minAgeDays: 0, maxAgeDays: hotMaxAgeDays, compression: null },
      { name: 'warm', minAgeDays: hotMaxAgeDays, maxAgeDays: warmMaxAgeDays, compression: 'brotli_6' },
      { name: 'cold', minAgeDays: warmMaxAgeDays, maxAgeDays: null, compression: 'brotli_11' }
    ];

    this.batchSize = Math.max(1, this.config.batchSize || 100);
    this.delayMs = this.config.delayMs != null ? this.config.delayMs : 50;
    // SAFETY: dry run is the DEFAULT. Only an explicit dryRun===false mutates.
    this.dryRun = this.config.dryRun !== false;
    // Hard cap on rows touched across all tiers. 0 = unlimited.
    this.maxRows = this.config.maxRows == null ? 1000 : this.config.maxRows;
  }

  async execute() {
    try {
      const total = this._countEligible();
      let totalProcessed = 0;
      let totalErrors = 0;
      let totalSkipped = 0;
      let consumed = 0;

      for (const tier of this.tiers) {
        if (this.signal && this.signal.aborted) break;
        const remaining = this.maxRows > 0 ? (this.maxRows - consumed) : Infinity;
        if (remaining <= 0) break;

        const r = await this._processTier(tier, remaining, { consumed, total });
        totalProcessed += r.processed;
        totalErrors += r.errors;
        totalSkipped += r.skipped;
        consumed += r.consumed;
      }

      if (tof(this.onProgress) === 'function') {
        this.onProgress({
          current: consumed,
          total,
          message: this.dryRun
            ? `Dry run complete: ${totalSkipped} rows would be compressed (0 written)`
            : `Lifecycle complete: ${totalProcessed} rows compressed, ${totalErrors} errors`,
          metadata: { dryRun: this.dryRun, maxRows: this.maxRows, totalProcessed, totalErrors, totalSkipped }
        });
      }
    } catch (error) {
      // Re-throw ONLY. The manager wires onError->_handleError AND
      // .catch(_handleError), so also calling this.onError here double-reports;
      // re-throwing lets the manager's .catch mark the run failed (not completed).
      throw error;
    }
  }

  /** Count rows eligible for any compression tier (older than the hot window). @private */
  _countEligible() {
    const hot = this.tiers[0].maxAgeDays;
    return this.db.prepare(`
      SELECT COUNT(*) AS c
      FROM content_storage cs
      INNER JOIN http_responses hr ON cs.http_response_id = hr.id
      WHERE cs.storage_type = 'db_inline'
        AND cs.content_blob IS NOT NULL
        AND LENGTH(cs.content_blob) > 0
        AND hr.fetched_at < datetime('now', ?)
    `).get(`-${hot} days`).c;
  }

  /**
   * Process a single age tier in place. minAgeDays is the "older than" bound,
   * maxAgeDays the "younger than" bound (null = no upper bound).
   * @private
   */
  async _processTier(tier, remaining, ctx) {
    const { name, minAgeDays, maxAgeDays, compression } = tier;
    let processed = 0;
    let errors = 0;
    let skipped = 0;
    let lastProcessedId = 0;

    if (!compression) return { processed, errors, skipped, consumed: 0 }; // hot: never compress

    const type = getCompressionType(this.db, compression); // { id, algorithm, level, window_bits, block_bits }

    // Age window as PARAMETERS (no string interpolation of the day counts):
    //   warm -> fetched_at < now-7d  AND fetched_at >= now-30d
    //   cold -> fetched_at < now-30d
    const ageParams = [`-${minAgeDays} days`];
    let ageClause = `hr.fetched_at < datetime('now', ?)`;
    if (maxAgeDays != null) {
      ageClause += ` AND hr.fetched_at >= datetime('now', ?)`;
      ageParams.push(`-${maxAgeDays} days`);
    }

    const select = this.db.prepare(`
      SELECT cs.id, cs.content_blob
      FROM content_storage cs
      INNER JOIN http_responses hr ON cs.http_response_id = hr.id
      WHERE cs.id > ?
        AND cs.storage_type = 'db_inline'
        AND cs.content_blob IS NOT NULL
        AND LENGTH(cs.content_blob) > 0
        AND ${ageClause}
      ORDER BY cs.id ASC
      LIMIT ?
    `);

    while (!(this.signal && this.signal.aborted) && remaining > 0) {
      const limit = Math.min(this.batchSize, remaining);
      const rows = select.all(lastProcessedId, ...ageParams, limit);
      if (rows.length === 0) break; // tier drained

      for (const row of rows) {
        if ((this.signal && this.signal.aborted) || remaining <= 0) break;
        remaining--; // this row consumes a cap slot

        if (this.dryRun) {
          // Count-only: NO write, but ADVANCE the cursor so the loop terminates.
          skipped++;
          lastProcessedId = row.id;
          continue;
        }

        try {
          const result = compress(row.content_blob, {
            algorithm: type.algorithm,
            level: type.level,
            windowBits: type.window_bits,
            blockBits: type.block_bits
          });
          // In-place rewrite of the SAME row via ncdb (sets content_blob to the
          // compressed bytes + storage_type='db_compressed'; leaves
          // content_sha256/uncompressed_size, which describe the uncompressed content).
          updateContentStorageCompressionCleanupResult(this.db, {
            id: row.id,
            compressionTypeId: type.id,
            contentBlob: result.compressed,
            compressedSize: result.compressedSize,
            compressionRatio: result.ratio
          });
          processed++;
          lastProcessedId = row.id;
        } catch (error) {
          errors++;
          lastProcessedId = row.id; // advance past the poison row
          console.error(`[CompressionLifecycleTask] Error compressing content ${row.id} in ${name} tier:`, error.message);
        }
      }

      if (tof(this.onProgress) === 'function') {
        this.onProgress({
          current: ctx.consumed + processed + skipped + errors,
          total: ctx.total,
          message: this.dryRun
            ? `Dry run ${name}: ${skipped} rows would be compressed`
            : `Compressing ${name}: ${processed} done, ${errors} errors`,
          metadata: { tier: name, dryRun: this.dryRun, processed, errors, skipped, lastProcessedId }
        });
      }

      if (this.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.delayMs));
      }
    }

    return { processed, errors, skipped, consumed: processed + skipped + errors };
  }

  /** @private */
  _getCompressionTypeId(name) {
    const type = this.db.prepare('SELECT id FROM compression_types WHERE name = ?').get(name);
    return type ? type.id : null;
  }

  pause() { /* age-based runs are short + resume-safe via the id cursor; no-op */ }
  resume() { /* no-op */ }
}

module.exports = { CompressionLifecycleTask };
