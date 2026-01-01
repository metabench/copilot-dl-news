'use strict';

const express = require('express');
const path = require('path');

const jsgui = require('jsgui3-html');

const { resolveBetterSqliteHandle } = require('../utils/dashboardModule');
const { renderPageHtml } = require('../shared');

const {
  buildMatrixModel,
  selectCellRows,
  normalizeLang,
  normalizeSearchQuery,
  clampInt
} = require('../../../db/sqlite/v1/queries/topicHubGuessingUiQueries');

const { TopicHubGuessingMatrixControl, TopicHubGuessingCellControl } = require('./controls');

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

function renderTopicHubGuessingMatrixHtml(options = {}) {
  const { dbHandle } = options;
  if (!dbHandle) {
    throw new Error('renderTopicHubGuessingMatrixHtml requires dbHandle');
  }

  const model = buildMatrixModel(dbHandle, options);
  const ctx = new jsgui.Page_Context();

  const control = new TopicHubGuessingMatrixControl({
    context: ctx,
    basePath: options.basePath || '',
    model: {
      ...model,
      matrixMode: normalizeMatrixMode(options.matrixMode),
      matrixThreshold: Number.isFinite(options.matrixThreshold) ? options.matrixThreshold : undefined
    },
    matrixMode: normalizeMatrixMode(options.matrixMode),
    matrixThreshold: Number.isFinite(options.matrixThreshold) ? options.matrixThreshold : undefined
  });

  return renderPageHtml(control, {
    title: '🏷️ Topic Hub Guessing — Coverage Matrix'
  });
}

function renderTopicHubGuessingCellHtml({ basePath = '', modelContext, host, topicSlug, topicLabel, rows }) {
  const backParams = new URLSearchParams();
  if (modelContext.lang) backParams.set('lang', modelContext.lang);
  backParams.set('topicLimit', String(modelContext.topicLimit));
  backParams.set('hostLimit', String(modelContext.hostLimit));
  if (modelContext.topicQ) backParams.set('q', modelContext.topicQ);
  if (modelContext.hostQ) backParams.set('hostQ', modelContext.hostQ);

  const backHref = `${basePath || '.'}/?${backParams.toString()}`;

  const ctx = new jsgui.Page_Context();
  const control = new TopicHubGuessingCellControl({
    context: ctx,
    model: {
      backHref,
      host,
      topicSlug,
      topicLabel,
      rows
    }
  });

  return renderPageHtml(control, {
    title: '🏷️ Topic Hub Guessing — Cell'
  });
}

async function createTopicHubGuessingRouter(options = {}) {
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
    throw new Error('createTopicHubGuessingRouter requires a db handle (getDbHandle/getDbRW/dbPath)');
  }

  const router = express.Router();
  router.use(express.urlencoded({ extended: false }));

  if (includeRootRoute) {
    router.get('/', (req, res) => {
      try {
        const lang = normalizeLang(req.query.lang, { fallback: 'und' });
        const topicLimit = clampInt(req.query.topicLimit, { min: 1, max: 2000, fallback: 120 });
        const hostLimit = clampInt(req.query.hostLimit, { min: 1, max: 400, fallback: 40 });
        const topicQ = normalizeSearchQuery(req.query.q);
        const hostQ = normalizeSearchQuery(req.query.hostQ);

        const matrixMode = normalizeMatrixMode(req.query.matrixMode);
        const matrixThreshold = clampInt(req.query.matrixThreshold, { min: 1, max: 10000000, fallback: 50000 });

        const html = renderTopicHubGuessingMatrixHtml({
          dbHandle: resolved.dbHandle,
          basePath: req.baseUrl || '',
          lang,
          topicLimit,
          hostLimit,
          q: topicQ,
          hostQ,
          matrixMode,
          matrixThreshold
        });

        res.type('html').send(html);
      } catch (err) {
        res.status(500).type('html').send(renderErrorHtml(err.stack || err.message));
      }
    });

    router.get('/cell', (req, res) => {
      try {
        const basePath = req.baseUrl || '';
        const host = String(req.query.host || '').trim();
        const topicSlug = String(req.query.topicSlug || '').trim();
        const lang = normalizeLang(req.query.lang, { fallback: 'und' });

        const topicLimit = clampInt(req.query.topicLimit, { min: 1, max: 2000, fallback: 120 });
        const hostLimit = clampInt(req.query.hostLimit, { min: 1, max: 400, fallback: 40 });
        const topicQ = normalizeSearchQuery(req.query.q);
        const hostQ = normalizeSearchQuery(req.query.hostQ);

        if (!host || !topicSlug) {
          res.status(400).type('html').send(renderErrorHtml('host and topicSlug are required'));
          return;
        }

        const modelContext = { lang, topicLimit, hostLimit, topicQ, hostQ };

        const rows = selectCellRows(resolved.dbHandle, { topicSlug, host, limit: 200 });
        const topicLabel = (rows[0] && (rows[0].topic_label || rows[0].topic_slug)) || topicSlug;

        const html = renderTopicHubGuessingCellHtml({
          basePath,
          modelContext,
          host,
          topicSlug,
          topicLabel,
          rows
        });

        res.type('html').send(html);
      } catch (err) {
        res.status(500).type('html').send(renderErrorHtml(err.stack || err.message));
      }
    });
  }

  return { router, close: resolved.close };
}

module.exports = {
  createTopicHubGuessingRouter,
  renderTopicHubGuessingMatrixHtml
};
