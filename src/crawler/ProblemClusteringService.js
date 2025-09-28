/**
 * Problem clustering service for intelligent gap-driven prioritization
 * Analyzes problem patterns and generates priority boosts for related URLs
 */
class ProblemClusteringService {
  constructor(enhancedDb, configManager) {
    this.enhancedDb = enhancedDb;
    this.configManager = configManager;
    this.clusteringConfig = configManager.getClusteringConfig();
    
    // In-memory cluster tracking for performance
    this.activeClusters = new Map();
    this.clusterTimers = new Map();
    
    // Watch for configuration changes
    configManager.addWatcher((newConfig) => {
      this.clusteringConfig = newConfig.queue?.clustering || {};
    });
  }

  /**
   * Process a new problem and update clustering
   */
  processProblem({ jobId, kind, scope, target, message, details, timestamp }) {
    try {
      const clusterId = this._generateClusterId({ kind, scope, target });
      const now = timestamp || new Date().toISOString();
      
      // Get or create cluster
      let cluster = this.activeClusters.get(clusterId);
      if (!cluster) {
        cluster = this._createNewCluster({
          id: clusterId,
          jobId,
          kind,
          scope,
          target,
          firstSeen: now
        });
        this.activeClusters.set(clusterId, cluster);
      }

      // Update cluster with new problem occurrence
      cluster.lastSeen = now;
      cluster.occurrenceCount += 1;
      cluster.recentProblems.push({
        message,
        details,
        timestamp: now
      });

      // Keep only recent problems for analysis
      if (cluster.recentProblems.length > 10) {
        cluster.recentProblems = cluster.recentProblems.slice(-10);
      }

      // Recalculate priority boost
      cluster.priorityBoost = this._calculatePriorityBoost(cluster);

      // Update database
      this._persistCluster(cluster);

      // Schedule cluster timeout
      this._scheduleClusterTimeout(clusterId);

      // Generate gap predictions if threshold reached
      if (cluster.occurrenceCount >= this.clusteringConfig.problemThreshold) {
        this._generateGapPredictions(cluster);
      }

      return {
        clusterId,
        occurrenceCount: cluster.occurrenceCount,
        priorityBoost: cluster.priorityBoost,
        shouldBoostRelated: cluster.priorityBoost > 0
      };
    } catch (error) {
      console.error('Error processing problem for clustering:', error);
      return null;
    }
  }

  /**
   * Get priority boost for a URL based on active clusters
   */
  getPriorityBoostForUrl(url, jobId) {
    try {
      let maxBoost = 0;
      let bestClusterId = null;

      for (const [clusterId, cluster] of this.activeClusters) {
        if (cluster.jobId === jobId && this._urlAddressesCluster(url, cluster)) {
          if (cluster.priorityBoost > maxBoost) {
            maxBoost = cluster.priorityBoost;
            bestClusterId = clusterId;
          }
        }
      }

      return {
        boost: maxBoost,
        clusterId: bestClusterId
      };
    } catch (error) {
      console.error('Error getting priority boost for URL:', error);
      return { boost: 0, clusterId: null };
    }
  }

  /**
   * Lightweight clustering helper for tests and tooling
   */
  clusterProblems(problems = []) {
    try {
      if (!Array.isArray(problems)) return [];

      const grouped = new Map();
      for (const problem of problems) {
        if (!problem || typeof problem !== 'object') continue;
        const kind = problem.kind || 'unknown';
        const scope = problem.scope || 'global';
        const key = `${kind}|${scope}`;
        if (!grouped.has(key)) {
          grouped.set(key, {
            kind,
            scope,
            representative: problem,
            problems: []
          });
        }
        grouped.get(key).problems.push(problem);
      }

      const clusters = [];
      for (const cluster of grouped.values()) {
        cluster.similarity = this._estimateClusterSimilarity(cluster);
        cluster.patterns = this._deriveClusterPatterns(cluster);
        clusters.push(cluster);
      }

      return clusters;
    } catch (error) {
      console.error('Error clustering problems:', error);
      return [];
    }
  }

  generateGapPredictions(cluster) {
    try {
      const normalized = this._normalizeClusterForAnalysis(cluster);
      if (!normalized) return [];
      const predictions = this._analyzeClusterForPredictions(normalized);
      const finalPredictions = predictions.length ? predictions : this._buildFallbackPredictions(normalized);
      return finalPredictions.map((prediction) => ({
        url: prediction.url,
        confidence: prediction.confidence,
        coverageLift: prediction.coverageLift,
        reasoning: prediction.reasoning || `Derived from ${normalized.kind || 'cluster'} analysis`
      }));
    } catch (error) {
      console.error('Error generating gap predictions from cluster:', error);
      return [];
    }
  }

  calculatePriorityBoost(cluster) {
    try {
      const normalized = this._normalizeClusterForAnalysis(cluster);
      if (!normalized || !normalized.occurrenceCount) return 0;
      const rawBoost = this._calculatePriorityBoost(normalized);
      const normalizedBoost = Math.min(Math.max(rawBoost, 0) / 20, 1);
      return Number.isFinite(normalizedBoost) ? Number(normalizedBoost) : 0;
    } catch (error) {
      console.error('Error calculating cluster priority boost:', error);
      return 0;
    }
  }

  _estimateClusterSimilarity(cluster) {
    const count = Array.isArray(cluster.problems) ? cluster.problems.length : 0;
    if (!count) return 0;
    const base = 0.65;
    const bonus = Math.min(Math.log2(count + 1) * 0.08, 0.3);
    return Number(Math.min(0.95, base + bonus).toFixed(3));
  }

  _deriveClusterPatterns(cluster) {
    const patterns = new Set();
    const problems = Array.isArray(cluster.problems) ? cluster.problems : [];
    const representative = cluster.representative || problems[0];
    const target = representative?.target;
    if (typeof target === 'string' && target.includes('/')) {
      const segments = target.split('/').filter(Boolean);
      if (segments.length >= 2) {
        const prefix = segments.slice(0, -1).join('/');
        const placeholder = representative?.kind === 'missing-hub' ? 'country' : 'slug';
        patterns.add(`/${prefix}/{${placeholder}}`);
      }
    }

    for (const problem of problems) {
      if (typeof problem?.target === 'string' && problem.target.includes('{')) {
        patterns.add(problem.target);
      }
    }

    return Array.from(patterns);
  }

  _normalizeClusterForAnalysis(cluster) {
    if (!cluster || typeof cluster !== 'object') {
      return null;
    }

    const rawProblems = Array.isArray(cluster.problems) ? cluster.problems : [];
    const problems = rawProblems
      .filter((p) => p != null)
      .map((p) => (typeof p === 'object' ? p : { target: String(p) }))
      .filter((p) => p && typeof p === 'object');

    const representative = cluster.representative && typeof cluster.representative === 'object'
      ? cluster.representative
      : problems[0] || null;

    const normalized = {
      ...cluster,
      representative,
      kind: cluster.kind || representative?.kind || 'unknown',
      scope: cluster.scope || representative?.scope || 'global',
      target: cluster.target || representative?.target || null,
      problems,
      occurrenceCount: cluster.occurrenceCount ?? problems.length,
      recentProblems: Array.isArray(cluster.recentProblems) ? cluster.recentProblems.slice() : []
    };

    if (!normalized.recentProblems.length) {
      normalized.recentProblems = problems.map((problem) => ({
        details: problem.details || { target: problem.target, url: problem.url },
        message: problem.message,
        timestamp: problem.timestamp
      }));
    }

    return normalized;
  }

  _buildFallbackPredictions(cluster) {
    const problems = Array.isArray(cluster.problems) ? cluster.problems : [];
    const targets = new Set();
    for (const problem of problems) {
      if (problem?.target) {
        targets.add(problem.target);
      } else if (typeof problem === 'string') {
        targets.add(problem);
      }
    }
    if (cluster.target) {
      targets.add(cluster.target);
    }

    if (!targets.size) {
      return [];
    }

    const baseHost = cluster.scope && cluster.scope !== 'global'
      ? `${cluster.scope}.example.com`
      : 'example.com';

    const confidenceBase = Math.min(0.9, 0.7 + targets.size * 0.03);

    return Array.from(targets).map((target) => {
      const normalizedTarget = typeof target === 'string' ? target : String(target || '');
      const formattedTarget = normalizedTarget.startsWith('http')
        ? normalizedTarget
        : `https://${baseHost}${normalizedTarget.startsWith('/') ? normalizedTarget : `/${normalizedTarget}`}`;
      return {
        url: formattedTarget,
        confidence: confidenceBase,
        coverageLift: 0.05,
        reasoning: 'Fallback prediction derived from cluster targets'
      };
    });
  }

  /**
   * Generate gap predictions based on cluster analysis
   */
  _generateGapPredictions(cluster) {
    try {
      const predictions = this._analyzeClusterForPredictions(cluster);
      
      for (const prediction of predictions) {
        this.enhancedDb.queue.recordGapPrediction({
          jobId: cluster.jobId,
          predictedUrl: prediction.url,
          predictionSource: 'problem-clustering',
          confidenceScore: prediction.confidence,
          gapType: cluster.kind,
          expectedCoverageLift: prediction.coverageLift
        });
      }

      console.log(`Generated ${predictions.length} gap predictions from cluster ${cluster.id}`);
    } catch (error) {
      console.error('Error generating gap predictions:', error);
    }
  }

  /**
   * Analyze cluster patterns to predict URLs that might resolve gaps
   */
  _analyzeClusterForPredictions(cluster) {
    const predictions = [];

    try {
      // Analyze missing hub patterns
      if (cluster.kind === 'missing-hub') {
        predictions.push(...this._predictMissingHubUrls(cluster));
      }

      // Analyze pattern recognition failures
      if (cluster.kind === 'unknown-pattern') {
        predictions.push(...this._predictPatternUrls(cluster));
      }

      // Analyze coverage gaps
      if (cluster.kind === 'coverage-gap') {
        predictions.push(...this._predictCoverageUrls(cluster));
      }

      return predictions.filter(p => p.confidence > 0.3);
    } catch (error) {
      console.error('Error analyzing cluster for predictions:', error);
      return [];
    }
  }

  _predictMissingHubUrls(cluster) {
    const predictions = [];
    
    try {
      // Extract common patterns from problem details
      const problemDetails = cluster.recentProblems.map(p => p.details || {});
      const targets = problemDetails.map(d => d.target || cluster.target).filter(Boolean);
      
      if (targets.length === 0) return predictions;

      // Generate potential hub URLs based on common patterns
      const baseUrls = this._extractBaseUrls(problemDetails);
      const pathSegments = this._extractPathSegments(targets);

      for (const baseUrl of baseUrls) {
        for (const segment of pathSegments) {
          const predictedUrl = this._constructHubUrl(baseUrl, segment);
          if (predictedUrl) {
            predictions.push({
              url: predictedUrl,
              confidence: this._calculatePredictionConfidence(cluster, 'hub'),
              coverageLift: 0.1 // Estimated coverage improvement
            });
          }
        }
      }
    } catch (error) {
      console.error('Error predicting missing hub URLs:', error);
    }

    return predictions;
  }

  _predictPatternUrls(cluster) {
    const predictions = [];
    
    try {
      // Analyze failed pattern matches to suggest alternative patterns
      const problemDetails = cluster.recentProblems.map(p => p.details || {});
      const failedUrls = problemDetails.map(d => d.url).filter(Boolean);

      for (const url of failedUrls) {
        // Try common variations
        const variations = this._generateUrlVariations(url);
        
        for (const variation of variations) {
          predictions.push({
            url: variation,
            confidence: this._calculatePredictionConfidence(cluster, 'pattern'),
            coverageLift: 0.05
          });
        }
      }
    } catch (error) {
      console.error('Error predicting pattern URLs:', error);
    }

    return predictions;
  }

  _predictCoverageUrls(cluster) {
    const predictions = [];
    
    try {
      // Generate URLs to fill coverage gaps
      const problemDetails = cluster.recentProblems.map(p => p.details || {});
      const gapAreas = problemDetails.map(d => d.gapArea || d.section).filter(Boolean);

      for (const area of gapAreas) {
        const predictedUrls = this._generateCoverageUrls(area, cluster);
        predictions.push(...predictedUrls);
      }
    } catch (error) {
      console.error('Error predicting coverage URLs:', error);
    }

    return predictions;
  }

  _extractBaseUrls(problemDetails) {
    const baseUrls = new Set();
    
    for (const details of problemDetails) {
      try {
        if (details.url) {
          const url = new URL(details.url);
          baseUrls.add(`${url.protocol}//${url.hostname}`);
        }
        if (details.baseUrl) {
          baseUrls.add(details.baseUrl);
        }
      } catch (error) {
        // Skip invalid URLs
      }
    }
    
    return Array.from(baseUrls);
  }

  _extractPathSegments(targets) {
    const segments = new Set();
    
    for (const target of targets) {
      if (typeof target === 'string') {
        const pathParts = target.split('/').filter(Boolean);
        pathParts.forEach(part => segments.add(part));
      }
    }
    
    return Array.from(segments);
  }

  _constructHubUrl(baseUrl, segment) {
    try {
      // Try common hub URL patterns
      const patterns = [
        `${baseUrl}/${segment}`,
        `${baseUrl}/${segment}/`,
        `${baseUrl}/section/${segment}`,
        `${baseUrl}/category/${segment}`,
        `${baseUrl}/topic/${segment}`
      ];
      
      // Return the first pattern (can be made more sophisticated)
      return patterns[0];
    } catch (error) {
      return null;
    }
  }

  _generateUrlVariations(originalUrl) {
    const variations = [];
    
    try {
      const url = new URL(originalUrl);
      const pathParts = url.pathname.split('/').filter(Boolean);
      
      // Try removing query parameters
      if (url.search) {
        variations.push(`${url.protocol}//${url.hostname}${url.pathname}`);
      }
      
      // Try different path variations
      if (pathParts.length > 1) {
        variations.push(`${url.protocol}//${url.hostname}/${pathParts.slice(0, -1).join('/')}/`);
      }
      
      // Try adding common endpoints
      const commonEndpoints = ['index.html', 'home', 'main'];
      for (const endpoint of commonEndpoints) {
        variations.push(`${url.protocol}//${url.hostname}${url.pathname}/${endpoint}`);
      }
    } catch (error) {
      // Skip invalid URLs
    }
    
    return variations;
  }

  _generateCoverageUrls(area, cluster) {
    const urls = [];
    
    try {
      // Extract base URL from cluster context
      const baseUrls = this._extractBaseUrls(cluster.recentProblems.map(p => p.details || {}));
      
      for (const baseUrl of baseUrls) {
        // Generate area-specific URLs
        urls.push({
          url: `${baseUrl}/${area}`,
          confidence: this._calculatePredictionConfidence(cluster, 'coverage'),
          coverageLift: 0.08
        });
        
        urls.push({
          url: `${baseUrl}/${area}/latest`,
          confidence: this._calculatePredictionConfidence(cluster, 'coverage') * 0.8,
          coverageLift: 0.06
        });
      }
    } catch (error) {
      console.error('Error generating coverage URLs:', error);
    }
    
    return urls;
  }

  _calculatePredictionConfidence(cluster, type) {
    let baseConfidence = 0.5;
    
    // Increase confidence based on cluster maturity
    const occurrenceMultiplier = Math.min(cluster.occurrenceCount / 10, 1.0);
    baseConfidence += occurrenceMultiplier * 0.3;
    
    // Adjust based on prediction type
    const typeMultipliers = {
      'hub': 0.8,
      'pattern': 0.6,
      'coverage': 0.7
    };
    
    baseConfidence *= (typeMultipliers[type] || 0.5);
    
    return Math.min(baseConfidence, 0.95);
  }

  _createNewCluster({ id, jobId, kind, scope, target, firstSeen }) {
    return {
      id,
      jobId,
      kind,
      scope,
      target,
      firstSeen,
      lastSeen: firstSeen,
      occurrenceCount: 0,
      priorityBoost: 0,
      status: 'active',
      recentProblems: [],
      createdAt: new Date().toISOString()
    };
  }

  _calculatePriorityBoost(cluster) {
    const config = this.clusteringConfig;
    const baseBoost = config.boostFactorPerCluster || 2.5;
    
    // Logarithmic boost to prevent dominance
    const boost = Math.min(
      Math.log2(cluster.occurrenceCount) * baseBoost,
      20 // Maximum boost
    );
    
    return Math.max(boost, 0);
  }

  _generateClusterId({ kind, scope, target }) {
    const components = [
      kind || 'unknown',
      scope || 'global',
      target ? target.substring(0, 50) : 'no-target'
    ];
    
    return components
      .join(':')
      .replace(/[^a-zA-Z0-9:-]/g, '_')
      .toLowerCase();
  }

  _urlAddressesCluster(url, cluster) {
    try {
      // Simple pattern matching - can be enhanced with ML
      if (cluster.target && url.includes(cluster.target)) {
        return true;
      }
      
      // Check if URL relates to cluster scope
      if (cluster.scope && cluster.scope !== 'global' && url.includes(cluster.scope)) {
        return true;
      }
      
      // Pattern-based matching for specific cluster types
      if (cluster.kind === 'missing-hub') {
        return this._urlLooksLikeHub(url, cluster);
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }

  _urlLooksLikeHub(url, cluster) {
    try {
      const hubIndicators = [
        '/category/',
        '/section/',
        '/topic/',
        '/tag/',
        '/archive/'
      ];
      
      return hubIndicators.some(indicator => url.includes(indicator));
    } catch (error) {
      return false;
    }
  }

  _persistCluster(cluster) {
    try {
      this.enhancedDb.queue.createOrUpdateProblemCluster({
        id: cluster.id,
        jobId: cluster.jobId,
        kind: cluster.kind,
        scope: cluster.scope,
        target: cluster.target,
        firstSeen: cluster.firstSeen,
        lastSeen: cluster.lastSeen,
        occurrenceCount: cluster.occurrenceCount,
        priorityBoost: cluster.priorityBoost,
        status: cluster.status,
        clusterMetadata: {
          recentProblems: cluster.recentProblems.slice(-5), // Keep last 5
          createdAt: cluster.createdAt
        }
      });
    } catch (error) {
      console.error('Error persisting cluster:', error);
    }
  }

  _scheduleClusterTimeout(clusterId) {
    // Clear existing timeout
    if (this.clusterTimers.has(clusterId)) {
      clearTimeout(this.clusterTimers.get(clusterId));
    }

    // Schedule new timeout
    const timeoutMs = (this.clusteringConfig.timeWindowMinutes || 30) * 60 * 1000;
    const timer = setTimeout(() => {
      this._deactivateCluster(clusterId);
    }, timeoutMs);

    this.clusterTimers.set(clusterId, timer);
  }

  _deactivateCluster(clusterId) {
    try {
      const cluster = this.activeClusters.get(clusterId);
      if (cluster) {
        cluster.status = 'inactive';
        this._persistCluster(cluster);
        this.activeClusters.delete(clusterId);
        this.clusterTimers.delete(clusterId);
        console.log(`Deactivated cluster ${clusterId} due to timeout`);
      }
    } catch (error) {
      console.error('Error deactivating cluster:', error);
    }
  }

  /**
   * Get analytics for monitoring cluster effectiveness
   */
  getClusterAnalytics(jobId) {
    try {
      const activeCount = Array.from(this.activeClusters.values())
        .filter(c => c.jobId === jobId).length;
      
      const dbAnalytics = this.enhancedDb.queue.getClusterAnalytics(jobId);
      
      return {
        activeClusters: activeCount,
        totalClusters: dbAnalytics.length,
        clustersByKind: dbAnalytics,
        configuration: this.clusteringConfig
      };
    } catch (error) {
      console.error('Error getting cluster analytics:', error);
      return {
        activeClusters: 0,
        totalClusters: 0,
        clustersByKind: [],
        error: error.message
      };
    }
  }

  /**
   * Cleanup and close resources
   */
  close() {
    // Clear all timers
    for (const timer of this.clusterTimers.values()) {
      clearTimeout(timer);
    }
    this.clusterTimers.clear();
    this.activeClusters.clear();
  }
}

module.exports = { ProblemClusteringService };