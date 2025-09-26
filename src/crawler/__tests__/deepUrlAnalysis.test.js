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
      // Seed minimal url row so hasUrl returns true.
  db.db.prepare("INSERT OR IGNORE INTO urls (url, host, created_at, last_seen_at) VALUES (?, ?, datetime('now'), datetime('now'))")
        .run(existingUrl, 'example.com');

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
});
