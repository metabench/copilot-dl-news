const express = require('express');
const { renderNav } = require('../services/navigation');
const { fetchCountryMinimalData, GazetteerCountryError } = require('../../../data/gazetteerCountry');
const { escapeHtml, formatNumber, createRenderContext } = require('../../../shared/utils/html');
const { errorPage } = require('../components/base');

const responseCache = new Map();
const CACHE_TTL_MS = 60 * 1000;

function getCacheKey({ dbPath, countryCode, limit }) {
  return `${dbPath || '::default::'}::${countryCode}::${limit || 'auto'}`;
}

function createGazetteerCountryMinimalRouter(options = {}) {
  const { urlsDbPath, startTrace } = options;
  if (!urlsDbPath) {
    throw new Error('createGazetteerCountryMinimalRouter requires urlsDbPath');
  }
  if (typeof startTrace !== 'function') {
    throw new Error('createGazetteerCountryMinimalRouter requires startTrace(req, tag)');
  }

  const router = express.Router();
  const context = createRenderContext({ renderNav });

  router.get('/gazetteer/country/:cc', async (req, res) => {
    const trace = startTrace(req, 'gazetteer-minimal');
    const cc = String(req.params.cc || '').trim().toUpperCase();
    const limit = Number(req.query.limit) || undefined;
    const cacheKey = getCacheKey({ dbPath: urlsDbPath, countryCode: cc, limit });

    const endTrace = () => {
      try {
        trace.end();
      } catch (_) {
        // ignore trace errors
      }
    };

    if (!cc) {
      endTrace();
      res.status(400).type('html').send(errorPage({ status: 400, message: 'Invalid country code.' }, context));
      return;
    }

    const cached = responseCache.get(cacheKey);
    if (cached && (Date.now() - cached.createdAt) < CACHE_TTL_MS) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(cached.html);
      endTrace();
      return;
    }

    try {
      const { country, topCities, regionCount, cityCount, cityLimit } = fetchCountryMinimalData({
        dbPath: urlsDbPath,
        countryCode: cc,
        trace,
        cityLimit: limit
      });

      const topCitiesHtml = topCities.length
        ? topCities.map((city) => `<li><a href="/gazetteer/place/${escapeHtml(city.id)}">${escapeHtml(city.name || '')}</a>${city.population ? ` <span class="meta">${formatNumber(city.population)}</span>` : ''}${city.adm1_code ? ` <span class="meta">${escapeHtml(city.adm1_code)}</span>` : ''}</li>`).join('')
        : '<li class="meta">No cities recorded.</li>';

      const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(country.name || country.country_code)} — Gazetteer (minimal)</title>
<style>
  :root{color-scheme:light dark;--bg:#fff;--fg:#0f172a;--muted:#64748b;--border:#e5e7eb;--card:#f8fafc}
  @media (prefers-color-scheme:dark){:root{--bg:#0f172a;--fg:#e2e8f0;--muted:#94a3b8;--border:#1e293b;--card:#16213a}}
  body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:var(--bg);color:var(--fg)}
  .container{max-width:720px;margin:0 auto;padding:20px 16px}
  header{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:18px}
  header h1{margin:0;font-size:1.6rem;font-weight:600;letter-spacing:0.3px}
  nav{flex-shrink:0}
  nav a{text-decoration:none;color:var(--muted);margin-left:12px;font-size:0.95rem}
  nav a:hover{color:var(--fg);text-decoration:underline}
  .card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px}
  .meta{color:var(--muted);font-size:0.85rem}
  h2{margin:0 0 8px;font-size:1.1rem;font-weight:600}
  ul{list-style:none;padding:0;margin:8px 0 0}
  li{margin:4px 0;font-size:0.95rem;line-height:1.4}
  a{color:inherit}
  .badge{display:inline-flex;align-items:center;gap:4px;border-radius:999px;padding:2px 10px;border:1px solid var(--border);font-size:0.8rem;background:rgba(255,255,255,0.6)}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-top:12px}
  .grid .figure{display:flex;flex-direction:column;align-items:flex-start}
  .grid strong{font-size:1.4rem;font-weight:600}
  .note{margin-top:10px;font-size:0.85rem;color:var(--muted)}
</style>
</head><body>
  <div class="container">
    <header>
      <h1>${escapeHtml(country.name || country.country_code)} <span class="badge">${escapeHtml(country.country_code || '')}</span></h1>
      ${renderNav('gazetteer')}
    </header>
    <section class="card">
      <h2>Summary</h2>
      <div class="grid">
        <div class="figure"><strong>${formatNumber(regionCount)}</strong><span class="meta">Regions</span></div>
        <div class="figure"><strong>${formatNumber(cityCount)}</strong><span class="meta">Cities indexed</span></div>
        ${country.population ? `<div class="figure"><strong>${formatNumber(country.population)}</strong><span class="meta">Population</span></div>` : ''}
      </div>
      <p class="note">This minimal view highlights the most prominent cities for quick responses. <a href="/gazetteer/country/${escapeHtml(cc)}?view=full">View detailed page</a>.</p>
    </section>
    <section class="card">
      <h2>Top cities</h2>
      <p class="meta">Showing up to ${cityLimit} cities by population.</p>
      <ul>${topCitiesHtml}</ul>
    </section>
  </div>
</body></html>`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
      responseCache.set(cacheKey, {
        html,
        createdAt: Date.now()
      });
      endTrace();
    } catch (err) {
      endTrace();
      if (err instanceof GazetteerCountryError) {
        if (err.code === 'DB_UNAVAILABLE') {
          res.status(err.statusCode).type('html').send(errorPage({ status: err.statusCode, message: 'Database unavailable.' }, context));
          return;
        }
        if (err.code === 'NOT_FOUND') {
          res.status(err.statusCode).type('html').send(errorPage({ status: err.statusCode, message: 'Country not found.' }, context));
          return;
        }
      }
      const message = err && err.message ? err.message : String(err);
      res.status(500).type('html').send(errorPage({ status: 500, message }, context));
    }
  });

  return router;
}

module.exports = {
  createGazetteerCountryMinimalRouter
};
