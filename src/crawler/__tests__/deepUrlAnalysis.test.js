const fs = require('fs');
const os = require('os');
const path = require('path');
const { DeepUrlAnalyzer } = require('../deepUrlAnalysis');
const NewsDatabase = require('../../db');

describe('DeepUrlAnalyzer', () => {
  jest.setTimeout(15000);

  test('records alias metadata and detects existing queryless URL', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deep-url-'));
    const dbPath = path.join(dir, 'news.db');
    const db = new NewsDatabase(dbPath);
    try {
      const existingUrl = 'https://example.com/live';
      // Seed minimal URL row so hasUrl returns true.
      db.upsertUrl(existingUrl, null, null);

      const analyzer = new DeepUrlAnalyzer({ getDb: () => db });
      const decision = {
        allow: false,
        reason: 'query-superfluous',
        classification: { mode: 'superfluous', reason: 'ignorable-keys-only' },
        analysis: {
          normalized: 'https://example.com/live?filterKeyEvents=false',
          guessedWithoutQuery: existingUrl
        },
        guessedUrl: existingUrl,
        pendingActions: [],
        notes: 'Query parameters appear superfluous'
      };

      const result = analyzer.analyze(decision);
      expect(result.exists).toBe(true);
      expect(result.recorded).toBe(true);

      const row = db.db.prepare('SELECT url, alias_url, [exists] AS exists_flag FROM url_aliases WHERE url = ?').get(decision.analysis.normalized);
      expect(row).toBeDefined();
      expect(row.alias_url).toBe(existingUrl);
      expect(row.exists_flag).toBe(1);
    } finally {
      try { db.close(); } catch (_) {}
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('uses adapter hasUrl helper when available', () => {
    const hasUrl = jest.fn().mockReturnValue(true);
    const recordUrlAlias = jest.fn();
    const db = { hasUrl, recordUrlAlias };
    const analyzer = new DeepUrlAnalyzer({ getDb: () => db });
    const decision = {
      analysis: {
        normalized: 'https://example.com/live?foo=bar',
        guessedWithoutQuery: 'https://example.com/live'
      },
      classification: { mode: 'superfluous', reason: 'ignorable-keys-only' },
      pendingActions: ['trim-query'],
      notes: 'query appears optional'
    };

    const result = analyzer.analyze(decision);

    expect(hasUrl).toHaveBeenCalledWith('https://example.com/live');
    expect(recordUrlAlias).toHaveBeenCalledWith(expect.objectContaining({
      url: decision.analysis.normalized,
      aliasUrl: 'https://example.com/live',
      exists: true
    }));
    expect(result.exists).toBe(true);
    expect(result.recorded).toBe(true);
  });
});
