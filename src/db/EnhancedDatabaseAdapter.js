const { QueueDatabase } = require('./QueueDatabase');
const { PlannerDatabase } = require('./PlannerDatabase');
const { CoverageDatabase } = require('./CoverageDatabase');

/**
 * Enhanced database adapter that integrates queue, planner, and coverage modules
 * with the existing NewsDatabase while maintaining backward compatibility
 */
class EnhancedDatabaseAdapter {
  constructor(newsDatabase) {
    this.newsDb = newsDatabase;
    
    // Extract raw better-sqlite3 database
    // newsDatabase might be CrawlerDb with .db = NewsDatabase with .db = raw DB
    // or it might be NewsDatabase with .db = raw DB
    let rawDb = newsDatabase.db;
    if (rawDb && rawDb.db && typeof rawDb.db.prepare === 'function') {
      // Two-level wrapper: CrawlerDb -> NewsDatabase -> raw DB
      rawDb = rawDb.db;
    }
    this.db = rawDb;
    
    // Initialize feature modules with individual error handling
    try {
      this.queue = new QueueDatabase(this.db);
    } catch (error) {
      throw new Error(`QueueDatabase initialization failed: ${error?.message || 'unknown'}`);
    }
    
    try {
      this.planner = new PlannerDatabase(this.db);
    } catch (error) {
      throw new Error(`PlannerDatabase initialization failed: ${error?.message || 'unknown'}`);
    }
    
    try {
      this.coverage = new CoverageDatabase(this.db);
    } catch (error) {
      throw new Error(`CoverageDatabase initialization failed: ${error?.message || 'unknown'}`);
    }
    
    // Track initialization
    this.initialized = true;
    console.log('Enhanced database adapter initialized with queue, planner, and coverage modules');
  }

  // Proxy methods to existing NewsDatabase for backward compatibility
  insertQueueEvent(data) {
    // Legacy method - delegate to original implementation
    if (this.newsDb.insertQueueEvent) {
      this.newsDb.insertQueueEvent(data);
    }
    
    // Also log to enhanced queue system if feature is enabled
    if (data.jobId && this.queue) {
      try {
        this.queue.logEnhancedQueueEvent({
          jobId: data.jobId,
          ts: data.ts || new Date().toISOString(),
          action: data.action,
          url: data.url,
          depth: data.depth,
          host: data.host,
          reason: data.reason,
          queueSize: data.queueSize,
          alias: data.alias,
          priorityScore: data.priorityScore,
          prioritySource: data.prioritySource,
          bonusApplied: data.bonusApplied,
          clusterId: data.clusterId,
          gapPredictionScore: data.gapPredictionScore
        });
      } catch (error) {
        console.warn('Failed to log enhanced queue event:', error.message);
      }
    }
  }

  insertProblem(data) {
    // Legacy method - delegate to original implementation
    if (this.newsDb.insertProblem) {
      this.newsDb.insertProblem(data);
    }
    
    // Also handle problem clustering if feature is enabled
    if (data.jobId && this.queue && data.kind) {
      try {
        this._handleProblemForClustering(data);
      } catch (error) {
        console.warn('Failed to handle problem clustering:', error.message);
      }
    }
  }

  insertMilestone(data) {
    // Legacy method - delegate to original implementation
    if (this.newsDb.insertMilestone) {
      this.newsDb.insertMilestone(data);
    }
    
    // Also track milestone achievements for coverage analytics
    if (data.jobId && this.coverage && data.kind) {
      try {
        this._handleMilestoneForCoverage(data);
      } catch (error) {
        console.warn('Failed to handle milestone for coverage:', error.message);
      }
    }
  }

  insertPlannerStageEvent(data) {
    // Legacy method - delegate to original implementation
    if (this.newsDb.insertPlannerStageEvent) {
      this.newsDb.insertPlannerStageEvent(data);
    }
  }

  // Enhanced methods for new features
  _handleProblemForClustering(problemData) {
    const clusterId = this._generateClusterId(problemData);
    const now = new Date().toISOString();
    
    const existingCluster = this.queue.getProblemCluster(clusterId);
    if (existingCluster) {
      // Update existing cluster
      this.queue.createOrUpdateProblemCluster({
        id: clusterId,
        jobId: problemData.jobId,
        kind: problemData.kind,
        scope: problemData.scope,
        target: problemData.target,
        firstSeen: existingCluster.first_seen,
        lastSeen: now,
        occurrenceCount: existingCluster.occurrence_count + 1,
        priorityBoost: this._calculatePriorityBoost(existingCluster.occurrence_count + 1),
        status: 'active',
        clusterMetadata: {
          lastProblemDetails: problemData.details,
          samples: (existingCluster.cluster_metadata?.samples || []).slice(-5).concat(problemData.message || '')
        }
      });
    } else {
      // Create new cluster
      this.queue.createOrUpdateProblemCluster({
        id: clusterId,
        jobId: problemData.jobId,
        kind: problemData.kind,
        scope: problemData.scope,
        target: problemData.target,
        firstSeen: now,
        lastSeen: now,
        occurrenceCount: 1,
        priorityBoost: 0,
        status: 'active',
        clusterMetadata: {
          firstProblemDetails: problemData.details,
          samples: [problemData.message || '']
        }
      });
    }
  }

  _handleMilestoneForCoverage(milestoneData) {
    // Extract meaningful metrics from different milestone types
    const milestoneAnalytics = this._extractMilestoneAnalytics(milestoneData);
    
    if (milestoneAnalytics) {
      this.coverage.recordMilestoneAchievement({
        jobId: milestoneData.jobId,
        milestoneType: milestoneData.kind,
        achievedAt: milestoneData.ts || new Date().toISOString(),
        thresholdValue: milestoneAnalytics.threshold,
        actualValue: milestoneAnalytics.actual,
        improvementPercentage: milestoneAnalytics.improvement,
        contextData: milestoneData.details,
        celebrationLevel: this._determineCelebrationLevel(milestoneData.kind)
      });
    }
  }

  _generateClusterId(problemData) {
    // Generate consistent cluster ID based on problem characteristics
    const components = [
      problemData.kind,
      problemData.scope || 'global',
      problemData.target ? problemData.target.substring(0, 50) : 'no-target'
    ];
    return components.join(':').replace(/[^a-zA-Z0-9:-]/g, '_');
  }

  _calculatePriorityBoost(occurrenceCount) {
    // Logarithmic boost to prevent one problem from dominating
    return Math.min(Math.log2(occurrenceCount) * 2.5, 20);
  }

  _extractMilestoneAnalytics(milestoneData) {
    const details = milestoneData.details || {};
    
    switch (milestoneData.kind) {
      case 'intelligent-completion':
        return {
          threshold: details.seededHubs?.requested || 1,
          actual: details.seededHubs?.unique || 0,
          improvement: details.coverage?.coveragePct || 0
        };
      case 'full-understanding':
        return {
          threshold: details.missing || 0,
          actual: details.countriesCovered || 0,
          improvement: details.countriesCovered ? (details.countriesCovered / (details.countriesCovered + (details.missing || 0))) * 100 : 0
        };
      case 'downloads-1k':
      case 'articles-identified-1k':
      case 'articles-identified-10k':
        const targetNumber = milestoneData.kind.includes('10k') ? 10000 : 1000;
        return {
          threshold: targetNumber,
          actual: targetNumber,
          improvement: 100 // Milestone reached
        };
      default:
        return null;
    }
  }

  _determineCelebrationLevel(milestoneKind) {
    const highImpactMilestones = [
      'full-understanding',
      'intelligent-completion',
      'articles-identified-10k'
    ];
    
    return highImpactMilestones.includes(milestoneKind) ? 'high' : 'normal';
  }

  // Utility methods for feature integration
  isFeatureAvailable(featureName) {
    switch (featureName) {
      case 'queue':
        return Boolean(this.queue);
      case 'planner':
        return Boolean(this.planner);
      case 'coverage':
        return Boolean(this.coverage);
      default:
        return false;
    }
  }

  getFeatureStats() {
    return {
      initialized: this.initialized,
      features: {
        queue: this.isFeatureAvailable('queue'),
        planner: this.isFeatureAvailable('planner'),
        coverage: this.isFeatureAvailable('coverage')
      },
      tablesCreated: this._checkTablesExist()
    };
  }

  _checkTablesExist() {
    try {
      const tableChecks = [
        'queue_events_enhanced',
        'problem_clusters',
        'gap_predictions',
        'planner_patterns',
        'hub_validations',
        'knowledge_reuse_events',
        'coverage_snapshots',
        'hub_discoveries',
        'coverage_gaps',
        'milestone_achievements',
        'dashboard_metrics'
      ];

      const existing = {};
      for (const table of tableChecks) {
        try {
          this.db.prepare(`SELECT COUNT(*) FROM ${table} LIMIT 1`).get();
          existing[table] = true;
        } catch (error) {
          existing[table] = false;
        }
      }
      
      return existing;
    } catch (error) {
      console.error('Failed to check table existence:', error);
      return {};
    }
  }

  // Cleanup and maintenance
  performMaintenance(options = {}) {
    const results = {
      timestamp: new Date().toISOString(),
      operations: []
    };

    try {
      // Cleanup expired knowledge
      if (this.planner && options.cleanupKnowledge !== false) {
        const knowledgeCleanup = this.planner.cleanupExpiredKnowledge(options.retentionDays || 90);
        results.operations.push({
          type: 'knowledge_cleanup',
          ...knowledgeCleanup
        });
      }

      // Cleanup old telemetry
      if (this.coverage && options.cleanupTelemetry !== false) {
        const telemetryDeleted = this.coverage.cleanupOldTelemetry(options.telemetryRetentionDays || 30);
        results.operations.push({
          type: 'telemetry_cleanup',
          recordsDeleted: telemetryDeleted
        });
      }

      // Deactivate old problem clusters
      if (this.queue && options.cleanupClusters !== false) {
        const cutoffDate = new Date();
        cutoffDate.setHours(cutoffDate.getHours() - (options.clusterTimeoutHours || 24));
        
        const deactivatedClusters = this.db.prepare(`
          UPDATE problem_clusters 
          SET status = 'inactive', updated_at = datetime('now')
          WHERE status = 'active' AND last_seen < ?
        `).run(cutoffDate.toISOString()).changes;
        
        results.operations.push({
          type: 'cluster_deactivation',
          clustersDeactivated: deactivatedClusters
        });
      }

      console.log('Database maintenance completed:', results);
      return results;
    } catch (error) {
      console.error('Database maintenance failed:', error);
      results.error = error.message;
      return results;
    }
  }

  // Health check
  healthCheck() {
    try {
      const health = {
        timestamp: new Date().toISOString(),
        database: 'connected',
        features: this.getFeatureStats(),
        tables: this._checkTablesExist(),
        performance: {}
      };

      // Basic performance check
      const start = Date.now();
      this.db.prepare('SELECT 1').get();
      health.performance.queryLatencyMs = Date.now() - start;

      return health;
    } catch (error) {
      return {
        timestamp: new Date().toISOString(),
        database: 'error',
        error: error.message
      };
    }
  }

  // Close connections and cleanup
  close() {
    try {
      // The underlying NewsDatabase handles the SQLite connection
      console.log('Enhanced database adapter closed');
    } catch (error) {
      console.error('Error closing enhanced database adapter:', error);
    }
  }
}

module.exports = { EnhancedDatabaseAdapter };