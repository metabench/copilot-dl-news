'use strict';

class GazetteerIngestionCoordinator {
  constructor({ ingestors = [], telemetry = null, logger = console } = {}) {
    this.logger = logger || console;
    this.telemetry = telemetry || null;
    this._ingestors = Array.isArray(ingestors) ? [...ingestors] : [];
    this._lastSummary = null;
  }

  registerIngestor(ingestor) {
    if (!ingestor || typeof ingestor.execute !== 'function') {
      throw new TypeError('Gazetteer ingestion requires ingestors with an execute() method');
    }
    this._ingestors.push(ingestor);
  }

  getIngestors() {
    return this._ingestors.slice();
  }

  getLastSummary() {
    return this._lastSummary;
  }

  async execute({ signal = null, onProgress = null } = {}) {
    const startedAt = Date.now();
    const snapshots = [];
    this._emitProgress(onProgress, {
      phase: 'start',
      startedAt,
      ingestorCount: this._ingestors.length
    });

    const totals = {
      ingestorsAttempted: 0,
      ingestorsCompleted: 0,
      recordsProcessed: 0,
      recordsUpserted: 0,
      errors: 0
    };

    for (const ingestor of this._ingestors) {
      if (signal?.aborted) {
        const abortErr = new Error('Gazetteer ingestion aborted');
        abortErr.name = 'AbortError';
        throw abortErr;
      }
      const ingestorId = ingestor.id || ingestor.name || 'anonymous-ingestor';
      totals.ingestorsAttempted += 1;
      this._emitProgress(onProgress, {
        phase: 'ingestor-start',
        ingestor: ingestorId
      });
      const startedAtMs = Date.now();
      let result = null;
      try {
        result = await ingestor.execute({
          signal,
          emitProgress: (payload = {}) => {
            this._emitProgress(onProgress, {
              phase: 'ingestor-progress',
              ingestor: ingestorId,
              payload
            });
          }
        }) || null;
        totals.ingestorsCompleted += 1;
        if (result && typeof result === 'object') {
          if (Number.isFinite(result.recordsProcessed)) {
            totals.recordsProcessed += result.recordsProcessed;
          }
          if (Number.isFinite(result.recordsUpserted)) {
            totals.recordsUpserted += result.recordsUpserted;
          }
          if (Number.isFinite(result.errors)) {
            totals.errors += result.errors;
          }
        }
      } catch (error) {
        totals.errors += 1;
        this._emitProgress(onProgress, {
          phase: 'ingestor-error',
          ingestor: ingestorId,
          error: error?.message || String(error)
        });
        throw wrapIngestorError(error, ingestorId);
      } finally {
        const finishedAtMs = Date.now();
        snapshots.push({
          id: ingestorId,
          result,
          durationMs: finishedAtMs - startedAtMs
        });
        this._emitProgress(onProgress, {
          phase: 'ingestor-complete',
          ingestor: ingestorId,
          durationMs: finishedAtMs - startedAtMs,
          summary: sanitizeSummary(result)
        });
      }
    }

    const finishedAt = Date.now();
    const summary = {
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt,
      ingestors: snapshots,
      totals
    };
    this._lastSummary = summary;
    this._emitProgress(onProgress, {
      phase: 'complete',
      summary
    });
    return summary;
  }

  _emitProgress(handler, payload) {
    if (typeof handler !== 'function' || !payload) {
      return;
    }
    try {
      handler({
        ...payload,
        emittedAt: Date.now()
      });
    } catch (_) {
      // best effort only
    }
  }
}

function sanitizeSummary(summary) {
  if (!summary || typeof summary !== 'object') {
    return null;
  }
  const output = {};
  if (Number.isFinite(summary.recordsProcessed)) {
    output.recordsProcessed = summary.recordsProcessed;
  }
  if (Number.isFinite(summary.recordsUpserted)) {
    output.recordsUpserted = summary.recordsUpserted;
  }
  if (Number.isFinite(summary.errors)) {
    output.errors = summary.errors;
  }
  if (summary.notes != null) {
    output.notes = summary.notes;
  }
  if (summary.preview != null) {
    output.preview = summary.preview;
  }
  return Object.keys(output).length ? output : null;
}

function wrapIngestorError(error, ingestorId) {
  if (!error) {
    const err = new Error(`Gazetteer ingestor '${ingestorId}' failed (no error details provided)`);
    err.name = 'GazetteerIngestorError';
    return err;
  }
  if (error.name && error.name.startsWith('Gazetteer')) {
    return error;
  }
  const wrapped = new Error(`Gazetteer ingestor '${ingestorId}' failed: ${error.message || String(error)}`);
  wrapped.name = 'GazetteerIngestorError';
  wrapped.cause = error;
  return wrapped;
}

module.exports = {
  GazetteerIngestionCoordinator,
  sanitizeSummary,
  wrapIngestorError
};
