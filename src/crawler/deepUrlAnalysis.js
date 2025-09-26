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
    try {
      if (typeof db.hasUrl === 'function') {
        return db.hasUrl(url);
      }
      if (db.db && typeof db.db.prepare === 'function') {
        const stmt = db.db.prepare('SELECT 1 FROM urls WHERE url = ? LIMIT 1');
        const row = stmt.get(url);
        if (row) return true;
        const art = db.db.prepare('SELECT 1 FROM articles WHERE url = ? LIMIT 1').get(url);
        if (art) return true;
        const fetch = db.db.prepare('SELECT 1 FROM fetches WHERE url = ? LIMIT 1').get(url);
        if (fetch) return true;
      }
    } catch (_) { /* ignore */ }
    return false;
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
