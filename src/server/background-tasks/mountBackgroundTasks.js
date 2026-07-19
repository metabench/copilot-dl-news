'use strict';

/**
 * Mount the background-task subsystem into an Express app (A7).
 *
 * The subsystem (BackgroundTaskManager + createBackgroundTasksRouter + the
 * task classes) was fully built but never wired into the live app — the
 * router had no caller and no manager was instantiated, so
 * /api/v1/background-tasks always answered "manager not available". This
 * mounts it: a manager over the app's own db handle (in-process writes, no
 * app-stop), the tested IngestAdminAreasTask registered, and the router
 * exposed. Kept minimal + isolated so the server.js change is a single
 * non-fatal line; other built-in tasks can be registered here once each is
 * independently verified.
 *
 * @param {express.Application} app
 * @param {Function} getDbRW - returns the NewsDatabase facade (.db = handle)
 * @param {Object}   [options]
 * @param {string}   [options.basePath='/api/v1/background-tasks']
 * @param {Object}   [options.logger=console]
 * @param {Object}   [options.registrationOptions] - injected per-task opts
 *                    (e.g. fetchSparql/fetchEntities for tests)
 * @returns {{ manager, router, basePath }}
 */
// Canonical taskType -> TaskClass mapping. There is no authoritative
// registry elsewhere (grep: registerTaskType only in tests + this file), so
// this IS it. Only taskTypes with a real class appear; the taskDefinitions
// database-export / gazetteer-import / database-vacuum are orphan defs with
// no class, and CompressionLifecycleTask is an orphan class with no def —
// both left out until reconciled. article-compression = CompressionTask
// (Brotli/article), NOT CompressionLifecycleTask (age-based tiering).
const BUILTIN_TASKS = {
  'ingest-admin-areas': () => require('../../background/tasks/IngestAdminAreasTask').IngestAdminAreasTask,
  'backfill-dates': () => require('../../background/tasks/BackfillDatesTask').BackfillDatesTask,
  'analysis-run': () => require('../../background/tasks/AnalysisTask').AnalysisTask,
  'guess-place-hubs': () => require('../../background/tasks/GuessPlaceHubsTask').GuessPlaceHubsTask,
  'article-compression': () => require('../../background/tasks/CompressionTask').CompressionTask,
};

function mountBackgroundTasks(app, getDbRW, options = {}) {
  const { BackgroundTaskManager } = require('../../background/BackgroundTaskManager');
  const { createBackgroundTasksRouter } = require('../../api/routes/background-tasks');

  const basePath = options.basePath || '/api/v1/background-tasks';
  const logger = options.logger || console;

  const facade = typeof getDbRW === 'function' ? getDbRW() : null;
  const dbHandle = facade && facade.db ? facade.db : facade;
  if (!dbHandle || typeof dbHandle.prepare !== 'function') {
    throw new Error('mountBackgroundTasks: getDbRW() did not yield a better-sqlite3 handle');
  }

  const manager = new BackgroundTaskManager({ db: dbHandle });

  // Register every built-in task that has a class. Registration is a
  // Map.set — construction/execution only happens on createTask+startTask,
  // so an infra-heavy task (analysis, compression, guess) is safe to make
  // AVAILABLE here; it only exercises its deps when actually triggered.
  // ingest-admin-areas gets the injected network (registrationOptions);
  // the rest take their defaults.
  const registered = [];
  for (const [taskType, load] of Object.entries(BUILTIN_TASKS)) {
    try {
      const TaskClass = load();
      const opts = taskType === 'ingest-admin-areas' ? (options.registrationOptions || {}) : {};
      manager.registerTaskType(taskType, TaskClass, opts);
      registered.push(taskType);
    } catch (err) {
      logger.warn(`[background-tasks] could not register ${taskType}: ${err.message}`);
    }
  }

  const router = createBackgroundTasksRouter({ taskManager: manager, getDbRW, logger });
  app.use(basePath, router);

  return { manager, router, basePath, registered };
}

module.exports = { mountBackgroundTasks, BUILTIN_TASKS };
