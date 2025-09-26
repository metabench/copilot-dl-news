const { URL } = require('url');

const SUPERFLUOUS_KEYS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'cmp', 'CMP', 'CMP_TU', 'CMP_BUNIT', 'CMP_TU', 'gclid', 'fbclid', 'msclkid',
  'spref', 'ito', 'gaa_at', 'gaa_ts', 'gaa_sig', 'gaa_l', 'dclid', 'gs_l',
  'guccounter', 'WT.mc_id', 'WT.mc_ev', 'WT.mc_t', 'WT.z_cad',
  'filterkeyevents', 'filterKeyEvents', 'refresh', 'ocid', 'oc', 'ref',
  'referrer', 'variant', 'output', 'sort', 'from', 'platform', 'view'
]);

const ESSENTIAL_KEYS = new Set([
  'q', 'query', 'search', 'keyword', 'keywords', 'page', 'offset', 'start',
  'section', 'topic', 'category', 'id'
]);

const ALWAYS_ESSENTIAL_KEYS = new Set([
  'q', 'query', 'search', 'keyword', 'keywords', 'id'
]);

const SUPERFLUOUS_VALUE_PATTERNS = [
  /^with:block-/i,
  /^cmpid=/i
];

const ESSENTIAL_PATH_HINTS = [/\bsearch\b/i, /\bfind\b/i, /\blookup\b/i];

class UrlPolicy {
  constructor(options = {}) {
    const { baseUrl = null, skipQueryUrls = true } = options;
    this.baseUrl = baseUrl;
    this.skipQueryUrls = skipQueryUrls !== false;
  }

  analyze(rawUrl) {
    if (!rawUrl && rawUrl !== '') {
      return { raw: rawUrl, invalid: true };
    }
    try {
      const urlObj = new URL(rawUrl, this.baseUrl || undefined);
      urlObj.hash = '';
      const normalized = urlObj.href;
      const query = urlObj.searchParams;
      const queryEntries = [];
      const queryKeys = [];
      query.forEach((value, key) => {
        queryEntries.push({ key, value });
        queryKeys.push(key);
      });
      const summary = {
        essentialKeys: [],
        ignorableKeys: [],
        uncertainKeys: []
      };
      for (const entry of queryEntries) {
        const keyLower = entry.key.toLowerCase();
        const value = entry.value || '';
        const valueLower = value.toLowerCase();
        const isSuperfluousByPattern = SUPERFLUOUS_KEYS.has(entry.key) || SUPERFLUOUS_KEYS.has(keyLower) || SUPERFLUOUS_VALUE_PATTERNS.some((re) => re.test(value));
        if (isSuperfluousByPattern && !ALWAYS_ESSENTIAL_KEYS.has(keyLower)) {
          summary.ignorableKeys.push(entry);
          continue;
        }
        if (ESSENTIAL_KEYS.has(keyLower)) {
          summary.essentialKeys.push(entry);
          continue;
        }
        summary.uncertainKeys.push(entry);
      }
      const hasQuery = queryEntries.length > 0;
      const path = urlObj.pathname || '/';
      const pathIsSearchy = ESSENTIAL_PATH_HINTS.some((re) => re.test(path));
      const classification = this._classifyQuery({ hasQuery, summary, pathIsSearchy });
      const guessedWithoutQuery = hasQuery ? this._stripQuery(urlObj) : normalized;
      return {
        raw: rawUrl,
        normalized,
        url: urlObj,
        host: urlObj.hostname,
        path,
        hasQuery,
        queryEntries,
        queryKeys,
        pathIsSearchy,
        querySummary: summary,
        queryClassification: classification,
        guessedWithoutQuery
      };
    } catch (_) {
      return { raw: rawUrl, invalid: true };
    }
  }

  _stripQuery(urlObj) {
    const clone = new URL(urlObj.href);
    clone.search = '';
    return clone.href;
  }

  _classifyQuery({ hasQuery, summary, pathIsSearchy }) {
    if (!hasQuery) {
      return { mode: 'none', reason: 'no-query' };
    }
    if (summary.essentialKeys.length > 0 || pathIsSearchy) {
      return { mode: 'essential', reason: summary.essentialKeys.length ? 'essential-key' : 'search-path' };
    }
    if (summary.uncertainKeys.length > 0) {
      return { mode: 'uncertain', reason: 'mixed-keys' };
    }
    if (summary.ignorableKeys.length > 0) {
      return { mode: 'superfluous', reason: 'ignorable-keys-only' };
    }
    return { mode: 'uncertain', reason: 'default' };
  }

  normalize(rawUrl, context = {}) {
    const analysis = this.analyze(rawUrl);
    if (!analysis || analysis.invalid) {
      return null;
    }
    return analysis.normalized;
  }

  decide(rawUrl, context = {}) {
    const analysis = this.analyze(rawUrl);
    if (!analysis || analysis.invalid) {
      return {
        allow: false,
        reason: 'invalid-url',
        analysis,
        context
      };
    }

    let allow = true;
    let reason = null;
    let notes = null;
    const pendingActions = [];

    if (this.skipQueryUrls && analysis.queryClassification.mode === 'superfluous') {
      allow = false;
      reason = 'query-superfluous';
      notes = 'Query parameters appear to be superfluous; propose investigation of stripped URL.';
    } else if (analysis.hasQuery) {
      pendingActions.push({
        type: 'query-investigation',
        details: {
          mode: analysis.queryClassification.mode,
          reason: analysis.queryClassification.reason,
          queryEntries: analysis.queryEntries
        }
      });
      notes = notes || 'Querystring present; further investigation may be required.';
    }

    return {
      allow,
      reason,
      analysis,
      context,
      notes,
      pendingActions,
      guessedUrl: analysis.guessedWithoutQuery,
      classification: analysis.queryClassification
    };
  }

  shouldDownload(rawUrl, context = {}) {
    const decision = this.decide(rawUrl, context);
    return Object.assign({ decision }, { allow: decision.allow });
  }
}

module.exports = { UrlPolicy };
