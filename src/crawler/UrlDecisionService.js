class UrlDecisionService {
  constructor({
    urlPolicy,
    urlDecisionCache,
    urlAnalysisCache,
    getDbAdapter = () => null
  } = {}) {
    if (!urlPolicy || typeof urlPolicy.decide !== 'function') {
      throw new Error('UrlDecisionService requires a urlPolicy with a decide() method');
    }
    this.urlPolicy = urlPolicy;
    this.urlDecisionCache = urlDecisionCache || new Map();
    this.urlAnalysisCache = urlAnalysisCache || new Map();
    this.getDbAdapter = typeof getDbAdapter === 'function' ? getDbAdapter : () => null;
  }

  getDecision(rawUrl, context = {}) {
    const phase = context && typeof context === 'object' && context.phase ? String(context.phase) : 'default';
    const cacheKey = `${phase}|${rawUrl}`;
    if (this.urlDecisionCache.has(cacheKey)) {
      return this.urlDecisionCache.get(cacheKey);
    }
    let decision = null;
    try {
      decision = this.urlPolicy.decide(rawUrl, context);
    } catch (error) {
      decision = {
        allow: false,
        reason: 'policy-error',
        analysis: {
          raw: rawUrl,
          invalid: true
        },
        error
      };
    }
    const analysis = decision?.analysis;
    if (analysis && !analysis.invalid) {
      const compact = this._compactUrlAnalysis(analysis);
      if (compact) {
        const normalizedKey = compact.normalized || rawUrl;
        this.urlAnalysisCache.set(normalizedKey, compact);
        this.urlAnalysisCache.set(rawUrl, compact);
        this._persistUrlAnalysis(compact, decision);
      }
    }
    this.urlDecisionCache.set(cacheKey, decision);
    return decision;
  }

  _compactUrlAnalysis(analysis) {
    if (!analysis || typeof analysis !== 'object' || analysis.invalid) return null;
    const trimEntries = (list) => Array.isArray(list) ? list.map((entry) => ({
      key: entry.key,
      value: entry.value
    })) : [];
    return {
      raw: analysis.raw,
      normalized: analysis.normalized,
      host: analysis.host,
      path: analysis.path,
      hasQuery: !!analysis.hasQuery,
      pathIsSearchy: !!analysis.pathIsSearchy,
      guessedWithoutQuery: analysis.guessedWithoutQuery || null,
      querySummary: {
        essential: trimEntries(analysis.querySummary?.essentialKeys || []),
        ignorable: trimEntries(analysis.querySummary?.ignorableKeys || []),
        uncertain: trimEntries(analysis.querySummary?.uncertainKeys || [])
      },
      queryClassification: analysis.queryClassification || null
    };
  }

  _persistUrlAnalysis(compactAnalysis, decision) {
    if (!compactAnalysis || !compactAnalysis.normalized) return;
    const dbAdapter = this.getDbAdapter();
    if (!dbAdapter || typeof dbAdapter.isEnabled !== 'function' || !dbAdapter.isEnabled()) {
      return;
    }
    try {
      const payload = {
        analysis: compactAnalysis,
        decision: {
          allow: !!(decision && decision.allow),
          reason: decision?.reason || null,
          classification: decision?.classification || null
        },
        recordedAt: new Date().toISOString()
      };
      dbAdapter.upsertUrl(compactAnalysis.normalized, null, JSON.stringify(payload));
    } catch (_) {
      // Persisting analysis is best effort
    }
  }
}

module.exports = {
  UrlDecisionService
};
