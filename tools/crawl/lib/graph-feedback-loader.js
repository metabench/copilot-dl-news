'use strict';

const path = require('path');
const { pathToFileURL } = require('url');

const { openNewsCrawlerDb } = require('../../../src/db/openNewsCrawlerDb');
const { buildGraphFeedbackPlan } = require('./graph-feedback-planner');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DEFAULT_DB_PATH = path.join(REPO_ROOT, 'data', 'news.db');

function defaultAnalysisImportCandidates() {
  return [
    'news-db-analysis',
    pathToFileURL(path.resolve(REPO_ROOT, '..', 'news-db-analysis', 'dist', 'index.js')).href,
  ];
}

/**
 * Dynamically import news-db-analysis from an installed dependency first, then
 * from the sibling repo build output used in local multi-repo development.
 *
 * @param {object} [options]
 * @param {(specifier: string) => Promise<object>} [options.importer]
 * @param {string[]} [options.candidates]
 * @returns {Promise<object>} Imported news-db-analysis module namespace.
 */
async function importNewsDbAnalysis(options = {}) {
  const importer = options.importer || (specifier => import(specifier));
  const candidates = options.candidates || defaultAnalysisImportCandidates();
  const failures = [];

  for (const candidate of candidates) {
    try {
      return await importer(candidate);
    } catch (err) {
      failures.push({ candidate, message: err && err.message ? err.message : String(err) });
    }
  }

  const detail = failures.map(item => `${item.candidate}: ${item.message}`).join('; ');
  throw new Error(`Unable to import news-db-analysis. Build/install ../news-db-analysis first. ${detail}`);
}

/**
 * Create a WebsiteGraphAnalysisService over a read-only news-crawler-db adapter.
 *
 * @param {object} [options]
 * @param {string} [options.dbPath] SQLite DB path.
 * @param {(dbPath: string, options: object) => object} [options.openDb]
 * @param {object} [options.analysisModule] Pre-imported news-db-analysis module.
 * @param {Function} [options.importAnalysis] Custom importer for tests.
 * @returns {Promise<{db: object, service: object, close: Function}>}
 */
async function createReadOnlyWebsiteGraphAnalysisService(options = {}) {
  const dbPath = options.dbPath || DEFAULT_DB_PATH;
  const analysisModule = options.analysisModule || await (options.importAnalysis || importNewsDbAnalysis)();
  const Service = analysisModule && analysisModule.WebsiteGraphAnalysisService;

  if (typeof Service !== 'function') {
    throw new Error('news-db-analysis does not export WebsiteGraphAnalysisService. Rebuild ../news-db-analysis.');
  }

  const openDb = options.openDb || openNewsCrawlerDb;
  const db = openDb(dbPath, {
    readonly: true,
    fileMustExist: true,
  });
  const service = new Service(db);

  return {
    db,
    service,
    close: () => closeDb(db),
  };
}

/**
 * Build the bounded graph feedback JSON using sibling-repo analysis and DB code.
 *
 * @param {string[]|string} domains Hostnames to analyze.
 * @param {object} [options]
 * @param {string} [options.dbPath] SQLite DB path.
 * @param {object} [options.plannerOptions] Options passed to buildGraphFeedbackPlan().
 * @param {Function} [options.openDb] DB opener test seam.
 * @param {object} [options.analysisModule] Pre-imported analysis module test seam.
 * @param {Function} [options.importAnalysis] Dynamic import test seam.
 * @param {Function} [options.planBuilder] Planner test seam.
 * @returns {Promise<object>} Graph feedback plan.
 */
async function buildReadOnlyGraphFeedbackPlan(domains, options = {}) {
  let handle = null;

  try {
    handle = await createReadOnlyWebsiteGraphAnalysisService(options);
    const planBuilder = options.planBuilder || buildGraphFeedbackPlan;
    return await planBuilder(handle.service, domains, options.plannerOptions || {});
  } finally {
    if (handle) {
      await handle.close();
    }
  }
}

async function closeDb(db) {
  if (db && typeof db.close === 'function') {
    await Promise.resolve(db.close());
  }
}

module.exports = {
  DEFAULT_DB_PATH,
  defaultAnalysisImportCandidates,
  importNewsDbAnalysis,
  createReadOnlyWebsiteGraphAnalysisService,
  buildReadOnlyGraphFeedbackPlan,
  closeDb,
};

