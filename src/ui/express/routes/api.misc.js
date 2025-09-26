const express = require('express');

// Misc APIs: status, crawl-types, health, metrics
// Dependencies are injected to avoid tight coupling with server globals.
function createMiscApiRouter({ jobs, getLegacy, getMetrics, getDbRW, QUIET }) {
  if (!jobs || typeof jobs.get !== 'function') throw new Error('createMiscApiRouter: jobs Map required');
  if (typeof getLegacy !== 'function') throw new Error('createMiscApiRouter: getLegacy() required');
  if (typeof getMetrics !== 'function') throw new Error('createMiscApiRouter: getMetrics() required');
  if (typeof getDbRW !== 'function') throw new Error('createMiscApiRouter: getDbRW() required');

  const router = express.Router();

  // Status: minimal legacy snapshot
  router.get('/api/status', (req, res) => {
    try {
      const first = (jobs.size ? jobs.values().next().value : null);
      const { startedAt, lastExit, paused } = getLegacy();
      const running = !!first;
      try { console.log(`[api] GET /api/status -> running=${running}`); } catch (_) {}
      res.json({ running, pid: first?.child?.pid || null, startedAt, lastExit, paused });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Crawl types catalog (best-effort DB; falls back to defaults)
  router.get('/api/crawl-types', (req, res) => {
    try {
      let items = [];
      try {
        const db = getDbRW();
        if (db) {
          items = db.prepare('SELECT name, description, declaration FROM crawl_types ORDER BY id').all().map(r => ({
            name: r.name,
            description: r.description,
            declaration: (() => { try { return JSON.parse(r.declaration); } catch (_) { return { crawlType: r.name }; } })()
          }));
        }
      } catch (_) {}
      if (!items || items.length === 0) {
        items = [
          { name: 'basic', description: 'Follow links only (no sitemap)', declaration: { crawlType: 'basic', useSitemap: false, sitemapOnly: false } },
          { name: 'sitemap-only', description: 'Use only the sitemap to discover pages', declaration: { crawlType: 'sitemap-only', useSitemap: true, sitemapOnly: true } },
          { name: 'basic-with-sitemap', description: 'Follow links and also use the sitemap', declaration: { crawlType: 'basic-with-sitemap', useSitemap: true, sitemapOnly: false } }
        ];
      }
      res.json({ items });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Lightweight health
  router.get('/health', (req, res) => {
    try {
      const m = getMetrics();
      const running = jobs.size > 0;
      let stage = 'idle';
      if (running) {
        try {
          const first = jobs.values().next().value;
          stage = first?.stage || 'running';
        } catch (_) {
          stage = 'running';
        }
      }
      res.json({ running, stage, queueSize: m.queueSize || 0, lastProgressAt: m._lastProgressWall || null, paused: !!getLegacy().paused });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Prometheus metrics
  router.get('/metrics', (req, res) => {
    try {
      const m = getMetrics();
      const { paused } = getLegacy();
      res.setHeader('Content-Type', 'text/plain; version=0.0.4');
      const lines = [];
      lines.push('# HELP crawler_running Whether the crawler is running (1) or not (0)');
      lines.push('# TYPE crawler_running gauge');
      lines.push(`crawler_running ${m.running}`);
      lines.push('# HELP crawler_paused Whether the crawler is paused (1) or not (0)');
      lines.push('# TYPE crawler_paused gauge');
      lines.push(`crawler_paused ${paused ? 1 : 0}`);
      lines.push('# HELP crawler_requests_total Pages visited');
      lines.push('# TYPE crawler_requests_total counter');
      lines.push(`crawler_requests_total ${m.visited}`);
      lines.push('# HELP crawler_downloads_total Pages downloaded');
      lines.push('# TYPE crawler_downloads_total counter');
      lines.push(`crawler_downloads_total ${m.downloaded}`);
      lines.push('# HELP crawler_articles_found_total Articles detected');
      lines.push('# TYPE crawler_articles_found_total counter');
      lines.push(`crawler_articles_found_total ${m.found}`);
      lines.push('# HELP crawler_articles_saved_total Articles saved');
      lines.push('# TYPE crawler_articles_saved_total counter');
      lines.push(`crawler_articles_saved_total ${m.saved}`);
      lines.push('# HELP crawler_errors_total Errors encountered');
      lines.push('# TYPE crawler_errors_total counter');
      lines.push(`crawler_errors_total ${m.errors}`);
      lines.push('# HELP crawler_queue_size Items currently in the queue');
      lines.push('# TYPE crawler_queue_size gauge');
      lines.push(`crawler_queue_size ${m.queueSize}`);
      lines.push('# HELP crawler_requests_per_second Recent request rate');
      lines.push('# TYPE crawler_requests_per_second gauge');
      lines.push(`crawler_requests_per_second ${m.requestsPerSec || 0}`);
      lines.push('# HELP crawler_downloads_per_second Recent download rate');
      lines.push('# TYPE crawler_downloads_per_second gauge');
      lines.push(`crawler_downloads_per_second ${m.downloadsPerSec || 0}`);
      lines.push('# HELP crawler_bytes_per_second Recent network bytes per second');
      lines.push('# TYPE crawler_bytes_per_second gauge');
      lines.push(`crawler_bytes_per_second ${m.bytesPerSec || 0}`);
      lines.push('# HELP crawler_cache_hit_ratio Cache hit ratio (0..1) over recent window');
      lines.push('# TYPE crawler_cache_hit_ratio gauge');
      lines.push(`crawler_cache_hit_ratio ${m.cacheHitRatio1m || 0}`);
      lines.push('# HELP crawler_error_rate_per_min Errors per minute (recent)');
      lines.push('# TYPE crawler_error_rate_per_min gauge');
      lines.push(`crawler_error_rate_per_min ${m.errorRatePerMin || 0}`);
      res.send(lines.join('\n') + '\n');
    } catch (e) {
      res.status(500).send('');
    }
  });

  return router;
}

module.exports = { createMiscApiRouter };
