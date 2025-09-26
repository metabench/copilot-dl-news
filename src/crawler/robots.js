const robotsParser = require('robots-parser');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function loadRobots(baseUrl) {
  const robotsUrl = `${baseUrl}/robots.txt`;
  let rules = null, sitemaps = [], loaded = false;
  try {
    const res = await fetch(robotsUrl);
    if (res.ok) {
      const txt = await res.text();
      rules = robotsParser(robotsUrl, txt);
      loaded = true;
      // Extract sitemaps
      let sm = [];
      if (typeof rules.getSitemaps === 'function') {
        sm = rules.getSitemaps() || [];
      } else {
        sm = txt.split(/\r?\n/).map(l => l.trim()).filter(l => /^sitemap\s*:/i.test(l)).map(l => l.split(/:/i).slice(1).join(':').trim()).filter(Boolean);
      }
      const norm = [];
      for (const u of sm) { try { const abs = new URL(u, baseUrl).href; norm.push(abs); } catch {} }
      sitemaps = Array.from(new Set(norm));
    }
  } catch {}
  return { rules, sitemaps, loaded };
}

module.exports = { loadRobots };
