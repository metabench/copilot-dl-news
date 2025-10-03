"use strict";

const { getCachedStatements } = require("../helpers");

const CACHE_KEY = Symbol.for("db.sqlite.ui.crawlEvents");

function prepareStatements(db) {
  return getCachedStatements(db, CACHE_KEY, (handle) => ({
    insertQueueEvent: handle.prepare(`
      INSERT INTO queue_events(
        job_id, ts, action, url, depth, host, reason, queue_size,
        alias, queue_origin, queue_role, queue_depth_bucket
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    insertCrawlProblem: handle.prepare(`
      INSERT INTO crawl_problems(job_id, ts, kind, scope, target, message, details)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    insertPlannerStage: handle.prepare(`
      INSERT INTO planner_stage_events(job_id, ts, stage, status, sequence, duration_ms, details)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    insertCrawlMilestone: handle.prepare(`
      INSERT INTO crawl_milestones(job_id, ts, kind, scope, target, message, details)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
  }));
}

function insertQueueEvent(db, params) {
  const { insertQueueEvent } = prepareStatements(db);
  return insertQueueEvent.run(...params);
}

function insertCrawlProblem(db, params) {
  const { insertCrawlProblem } = prepareStatements(db);
  return insertCrawlProblem.run(...params);
}

function insertPlannerStageEvent(db, params) {
  const { insertPlannerStage } = prepareStatements(db);
  return insertPlannerStage.run(...params);
}

function insertCrawlMilestone(db, params) {
  const { insertCrawlMilestone } = prepareStatements(db);
  return insertCrawlMilestone.run(...params);
}

module.exports = {
  insertQueueEvent,
  insertCrawlProblem,
  insertPlannerStageEvent,
  insertCrawlMilestone
};
