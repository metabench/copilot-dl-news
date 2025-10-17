/**
 * Database module for coverage analytics and telemetry
 * Handles coverage tracking, milestone analytics, and dashboard metrics
 */
class CoverageDatabase {
  constructor(db) {
    this.db = db;
    this._ensureSchema();
    this._prepareStatements();
  }

  _ensureSchema() {
    // Coverage telemetry snapshots
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS coverage_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        snapshot_time TEXT NOT NULL,
        domain TEXT NOT NULL,
        total_hubs_expected INTEGER,
        total_hubs_discovered INTEGER,
        coverage_percentage REAL,
        gap_count INTEGER,
        active_problems INTEGER,
        milestone_count INTEGER,
        telemetry_data TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_coverage_snapshots_job_time ON coverage_snapshots(job_id, snapshot_time DESC);
      CREATE INDEX IF NOT EXISTS idx_coverage_snapshots_domain ON coverage_snapshots(domain);
      CREATE INDEX IF NOT EXISTS idx_coverage_snapshots_coverage ON coverage_snapshots(coverage_percentage DESC);
    `);

    // Hub discovery tracking
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS hub_discoveries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        discovered_at TEXT NOT NULL,
        hub_url TEXT NOT NULL,
        hub_type TEXT,
        discovery_method TEXT NOT NULL,
        confidence_score REAL,
        classification_reason TEXT,
        gap_filled BOOLEAN DEFAULT 0,
        coverage_impact REAL,
        metadata TEXT,
        UNIQUE(job_id, hub_url)
      );
      CREATE INDEX IF NOT EXISTS idx_hub_discoveries_job_discovered ON hub_discoveries(job_id, discovered_at DESC);
      CREATE INDEX IF NOT EXISTS idx_hub_discoveries_method ON hub_discoveries(discovery_method);
      CREATE INDEX IF NOT EXISTS idx_hub_discoveries_confidence ON hub_discoveries(confidence_score DESC);
    `);

    // Gap tracking and trend analysis
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS coverage_gaps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        gap_type TEXT NOT NULL,
        gap_identifier TEXT NOT NULL,
        gap_description TEXT,
        priority_score REAL DEFAULT 0,
        first_detected TEXT NOT NULL,
        last_updated TEXT NOT NULL,
        resolution_status TEXT DEFAULT 'open',
        resolution_method TEXT,
        resolved_at TEXT,
        attempts_count INTEGER DEFAULT 0,
        metadata TEXT,
        UNIQUE(job_id, gap_type, gap_identifier)
      );
      CREATE INDEX IF NOT EXISTS idx_coverage_gaps_job_status ON coverage_gaps(job_id, resolution_status);
      CREATE INDEX IF NOT EXISTS idx_coverage_gaps_priority ON coverage_gaps(priority_score DESC);
      CREATE INDEX IF NOT EXISTS idx_coverage_gaps_type ON coverage_gaps(gap_type);
    `);

    // Milestone achievement tracking
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS milestone_achievements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        milestone_type TEXT NOT NULL,
        achieved_at TEXT NOT NULL,
        threshold_value REAL,
        actual_value REAL,
        improvement_percentage REAL,
        context_data TEXT,
        celebration_level TEXT DEFAULT 'normal'
      );
      CREATE INDEX IF NOT EXISTS idx_milestone_achievements_job_achieved ON milestone_achievements(job_id, achieved_at DESC);
      CREATE INDEX IF NOT EXISTS idx_milestone_achievements_type ON milestone_achievements(milestone_type);
    `);

    // Real-time dashboard metrics
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dashboard_metrics (
        job_id TEXT NOT NULL,
        metric_name TEXT NOT NULL,
        metric_value REAL NOT NULL,
        metric_unit TEXT,
        timestamp TEXT NOT NULL,
        aggregation_period TEXT DEFAULT 'instant',
        metadata TEXT,
        PRIMARY KEY (job_id, metric_name, timestamp)
      ) WITHOUT ROWID;
      CREATE INDEX IF NOT EXISTS idx_dashboard_metrics_job_name_time ON dashboard_metrics(job_id, metric_name, timestamp DESC);
    `);
  }

  _prepareStatements() {
    // Coverage snapshot management
    this._insertCoverageSnapshotStmt = this.db.prepare(`
      INSERT INTO coverage_snapshots (
        job_id, snapshot_time, domain, total_hubs_expected, total_hubs_discovered,
        coverage_percentage, gap_count, active_problems, milestone_count, telemetry_data
      ) VALUES (
        @jobId, @snapshotTime, @domain, @totalHubsExpected, @totalHubsDiscovered,
        @coveragePercentage, @gapCount, @activeProblems, @milestoneCount, @telemetryData
      )
    `);

    this._getLatestSnapshotStmt = this.db.prepare(`
      SELECT * FROM coverage_snapshots 
      WHERE job_id = ? 
      ORDER BY snapshot_time DESC 
      LIMIT 1
    `);

    this._getSnapshotTrendStmt = this.db.prepare(`
      SELECT * FROM coverage_snapshots 
      WHERE job_id = ? AND snapshot_time >= ?
      ORDER BY snapshot_time ASC
    `);

    // Hub discovery tracking
    this._insertHubDiscoveryStmt = this.db.prepare(`
      INSERT OR IGNORE INTO hub_discoveries (
        job_id, discovered_at, hub_url, hub_type, discovery_method,
        confidence_score, classification_reason, gap_filled, coverage_impact, metadata
      ) VALUES (
        @jobId, @discoveredAt, @hubUrl, @hubType, @discoveryMethod,
        @confidenceScore, @classificationReason, @gapFilled, @coverageImpact, @metadata
      )
    `);

    this._getRecentDiscoveriesStmt = this.db.prepare(`
      SELECT * FROM hub_discoveries 
      WHERE job_id = ? AND discovered_at >= ?
      ORDER BY discovered_at DESC
      LIMIT ?
    `);

    this._getDiscoveryStatsStmt = this.db.prepare(`
      SELECT 
        discovery_method,
        COUNT(*) as discovery_count,
        AVG(confidence_score) as avg_confidence,
        COUNT(CASE WHEN gap_filled = 1 THEN 1 END) as gaps_filled
      FROM hub_discoveries 
      WHERE job_id = ?
      GROUP BY discovery_method
      ORDER BY discovery_count DESC
    `);

    // Gap management
    this._insertGapStmt = this.db.prepare(`
      INSERT OR REPLACE INTO coverage_gaps (
        job_id, gap_type, gap_identifier, gap_description, priority_score,
        first_detected, last_updated, resolution_status, attempts_count, metadata
      ) VALUES (
        @jobId, @gapType, @gapIdentifier, @gapDescription, @priorityScore,
        COALESCE((SELECT first_detected FROM coverage_gaps WHERE job_id = @jobId AND gap_type = @gapType AND gap_identifier = @gapIdentifier), @firstDetected),
        @lastUpdated, @resolutionStatus, 
        COALESCE((SELECT attempts_count FROM coverage_gaps WHERE job_id = @jobId AND gap_type = @gapType AND gap_identifier = @gapIdentifier), 0) + COALESCE(@attemptsIncrement, 0),
        @metadata
      )
    `);

    this._resolveGapStmt = this.db.prepare(`
      UPDATE coverage_gaps 
      SET resolution_status = @status, resolution_method = @method, resolved_at = datetime('now')
      WHERE id = ?
    `);

    this._getActiveGapsStmt = this.db.prepare(`
      SELECT * FROM coverage_gaps 
      WHERE job_id = ? AND resolution_status = 'open'
      ORDER BY priority_score DESC, first_detected ASC
    `);

    // Milestone tracking
    this._insertMilestoneAchievementStmt = this.db.prepare(`
      INSERT INTO milestone_achievements (
        job_id, milestone_type, achieved_at, threshold_value, actual_value,
        improvement_percentage, context_data, celebration_level
      ) VALUES (
        @jobId, @milestoneType, @achievedAt, @thresholdValue, @actualValue,
        @improvementPercentage, @contextData, @celebrationLevel
      )
    `);

    this._getRecentMilestonesStmt = this.db.prepare(`
      SELECT * FROM milestone_achievements 
      WHERE job_id = ? 
      ORDER BY achieved_at DESC 
      LIMIT ?
    `);

    // Dashboard metrics
    this._insertMetricStmt = this.db.prepare(`
      INSERT OR REPLACE INTO dashboard_metrics (
        job_id, metric_name, metric_value, metric_unit, timestamp, aggregation_period, metadata
      ) VALUES (
        @jobId, @metricName, @metricValue, @metricUnit, @timestamp, @aggregationPeriod, @metadata
      )
    `);

    this._getMetricTimeSeriesStmt = this.db.prepare(`
      SELECT * FROM dashboard_metrics 
      WHERE job_id = ? AND metric_name = ? AND timestamp >= ?
      ORDER BY timestamp ASC
    `);

    this._getLatestMetricsStmt = this.db.prepare(`
      SELECT DISTINCT metric_name, metric_value, metric_unit, timestamp, metadata
      FROM dashboard_metrics m1
      WHERE job_id = ? AND timestamp = (
        SELECT MAX(timestamp) FROM dashboard_metrics m2 
        WHERE m2.job_id = m1.job_id AND m2.metric_name = m1.metric_name
      )
      ORDER BY metric_name
    `);
  }

  // Coverage snapshot methods
  recordCoverageSnapshot({
    jobId, snapshotTime, domain, totalHubsExpected, totalHubsDiscovered,
    coveragePercentage, gapCount, activeProblems, milestoneCount, telemetryData
  }) {
    try {
      return this._insertCoverageSnapshotStmt.run({
        jobId, snapshotTime, domain, totalHubsExpected, totalHubsDiscovered,
        coveragePercentage, gapCount, activeProblems, milestoneCount,
        telemetryData: telemetryData ? JSON.stringify(telemetryData) : null
      });
    } catch (error) {
      console.error('Failed to record coverage snapshot:', error);
      return null;
    }
  }

  getLatestSnapshot(jobId) {
    try {
      const row = this._getLatestSnapshotStmt.get(jobId);
      if (row && row.telemetry_data) {
        row.telemetry_data = JSON.parse(row.telemetry_data);
      }
      return row;
    } catch (error) {
      console.error('Failed to get latest snapshot:', error);
      return null;
    }
  }

  getSnapshotTrend(jobId, sinceTime) {
    try {
      const rows = this._getSnapshotTrendStmt.all(jobId, sinceTime);
      return rows.map(row => {
        if (row.telemetry_data) {
          row.telemetry_data = JSON.parse(row.telemetry_data);
        }
        return row;
      });
    } catch (error) {
      console.error('Failed to get snapshot trend:', error);
      return [];
    }
  }

  // Hub discovery methods
  recordHubDiscovery({
    jobId, discoveredAt, hubUrl, hubType, discoveryMethod,
    confidenceScore, classificationReason, gapFilled = false, coverageImpact, metadata
  }) {
    try {
      return this._insertHubDiscoveryStmt.run({
        jobId, discoveredAt, hubUrl, hubType, discoveryMethod,
        confidenceScore, classificationReason, gapFilled, coverageImpact,
        metadata: metadata ? JSON.stringify(metadata) : null
      });
    } catch (error) {
      console.error('Failed to record hub discovery:', error);
      return null;
    }
  }

  getRecentDiscoveries(jobId, sinceTime, limit = 50) {
    try {
      const rows = this._getRecentDiscoveriesStmt.all(jobId, sinceTime, limit);
      return rows.map(row => {
        if (row.metadata) {
          row.metadata = JSON.parse(row.metadata);
        }
        return row;
      });
    } catch (error) {
      console.error('Failed to get recent discoveries:', error);
      return [];
    }
  }

  getDiscoveryStats(jobId) {
    try {
      return this._getDiscoveryStatsStmt.all(jobId);
    } catch (error) {
      console.error('Failed to get discovery stats:', error);
      return [];
    }
  }

  // Gap management methods
  recordGap({
    jobId, gapType, gapIdentifier, gapDescription, priorityScore,
    firstDetected, attemptsIncrement = 0, metadata
  }) {
    try {
      return this._insertGapStmt.run({
        jobId, gapType, gapIdentifier, gapDescription, priorityScore,
        firstDetected, lastUpdated: new Date().toISOString(),
        resolutionStatus: 'open', attemptsIncrement,
        metadata: metadata ? JSON.stringify(metadata) : null
      });
    } catch (error) {
      console.error('Failed to record gap:', error);
      return null;
    }
  }

  resolveGap(gapId, status, method) {
    try {
      return this._resolveGapStmt.run({ id: gapId, status, method });
    } catch (error) {
      console.error('Failed to resolve gap:', error);
      return null;
    }
  }

  getActiveGaps(jobId) {
    try {
      const rows = this._getActiveGapsStmt.all(jobId);
      return rows.map(row => {
        if (row.metadata) {
          row.metadata = JSON.parse(row.metadata);
        }
        return row;
      });
    } catch (error) {
      console.error('Failed to get active gaps:', error);
      return [];
    }
  }

  // Milestone tracking methods
  recordMilestoneAchievement({
    jobId, milestoneType, achievedAt, thresholdValue, actualValue,
    improvementPercentage, contextData, celebrationLevel = 'normal'
  }) {
    try {
      return this._insertMilestoneAchievementStmt.run({
        jobId, milestoneType, achievedAt, thresholdValue, actualValue,
        improvementPercentage, celebrationLevel,
        contextData: contextData ? JSON.stringify(contextData) : null
      });
    } catch (error) {
      console.error('Failed to record milestone achievement:', error);
      return null;
    }
  }

  getRecentMilestones(jobId, limit = 20) {
    try {
      const rows = this._getRecentMilestonesStmt.all(jobId, limit);
      return rows.map(row => {
        if (row.context_data) {
          row.context_data = JSON.parse(row.context_data);
        }
        return row;
      });
    } catch (error) {
      console.error('Failed to get recent milestones:', error);
      return [];
    }
  }

  // Dashboard metrics methods
  recordMetric({
    jobId, metricName, metricValue, metricUnit, timestamp,
    aggregationPeriod = 'instant', metadata
  }) {
    try {
      return this._insertMetricStmt.run({
        jobId, metricName, metricValue, metricUnit, timestamp, aggregationPeriod,
        metadata: metadata ? JSON.stringify(metadata) : null
      });
    } catch (error) {
      console.error('Failed to record metric:', error);
      return null;
    }
  }

  getMetricTimeSeries(jobId, metricName, sinceTime) {
    try {
      const rows = this._getMetricTimeSeriesStmt.all(jobId, metricName, sinceTime);
      return rows.map(row => {
        if (row.metadata) {
          row.metadata = JSON.parse(row.metadata);
        }
        return row;
      });
    } catch (error) {
      console.error('Failed to get metric time series:', error);
      return [];
    }
  }

  getLatestMetrics(jobId) {
    try {
      const rows = this._getLatestMetricsStmt.all(jobId);
      return rows.map(row => {
        if (row.metadata) {
          row.metadata = JSON.parse(row.metadata);
        }
        return row;
      });
    } catch (error) {
      console.error('Failed to get latest metrics:', error);
      return [];
    }
  }

  // Analytics and aggregation methods
  getCoverageAnalytics(jobId, timeWindow = '1 hour') {
    try {
      const query = `
        SELECT 
          MIN(coverage_percentage) as min_coverage,
          MAX(coverage_percentage) as max_coverage,
          AVG(coverage_percentage) as avg_coverage,
          COUNT(*) as snapshot_count,
          (SELECT coverage_percentage FROM coverage_snapshots WHERE job_id = ? ORDER BY snapshot_time DESC LIMIT 1) as current_coverage,
          (SELECT coverage_percentage FROM coverage_snapshots WHERE job_id = ? ORDER BY snapshot_time ASC LIMIT 1) as initial_coverage
        FROM coverage_snapshots 
        WHERE job_id = ? AND snapshot_time >= datetime('now', '-' || ? || '')
      `;
      return this.db.prepare(query).get(jobId, jobId, jobId, timeWindow);
    } catch (error) {
      console.error('Failed to get coverage analytics:', error);
      return null;
    }
  }

  getGapAnalytics(jobId) {
    try {
      const query = `
        SELECT 
          gap_type,
          COUNT(*) as total_gaps,
          COUNT(CASE WHEN resolution_status = 'open' THEN 1 END) as open_gaps,
          COUNT(CASE WHEN resolution_status = 'resolved' THEN 1 END) as resolved_gaps,
          AVG(priority_score) as avg_priority,
          AVG(attempts_count) as avg_attempts
        FROM coverage_gaps 
        WHERE job_id = ?
        GROUP BY gap_type
        ORDER BY total_gaps DESC
      `;
      return this.db.prepare(query).all(jobId);
    } catch (error) {
      console.error('Failed to get gap analytics:', error);
      return [];
    }
  }

  // Performance and maintenance
  cleanupOldTelemetry(retentionDays = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      const cutoff = cutoffDate.toISOString();

      const queries = [
        'DELETE FROM coverage_snapshots WHERE created_at < ?',
        'DELETE FROM dashboard_metrics WHERE timestamp < ?',
        'DELETE FROM milestone_achievements WHERE achieved_at < ?'
      ];

      let totalDeleted = 0;
      for (const query of queries) {
        totalDeleted += this.db.prepare(query).run(cutoff).changes;
      }

      return totalDeleted;
    } catch (error) {
      console.error('Failed to cleanup old telemetry:', error);
      return 0;
    }
  }
}

module.exports = { CoverageDatabase };