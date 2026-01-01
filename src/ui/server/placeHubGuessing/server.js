'use strict';

const express = require('express');
const path = require('path');

const jsgui = require('jsgui3-html');

const { resolveBetterSqliteHandle } = require('../utils/dashboardModule');

const { renderPageHtml } = require('../shared');

const {
  buildMatrixModel,
  getCellModel,
  upsertCellVerification,
  computeAgeLabel,
  getMappingOutcome,
  parseEvidenceJson,
  normalizePlaceKind,
  normalizePageKind,
  normalizeSearchQuery,
  clampInt,
  normalizeOutcome
} = require('../../../db/sqlite/v1/queries/placeHubGuessingUiQueries');

const { PlaceHubGuessingMatrixControl, PlaceHubGuessingCellControl } = require('./controls');

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'news.db');

function normalizeMatrixMode(value) {
  const v = String(value || '').toLowerCase().trim();
  if (v === 'table' || v === 'virtual') return v;
  return 'auto';
}

function renderErrorHtml(message, title = 'Error') {
  const ctx = new jsgui.Page_Context();
  const pre = new jsgui.Control({ context: ctx, tagName: 'pre' });
  pre.add(new jsgui.String_Control({ context: ctx, text: String(message || '') }));
  return renderPageHtml(pre, { title });
}

function renderPlaceHubGuessingMatrixHtml(options = {}) {
  const { dbHandle } = options;
  if (!dbHandle) {
    throw new Error('renderPlaceHubGuessingMatrixHtml requires dbHandle');
  }

  const model = buildMatrixModel(dbHandle, options);
  const ctx = new jsgui.Page_Context();

  const control = new PlaceHubGuessingMatrixControl({
    context: ctx,
    basePath: options.basePath || '',
    model,
    computeAgeLabel,
    getMappingOutcome,
    matrixMode: normalizeMatrixMode(options.matrixMode),
    matrixThreshold: Number.isFinite(options.matrixThreshold) ? options.matrixThreshold : undefined
  });

  return renderPageHtml(control, {
    title: '🧭 Place Hub Guessing — Coverage Matrix'
  });
}

function renderPlaceHubGuessingCellHtml({ basePath = '', modelContext, place, mapping, host }) {
  const placeLabel = place?.place_name || place?.country_code || String(place?.place_id || '');
  const outcome = mapping ? getMappingOutcome(mapping) : null;

  const mappingJson = mapping
    ? JSON.stringify(
        {
          ...mapping,
          evidence: parseEvidenceJson(mapping.evidence)
        },
        null,
        2
      )
    : '';

  const backParams = new URLSearchParams();
  backParams.set('kind', modelContext.placeKind);
  backParams.set('pageKind', modelContext.pageKind);
  backParams.set('placeLimit', String(modelContext.placeLimit));
  backParams.set('hostLimit', String(modelContext.hostLimit));
  if (modelContext.placeQ) backParams.set('q', modelContext.placeQ);
  if (modelContext.hostQ) backParams.set('hostQ', modelContext.hostQ);

  const backHref = `${basePath || '.'}/?${backParams.toString()}`;

  const cellState = mapping
    ? (mapping.status === 'verified' || mapping.verified_at
        ? (outcome === 'absent' ? 'Verified (not there)' : 'Verified (there)')
        : 'Pending')
    : 'Unchecked';

  const currentUrl = mapping?.url || '';
  const verifiedLabel = mapping?.verified_at
    ? `${mapping.verified_at} (${computeAgeLabel(mapping.verified_at)})`
    : '';

  const ctx = new jsgui.Page_Context();
  const control = new PlaceHubGuessingCellControl({
    context: ctx,
    basePath,
    model: {
      backHref,
      placeLabel,
      host,
      pageKind: modelContext.pageKind,
      cellState,
      currentUrl: currentUrl || '(none)',
      verifiedLabel,
      mappingJson,
      hidden: {
        placeId: place?.place_id || '',
        host,
        kind: modelContext.placeKind,
        pageKind: modelContext.pageKind,
        placeLimit: modelContext.placeLimit,
        hostLimit: modelContext.hostLimit,
        q: modelContext.placeQ || '',
        hostQ: modelContext.hostQ || ''
      }
    }
  });

  return renderPageHtml(control, {
    title: '🧭 Place Hub Guessing — Cell'
  });
}

async function createPlaceHubGuessingRouter(options = {}) {
  const {
    dbPath = DB_PATH,
    getDbHandle,
    getDbRW,
    includeRootRoute = true
  } = options;

  const resolved = resolveBetterSqliteHandle({
    dbPath,
    readonly: true,
    getDbHandle,
    getDbRW
  });

  if (!resolved.dbHandle) {
    throw new Error('createPlaceHubGuessingRouter requires a db handle (getDbHandle/getDbRW/dbPath)');
  }

  const router = express.Router();

  // Needed for simple HTML form submissions.
  router.use(express.urlencoded({ extended: false }));

  if (includeRootRoute) {
    router.get('/', (req, res) => {
      try {
        const placeKind = normalizePlaceKind(req.query.kind);
        const pageKind = normalizePageKind(req.query.pageKind);
        const placeLimit = clampInt(req.query.placeLimit, { min: 1, max: 200, fallback: 30 });
        const hostLimit = clampInt(req.query.hostLimit, { min: 1, max: 50, fallback: 12 });
        const placeQ = normalizeSearchQuery(req.query.q);
        const hostQ = normalizeSearchQuery(req.query.hostQ);

        const matrixMode = normalizeMatrixMode(req.query.matrixMode);
        const matrixThreshold = clampInt(req.query.matrixThreshold, { min: 1, max: 10000000, fallback: 50000 });

        const html = renderPlaceHubGuessingMatrixHtml({
          dbHandle: resolved.dbHandle,
          placeKind,
          pageKind,
          placeLimit,
          hostLimit,
          placeQ,
          hostQ,
          matrixMode,
          matrixThreshold,
          basePath: req.baseUrl || ''
        });

        res.type('html').send(html);
      } catch (err) {
        res.status(500).type('html').send(renderErrorHtml(err.stack || err.message));
      }
    });

    router.get('/cell', (req, res) => {
      try {
        const basePath = req.baseUrl || '';

        const result = getCellModel(resolved.dbHandle, {
          placeId: req.query.placeId,
          host: req.query.host,
          placeKind: req.query.kind,
          pageKind: req.query.pageKind,
          placeLimit: req.query.placeLimit,
          hostLimit: req.query.hostLimit,
          placeQ: req.query.q,
          hostQ: req.query.hostQ
        });

        if (result?.error) {
          res.status(result.error.status).type('html').send(renderErrorHtml(result.error.message));
          return;
        }

        const html = renderPlaceHubGuessingCellHtml({
          basePath,
          modelContext: result.modelContext,
          place: result.place,
          mapping: result.mapping,
          host: result.host
        });

        res.type('html').send(html);
      } catch (err) {
        res.status(500).type('html').send(renderErrorHtml(err.stack || err.message));
      }
    });

    router.post('/cell/verify', (req, res) => {
      try {
        const placeId = Number(req.body.placeId);
        const host = String(req.body.host || '').trim();
        const url = String(req.body.url || '').trim();
        const outcome = normalizeOutcome(req.body.outcome);
        const note = normalizeSearchQuery(req.body.note);

        const placeKind = normalizePlaceKind(req.body.kind);
        const pageKind = normalizePageKind(req.body.pageKind);
        const placeLimit = clampInt(req.body.placeLimit, { min: 1, max: 200, fallback: 30 });
        const hostLimit = clampInt(req.body.hostLimit, { min: 1, max: 50, fallback: 12 });
        const placeQ = normalizeSearchQuery(req.body.q);
        const hostQ = normalizeSearchQuery(req.body.hostQ);

        if (!url) {
          res.status(400).type('html').send(renderErrorHtml('URL is required'));
          return;
        }
        if (!outcome) {
          res.status(400).type('html').send(renderErrorHtml('Invalid outcome'));
          return;
        }

        const rw = resolveBetterSqliteHandle({
          dbPath,
          readonly: false,
          getDbHandle,
          getDbRW
        });

        try {
          const upsertResult = upsertCellVerification(rw.dbHandle, {
            placeId,
            host,
            pageKind,
            outcome,
            url,
            note
          });

          if (upsertResult?.error) {
            res.status(upsertResult.error.status).type('html').send(renderErrorHtml(upsertResult.error.message));
            return;
          }
        } finally {
          try {
            rw.close();
          } catch {
            // ignore
          }
        }

        const params = new URLSearchParams();
        params.set('placeId', String(placeId));
        params.set('host', host);
        params.set('kind', placeKind);
        params.set('pageKind', pageKind);
        params.set('placeLimit', String(placeLimit));
        params.set('hostLimit', String(hostLimit));
        if (placeQ) params.set('q', placeQ);
        if (hostQ) params.set('hostQ', hostQ);
        params.set('updated', '1');

        res.redirect(`${req.baseUrl || ''}/cell?${params.toString()}`);
      } catch (err) {
        res.status(500).type('html').send(renderErrorHtml(err.stack || err.message));
        return;
      }
    });
  }

  return { router, close: resolved.close };
}

module.exports = {
  createPlaceHubGuessingRouter,
  renderPlaceHubGuessingMatrixHtml
};
