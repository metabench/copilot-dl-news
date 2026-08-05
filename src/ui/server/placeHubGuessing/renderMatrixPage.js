'use strict';

/**
 * Coverage-matrix page rendering for the Place Hub Guessing dashboard,
 * extracted from server.js so snapshotChild.js can render the page without
 * loading the crawler stack server.js drags in (CrawlOperations, pattern
 * learning, orchestration — ~18s of requires measured 2026-08-05, versus a
 * couple of seconds for this module's own dependency chain).
 *
 * The render itself is the expensive part of GET /: buildMatrixModel is
 * ~0.3s cold / ~10ms warm, but the jsgui3 render of the 200×30 matrix takes
 * ~6-9s and produces an ~8.5MB document. It is fully synchronous, so it must
 * run off the server's event loop (see the htmlSnapshotCache use in
 * server.js).
 */

const jsgui = require('jsgui3-html');

const {
  buildMatrixModel,
  computeAgeLabel,
  getMappingOutcome
} = require('news-crawler-db');

const { renderPageHtml } = require('../shared');
const { PlaceHubGuessingMatrixControl } = require('./controls');

function normalizeMatrixMode(value) {
  const v = String(value || '').toLowerCase().trim();
  if (v === 'table' || v === 'virtual') return v;
  return 'auto';
}

function renderPlaceHubGuessingMatrixHtml(options = {}) {
  const { dbHandle } = options;
  if (!dbHandle) {
    throw new Error('renderPlaceHubGuessingMatrixHtml requires dbHandle');
  }

  const model = buildMatrixModel(dbHandle, options);
  model.activePattern = options.activePattern;
  model.parentPlace = options.parentPlace;
  model.continent = options.continent;
  model.matrixMode = options.matrixMode;
  model.matrixThreshold = options.matrixThreshold;
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

module.exports = { renderPlaceHubGuessingMatrixHtml, normalizeMatrixMode };
