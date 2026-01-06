const { ConfigManager } = require('../config/ConfigManager');
const { fp } = require('lang-tools');
const PriorityCalculator = require('./PriorityCalculator');

/**
 * Polymorphic numeric coercion with recursive object unwrapping.
 * Uses functional polymorphism (fp) from lang-tools for signature-based dispatch.
 * 
 * Signature handlers:
 * - '[n]' or '[n,n]': Number returns as-is if finite
 * - '[s]' or '[s,n]': String parsed to number if valid
 * - '[o]' or '[o,n]': Object recursively unwraps .value property
 * - All other cases return fallback (default 0)
 */
const coerceNumeric = fp((a, sig) => {
  const fallback = a.l >= 2 ? a[1] : 0;
  
  // Number - return if finite
  if (sig === '[n]' || sig === '[n,n]') {
    return Number.isFinite(a[0]) ? a[0] : fallback;
  }
  
  // String - parse to number
  if (sig === '[s]' || sig === '[s,n]') {
    const trimmed = a[0].trim();
    if (trimmed !== '') {
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return fallback;
  }
  
  // Object - recursively unwrap .value property
  if (sig === '[o]' || sig === '[o,n]') {
    if (a[0] !== null && typeof a[0].value !== 'undefined') {
      return coerceNumeric(a[0].value, fallback);
    }
    return fallback;
  }
  
  // Default: fallback
  return fallback;
});

function toCamelCase(name = '') {
  return String(name)
    .replace(/[-_\s]+(.)?/g, (_, chr) => (chr ? chr.toUpperCase() : ''))
    .replace(/^(.)/, (match) => match.toLowerCase());
}

/**
 * Enhanced priority scoring system with configurable bonuses and intelligent gap-driven prioritization
 * Integrates with problem clustering and knowledge reuse for improved crawl efficiency
 */
class PriorityScorer {
  constructor(configManager = null, enhancedDb = null) {
    this.configManager = configManager || new ConfigManager();
    this.enhancedDb = enhancedDb;
    this.problemClusters = new Map();
    this.gapPredictions = new Map();
    
    this._refreshConfig();
    this.priorityCalculator = new PriorityCalculator();

    this.configManager.addWatcher((newConfig) => {
      this._refreshConfig(newConfig);
    });
  }

  _refreshConfig(config = null) {
    const cfg = config || this.configManager.getConfig() || {};
    const queue = cfg.queue || {};

    const bonusSources = [queue.bonuses, cfg.queuePriorityBonuses].filter(Boolean);
    this.bonuses = {};
    for (const source of bonusSources) {
      for (const [key, value] of Object.entries(source)) {
        this.bonuses[key] = coerceNumeric(value, this.bonuses[key] || 0);
      }
    }

    const weightSources = [queue.weights].filter(Boolean);
    this.typeWeights = {};
    for (const source of weightSources) {
      for (const [key, value] of Object.entries(source)) {
        this.typeWeights[key] = coerceNumeric(value, this.typeWeights[key]);
      }
    }

    const priorityWeightSources = [cfg.priorityWeights, queue.priorityWeights].filter(Boolean);
    this.priorityWeights = {};
    for (const source of priorityWeightSources) {
      for (const [key, value] of Object.entries(source)) {
        this.priorityWeights[key] = coerceNumeric(value, this.priorityWeights[key] ?? 0);
      }
    }
    if (!Object.keys(this.priorityWeights).length) {
      this.priorityWeights = {
        base: 1,
        'discovery-method': 0,
        'gap-score': 0,
        'problem-clusters': 0,
        'knowledge-reuse': 0
      };
    } else {
      this.priorityWeights.base = this.priorityWeights.base ?? 1;
      this.priorityWeights['discovery-method'] = this.priorityWeights['discovery-method'] ?? 0;
      this.priorityWeights['gap-score'] = this.priorityWeights['gap-score'] ?? 0;
      this.priorityWeights['problem-clusters'] = this.priorityWeights['problem-clusters'] ?? 0;
      this.priorityWeights['knowledge-reuse'] = this.priorityWeights['knowledge-reuse'] ?? 0;
    }

    this.clustering = {
      ...(queue.clustering || {}),
      ...(cfg.clustering || {})
    };

    const rawFeatures = cfg.features || {};
    const normalizedFeatures = {};
    for (const [key, value] of Object.entries(rawFeatures)) {
      normalizedFeatures[toCamelCase(key)] = Boolean(value);
    }
    this.features = normalizedFeatures;
  }

  calculateEnhancedPriority(workItem, metadata = {}) {
    const type = workItem?.type || workItem?.kind || metadata?.type;
    const depth = workItem?.depth || 0;
    const discoveredAt = workItem?.discoveredAt || workItem?.timestamp || null;
    const bias = workItem?.bias || 0;
    const url = workItem?.url || metadata?.url || null;
    const jobId = metadata?.jobId || workItem?.jobId || null;
    const meta = { ...metadata, discoveryMethod: metadata.discoveryMethod || workItem?.discoveryMethod };

    const basePriorityOverride = typeof workItem?.basePriority === 'number'
      ? workItem.basePriority
      : typeof metadata?.basePriority === 'number'
        ? metadata.basePriority
        : null;

    const result = this.computeEnhancedPriority({
      type,
      depth,
      discoveredAt,
      bias,
      url,
      meta,
      jobId,
      basePriorityOverride
    });

    return result.priority;
  }

  computeEnhancedPriority({
    type,
    depth,
    discoveredAt,
    bias = 0,
    url,
    meta = null,
    jobId = null,
    basePriorityOverride = null
  }) {
    const startTime = Date.now();
    const fallbackBase = typeof basePriorityOverride === 'number'
      ? basePriorityOverride
      : this._computeBasePriority({ type, depth, discoveredAt, bias });

    const features = this.features || {};
    const gapEnabled = Boolean(features.gapDrivenPrioritization);
    const clusteringEnabled = Boolean(features.problemClustering);
    const knowledgeEnabled = Boolean(features.plannerKnowledgeReuse);

    try {
      const basePriority = fallbackBase;
      let enhancedPriority = basePriority;
      let prioritySource = 'base';
      let bonusApplied = 0;
      let gapPredictionScore = null;
      let clusterId = null;

      const baseMultiplier = this.priorityWeights.base ?? 1;
      if (baseMultiplier !== 1) {
        const baseContribution = basePriority * (baseMultiplier - 1);
        enhancedPriority += baseContribution;
        if (baseContribution > 0) {
          bonusApplied += baseContribution;
        }
      }

      const discoveryMethod = meta?.discoveryMethod;
      if (gapEnabled && discoveryMethod) {
        const discoveryBonus = this._getDiscoveryBonus(discoveryMethod);
        if (discoveryBonus > 0) {
          enhancedPriority += discoveryBonus;
          bonusApplied += discoveryBonus;
        }

        const discoveryWeight = this.priorityWeights['discovery-method'] ?? 0;
        if (discoveryWeight) {
          const discoveryContribution = basePriority * discoveryWeight;
          enhancedPriority += discoveryContribution;
          if (discoveryContribution > 0) {
            bonusApplied += discoveryContribution;
          }
        }

        prioritySource = discoveryMethod;
      }

      if (gapEnabled) {
        let gapContribution = 0;
        const manualGapScore = typeof meta?.gapScore === 'number' ? meta.gapScore : null;
        if (manualGapScore !== null) {
          const gapWeight = this.priorityWeights['gap-score'] ?? 0;
          const weightedGap = manualGapScore * gapWeight;
          if (weightedGap) {
            gapContribution += weightedGap;
            enhancedPriority += weightedGap;
          }
        }

        if (url && jobId) {
          const dbGapScore = this._getGapPredictionScore(url, jobId);
          if (dbGapScore > 0) {
            gapContribution += dbGapScore;
            enhancedPriority += dbGapScore;
          }
        }

        if (gapContribution > 0) {
          gapPredictionScore = gapContribution;
          bonusApplied += gapContribution;
          if (prioritySource === 'base') {
            prioritySource = 'gap-prediction';
          }
        }
      }

      const clusterMetadataBoost = typeof meta?.problemClusterBoost === 'number' ? meta.problemClusterBoost : 0;
      if (clusteringEnabled && url && jobId) {
        const clusterBoost = this._getClusterBoost(url, jobId);
        let combinedBoost = clusterBoost.boost || 0;
        if (clusterMetadataBoost > combinedBoost) {
          combinedBoost = clusterMetadataBoost;
        }

        if (combinedBoost > 0) {
          const clusterWeight = (this.priorityWeights['problem-clusters'] ?? 0) || 1;
          const contribution = combinedBoost * clusterWeight;
          enhancedPriority += contribution;
          bonusApplied += contribution;
          clusterId = clusterBoost.clusterId;
          if (prioritySource === 'base') {
            prioritySource = 'cluster-boost';
          }
        }
      } else if (clusterMetadataBoost > 0) {
        const clusterWeight = (this.priorityWeights['problem-clusters'] ?? 0) || 1;
        const contribution = clusterMetadataBoost * clusterWeight;
        enhancedPriority += contribution;
        bonusApplied += contribution;
        if (prioritySource === 'base') {
          prioritySource = 'cluster-boost';
        }
      }

      if (knowledgeEnabled && meta?.knowledgeReused) {
        const knowledgeBonus = this._getKnowledgeReuseBonus(meta.knowledgeReused);
        if (knowledgeBonus > 0) {
          const knowledgeWeight = (this.priorityWeights['knowledge-reuse'] ?? 1) || 1;
          const contribution = knowledgeBonus * knowledgeWeight;
          enhancedPriority += contribution;
          bonusApplied += contribution;
          if (prioritySource === 'base') {
            prioritySource = 'knowledge-reuse';
          }
        }
      }

      // Cost-aware priority adjustment (Phase 1 improvement)
      const costEnabled = Boolean(features.costAwarePriority);
      if (costEnabled && meta?.estimatedCostMs) {
        const costAdjustment = this._calculateCostAdjustment(meta.estimatedCostMs, enhancedPriority);
        if (costAdjustment !== 0) {
          enhancedPriority += costAdjustment;
          if (costAdjustment < 0) {
            bonusApplied += costAdjustment; // Track negative adjustment
          } else {
            bonusApplied += costAdjustment;
          }
          if (prioritySource === 'base') {
            prioritySource = 'cost-adjusted';
          }
        }
      }

      const computeTimeMs = Date.now() - startTime;

      return {
        priority: enhancedPriority,
        prioritySource,
        bonusApplied,
        gapPredictionScore,
        clusterId,
        basePriority,
        computeTimeMs,
        metadata: {
          type,
          depth,
          discoveredAt,
          bias,
          meta,
          basePriority,
          url: url ? url.substring(0, 100) : null
        }
      };
    } catch (error) {
      console.error('Error computing enhanced priority:', error);
      return {
        priority: fallbackBase,
        prioritySource: 'fallback',
        bonusApplied: 0,
        error: error.message
      };
    }
  }
  /**
   * Calculate priority adjustment based on estimated cost.
   * Lower cost actions get priority boost, higher cost get penalty.
   * @private
   * @param {number} estimatedCostMs - Estimated action cost in milliseconds
   * @param {number} currentPriority - Current priority before adjustment
   * @returns {number} Priority adjustment (positive or negative)
   */
  _calculateCostAdjustment(estimatedCostMs, currentPriority) {
    // Cost thresholds
    const fastThreshold = 100;  // <100ms = fast
    const slowThreshold = 500;  // >500ms = slow
    
    // Adjustment scale based on current priority magnitude
    const adjustmentScale = currentPriority * 0.1; // 10% of current priority
    
    if (estimatedCostMs < fastThreshold) {
      // Fast actions get priority boost
      const boost = adjustmentScale * (1 - estimatedCostMs / fastThreshold);
      return boost;
    } else if (estimatedCostMs > slowThreshold) {
      // Slow actions get priority penalty
      const penalty = -adjustmentScale * Math.min((estimatedCostMs - slowThreshold) / slowThreshold, 1.0);
      return penalty;
    }
    
    // Medium cost = no adjustment
    return 0;
  }

  _computeBasePriority({ type, depth, discoveredAt, bias = 0 }) {
    // Delegate base priority calculation to PriorityCalculator
    try {
      if (this.priorityCalculator && typeof this.priorityCalculator.computeBase === 'function') {
        return this.priorityCalculator.computeBase({ type, depth, discoveredAt, bias });
      }
    } catch (err) {
      // Fallback to the original logic
    }
    let kind = type;
    if (type && typeof type === 'object') {
      kind = type.kind || type.type || type.intent;
    }
    const normalizedKind = typeof kind === 'string' ? kind : 'nav';

    // Use configurable weights
    let typeWeight = this.typeWeights[normalizedKind];
    if (typeWeight === undefined) {
      // Fallback to hardcoded weights for backward compatibility
      switch (normalizedKind) {
        case 'article': typeWeight = 0; break;
        case 'hub-seed': typeWeight = 4; break;
        case 'history': typeWeight = 6; break;
        case 'nav': typeWeight = 10; break;
        case 'refresh': typeWeight = 25; break;
        default: typeWeight = 12; break;
      }
    }

    const depthPenalty = depth;
    const tieBreaker = discoveredAt || 0;
    return typeWeight + depthPenalty + bias + tieBreaker * 1e-9;
  }

  _getDiscoveryBonus(discoveryMethod) {
    const bonusKey = this._mapDiscoveryMethodToBonus(discoveryMethod);
    return this.bonuses[bonusKey] || 0;
  }

  _mapDiscoveryMethodToBonus(discoveryMethod) {
    const mapping = {
      'intelligent-seed': 'adaptive-seed',
      'adaptive-seed': 'adaptive-seed',
      'hub-seed': 'adaptive-seed',
      'sitemap': 'sitemap',
      'sitemap-url': 'sitemap',
      'validated-hub': 'hub-validated',
      'pattern-match': 'hub-validated',
      'link-discovery': 'link',
      'link': 'link'
    };
    
    return mapping[discoveryMethod] || 'link';
  }

  _getGapPredictionScore(url, jobId) {
    try {
      if (!this.enhancedDb?.queue) return 0;

      // Check if this URL addresses a known gap
      const predictions = this.enhancedDb.queue.getTopGapPredictions(jobId, 100);
      const urlPrediction = predictions.find(p => p.predicted_url === url);
      
      if (urlPrediction) {
        // Score based on confidence and expected coverage lift
        const confidenceScore = urlPrediction.confidence_score || 0;
        const coverageLift = urlPrediction.expected_coverage_lift || 0;
        return Math.min(confidenceScore * 10 + coverageLift * 5, 15);
      }

      return 0;
    } catch (error) {
      console.error('Error getting gap prediction score:', error);
      return 0;
    }
  }

  _getClusterBoost(url, jobId) {
    try {
      if (!this.enhancedDb?.queue) {
        return { boost: 0, clusterId: null };
      }

      // Get active problem clusters for this job
      const clusters = this.enhancedDb.queue.getActiveClusters(jobId);
      
      // Find cluster that this URL might address
      for (const cluster of clusters) {
        if (this._urlAddressesCluster(url, cluster)) {
          return {
            boost: cluster.priority_boost || 0,
            clusterId: cluster.id
          };
        }
      }

      return { boost: 0, clusterId: null };
    } catch (error) {
      console.error('Error getting cluster boost:', error);
      return { boost: 0, clusterId: null };
    }
  }

  _urlAddressesCluster(url, cluster) {
    try {
      // Simple heuristic: URL addresses cluster if it relates to the target
      if (cluster.target && url.includes(cluster.target)) {
        return true;
      }

      // More sophisticated matching could be added here
      // For example, pattern matching, domain analysis, etc.
      
      return false;
    } catch (error) {
      return false;
    }
  }

  _getKnowledgeReuseBonus(knowledgeReused) {
    // Bonus for URLs that reuse validated patterns or hub knowledge
    const baseBonus = this.bonuses['hub-validated'] || 5;
    
    if (knowledgeReused.type === 'pattern' && knowledgeReused.confidence > 0.7) {
      return baseBonus * knowledgeReused.confidence;
    }
    
    if (knowledgeReused.type === 'hub' && knowledgeReused.validated) {
      return baseBonus;
    }
    
    return baseBonus * 0.5; // Partial bonus for other knowledge reuse
  }

  /**
   * Batch compute priorities for multiple URLs efficiently
   */
  computeBatchPriorities(items, jobId = null) {
    const startTime = Date.now();
    const results = [];

    // Pre-load gap predictions and clusters to avoid repeated DB calls
    let gapPredictions = [];
    let clusters = [];
    
    if (this.features.gapDrivenPrioritization && jobId && this.enhancedDb?.queue) {
      try {
        gapPredictions = this.enhancedDb.queue.getTopGapPredictions(jobId, 200);
        if (this.features.problemClustering) {
          clusters = this.enhancedDb.queue.getActiveClusters(jobId);
        }
      } catch (error) {
        console.warn('Failed to pre-load gap data for batch scoring:', error);
      }
    }

    // Compute priorities for each item
    for (const item of items) {
      try {
        const result = this.computeEnhancedPriority({
          ...item,
          jobId
        });
        results.push(result);
      } catch (error) {
        console.error('Error in batch priority computation:', error);
        results.push({
          priority: this._computeBasePriority(item),
          prioritySource: 'error-fallback',
          error: error.message
        });
      }
    }

    const totalTimeMs = Date.now() - startTime;
    
    return {
      results,
      batchStats: {
        itemCount: items.length,
        totalTimeMs,
        avgTimePerItem: totalTimeMs / items.length,
        featuresUsed: {
          gapPrediction: gapPredictions.length > 0,
          clustering: clusters.length > 0,
          knowledgeReuse: this.features.plannerKnowledgeReuse
        }
      }
    };
  }

  /**
   * Update gap predictions based on crawl outcomes
   */
  updateGapPrediction(url, jobId, outcome) {
    if (!this.features.gapDrivenPrioritization || !this.enhancedDb?.queue) {
      return;
    }

    try {
      const predictions = this.enhancedDb.queue.getTopGapPredictions(jobId, 500);
      const prediction = predictions.find(p => p.predicted_url === url);
      
      if (prediction) {
        const status = outcome.success ? 'validated' : 'failed';
        const result = {
          classification: outcome.classification,
          actualCoverageLift: outcome.coverageLift,
          fetchSuccess: outcome.fetchSuccess,
          validationNotes: outcome.notes
        };
        
        this.enhancedDb.queue.validateGapPrediction(prediction.id, status, JSON.stringify(result));
      }
    } catch (error) {
      console.error('Failed to update gap prediction:', error);
    }
  }

  /**
   * Get scoring statistics for monitoring and tuning
   */
  getStats() {
    return {
      configuration: {
        bonuses: Object.keys(this.bonuses).length,
        weights: Object.keys(this.typeWeights || {}).length,
        featuresEnabled: Object.keys(this.features).filter(k => this.features[k]).length
      },
      clustering: this.clustering,
      features: this.features
    };
  }

  /**
   * Update configuration for runtime tuning
   */
  updateConfiguration(updates) {
    return this.configManager.updateConfig(updates);
  }

  close() {
    // Cleanup if needed
    if (this.configManager) {
      this.configManager.close();
    }
  }
}

module.exports = { PriorityScorer };