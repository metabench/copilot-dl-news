class DeepUrlAnalyzer {
  constructor(options = {}) {
    const { getDb = null, policy = null } = options;
    this.getDb = typeof getDb === 'function' ? getDb : () => getDb;
    this.policy = policy || null;
  }

  _db() {
    const instance = this.getDb ? this.getDb() : null;
    if (!instance || typeof instance !== 'object') return null;
    return instance;
  }

  _hasUrl(db, url) {
    if (!db || !url) return false;
    if (typeof db.hasUrl !== 'function') {
      return false;
    }
    try {
      return !!db.hasUrl(url);
    } catch (_) {
      return false;
    }
  }

  analyze(decision) {
    if (!decision || typeof decision !== 'object') {
      return { recorded: false, exists: false };
    }
    const db = this._db();
    const guessedUrl = decision.guessedUrl || (decision.analysis ? decision.analysis.guessedWithoutQuery : null);
    if (!guessedUrl) {
      return { recorded: false, exists: false };
    }

    const exists = this._hasUrl(db, guessedUrl);
    if (db && typeof db.recordUrlAlias === 'function') {
      try {
        db.recordUrlAlias({
          url: decision.analysis ? decision.analysis.normalized : null,
          aliasUrl: guessedUrl,
          classification: decision.classification ? decision.classification.mode : null,
          reason: decision.classification ? decision.classification.reason : null,
          exists,
          metadata: {
            pendingActions: decision.pendingActions || null,
            notes: decision.notes || null
          }
        });
      } catch (_) { /* ignore */ }
    }

    return { recorded: !!db, exists };
  }
}

module.exports = { DeepUrlAnalyzer };
