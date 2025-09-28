/**
 * Coverage Analytics API for real-time crawl monitoring and gap analysis
 */

const express = require('express');

function createCoverageAPI(enhancedDbAdapter) {
  const router = express.Router();

  // Get current coverage snapshot for a job
  router.get('/jobs/:jobId/snapshot', (req, res) => {
    try {
      const { jobId } = req.params;
      
      if (!enhancedDbAdapter?.coverage) {
        return res.status(503).json({
          error: 'Coverage analytics not available',
          reason: 'Enhanced database adapter not initialized'
        });
      }

      const snapshot = enhancedDbAdapter.coverage.getLatestSnapshot(jobId);
      
      if (!snapshot) {
        return res.status(404).json({
          error: 'No coverage snapshot found for job',
          jobId
        });
      }

      res.json({
        success: true,
        jobId,
        snapshot,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        error: error.message,
        type: 'coverage_snapshot_error'
      });
    }
  });

  // Get coverage trend over time
  router.get('/jobs/:jobId/trend', (req, res) => {
    try {
      const { jobId } = req.params;
      const { since = '1 hour' } = req.query;
      
      if (!enhancedDbAdapter?.coverage) {
        return res.status(503).json({
          error: 'Coverage analytics not available'
        });
      }

      const sinceTime = new Date();
      const [amount, unit] = since.split(' ');
      switch (unit) {
        case 'minute':
        case 'minutes':
          sinceTime.setMinutes(sinceTime.getMinutes() - parseInt(amount));
          break;
        case 'hour':
        case 'hours':
          sinceTime.setHours(sinceTime.getHours() - parseInt(amount));
          break;
        case 'day':
        case 'days':
          sinceTime.setDate(sinceTime.getDate() - parseInt(amount));
          break;
        default:
          sinceTime.setHours(sinceTime.getHours() - 1);
      }

      const trend = enhancedDbAdapter.coverage.getSnapshotTrend(jobId, sinceTime.toISOString());
      const analytics = enhancedDbAdapter.coverage.getCoverageAnalytics(jobId, since);

      res.json({
        success: true,
        jobId,
        period: since,
        dataPoints: trend.length,
        trend,
        analytics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        error: error.message,
        type: 'coverage_trend_error'
      });
    }
  });

  // Get hub discovery statistics
  router.get('/jobs/:jobId/discoveries', (req, res) => {
    try {
      const { jobId } = req.params;
      const { since = '1 hour', limit = 50 } = req.query;
      
      if (!enhancedDbAdapter?.coverage) {
        return res.status(503).json({
          error: 'Coverage analytics not available'
        });
      }

      const sinceTime = new Date();
      const [amount, unit] = since.split(' ');
      switch (unit) {
        case 'minute':
        case 'minutes':
          sinceTime.setMinutes(sinceTime.getMinutes() - parseInt(amount));
          break;
        case 'hour':
        case 'hours':
          sinceTime.setHours(sinceTime.getHours() - parseInt(amount));
          break;
        default:
          sinceTime.setHours(sinceTime.getHours() - 1);
      }

      const discoveries = enhancedDbAdapter.coverage.getRecentDiscoveries(
        jobId, 
        sinceTime.toISOString(), 
        parseInt(limit)
      );
      
      const stats = enhancedDbAdapter.coverage.getDiscoveryStats(jobId);

      res.json({
        success: true,
        jobId,
        period: since,
        discoveries,
        stats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        error: error.message,
        type: 'discovery_stats_error'
      });
    }
  });

  // Get active gaps and analysis
  router.get('/jobs/:jobId/gaps', (req, res) => {
    try {
      const { jobId } = req.params;
      
      if (!enhancedDbAdapter?.coverage) {
        return res.status(503).json({
          error: 'Coverage analytics not available'
        });
      }

      const activeGaps = enhancedDbAdapter.coverage.getActiveGaps(jobId);
      const gapAnalytics = enhancedDbAdapter.coverage.getGapAnalytics(jobId);

      res.json({
        success: true,
        jobId,
        activeGaps,
        analytics: gapAnalytics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        error: error.message,
        type: 'gap_analysis_error'
      });
    }
  });

  // Get milestone achievements
  router.get('/jobs/:jobId/milestones', (req, res) => {
    try {
      const { jobId } = req.params;
      const { limit = 20 } = req.query;
      
      if (!enhancedDbAdapter?.coverage) {
        return res.status(503).json({
          error: 'Coverage analytics not available'
        });
      }

      const milestones = enhancedDbAdapter.coverage.getRecentMilestones(jobId, parseInt(limit));

      res.json({
        success: true,
        jobId,
        milestones,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        error: error.message,
        type: 'milestones_error'
      });
    }
  });

  // Get real-time metrics for dashboard
  router.get('/jobs/:jobId/metrics', (req, res) => {
    try {
      const { jobId } = req.params;
      
      if (!enhancedDbAdapter?.coverage) {
        return res.status(503).json({
          error: 'Coverage analytics not available'
        });
      }

      const metrics = enhancedDbAdapter.coverage.getLatestMetrics(jobId);

      res.json({
        success: true,
        jobId,
        metrics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        error: error.message,
        type: 'metrics_error'
      });
    }
  });

  // Get metric time series for charts
  router.get('/jobs/:jobId/metrics/:metricName', (req, res) => {
    try {
      const { jobId, metricName } = req.params;
      const { since = '1 hour' } = req.query;
      
      if (!enhancedDbAdapter?.coverage) {
        return res.status(503).json({
          error: 'Coverage analytics not available'
        });
      }

      const sinceTime = new Date();
      const [amount, unit] = since.split(' ');
      switch (unit) {
        case 'minute':
        case 'minutes':
          sinceTime.setMinutes(sinceTime.getMinutes() - parseInt(amount));
          break;
        case 'hour':
        case 'hours':
          sinceTime.setHours(sinceTime.getHours() - parseInt(amount));
          break;
        default:
          sinceTime.setHours(sinceTime.getHours() - 1);
      }

      const timeSeries = enhancedDbAdapter.coverage.getMetricTimeSeries(
        jobId, 
        metricName, 
        sinceTime.toISOString()
      );

      res.json({
        success: true,
        jobId,
        metricName,
        period: since,
        dataPoints: timeSeries.length,
        timeSeries,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        error: error.message,
        type: 'metric_series_error'
      });
    }
  });

  // Get queue analytics
  router.get('/jobs/:jobId/queue-analytics', (req, res) => {
    try {
      const { jobId } = req.params;
      const { timeWindow = '1 hour' } = req.query;
      
      if (!enhancedDbAdapter?.queue) {
        return res.status(503).json({
          error: 'Queue analytics not available'
        });
      }

      const queueAnalytics = enhancedDbAdapter.queue.getQueueAnalytics(jobId, timeWindow);
      const clusterAnalytics = enhancedDbAdapter.queue.getClusterAnalytics(jobId);

      res.json({
        success: true,
        jobId,
        timeWindow,
        queueAnalytics,
        clusterAnalytics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        error: error.message,
        type: 'queue_analytics_error'
      });
    }
  });

  // Get knowledge reuse statistics
  router.get('/jobs/:jobId/knowledge-stats', (req, res) => {
    try {
      const { jobId } = req.params;
      
      if (!enhancedDbAdapter?.planner) {
        return res.status(503).json({
          error: 'Knowledge analytics not available'
        });
      }

      const knowledgeStats = enhancedDbAdapter.planner.getKnowledgeReuseStats(jobId);

      res.json({
        success: true,
        jobId,
        knowledgeStats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        error: error.message,
        type: 'knowledge_stats_error'
      });
    }
  });

  // Health check for analytics APIs
  router.get('/health', (req, res) => {
    try {
      const health = {
        timestamp: new Date().toISOString(),
        services: {
          enhancedDb: Boolean(enhancedDbAdapter),
          coverage: Boolean(enhancedDbAdapter?.coverage),
          queue: Boolean(enhancedDbAdapter?.queue),
          planner: Boolean(enhancedDbAdapter?.planner)
        }
      };

      if (enhancedDbAdapter) {
        try {
          health.features = enhancedDbAdapter.getFeatureStats();
        } catch (error) {
          health.featuresError = error.message;
        }
      }

      const allServicesUp = Object.values(health.services).every(s => s);
      
      res.status(allServicesUp ? 200 : 503).json({
        success: allServicesUp,
        health
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        type: 'health_check_error'
      });
    }
  });

  return router;
}

module.exports = {
  createCoverageAPI,
  createCoverageApiRouter: createCoverageAPI
};