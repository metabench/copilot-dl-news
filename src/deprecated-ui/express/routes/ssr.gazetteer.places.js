const express = require('express');
const { renderNav } = require('../services/navigation');
const {
  escapeHtml,
  formatNumber,
  formatBytes,
  toQueryString,
  safeTracePre,
  createSizeEstimator
} = require('../views/gazetteer/helpers');
const {
  normalizeGazetteerPlacesQuery,
  fetchGazetteerPlaces
} = require('../../../data/gazetteerPlaces');

function createGazetteerPlacesRouter(options = {}) {
  const { urlsDbPath, startTrace } = options;
  if (!urlsDbPath) throw new Error('createGazetteerPlacesRouter requires urlsDbPath');
  if (typeof startTrace !== 'function') throw new Error('createGazetteerPlacesRouter requires startTrace(req, tag)');

  const router = express.Router();

  router.get('/gazetteer/places', (req, res) => {
    const trace = startTrace(req, 'gazetteer');
    const endTrace = () => {
      try { trace.end(); } catch (_) { /* noop */ }
    };

    const showStorage = String(req.query.storage || '0') === '1';
    const normalizedQuery = normalizeGazetteerPlacesQuery(req.query || {});

    let openDbReadOnly;
    try {
  ({ openDbReadOnly } = require('../../../data/db/sqlite'));
    } catch (err) {
      endTrace();
      res.status(503).send('<!doctype html><title>Gazetteer</title><body><h1>Gazetteer</h1><p>Database unavailable.</p></body></html>');
      return;
    }

    let db;
    try {
      const doneOpen = safeTracePre(trace, 'db-open');
      db = openDbReadOnly(urlsDbPath);
      doneOpen();

      const doneFetch = safeTracePre(trace, 'rows');
      const {
        total,
        rows: baseRows,
        filters
      } = fetchGazetteerPlaces(db, normalizedQuery, {
        orderByNameExpression: 'name',
        orderBySecondary: 'p.id ASC'
      });
      doneFetch();

      let rows = baseRows;
      const {
        search,
        kind,
        countryCode,
        adm1,
        minPopulation,
        sort,
        direction,
        page,
        pageSize
      } = filters;

      let totalStorage = 0;
      if (showStorage) {
        const estimateSize = createSizeEstimator(db);
        rows = rows.map((row) => {
          const size = estimateSize(row.id);
          totalStorage += size;
          return { ...row, size_bytes: size };
        });
      }

      const toggleLinkParams = {
        q: search,
        kind,
        cc: countryCode,
        adm1,
        minpop: minPopulation || '',
        sort,
        dir: direction,
        page,
        pageSize
      };
      const toggleLink = showStorage
        ? `<a href="${toQueryString(toggleLinkParams)}" class="gazetteer-link">Hide storage</a>`
        : `<a href="${toQueryString({ ...toggleLinkParams, storage: 1 })}" class="gazetteer-link">Show approx storage</a>`;

      const rowsHtml = rows.map((row) => `
        <tr>
          <td><a href="/gazetteer/place/${row.id}">${escapeHtml(row.name || '(unnamed)')}</a></td>
          <td>${escapeHtml(row.country_code || '')}</td>
          <td>${escapeHtml(row.adm1_code || '')}</td>
          ${showStorage ? `<td class="tr"><span title="Approximate">~ ${formatBytes(row.size_bytes || 0)}</span></td>` : ''}
          <td class="tr">${formatNumber(row.population)}</td>
        </tr>
      `).join('');

      const summaryBits = [];
      summaryBits.push(`${rows.length ? rows.length : 'No'} result${rows.length === 1 ? '' : 's'}`);
      summaryBits.push(`page ${page}`);
      summaryBits.push(`page size ${pageSize}`);

      if (search) summaryBits.push(`query “${escapeHtml(search)}”`);
      if (kind) summaryBits.push(`kind ${escapeHtml(kind)}`);
      if (countryCode) summaryBits.push(`country ${escapeHtml(countryCode)}`);
      if (adm1) summaryBits.push(`ADM1 ${escapeHtml(adm1)}`);
      if (minPopulation) summaryBits.push(`min population ${escapeHtml(minPopulation)}`);

      const basePagerParams = {
        q: search,
        kind,
        cc: countryCode,
        adm1,
        minpop: minPopulation || '',
        sort,
        dir: direction,
        pageSize
      };
      if (showStorage) {
        basePagerParams.storage = 1;
      }
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const hasPrev = page > 1;
      const hasNext = page < totalPages;
      const prevLink = hasPrev
        ? `<a href="${toQueryString({ ...basePagerParams, page: page - 1 })}">← Prev</a>`
        : `<span class="muted">← Prev</span>`;
      const nextLink = hasNext
        ? `<a href="${toQueryString({ ...basePagerParams, page: page + 1 })}">Next →</a>`
        : `<span class="muted">Next →</span>`;

      const navHtml = renderNav('gazetteer', { variant: 'bar' });
      const summaryLine = summaryBits.join(' · ');
      const storageSummary = showStorage ? `<div class="muted">Total shown storage: ~ ${formatBytes(totalStorage)}</div>` : '';

      const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Gazetteer places</title>
<link rel="stylesheet" href="/ui.css" />
<link rel="stylesheet" href="/ui-dark.css" />
<script type="module" src="/assets/theme/init.js"></script>
<script type="module" src="/assets/global-nav.js"></script>
</head><body class="ui-page gazetteer-page">
  ${navHtml}
  <div class="ui-container">
    <header class="gazetteer-header">
      <h1 class="gazetteer-header__title">Gazetteer places</h1>
      <p class="gazetteer-header__summary">${summaryLine || 'Filter and browse all known places.'}</p>
    </header>
    <main class="gazetteer-layout">
      <section class="panel gazetteer-panel" aria-label="Filter places">
        <form class="gazetteer-search" method="GET" action="/gazetteer/places">
          <div class="gazetteer-search__row">
            <label class="gazetteer-search__label" for="filter-q">Search</label>
            <input id="filter-q" class="gazetteer-input gazetteer-input--wide" type="text" name="q" value="${escapeHtml(search)}" placeholder="City, region, …" />
            <label class="gazetteer-search__label" for="filter-kind">Kind</label>
            <input id="filter-kind" class="gazetteer-input gazetteer-input--compact" type="text" name="kind" value="${escapeHtml(kind)}" placeholder="city" />
            <label class="gazetteer-search__label" for="filter-cc">Country</label>
            <input id="filter-cc" class="gazetteer-input gazetteer-input--compact" type="text" name="cc" value="${escapeHtml(countryCode)}" placeholder="GB" />
            <label class="gazetteer-search__label" for="filter-adm1">ADM1</label>
            <input id="filter-adm1" class="gazetteer-input gazetteer-input--compact" type="text" name="adm1" value="${escapeHtml(adm1)}" placeholder="ENG" />
          </div>
          <div class="gazetteer-search__row u-mt-sm">
            <label class="gazetteer-search__label" for="filter-minpop">Min population</label>
            <input id="filter-minpop" class="gazetteer-input gazetteer-input--compact" type="number" name="minpop" value="${escapeHtml(minPopulation || '')}" min="0" />
            <label class="gazetteer-search__label" for="filter-sort">Sort</label>
            <input id="filter-sort" class="gazetteer-input gazetteer-input--compact" type="text" name="sort" value="${escapeHtml(sort)}" placeholder="name" />
            <label class="gazetteer-search__label" for="filter-dir">Direction</label>
            <input id="filter-dir" class="gazetteer-input gazetteer-input--compact" type="text" name="dir" value="${escapeHtml(direction)}" placeholder="asc" />
            <label class="gazetteer-search__label" for="filter-page">Page</label>
            <input id="filter-page" class="gazetteer-input gazetteer-input--compact" type="number" min="1" name="page" value="${escapeHtml(page)}" />
            <label class="gazetteer-search__label" for="filter-pageSize">Page size</label>
            <input id="filter-pageSize" class="gazetteer-input gazetteer-input--compact" type="number" min="1" max="200" name="pageSize" value="${escapeHtml(pageSize)}" />
          </div>
          <div class="gazetteer-search__row u-mt-sm">
            <button type="submit" class="ui-button">Apply filters</button>
            <a class="ui-button ui-button--secondary" href="/gazetteer/places">Reset</a>
          </div>
        </form>
      </section>
      <section class="panel gazetteer-panel" aria-label="Places results">
        <div class="gazetteer-search__row">
          <span class="muted">${summaryLine || 'Showing all places.'}</span>
        </div>
        <div class="gazetteer-search__row u-mt-xs">
          <div>${prevLink}</div>
          <div class="muted">Page ${page} of ${totalPages}</div>
          <div>${nextLink}</div>
        </div>
        <div class="gazetteer-search__row u-mt-xs">
          ${toggleLink}
          <a class="gazetteer-link" href="/gazetteer">Back to summary</a>
          <a class="gazetteer-link" href="/gazetteer/countries">Countries</a>
        </div>
        <div class="table-responsive u-mt-sm">
          <table class="gazetteer-table">
            <thead><tr><th>Name</th><th>Country</th><th>ADM1</th>${showStorage ? '<th class="tr">Storage</th>' : ''}<th class="tr">Population</th></tr></thead>
            <tbody>${rowsHtml || `<tr><td colspan="${showStorage ? 5 : 4}" class="muted">No places found.</td></tr>`}</tbody>
          </table>
        </div>
        ${storageSummary}
      </section>
    </main>
  </div>
</body></html>`;

      const doneClose = safeTracePre(trace, 'db-close');
      db.close();
      doneClose();

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
      endTrace();
    } catch (err) {
      try { if (db) db.close(); } catch (_) { /* noop */ }
      endTrace();
      const msg = err && err.message ? err.message : String(err);
      res.status(500).send(`<!doctype html><title>Error</title><pre>${escapeHtml(msg)}</pre>`);
    }
  });

  return router;
}

module.exports = {
  createGazetteerPlacesRouter
};
