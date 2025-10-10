'use strict';

/**
 * Coverage Adapter - Provides analytics data for the coverage API
 * Uses existing job registry and metrics to generate coverage analytics
 */
class CoverageAdapter {
  constructor({ jobRegistry, db, logger = console }) {
    this.jobRegistry = jobRegistry;
    this.db = db;
    this.logger = logger;
  }

  // Get latest coverage snapshot for a job
  getLatestSnapshot(jobId) {
    const jobs = this.jobRegistry.getJobs();
    const job = jobs.get(jobId);
    
    if (!job) {
      return null;
    }

    const summary = this.jobRegistry.summaryFn ? this.jobRegistry.summaryFn(jobs) : { items: [] };
    const jobSummary = summary.items.find(item => item.id === jobId);

    return {
      jobId,
      status: job.status || 'unknown',
      stage: job.stage || null,
      metrics: {
        visited: job.visited || 0,
        downloaded: job.downloaded || 0,
        errors: job.errors || 0,
        queueSize: job.queueSize || 0,
        paused: job.paused || false
      },
      timestamps: {
        startedAt: job.startedAt || null,
        lastActivityAt: job.lastActivityAt || null,
        stageChangedAt: job.stageChangedAt || null
      },
      achievements: jobSummary?.achievements || [],
      lifecycle: jobSummary?.lifecycle || null,
      statusText: job.statusText || null,
      startup: job.startup || null
    };
  }

  // Get snapshot trend over time (currently returns current snapshot)
  getSnapshotTrend(jobId, sinceIso) {
    const snapshot = this.getLatestSnapshot(jobId);
    if (!snapshot) {
      return [];
    }
    
    // Return single point for now - could be extended to track history
    return [{
      timestamp: new Date().toISOString(),
      ...snapshot.metrics
    }];
  }

  // Get coverage analytics
  getCoverageAnalytics(jobId, period) {
    const snapshot = this.getLatestSnapshot(jobId);
    if (!snapshot) {
      return null;
    }

    const metrics = snapshot.metrics;
    const successRate = metrics.visited > 0 
      ? ((metrics.downloaded / metrics.visited) * 100).toFixed(1)
      : '0.0';
    
    const errorRate = metrics.visited > 0
      ? ((metrics.errors / metrics.visited) * 100).toFixed(1)
      : '0.0';

    return {
      successRate: parseFloat(successRate),
      errorRate: parseFloat(errorRate),
      totalProcessed: metrics.visited,
      queueDepth: metrics.queueSize,
      isPaused: metrics.paused
    };
  }

  // Get recent discoveries (milestones)
  getRecentDiscoveries(jobId, sinceIso, limit) {
    const snapshot = this.getLatestSnapshot(jobId);
    if (!snapshot || !snapshot.achievements) {
      return [];
    }

    return snapshot.achievements.slice(0, limit);
  }

  // Get discovery statistics
  getDiscoveryStats(jobId) {
    const snapshot = this.getLatestSnapshot(jobId);
    if (!snapshot) {
      return null;
    }

    return {
      totalAchievements: snapshot.achievements?.length || 0,
      currentStage: snapshot.stage,
      status: snapshot.status
    };
  }

  // Get active gaps (items in queue)
  getActiveGaps(jobId) {
    const snapshot = this.getLatestSnapshot(jobId);
    if (!snapshot) {
      return [];
    }

    return [{
      type: 'queue',
      count: snapshot.metrics.queueSize,
      description: `${snapshot.metrics.queueSize} items waiting in queue`
    }];
  }

  // Get gap analytics
  getGapAnalytics(jobId) {
    const snapshot = this.getLatestSnapshot(jobId);
    if (!snapshot) {
      return null;
    }

    return {
      queueDepth: snapshot.metrics.queueSize,
      isPaused: snapshot.metrics.paused,
      canResume: snapshot.metrics.queueSize > 0
    };
  }

  // Get recent milestones
  getRecentMilestones(jobId, limit) {
    return this.getRecentDiscoveries(jobId, null, limit);
  }

  // Get latest metrics
  getLatestMetrics(jobId) {
    const snapshot = this.getLatestSnapshot(jobId);
    if (!snapshot) {
      return null;
    }

    return snapshot.metrics;
  }

  // Get metric time series (single point for now)
  getMetricTimeSeries(jobId, metricName, sinceIso) {
    const snapshot = this.getLatestSnapshot(jobId);
    if (!snapshot || !snapshot.metrics[metricName]) {
      return [];
    }

    return [{
      timestamp: new Date().toISOString(),
      value: snapshot.metrics[metricName]
    }];
  }

  // Get feature stats
  getFeatureStats() {
    return {
      coverage: true,
      queue: false,
      planner: false,
      liveMetrics: true
    };
  }
}

// Queue analytics adapter
class QueueAdapter {
  constructor({ jobRegistry, db, logger = console }) {
    this.jobRegistry = jobRegistry;
    this.db = db;
    this.logger = logger;
  }

  getQueueAnalytics(jobId, timeWindow) {
    const jobs = this.jobRegistry.getJobs();
    const job = jobs.get(jobId);
    
    if (!job) {
      return null;
    }

    return {
      queueSize: job.queueSize || 0,
      paused: job.paused || false,
      averageProcessingTime: null, // Not tracked yet
      throughput: null // Not tracked yet
    };
  }

  getClusterAnalytics(jobId) {
    return {
      clusters: [],
      totalClusters: 0
    };
  }
}

// Planner analytics adapter (stub for now)
class PlannerAdapter {
  constructor({ jobRegistry, db, logger = console }) {
    this.jobRegistry = jobRegistry;
    this.db = db;
    this.logger = logger;
  }

  getKnowledgeReuseStats(jobId) {
    return {
      totalReuses: 0,
      recentReuses: []
    };
  }
}

// Enhanced DB Adapter - combines all adapters
class EnhancedDbAdapter {
  constructor({ jobRegistry, db, logger = console }) {
    this.coverage = new CoverageAdapter({ jobRegistry, db, logger });
    this.queue = new QueueAdapter({ jobRegistry, db, logger });
    this.planner = new PlannerAdapter({ jobRegistry, db, logger });
  }

  getFeatureStats() {
    return this.coverage.getFeatureStats();
  }
}

module.exports = {
  EnhancedDbAdapter,
  CoverageAdapter,
  QueueAdapter,
  PlannerAdapter
};
