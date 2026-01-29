/**
 * Decision Explainer - Makes crawler intelligence transparent
 * 
 * Provides human-readable explanations for all intelligent decisions:
 * - Why URLs were chosen or skipped
 * - Confidence intervals and reasoning
 * - Counterfactual analysis ("why not URL X?")
 * - Decision tree visualization data
 */

class DecisionExplainer {
  constructor({ logger = console } = {}) {
    this.logger = logger;
    this.decisionLog = [];
    this.maxLogSize = 1000; // Keep last 1000 decisions
  }

  /**
   * Log a decision with full reasoning
   */
  logDecision({
    decision,
    url,
    reason,
    confidence,
    alternatives = [],
    context = {},
    metadata = {}
  }) {
    const entry = {
      timestamp: new Date().toISOString(),
      decision, // 'selected', 'skipped', 'avoided', 'prioritized'
      url,
      reason,
      confidence,
      alternatives,
      context,
      metadata,
      id: this._generateDecisionId()
    };

    this.decisionLog.push(entry);

    // Maintain log size
    if (this.decisionLog.length > this.maxLogSize) {
      this.decisionLog.shift();
    }

    // Emit for real-time monitoring
    this.logger.log?.('[Decision]', this._formatDecisionForLog(entry));

    return entry.id;
  }

  /**
   * Explain why a URL was selected
   */
  explainSelection(url, action, playbook, context) {
    const reasons = [];
    const factors = [];

    // Hub tree presence
    if (action.source === 'hub-tree') {
      reasons.push(`Found in hub tree at level ${action.placeChain?.length || 0}`);
      factors.push({
        factor: 'hub_tree',
        weight: 0.3,
        value: action.confidence || 0.7,
        explanation: 'Previously discovered hub location'
      });
    }

    // Learned patterns
    if (action.source === 'learned_pattern') {
      reasons.push(`Matches learned pattern (confidence: ${(action.confidence * 100).toFixed(1)}%)`);
      factors.push({
        factor: 'pattern_match',
        weight: 0.25,
        value: action.confidence,
        explanation: `Pattern from ${action.knowledgeReused?.type || 'history'}`
      });
    }

    // Problem resolution
    if (action.source === 'problem-resolution') {
      reasons.push('Generated to resolve known gap');
      factors.push({
        factor: 'gap_resolution',
        weight: 0.35,
        value: 0.6,
        explanation: 'Addresses missing hub or coverage gap'
      });
    }

    // Confidence score
    const confidenceLevel = action.confidence >= 0.8 ? 'high' : 
                           action.confidence >= 0.5 ? 'medium' : 'low';
    reasons.push(`Confidence: ${confidenceLevel} (${(action.confidence * 100).toFixed(1)}%)`);

    return {
      decision: 'selected',
      url,
      summary: reasons.join('; '),
      confidence: action.confidence,
      confidenceInterval: this._calculateConfidenceInterval(action.confidence),
      factors,
      reasoning: this._buildReasoningChain(factors),
      alternatives: context.alternatives || []
    };
  }

  /**
   * Explain why a URL was avoided
   */
  explainAvoidance(url, avoidanceRules, matchedRule) {
    const reasons = [];
    const factors = [];

    if (matchedRule) {
      reasons.push(`Matches avoidance rule: ${matchedRule.kind}`);
      reasons.push(`Pattern: ${matchedRule.pattern}`);
      reasons.push(`Confidence: ${(matchedRule.confidence * 100).toFixed(1)}%`);

      if (matchedRule.learnedAt) {
        const age = Date.now() - new Date(matchedRule.learnedAt).getTime();
        const daysAgo = Math.floor(age / (24 * 60 * 60 * 1000));
        reasons.push(`Learned ${daysAgo} days ago`);
      }

      factors.push({
        factor: 'avoidance_rule',
        weight: 1.0,
        value: matchedRule.confidence,
        explanation: `${matchedRule.kind} pattern detected`
      });
    }

    return {
      decision: 'avoided',
      url,
      summary: reasons.join('; '),
      confidence: matchedRule?.confidence || 1.0,
      rule: matchedRule,
      factors,
      reasoning: 'URL matches learned avoidance pattern - likely to fail or waste resources'
    };
  }

  /**
   * Explain why URL X was not chosen over URL Y
   */
  explainCounterfactual(chosenUrl, alternativeUrl, chosenAction, alternativeAction) {
    const comparison = {
      chosen: chosenUrl,
      alternative: alternativeUrl,
      confidenceDiff: (chosenAction.confidence || 0) - (alternativeAction?.confidence || 0),
      sourceDiff: {
        chosen: chosenAction.source,
        alternative: alternativeAction?.source || 'unknown'
      }
    };

    const reasons = [];

    if (comparison.confidenceDiff > 0.1) {
      reasons.push(`Higher confidence (+${(comparison.confidenceDiff * 100).toFixed(1)}%)`);
    }

    if (chosenAction.source === 'hub-tree' && alternativeAction?.source !== 'hub-tree') {
      reasons.push('Previously validated hub location vs unvalidated');
    }

    if (chosenAction.source === 'problem-resolution') {
      reasons.push('Addresses known gap vs exploratory');
    }

    const priorityScore = this._calculatePriorityScore(chosenAction);
    const altPriorityScore = alternativeAction ? this._calculatePriorityScore(alternativeAction) : 0;

    if (priorityScore > altPriorityScore) {
      reasons.push(`Higher priority score (${priorityScore.toFixed(1)} vs ${altPriorityScore.toFixed(1)})`);
    }

    return {
      type: 'counterfactual',
      comparison,
      summary: reasons.length ? reasons.join('; ') : 'Similar priority, order-dependent selection',
      reasoning: this._buildCounterfactualReasoning(chosenAction, alternativeAction)
    };
  }

  /**
   * Generate decision tree visualization data
   */
  generateDecisionTree(candidateActions, finalActions, avoidanceRules) {
    const tree = {
      root: {
        id: 'root',
        label: 'Candidate Actions',
        count: candidateActions.length,
        children: []
      }
    };

    // Group by source
    const bySource = {};
    for (const action of candidateActions) {
      const source = action.source || 'unknown';
      if (!bySource[source]) {
        bySource[source] = [];
      }
      bySource[source].push(action);
    }

    // Add source branches
    for (const [source, actions] of Object.entries(bySource)) {
      const sourceNode = {
        id: `source_${source}`,
        label: this._formatSourceLabel(source),
        count: actions.length,
        children: []
      };

      // Add confidence branches
      const highConf = actions.filter(a => (a.confidence || 0) >= 0.7);
      const medConf = actions.filter(a => (a.confidence || 0) >= 0.4 && (a.confidence || 0) < 0.7);
      const lowConf = actions.filter(a => (a.confidence || 0) < 0.4);

      if (highConf.length) {
        sourceNode.children.push({
          id: `${source}_high`,
          label: 'High Confidence (≥70%)',
          count: highConf.length,
          status: 'selected'
        });
      }

      if (medConf.length) {
        sourceNode.children.push({
          id: `${source}_med`,
          label: 'Medium Confidence (40-70%)',
          count: medConf.length,
          status: 'selected'
        });
      }

      if (lowConf.length) {
        sourceNode.children.push({
          id: `${source}_low`,
          label: 'Low Confidence (<40%)',
          count: lowConf.length,
          status: 'filtered'
        });
      }

      tree.root.children.push(sourceNode);
    }

    // Add avoidance filter branch
    if (avoidanceRules.length > 0) {
      const avoided = candidateActions.length - finalActions.length;
      if (avoided > 0) {
        tree.root.children.push({
          id: 'avoided',
          label: 'Avoidance Filter',
          count: avoided,
          status: 'blocked',
          rules: avoidanceRules.map(r => r.pattern)
        });
      }
    }

    return tree;
  }

  /**
   * Get recent decisions for review
   */
  getRecentDecisions(limit = 50) {
    return this.decisionLog.slice(-limit);
  }

  /**
   * Get decision statistics
   */
  getDecisionStats() {
    const stats = {
      total: this.decisionLog.length,
      byDecision: {},
      avgConfidence: 0,
      bySource: {}
    };

    let totalConf = 0;
    for (const entry of this.decisionLog) {
      // Count by decision type
      stats.byDecision[entry.decision] = (stats.byDecision[entry.decision] || 0) + 1;

      // Sum confidence
      totalConf += entry.confidence || 0;

      // Count by source
      const source = entry.metadata?.source || 'unknown';
      stats.bySource[source] = (stats.bySource[source] || 0) + 1;
    }

    stats.avgConfidence = stats.total > 0 ? totalConf / stats.total : 0;

    return stats;
  }

  /**
   * Export decision log for analysis
   */
  exportDecisions(format = 'json') {
    if (format === 'json') {
      return JSON.stringify(this.decisionLog, null, 2);
    } else if (format === 'csv') {
      return this._convertToCSV(this.decisionLog);
    } else if (format === 'summary') {
      return this._generateSummary();
    }
  }

  // Private helpers

  _generateDecisionId() {
    return `dec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  _formatDecisionForLog(entry) {
    const confidenceStr = `${(entry.confidence * 100).toFixed(1)}%`;
    return `${entry.decision.toUpperCase()} ${entry.url || 'N/A'} - ${entry.reason} (confidence: ${confidenceStr})`;
  }

  _calculateConfidenceInterval(confidence, sampleSize = 10) {
    // Simple confidence interval calculation
    const margin = 1.96 * Math.sqrt((confidence * (1 - confidence)) / sampleSize);
    return {
      lower: Math.max(0, confidence - margin),
      upper: Math.min(1, confidence + margin),
      margin
    };
  }

  _buildReasoningChain(factors) {
    const sorted = factors.sort((a, b) => (b.weight * b.value) - (a.weight * a.value));
    return sorted.map(f => 
      `${f.explanation} (impact: ${(f.weight * f.value * 100).toFixed(1)}%)`
    ).join(' → ');
  }

  _calculatePriorityScore(action) {
    let score = (action.confidence || 0.5) * 10;
    
    if (action.source === 'hub-tree') score += 3;
    if (action.source === 'problem-resolution') score += 5;
    if (action.source === 'learned_pattern') score += 2;

    return score;
  }

  _buildCounterfactualReasoning(chosen, alternative) {
    if (!alternative) {
      return 'No alternative provided for comparison';
    }

    const chosenScore = this._calculatePriorityScore(chosen);
    const altScore = this._calculatePriorityScore(alternative);

    if (chosenScore > altScore + 2) {
      return `Chosen URL has significantly higher priority (${chosenScore.toFixed(1)} vs ${altScore.toFixed(1)})`;
    } else if (chosenScore > altScore) {
      return `Chosen URL has slightly higher priority (${chosenScore.toFixed(1)} vs ${altScore.toFixed(1)})`;
    } else {
      return `Similar priority scores - selection based on order or other factors`;
    }
  }

  _formatSourceLabel(source) {
    const labels = {
      'hub-tree': 'Hub Tree',
      'learned_pattern': 'Learned Patterns',
      'problem-resolution': 'Gap Resolution',
      'unknown': 'Unknown Source'
    };
    return labels[source] || source;
  }

  _convertToCSV(decisions) {
    const headers = ['timestamp', 'decision', 'url', 'reason', 'confidence'];
    const rows = [headers.join(',')];

    for (const dec of decisions) {
      const row = [
        dec.timestamp,
        dec.decision,
        dec.url || 'N/A',
        `"${dec.reason.replace(/"/g, '""')}"`,
        dec.confidence.toFixed(3)
      ];
      rows.push(row.join(','));
    }

    return rows.join('\n');
  }

  _generateSummary() {
    const stats = this.getDecisionStats();
    const lines = [
      `Decision Summary (${stats.total} total decisions)`,
      '',
      'By Decision Type:',
      ...Object.entries(stats.byDecision).map(([type, count]) => 
        `  ${type}: ${count} (${(count/stats.total*100).toFixed(1)}%)`
      ),
      '',
      'By Source:',
      ...Object.entries(stats.bySource).map(([source, count]) =>
        `  ${source}: ${count} (${(count/stats.total*100).toFixed(1)}%)`
      ),
      '',
      `Average Confidence: ${(stats.avgConfidence * 100).toFixed(1)}%`
    ];

    return lines.join('\n');
  }

  close() {
    // Save decision log if needed
    this.decisionLog = [];
  }
}

module.exports = { DecisionExplainer };
