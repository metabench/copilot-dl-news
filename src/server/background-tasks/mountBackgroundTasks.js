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
function mountBackgroundTasks(app, getDbRW, options = {}) {
  const { BackgroundTaskManager } = require('../../background/BackgroundTaskManager');
  const { IngestAdminAreasTask } = require('../../background/tasks/IngestAdminAreasTask');
  const { createBackgroundTasksRouter } = require('../../api/routes/background-tasks');

  const basePath = options.basePath || '/api/v1/background-tasks';
  const logger = options.logger || console;

  const facade = typeof getDbRW === 'function' ? getDbRW() : null;
  const dbHandle = facade && facade.db ? facade.db : facade;
  if (!dbHandle || typeof dbHandle.prepare !== 'function') {
    throw new Error('mountBackgroundTasks: getDbRW() did not yield a better-sqlite3 handle');
  }

  const manager = new BackgroundTaskManager({ db: dbHandle });

  // Only the verified task for now (in-app admin-area ingestion — the piece
  // that retires the app-stop dance). Network injected via registration so
  // tests use fakes and production gets real WDQS.
  manager.registerTaskType('ingest-admin-areas', IngestAdminAreasTask, options.registrationOptions || {});

  const router = createBackgroundTasksRouter({ taskManager: manager, getDbRW, logger });
  app.use(basePath, router);

  return { manager, router, basePath };
}

module.exports = { mountBackgroundTasks };
