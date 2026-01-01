const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const NewsDatabase = require('../../db');

function seedArticle(db, url) {
  const now = new Date().toISOString();

  db.upsertArticle(
    {
      url,
      title: 'Sample article for logging test',
      html: '<html><body><article><p>Wales and Scotland news story.</p></article></body></html>',
      text: 'Wales and Scotland news story.',
      crawled_at: now,
      request_started_at: now,
      fetched_at: now,
      http_status: 200,
      content_type: 'text/html',
      word_count: 6
    },
    {
      // Keep the test lightweight and deterministic.
      compress: false
    }
  );
}

describe('analysis-run logging', () => {
  jest.setTimeout(20000);

  test('logs rolling page analysis activity', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'analysis-run-log-'));
    const dbPath = path.join(dir, 'news.db');
    const db = new NewsDatabase(dbPath);
    seedArticle(db, 'https://example.com/article-logging');
    db.close();

    const scriptPath = path.join(process.cwd(), 'src', 'tools', 'analysis-run.js');
    const env = Object.assign({}, process.env, { TEST_FAST: '1' });
    const result = spawnSync(process.execPath, [scriptPath, `--db=${dbPath}`, '--limit=5', '--analysis-version=1'], {
      env,
      encoding: 'utf-8'
    });

    try {
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.stdout).toEqual(expect.stringContaining('[analysis-run] analyse-pages:'));
      expect(result.stdout).toEqual(expect.stringContaining('pages processed in last 1s'));
      expect(result.stdout).toEqual(expect.stringContaining('\r'));
    } finally {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
    }
  });
});
