const robotsParser = require('robots-parser');
const { compact } = require('../../shared/utils/pipelines');

const DEFAULT_ROBOTS_FETCH_TIMEOUT_MS = Number(process.env.CRAWLER_ROBOTS_FETCH_TIMEOUT_MS || 15000);

async function timeoutFetch(url, options = {}) {
  const fetchImpl = typeof globalThis.fetch === 'function'
    ? globalThis.fetch.bind(globalThis)
    : (await import('node-fetch')).default;
  if (options && options.signal) return fetchImpl(url, options);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_ROBOTS_FETCH_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function loadRobots(baseUrl) {
  const robotsUrl = `${baseUrl}/robots.txt`;
  let rules = null, sitemaps = [], loaded = false;
  try {
    const res = await timeoutFetch(robotsUrl);
    if (res.ok) {
      const txt = await res.text();
      rules = robotsParser(robotsUrl, txt);
      loaded = true;
      // Extract sitemaps
      let sm = [];
      if (typeof rules.getSitemaps === 'function') {
        sm = rules.getSitemaps() || [];
      } else {
        const lines = compact(txt.split(/\r?\n/), l => {
          const trimmed = l.trim();
          return /^sitemap\s*:/i.test(trimmed) ? trimmed : null;
        });
        sm = compact(lines, l => l.split(/:/i).slice(1).join(':').trim());
      }
      const norm = [];
      for (const u of sm) { try { const abs = new URL(u, baseUrl).href; norm.push(abs); } catch {} }
      sitemaps = Array.from(new Set(norm));
    }
  } catch {}
  return { rules, sitemaps, loaded };
}

module.exports = { loadRobots };
