'use strict';

const express = require('express');
const path = require('path');
const jsgui = require('jsgui3-html');

const { resolveBetterSqliteHandle } = require('../utils/dashboardModule');
const { renderPageHtml } = require('../shared');

const {
  selectTopicLanguages,
  selectTopicSlugRows,
  upsertTopicSlugRow,
  deleteTopicSlugRow,
  normalizeLang,
  normalizeSearchQuery
} = require('../../../db/sqlite/v1/queries/nonGeoTopicSlugsUiQueries');

const { TopicListsControl } = require('./controls');

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'news.db');

function renderErrorHtml(message, title = 'Error') {
  const ctx = new jsgui.Page_Context();
  const pre = new jsgui.Control({ context: ctx, tagName: 'pre' });
  pre.add(new jsgui.String_Control({ context: ctx, text: String(message || '') }));
  return renderPageHtml(pre, { title });
}

function renderTopicListsHtml({ dbHandle, basePath = '', lang, q } = {}) {
  if (!dbHandle) {
    throw new Error('renderTopicListsHtml requires dbHandle');
  }

  const resolvedLang = normalizeLang(lang, { fallback: 'und' });
  const resolvedQ = normalizeSearchQuery(q);

  const languages = selectTopicLanguages(dbHandle);
  const rows = selectTopicSlugRows(dbHandle, { lang: resolvedLang, q: resolvedQ, limit: 500 });

  const ctx = new jsgui.Page_Context();
  const control = new TopicListsControl({
    context: ctx,
    basePath,
    model: {
      lang: resolvedLang,
      q: resolvedQ,
      languages,
      rows
    }
  });

  return renderPageHtml(control, {
    title: '🏷️ Topic Lists (Non-Geo)'
  });
}

async function createTopicListsRouter(options = {}) {
  const {
    dbPath = DB_PATH,
    getDbHandle,
    getDbRW,
    includeRootRoute = true
  } = options;

  const resolvedRO = resolveBetterSqliteHandle({
    dbPath,
    readonly: true,
    getDbHandle,
    getDbRW
  });

  if (!resolvedRO.dbHandle) {
    throw new Error('createTopicListsRouter requires a db handle (getDbHandle/getDbRW/dbPath)');
  }

  const router = express.Router();
  router.use(express.urlencoded({ extended: false }));

  if (includeRootRoute) {
    router.get('/', (req, res) => {
      try {
        const html = renderTopicListsHtml({
          dbHandle: resolvedRO.dbHandle,
          basePath: req.baseUrl || '',
          lang: req.query.lang,
          q: req.query.q
        });
        res.type('html').send(html);
      } catch (err) {
        res.status(500).type('html').send(renderErrorHtml(err.stack || err.message));
      }
    });

    router.post('/upsert', (req, res) => {
      const slug = String(req.body.slug || '').trim();
      const lang = normalizeLang(req.body.lang, { fallback: 'und' });
      const label = String(req.body.label || '').trim();
      const source = String(req.body.source || '').trim();
      const notes = String(req.body.notes || '').trim();

      if (!slug) {
        res.status(400).type('html').send(renderErrorHtml('Slug is required'));
        return;
      }

      const rw = resolveBetterSqliteHandle({
        dbPath,
        readonly: false,
        getDbHandle,
        getDbRW
      });

      try {
        upsertTopicSlugRow(rw.dbHandle, {
          slug,
          lang,
          label,
          source,
          notes
        });
      } catch (err) {
        res.status(500).type('html').send(renderErrorHtml(err.stack || err.message));
        return;
      } finally {
        try {
          rw.close();
        } catch {
          // ignore
        }
      }

      const params = new URLSearchParams();
      const returnLang = normalizeLang(req.body.returnLang, { fallback: lang });
      const returnQ = normalizeSearchQuery(req.body.returnQ);

      params.set('lang', returnLang);
      if (returnQ) params.set('q', returnQ);
      params.set('saved', '1');

      res.redirect(`${req.baseUrl || ''}/?${params.toString()}`);
    });

    router.post('/delete', (req, res) => {
      const slug = String(req.body.slug || '').trim();
      const lang = normalizeLang(req.body.lang, { fallback: 'und' });
      if (!slug) {
        res.status(400).type('html').send(renderErrorHtml('Slug is required'));
        return;
      }

      const rw = resolveBetterSqliteHandle({
        dbPath,
        readonly: false,
        getDbHandle,
        getDbRW
      });

      try {
        deleteTopicSlugRow(rw.dbHandle, { slug, lang });
      } catch (err) {
        res.status(500).type('html').send(renderErrorHtml(err.stack || err.message));
        return;
      } finally {
        try {
          rw.close();
        } catch {
          // ignore
        }
      }

      const params = new URLSearchParams();
      const returnLang = normalizeLang(req.body.returnLang, { fallback: lang });
      const returnQ = normalizeSearchQuery(req.body.returnQ);

      params.set('lang', returnLang);
      if (returnQ) params.set('q', returnQ);
      params.set('deleted', '1');

      res.redirect(`${req.baseUrl || ''}/?${params.toString()}`);
    });
  }

  return {
    router,
    close: resolvedRO.close
  };
}

module.exports = {
  createTopicListsRouter,
  renderTopicListsHtml
};
