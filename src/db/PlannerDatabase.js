/**
 * Database module for planner knowledge management and pattern reuse
 * Handles pattern caching, hub validation, and knowledge persistence
 */
class PlannerDatabase {
  constructor(db) {
    this.db = db;
    this._ensureSchema();
    this._prepareStatements();
  }

  _ensureSchema() {
    // Pattern knowledge storage
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS planner_patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT NOT NULL,
        pattern_type TEXT NOT NULL,
        pattern_regex TEXT NOT NULL,
        success_count INTEGER DEFAULT 0,
        failure_count INTEGER DEFAULT 0,
        confidence_score REAL DEFAULT 0.0,
        last_validated TEXT,
        metadata TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(domain, pattern_type, pattern_regex)
      );
      CREATE INDEX IF NOT EXISTS idx_planner_patterns_domain_type ON planner_patterns(domain, pattern_type);
      CREATE INDEX IF NOT EXISTS idx_planner_patterns_confidence ON planner_patterns(confidence_score DESC);
      CREATE INDEX IF NOT EXISTS idx_planner_patterns_updated ON planner_patterns(updated_at DESC);
    `);

    // Hub validation cache
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS hub_validations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT NOT NULL,
        hub_url TEXT NOT NULL,
        hub_type TEXT NOT NULL,
        validation_status TEXT NOT NULL,
        classification_confidence REAL,
        last_fetch_status INTEGER,
        content_indicators TEXT,
        validation_method TEXT,
        validated_at TEXT NOT NULL,
        expires_at TEXT,
        revalidation_priority INTEGER DEFAULT 0,
        metadata TEXT,
        UNIQUE(domain, hub_url)
      );
      CREATE INDEX IF NOT EXISTS idx_hub_validations_domain_status ON hub_validations(domain, validation_status);
      CREATE INDEX IF NOT EXISTS idx_hub_validations_expires ON hub_validations(expires_at);
      CREATE INDEX IF NOT EXISTS idx_hub_validations_priority ON hub_validations(revalidation_priority DESC);
    `);

    // Knowledge reuse tracking
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_reuse_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        reuse_type TEXT NOT NULL,
        source_pattern_id INTEGER,
        source_hub_id INTEGER,
        reused_url TEXT,
        success_outcome BOOLEAN,
        time_saved_ms INTEGER,
        confidence_at_reuse REAL,
        outcome_details TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (source_pattern_id) REFERENCES planner_patterns(id),
        FOREIGN KEY (source_hub_id) REFERENCES hub_validations(id)
      );
      CREATE INDEX IF NOT EXISTS idx_knowledge_reuse_job ON knowledge_reuse_events(job_id);
      CREATE INDEX IF NOT EXISTS idx_knowledge_reuse_type_success ON knowledge_reuse_events(reuse_type, success_outcome);
    `);

    // Cross-crawl knowledge sharing
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cross_crawl_knowledge (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_domain TEXT NOT NULL,
        knowledge_type TEXT NOT NULL,
        knowledge_key TEXT NOT NULL,
        knowledge_value TEXT NOT NULL,
        confidence_level REAL NOT NULL,
        usage_count INTEGER DEFAULT 0,
        last_used TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(source_domain, knowledge_type, knowledge_key)
      );
      CREATE INDEX IF NOT EXISTS idx_cross_crawl_domain_type ON cross_crawl_knowledge(source_domain, knowledge_type);
      CREATE INDEX IF NOT EXISTS idx_cross_crawl_confidence ON cross_crawl_knowledge(confidence_level DESC);
      CREATE INDEX IF NOT EXISTS idx_cross_crawl_usage ON cross_crawl_knowledge(usage_count DESC);
    `);
  }

  _prepareStatements() {
    // Pattern management
    this._insertPatternStmt = this.db.prepare(`
      INSERT OR REPLACE INTO planner_patterns (
        domain, pattern_type, pattern_regex, success_count, failure_count,
        confidence_score, last_validated, metadata, updated_at
      ) VALUES (
        @domain, @patternType, @patternRegex, 
        COALESCE((SELECT success_count FROM planner_patterns WHERE domain = @domain AND pattern_type = @patternType AND pattern_regex = @patternRegex), 0) + COALESCE(@successIncrement, 0),
        COALESCE((SELECT failure_count FROM planner_patterns WHERE domain = @domain AND pattern_type = @patternType AND pattern_regex = @patternRegex), 0) + COALESCE(@failureIncrement, 0),
        @confidenceScore, @lastValidated, @metadata, datetime('now')
      )
    `);

    this._getPatternsByDomainStmt = this.db.prepare(`
      SELECT * FROM planner_patterns 
      WHERE domain = ? AND confidence_score >= ?
      ORDER BY confidence_score DESC, success_count DESC
    `);

    this._updatePatternSuccessStmt = this.db.prepare(`
      UPDATE planner_patterns 
      SET success_count = success_count + 1, 
          confidence_score = CASE 
            WHEN (success_count + failure_count + 1) > 0 THEN 
              (success_count + 1.0) / (success_count + failure_count + 1)
            ELSE 0.5 
          END,
          last_validated = datetime('now'),
          updated_at = datetime('now')
      WHERE id = ?
    `);

    this._updatePatternFailureStmt = this.db.prepare(`
      UPDATE planner_patterns 
      SET failure_count = failure_count + 1,
          confidence_score = CASE 
            WHEN (success_count + failure_count + 1) > 0 THEN 
              success_count / (success_count + failure_count + 1.0)
            ELSE 0.5 
          END,
          updated_at = datetime('now')
      WHERE id = ?
    `);

    // Hub validation management
    this._insertHubValidationStmt = this.db.prepare(`
      INSERT OR REPLACE INTO hub_validations (
        domain, hub_url, hub_type, validation_status, classification_confidence,
        last_fetch_status, content_indicators, validation_method, validated_at,
        expires_at, revalidation_priority, metadata
      ) VALUES (
        @domain, @hubUrl, @hubType, @validationStatus, @classificationConfidence,
        @lastFetchStatus, @contentIndicators, @validationMethod, @validatedAt,
        @expiresAt, @revalidationPriority, @metadata
      )
    `);

    this._getValidatedHubsStmt = this.db.prepare(`
      SELECT * FROM hub_validations 
      WHERE domain = ? AND validation_status = 'valid' 
      AND (expires_at IS NULL OR expires_at > datetime('now'))
      ORDER BY classification_confidence DESC
    `);

    this._getExpiredHubsStmt = this.db.prepare(`
      SELECT * FROM hub_validations 
      WHERE expires_at <= datetime('now') OR revalidation_priority > 5
      ORDER BY revalidation_priority DESC, expires_at ASC
      LIMIT ?
    `);

    // Knowledge reuse tracking
    this._insertReuseEventStmt = this.db.prepare(`
      INSERT INTO knowledge_reuse_events (
        job_id, reuse_type, source_pattern_id, source_hub_id, reused_url,
        success_outcome, time_saved_ms, confidence_at_reuse, outcome_details
      ) VALUES (
        @jobId, @reuseType, @sourcePatternId, @sourceHubId, @reusedUrl,
        @successOutcome, @timeSavedMs, @confidenceAtReuse, @outcomeDetails
      )
    `);

    // Cross-crawl knowledge
    this._insertCrossCrawlKnowledgeStmt = this.db.prepare(`
      INSERT OR REPLACE INTO cross_crawl_knowledge (
        source_domain, knowledge_type, knowledge_key, knowledge_value,
        confidence_level, usage_count, last_used, updated_at
      ) VALUES (
        @sourceDomain, @knowledgeType, @knowledgeKey, @knowledgeValue,
        @confidenceLevel, 
        COALESCE((SELECT usage_count FROM cross_crawl_knowledge WHERE source_domain = @sourceDomain AND knowledge_type = @knowledgeType AND knowledge_key = @knowledgeKey), 0),
        @lastUsed, datetime('now')
      )
    `);

    this._incrementKnowledgeUsageStmt = this.db.prepare(`
      UPDATE cross_crawl_knowledge 
      SET usage_count = usage_count + 1, last_used = datetime('now')
      WHERE id = ?
    `);

    this._getCrossCrawlKnowledgeStmt = this.db.prepare(`
      SELECT * FROM cross_crawl_knowledge 
      WHERE source_domain = ? AND knowledge_type = ? AND confidence_level >= ?
      ORDER BY confidence_level DESC, usage_count DESC
    `);
  }

  // Pattern management methods
  recordPattern({ domain, patternType, patternRegex, successIncrement = 0, failureIncrement = 0, confidenceScore, metadata = null }) {
    try {
      return this._insertPatternStmt.run({
        domain, patternType, patternRegex, successIncrement, failureIncrement,
        confidenceScore: confidenceScore || 0.5,
        lastValidated: new Date().toISOString(),
        metadata: metadata ? JSON.stringify(metadata) : null
      });
    } catch (error) {
      console.error('Failed to record pattern:', error);
      return null;
    }
  }

  getPatternsByDomain(domain, minConfidence = 0.3) {
    try {
      const rows = this._getPatternsByDomainStmt.all(domain, minConfidence);
      return rows.map(row => {
        if (row.metadata) {
          row.metadata = JSON.parse(row.metadata);
        }
        return row;
      });
    } catch (error) {
      console.error('Failed to get patterns by domain:', error);
      return [];
    }
  }

  updatePatternSuccess(patternId) {
    try {
      return this._updatePatternSuccessStmt.run(patternId);
    } catch (error) {
      console.error('Failed to update pattern success:', error);
      return null;
    }
  }

  updatePatternFailure(patternId) {
    try {
      return this._updatePatternFailureStmt.run(patternId);
    } catch (error) {
      console.error('Failed to update pattern failure:', error);
      return null;
    }
  }

  // Hub validation methods
  recordHubValidation({
    domain, hubUrl, hubType, validationStatus, classificationConfidence,
    lastFetchStatus, contentIndicators, validationMethod, expiresAt,
    revalidationPriority = 0, metadata = null
  }) {
    try {
      return this._insertHubValidationStmt.run({
        domain, hubUrl, hubType, validationStatus, classificationConfidence,
        lastFetchStatus, contentIndicators: JSON.stringify(contentIndicators),
        validationMethod, validatedAt: new Date().toISOString(),
        expiresAt, revalidationPriority,
        metadata: metadata ? JSON.stringify(metadata) : null
      });
    } catch (error) {
      console.error('Failed to record hub validation:', error);
      return null;
    }
  }

  getValidatedHubs(domain) {
    try {
      const rows = this._getValidatedHubsStmt.all(domain);
      return rows.map(row => {
        if (row.content_indicators) {
          row.content_indicators = JSON.parse(row.content_indicators);
        }
        if (row.metadata) {
          row.metadata = JSON.parse(row.metadata);
        }
        return row;
      });
    } catch (error) {
      console.error('Failed to get validated hubs:', error);
      return [];
    }
  }

  getExpiredHubs(limit = 20) {
    try {
      const rows = this._getExpiredHubsStmt.all(limit);
      return rows.map(row => {
        if (row.content_indicators) {
          row.content_indicators = JSON.parse(row.content_indicators);
        }
        if (row.metadata) {
          row.metadata = JSON.parse(row.metadata);
        }
        return row;
      });
    } catch (error) {
      console.error('Failed to get expired hubs:', error);
      return [];
    }
  }

  // Knowledge reuse tracking
  recordReuseEvent({
    jobId, reuseType, sourcePatternId, sourceHubId, reusedUrl,
    successOutcome, timeSavedMs, confidenceAtReuse, outcomeDetails
  }) {
    try {
      return this._insertReuseEventStmt.run({
        jobId, reuseType, sourcePatternId: sourcePatternId || null,
        sourceHubId: sourceHubId || null, reusedUrl, successOutcome,
        timeSavedMs: timeSavedMs || null, confidenceAtReuse,
        outcomeDetails: outcomeDetails ? JSON.stringify(outcomeDetails) : null
      });
    } catch (error) {
      console.error('Failed to record reuse event:', error);
      return null;
    }
  }

  // Cross-crawl knowledge management
  storeCrossCrawlKnowledge({
    sourceDomain, knowledgeType, knowledgeKey, knowledgeValue,
    confidenceLevel, lastUsed = null
  }) {
    try {
      return this._insertCrossCrawlKnowledgeStmt.run({
        sourceDomain, knowledgeType, knowledgeKey, knowledgeValue,
        confidenceLevel, lastUsed: lastUsed || new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to store cross-crawl knowledge:', error);
      return null;
    }
  }

  getCrossCrawlKnowledge(sourceDomain, knowledgeType, minConfidence = 0.5) {
    try {
      return this._getCrossCrawlKnowledgeStmt.all(sourceDomain, knowledgeType, minConfidence);
    } catch (error) {
      console.error('Failed to get cross-crawl knowledge:', error);
      return [];
    }
  }

  incrementKnowledgeUsage(knowledgeId) {
    try {
      return this._incrementKnowledgeUsageStmt.run(knowledgeId);
    } catch (error) {
      console.error('Failed to increment knowledge usage:', error);
      return null;
    }
  }

  // Analytics and reporting
  getPatternAnalytics(domain) {
    try {
      const query = `
        SELECT 
          pattern_type,
          COUNT(*) as pattern_count,
          AVG(confidence_score) as avg_confidence,
          AVG(success_count) as avg_success,
          AVG(failure_count) as avg_failure,
          SUM(success_count) as total_success,
          SUM(failure_count) as total_failure
        FROM planner_patterns 
        WHERE domain = ?
        GROUP BY pattern_type
        ORDER BY avg_confidence DESC
      `;
      return this.db.prepare(query).all(domain);
    } catch (error) {
      console.error('Failed to get pattern analytics:', error);
      return [];
    }
  }

  getKnowledgeReuseStats(jobId) {
    try {
      const query = `
        SELECT 
          reuse_type,
          COUNT(*) as reuse_count,
          COUNT(CASE WHEN success_outcome = 1 THEN 1 END) as success_count,
          AVG(confidence_at_reuse) as avg_confidence,
          SUM(time_saved_ms) as total_time_saved
        FROM knowledge_reuse_events 
        WHERE job_id = ?
        GROUP BY reuse_type
        ORDER BY reuse_count DESC
      `;
      return this.db.prepare(query).all(jobId);
    } catch (error) {
      console.error('Failed to get knowledge reuse stats:', error);
      return [];
    }
  }

  // Maintenance methods
  cleanupExpiredKnowledge(retentionDays = 90) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      const cutoff = cutoffDate.toISOString();

      // Clean up low-confidence patterns older than retention period
      const cleanupPatternsQuery = `
        DELETE FROM planner_patterns 
        WHERE confidence_score < 0.2 AND updated_at < ?
      `;
      
      // Clean up failed hub validations older than retention period
      const cleanupHubsQuery = `
        DELETE FROM hub_validations 
        WHERE validation_status = 'invalid' AND validated_at < ?
      `;

      const patternsDeleted = this.db.prepare(cleanupPatternsQuery).run(cutoff).changes;
      const hubsDeleted = this.db.prepare(cleanupHubsQuery).run(cutoff).changes;

      return { patternsDeleted, hubsDeleted };
    } catch (error) {
      console.error('Failed to cleanup expired knowledge:', error);
      return { patternsDeleted: 0, hubsDeleted: 0 };
    }
  }
}

module.exports = { PlannerDatabase };