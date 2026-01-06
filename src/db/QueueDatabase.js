/**
 * Database module for queue management and prioritization features
 * Handles queue events, priority scoring, problem clustering, and gap tracking
 */
class QueueDatabase {
  constructor(db) {
    this.db = db;
    this._ensureSchema();
    this._prepareStatements();
  }

  _ensureUrlId(url) {
    if (!url) return null;

    try {
      // Try to get existing URL ID
      let urlRow = this.db.prepare('SELECT id FROM urls WHERE url = ?').get(url);
      if (urlRow) return urlRow.id;

      // URL doesn't exist, insert it
      const host = (() => {
        try {
          const u = new URL(url);
          return u.hostname.toLowerCase();
        } catch (_) {
          return null;
        }
      })();

      const result = this.db.prepare(`
        INSERT INTO urls (url, host, created_at, last_seen_at)
        VALUES (?, ?, datetime('now'), datetime('now'))
      `).run(url, host);

      return result.lastInsertRowid;
    } catch (err) {
      console.warn(`[QueueDatabase] Failed to ensure URL ${url}:`, err?.message || err);
      return null;
    }
  }

  _ensureSchema() {
    // Enhanced queue events with priority metadata
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS queue_events_enhanced (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        ts TEXT NOT NULL,
        action TEXT NOT NULL,
        url_id INTEGER,
        depth INTEGER,
        host TEXT,
        reason TEXT,
        queue_size INTEGER,
        alias TEXT,
        queue_origin TEXT,
        queue_role TEXT,
        queue_depth_bucket TEXT,
        priority_score REAL,
        priority_source TEXT,
        bonus_applied REAL,
        cluster_id TEXT,
        gap_prediction_score REAL,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_queue_events_enhanced_job_ts ON queue_events_enhanced(job_id, ts DESC);
      CREATE INDEX IF NOT EXISTS idx_queue_events_enhanced_priority ON queue_events_enhanced(priority_score DESC);
      CREATE INDEX IF NOT EXISTS idx_queue_events_enhanced_cluster ON queue_events_enhanced(cluster_id);
      CREATE INDEX IF NOT EXISTS idx_queue_events_enhanced_host ON queue_events_enhanced(host);
    `);

    // Problem clustering table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS problem_clusters (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        scope TEXT,
        target TEXT,
        first_seen TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        occurrence_count INTEGER DEFAULT 1,
        priority_boost REAL DEFAULT 0,
        status TEXT DEFAULT 'active',
        cluster_metadata TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_problem_clusters_job_kind ON problem_clusters(job_id, kind);
      CREATE INDEX IF NOT EXISTS idx_problem_clusters_status ON problem_clusters(status);
      CREATE INDEX IF NOT EXISTS idx_problem_clusters_boost ON problem_clusters(priority_boost DESC);
    `);

    // Gap prediction tracking
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS gap_predictions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        predicted_url TEXT NOT NULL,
        prediction_source TEXT NOT NULL,
        confidence_score REAL NOT NULL,
        gap_type TEXT,
        expected_coverage_lift REAL,
        validation_status TEXT DEFAULT 'pending',
        validation_result TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        validated_at TEXT,
        UNIQUE(job_id, predicted_url)
      );
      CREATE INDEX IF NOT EXISTS idx_gap_predictions_job_confidence ON gap_predictions(job_id, confidence_score DESC);
      CREATE INDEX IF NOT EXISTS idx_gap_predictions_status ON gap_predictions(validation_status);
    `);

    // Priority configuration audit log
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS priority_config_changes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        changed_at TEXT DEFAULT (datetime('now')),
        changed_by TEXT,
        change_type TEXT NOT NULL,
        old_values TEXT,
        new_values TEXT,
        impact_assessment TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_priority_config_changes_ts ON priority_config_changes(changed_at DESC);
    `);
  }

  _prepareStatements() {
    // Enhanced queue event insertion
    this._insertEnhancedQueueEventStmt = this.db.prepare(`
      INSERT INTO queue_events_enhanced (
        job_id, ts, action, url_id, depth, host, reason, queue_size, alias,
        queue_origin, queue_role, queue_depth_bucket,
        priority_score, priority_source, bonus_applied, cluster_id, gap_prediction_score
      ) VALUES (
        @jobId, @ts, @action, @urlId, @depth, @host, @reason, @queueSize, @alias,
        @queueOrigin, @queueRole, @queueDepthBucket,
        @priorityScore, @prioritySource, @bonusApplied, @clusterId, @gapPredictionScore
      )
    `);

    // Problem cluster management
    this._insertProblemClusterStmt = this.db.prepare(`
      INSERT OR REPLACE INTO problem_clusters (
        id, job_id, kind, scope, target, first_seen, last_seen, occurrence_count,
        priority_boost, status, cluster_metadata, updated_at
      ) VALUES (
        @id, @jobId, @kind, @scope, @target, 
        COALESCE((SELECT first_seen FROM problem_clusters WHERE id = @id), @firstSeen),
        @lastSeen, @occurrenceCount, @priorityBoost, @status, @clusterMetadata, datetime('now')
      )
    `);

    this._getProblemClusterStmt = this.db.prepare(`
      SELECT * FROM problem_clusters WHERE id = ?
    `);

    this._getActiveClustersStmt = this.db.prepare(`
      SELECT * FROM problem_clusters 
      WHERE job_id = ? AND status = 'active' 
      ORDER BY priority_boost DESC, occurrence_count DESC
    `);

    // Gap prediction management
    this._insertGapPredictionStmt = this.db.prepare(`
      INSERT OR IGNORE INTO gap_predictions (
        job_id, predicted_url, prediction_source, confidence_score,
        gap_type, expected_coverage_lift
      ) VALUES (@jobId, @predictedUrl, @predictionSource, @confidenceScore, @gapType, @expectedCoverageLift)
    `);

    this._updateGapValidationStmt = this.db.prepare(`
      UPDATE gap_predictions 
      SET validation_status = @status, validation_result = @result, validated_at = datetime('now')
      WHERE id = @id
    `);

    this._getTopGapPredictionsStmt = this.db.prepare(`
      SELECT * FROM gap_predictions 
      WHERE job_id = ? AND validation_status = 'pending'
      ORDER BY confidence_score DESC, expected_coverage_lift DESC
      LIMIT ?
    `);

    // Priority configuration tracking
    this._logConfigChangeStmt = this.db.prepare(`
      INSERT INTO priority_config_changes (changed_by, change_type, old_values, new_values, impact_assessment)
      VALUES (@changedBy, @changeType, @oldValues, @newValues, @impactAssessment)
    `);
  }

  // Enhanced queue event logging
  logEnhancedQueueEvent({
    jobId, ts, action, url, depth, host, reason, queueSize, alias,
    queueOrigin, queueRole, queueDepthBucket,
    priorityScore, prioritySource, bonusApplied, clusterId, gapPredictionScore
  }) {
    // Skip logging if URL is missing (required by schema)
    if (!url) {
      return null;
    }
    try {
      const urlId = this._ensureUrlId(url);
      return this._insertEnhancedQueueEventStmt.run({
        jobId, ts, action, urlId, depth, host, reason, queueSize, alias,
        queueOrigin: queueOrigin || null,
        queueRole: queueRole || null,
        queueDepthBucket: queueDepthBucket || null,
        priorityScore: priorityScore || null,
        prioritySource: prioritySource || null,
        bonusApplied: bonusApplied || null,
        clusterId: clusterId || null,
        gapPredictionScore: gapPredictionScore || null
      });
    } catch (error) {
      console.error('Failed to log enhanced queue event:', error);
      return null;
    }
  }

  // Problem clustering methods
  createOrUpdateProblemCluster({
    id, jobId, kind, scope, target, firstSeen, lastSeen, occurrenceCount = 1,
    priorityBoost = 0, status = 'active', clusterMetadata = null
  }) {
    try {
      return this._insertProblemClusterStmt.run({
        id, jobId, kind, scope, target, firstSeen, lastSeen, occurrenceCount,
        priorityBoost, status, clusterMetadata: clusterMetadata ? JSON.stringify(clusterMetadata) : null
      });
    } catch (error) {
      console.error('Failed to create/update problem cluster:', error);
      return null;
    }
  }

  getProblemCluster(clusterId) {
    try {
      const row = this._getProblemClusterStmt.get(clusterId);
      if (row && row.cluster_metadata) {
        row.cluster_metadata = JSON.parse(row.cluster_metadata);
      }
      return row;
    } catch (error) {
      console.error('Failed to get problem cluster:', error);
      return null;
    }
  }

  getActiveClusters(jobId) {
    try {
      const rows = this._getActiveClustersStmt.all(jobId);
      return rows.map(row => {
        if (row.cluster_metadata) {
          row.cluster_metadata = JSON.parse(row.cluster_metadata);
        }
        return row;
      });
    } catch (error) {
      console.error('Failed to get active clusters:', error);
      return [];
    }
  }

  // Gap prediction methods
  recordGapPrediction({
    jobId, predictedUrl, predictionSource, confidenceScore,
    gapType, expectedCoverageLift
  }) {
    try {
      return this._insertGapPredictionStmt.run({
        jobId, predictedUrl, predictionSource, confidenceScore,
        gapType: gapType || null,
        expectedCoverageLift: expectedCoverageLift || null
      });
    } catch (error) {
      console.error('Failed to record gap prediction:', error);
      return null;
    }
  }

  validateGapPrediction(id, status, result) {
    try {
      return this._updateGapValidationStmt.run({ id, status, result });
    } catch (error) {
      console.error('Failed to validate gap prediction:', error);
      return null;
    }
  }

  getTopGapPredictions(jobId, limit = 50) {
    try {
      return this._getTopGapPredictionsStmt.all(jobId, limit);
    } catch (error) {
      console.error('Failed to get gap predictions:', error);
      return [];
    }
  }

  // Configuration change logging
  logConfigChange(changedBy, changeType, oldValues, newValues, impactAssessment = null) {
    try {
      return this._logConfigChangeStmt.run({
        changedBy, changeType,
        oldValues: JSON.stringify(oldValues),
        newValues: JSON.stringify(newValues),
        impactAssessment
      });
    } catch (error) {
      console.error('Failed to log config change:', error);
      return null;
    }
  }

  // Analytics and reporting
  getQueueAnalytics(jobId, timeWindow = '1 hour') {
    try {
      const query = `
        SELECT 
          action,
          priority_source,
          COUNT(*) as count,
          AVG(priority_score) as avg_priority,
          AVG(bonus_applied) as avg_bonus,
          AVG(gap_prediction_score) as avg_gap_score
        FROM queue_events_enhanced 
        WHERE job_id = ? AND ts > datetime('now', '-' || ? || '')
        GROUP BY action, priority_source
        ORDER BY count DESC
      `;
      return this.db.prepare(query).all(jobId, timeWindow);
    } catch (error) {
      console.error('Failed to get queue analytics:', error);
      return [];
    }
  }

  getClusterAnalytics(jobId) {
    try {
      const query = `
        SELECT 
          kind,
          COUNT(*) as cluster_count,
          SUM(occurrence_count) as total_occurrences,
          AVG(priority_boost) as avg_boost,
          MAX(priority_boost) as max_boost
        FROM problem_clusters 
        WHERE job_id = ? AND status = 'active'
        GROUP BY kind
        ORDER BY total_occurrences DESC
      `;
      return this.db.prepare(query).all(jobId);
    } catch (error) {
      console.error('Failed to get cluster analytics:', error);
      return [];
    }
  }
}

const { ensureUrlId } = require('./sqlite/urlHelpers');

module.exports = { QueueDatabase };
