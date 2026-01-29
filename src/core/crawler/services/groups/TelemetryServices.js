'use strict';

const EventEmitter = require('events');

/**
 * TelemetryServices - Events, metrics, and progress tracking.
 *
 * Groups:
 * - eventBus: Central event emitter
 * - progressTracker: Progress percentage and ETA
 * - telemetry (facade): Unified telemetry interface
 *
 * @param {ServiceContainer} container - The service container
 * @param {Object} config - Crawler configuration
 */
function registerTelemetryServices(container, config) {
  // Central event bus
  container.register('eventBus', () => {
    const bus = new EventEmitter();
    bus.setMaxListeners(50); // Crawlers have many listeners
    return bus;
  }, { group: 'telemetry' });

  // Metrics collector
  container.register('metricsCollector', (c) => {
    const context = c.get('context');

    return {
      _snapshots: [],
      _lastSnapshot: null,

      /**
       * Take a metrics snapshot.
       * @returns {Object}
       */
      snapshot() {
        const now = Date.now();
        const stats = context.stats;

        const snapshot = {
          timestamp: now,
          visited: stats.visited,
          queued: stats.queued,
          articles: stats.articles,
          errors: stats.errors,
          bytesDownloaded: stats.bytesDownloaded,
          pagesPerSecond: context.pagesPerSecond,
          elapsedMs: context.elapsedMs
        };

        this._snapshots.push(snapshot);
        this._lastSnapshot = snapshot;

        // Keep only last 100 snapshots
        if (this._snapshots.length > 100) {
          this._snapshots.shift();
        }

        return snapshot;
      },

      /**
       * Get rate of change between snapshots.
       * @param {string} metric
       * @returns {number} Change per second
       */
      getRate(metric) {
        if (this._snapshots.length < 2) return 0;

        const latest = this._snapshots[this._snapshots.length - 1];
        const previous = this._snapshots[this._snapshots.length - 2];
        const timeDelta = (latest.timestamp - previous.timestamp) / 1000;

        if (timeDelta === 0) return 0;
        return (latest[metric] - previous[metric]) / timeDelta;
      },

      /**
       * Get all snapshots.
       * @returns {Array}
       */
      getSnapshots() {
        return [...this._snapshots];
      },

      /**
       * Get last snapshot.
       * @returns {Object|null}
       */
      getLastSnapshot() {
        return this._lastSnapshot;
      }
    };
  }, { group: 'telemetry', dependencies: ['context'] });

  // Progress tracker
  container.register('progressTracker', (c) => {
    const context = c.get('context');
    const eventBus = c.get('eventBus');

    return {
      _callbacks: [],

      /**
       * Get current progress.
       * @returns {Object}
       */
      getProgress() {
        const stats = context.stats;
        const maxPages = config.maxPages || null;

        let percent = 0;
        if (maxPages) {
          percent = Math.min(100, (stats.visited / maxPages) * 100);
        } else if (stats.visited + stats.queued > 0) {
          percent = (stats.visited / (stats.visited + stats.queued)) * 100;
        }

        return {
          percent: Math.round(percent * 10) / 10,
          visited: stats.visited,
          queued: stats.queued,
          remaining: maxPages ? Math.max(0, maxPages - stats.visited) : stats.queued,
          eta: this._estimateETA()
        };
      },

      /**
       * Estimate time remaining.
       * @private
       */
      _estimateETA() {
        const pps = context.pagesPerSecond;
        if (pps === 0) return null;

        const progress = this.getProgress();
        if (progress.remaining === 0) return 0;

        const secondsRemaining = progress.remaining / pps;
        return Math.round(secondsRemaining * 1000); // Return ms
      },

      /**
       * Register progress callback.
       * @param {Function} callback
       */
      onProgress(callback) {
        this._callbacks.push(callback);
      },

      /**
       * Emit progress update.
       */
      emitProgress() {
        const progress = this.getProgress();
        for (const cb of this._callbacks) {
          try {
            cb(progress);
          } catch (e) {
            // Ignore callback errors
          }
        }
        eventBus.emit('progress', progress);
      }
    };
  }, { group: 'telemetry', dependencies: ['context', 'eventBus'] });

  // Telemetry facade
  container.register('telemetry', (c) => {
    const eventBus = c.get('eventBus');
    const progressTracker = c.get('progressTracker');
    const metricsCollector = c.get('metricsCollector');
    const context = c.get('context');

    return {
      events: eventBus,
      progress: progressTracker,
      metrics: metricsCollector,

      /**
       * Emit an event.
       * @param {string} event
       * @param {Object} data
       */
      emit(event, data = {}) {
        eventBus.emit(event, { ...data, timestamp: Date.now() });
      },

      /**
       * Subscribe to an event.
       * @param {string} event
       * @param {Function} handler
       */
      on(event, handler) {
        eventBus.on(event, handler);
      },

      /**
       * Subscribe to an event once.
       * @param {string} event
       * @param {Function} handler
       */
      once(event, handler) {
        eventBus.once(event, handler);
      },

      /**
       * Get current telemetry snapshot.
       * @returns {Object}
       */
      getSnapshot() {
        return {
          progress: progressTracker.getProgress(),
          metrics: metricsCollector.snapshot(),
          status: context.status,
          elapsedMs: context.elapsedMs
        };
      },

      /**
       * Sequence runner telemetry handlers.
       */
      forSequenceRunner() {
        return {
          onSequenceStart: (data) => eventBus.emit('sequence:start', data),
          onSequenceComplete: (data) => eventBus.emit('sequence:complete', data),
          onStepEvent: (data) => eventBus.emit('sequence:step', data)
        };
      }
    };
  }, { group: 'facades', dependencies: ['eventBus', 'progressTracker', 'metricsCollector', 'context'] });
}

module.exports = { registerTelemetryServices };
