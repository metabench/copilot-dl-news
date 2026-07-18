/**
 * Ingest Admin Areas Background Task (A7)
 *
 * Runs admin-area (ADM2: county / district / department) ingestion IN the
 * app process via the extracted ingestAdminAreas() callable — the whole
 * point being to retire the app-stop dance for gazetteer writes. Reads
 * VERIFIED admin_class_map rows only (the unattended-safety gate lives in
 * the callable), so an unreviewed auto-discovered class can never leak.
 *
 * Framework contract: constructor({db, taskId, config, signal, onProgress,
 * onError, ...registrationOptions}) + async execute(). The network layer
 * (fetchSparql / fetchEntities) is passed through registrationOptions so
 * tests inject fakes and production gets the real WDQS/wbgetentities.
 */

const { ingestAdminAreas } = require('../../tools/gazetteer/ingestAdminAreas');

class IngestAdminAreasTask {
  /**
   * @param {Object} options
   * @param {Database} options.db - better-sqlite3 handle (the app's live db)
   * @param {number} options.taskId
   * @param {Object} options.config - { countries: string[], limit?: number }
   * @param {AbortSignal} options.signal
   * @param {Function} options.onProgress
   * @param {Function} options.onError
   * @param {Function} [options.fetchSparql] - injected (registrationOptions)
   * @param {Function} [options.fetchEntities] - injected (registrationOptions)
   */
  constructor(options) {
    this.db = options.db;
    this.taskId = options.taskId;
    this.config = options.config || {};
    this.signal = options.signal;
    this.onProgress = options.onProgress;
    this.onError = options.onError;

    // The taskDefinition's countries field is a CSV string; direct callers
    // may pass an array. Accept both.
    const rawCountries = this.config.countries;
    this.countries = Array.isArray(rawCountries)
      ? rawCountries.map((c) => String(c).trim().toUpperCase()).filter(Boolean)
      : String(rawCountries || '').split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
    this.limit = Number.isFinite(this.config.limit) ? this.config.limit : 200;

    // Injected via registrationOptions; undefined → callable uses real net.
    this.fetchSparql = options.fetchSparql;
    this.fetchEntities = options.fetchEntities;

    this.stats = { created: 0, existing: 0, failed: 0, classesProcessed: 0 };
  }

  async execute() {
    if (!this.countries.length) {
      throw new Error('IngestAdminAreasTask requires config.countries (ISO-3166 alpha-2 codes)');
    }
    this._report({ stage: 'starting', total: this.countries.length, message: `Ingesting admin areas for ${this.countries.join(', ')}` });

    const result = await ingestAdminAreas(this.db, {
      countries: this.countries,
      limit: this.limit,
      signal: this.signal,
      fetchSparql: this.fetchSparql,
      fetchEntities: this.fetchEntities,
      logger: { info: () => {}, warn: () => {} },
      onProgress: (p) => {
        this.stats.classesProcessed++;
        this.stats.created += p.created || 0;
        this.stats.existing += p.existing || 0;
        this.stats.failed += p.failed || 0;
        this._report({
          stage: 'ingesting',
          current: this.stats.classesProcessed,
          message: `${p.country}/${p.classQid}: +${p.created} (${p.existing} existing, ${p.failed} failed)`,
        });
      },
    });

    this.stats.created = result.created;
    this.stats.existing = result.existing;
    this.stats.failed = result.failed;
    this._report({ stage: 'completed', message: `Done: created ${result.created}, existing ${result.existing}, failed ${result.failed}`, stats: this.stats });
    return result;
  }

  _report(progress) {
    if (typeof this.onProgress === 'function') {
      try { this.onProgress(progress); } catch (_) {}
    }
  }
}

module.exports = { IngestAdminAreasTask };
