const { tof } = require('lang-tools');
const { backfillDates } = require('../../tools/backfill-dates-core');

class BackfillDatesTask {
  constructor(options) {
    this.db = options.db;
    this.taskId = options.taskId;
    this.config = options.config || {};
    this.signal = options.signal;
    this.onProgress = options.onProgress;
    this.onError = options.onError;

    this.paused = false;
    this.currentStage = 'starting';

    this.dbPath = this.config.dbPath;
    this.limit = this._num(this.config.limit, 0);
    this.batchSize = this._num(this.config.batchSize, 50);
    this.redo = Boolean(this.config.redo || this.config.force);
    this.includeNav = Boolean(this.config.includeNav);
    this.onlyUrl = typeof this.config.url === 'string' ? this.config.url.trim() : '';
    this.listExisting = Boolean(this.config.listExisting);

    this.stats = {
      processed: 0,
      batches: 0,
      backfilled: 0,
      updated: 0,
      unchanged: 0,
      missing: 0,
      existingListed: 0
    };
  }

  _num(v, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return n;
  }

  _loadResumeCursor() {
    try {
      const row = this.db.prepare('SELECT metadata FROM background_tasks WHERE id = ?').get(this.taskId);
      if (!row || !row.metadata) return 0;
      const meta = JSON.parse(row.metadata);
      const lastId = meta?.cursor?.lastId;
      return Number.isFinite(lastId) ? lastId : 0;
    } catch (_) {
      return 0;
    }
  }

  async _waitIfPaused() {
    while (this.paused && !(this.signal && this.signal.aborted)) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  async execute() {
    try {
      this.currentStage = 'starting';
      this._reportProgress('Starting date backfill', {
        stage: 'starting'
      });

      const startAfterId = this._loadResumeCursor();

      this.currentStage = 'backfill';
      this._reportProgress('Backfilling article dates from stored HTML', {
        stage: 'backfill',
        cursor: { lastId: startAfterId }
      });

      const result = await backfillDates({
        db: this.db,
        dbPath: this.dbPath,
        limit: this.limit,
        batchSize: this.batchSize,
        listExisting: this.listExisting,
        redo: this.redo,
        includeNav: this.includeNav,
        onlyUrl: this.onlyUrl,
        startAfterId,
        signal: this.signal,
        awaitIfPaused: async () => {
          await this._waitIfPaused();
        },
        onProgress: (progress) => {
          this.stats.processed = progress?.current ?? this.stats.processed;
          this._reportProgress(progress.message, {
            stage: progress?.metadata?.stage || this.currentStage,
            cursor: progress?.metadata?.cursor,
            stats: {
              ...this.stats,
              ...(progress?.metadata?.stats || {})
            },
            total: progress?.total,
            current: progress?.current
          });

          if (this.paused) {
            this._reportProgress('Paused', {
              stage: progress?.metadata?.stage || this.currentStage,
              paused: true,
              cursor: progress?.metadata?.cursor,
              stats: progress?.metadata?.stats
            });
          }
        },
        onRowEvent: () => {
          // No per-row telemetry by default (too noisy for SSE).
        },
        logger: null
      });

      // If cancelled, propagate AbortError so BackgroundTaskManager can keep CANCELLED.
      if (this.signal && this.signal.aborted) {
        const abortErr = new Error('Aborted');
        abortErr.name = 'AbortError';
        throw abortErr;
      }

      this.currentStage = 'completed';
      this._reportProgress('Date backfill completed', {
        stage: 'completed',
        final: true,
        cursor: result?.cursor,
        stats: {
          processed: result?.processed,
          batches: result?.batches,
          backfilled: result?.backfilled,
          updated: result?.updated,
          unchanged: result?.unchanged,
          missing: result?.missing,
          existingListed: result?.existingListed
        }
      });
    } catch (error) {
      if (tof(this.onError) === 'function') {
        this.onError(error);
      }
      throw error;
    }
  }

  _reportProgress(message, metadata = {}) {
    if (tof(this.onProgress) !== 'function') return;

    const current = metadata.current ?? this.stats.processed;
    const total = metadata.total ?? 0;

    const progressData = {
      current,
      total,
      message,
      metadata: {
        stage: this.currentStage,
        ...metadata
      }
    };

    // Persist cursor for resumability.
    if (!progressData.metadata.cursor && metadata.cursor) {
      progressData.metadata.cursor = metadata.cursor;
    }

    try {
      this.onProgress(progressData);
    } catch (_) {
      // ignore
    }
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
  }
}

module.exports = { BackfillDatesTask };
