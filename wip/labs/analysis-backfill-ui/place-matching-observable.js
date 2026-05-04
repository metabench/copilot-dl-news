/**
 * Place Matching Observable
 * 
 * Wraps the ArticlePlaceMatcher in an observable pattern for real-time progress tracking.
 * Designed for the "Place Identification and Disambiguation Backfill" task.
 */
'use strict';

const { ArticlePlaceMatcher } = require('../../src/matching/ArticlePlaceMatcher');
const { RollingWindow, ItemTimingTracker, STALL_THRESHOLD_MS, SLOW_ITEM_THRESHOLD_MS } = require('./analysis-observable');
const { performance } = require('perf_hooks');
const path = require('path');
const { findProjectRoot } = require('../../src/utils/project-root');
const Database = require('better-sqlite3');

/**
 * Extended Matcher that reads directly from DB instead of API
 */
class DirectDbArticlePlaceMatcher extends ArticlePlaceMatcher {
  constructor(options) {
    super(options);
    this.gazetteerDb = options.gazetteerDb;
  }

  async getAllPlaces() {
    // Read directly from gazetteer DB
    const places = this.gazetteerDb.prepare(`
      SELECT 
        p.id,
        p.kind,
        p.population,
        p.lat,
        p.lng,
        (SELECT name FROM place_names WHERE place_id = p.id AND name_kind = 'canonical' LIMIT 1) as canonicalName
      FROM places p
    `).all();

    // Get names for each place
    const getNames = this.gazetteerDb.prepare(`
      SELECT name, normalized 
      FROM place_names 
      WHERE place_id = ?
    `);

    return places.map(p => {
      const names = getNames.all(p.id);
      const nameSet = new Set();
      if (p.canonicalName) nameSet.add(p.canonicalName);
      names.forEach(n => {
        nameSet.add(n.name);
        if (n.normalized) nameSet.add(n.normalized);
      });

      return {
        id: p.id,
        canonicalName: p.canonicalName,
        kind: p.kind,
        population: p.population,
        lat: p.lat,
        lng: p.lng,
        names: Array.from(nameSet)
      };
    });
  }
}

function createPlaceMatchingObservable(options = {}) {
  const {
    newsDbPath = path.join(findProjectRoot(__dirname), 'data', 'news.db'),
    // Default to news.db for gazetteer as well, since it contains the places table and ensures FK integrity
    gazetteerDbPath = path.join(findProjectRoot(__dirname), 'data', 'news.db'),
    limit = null,
    emitIntervalMs = 100,
    ruleLevel = 1
  } = options;

  const subscribers = new Set();
  let isRunning = false;
  let shouldStop = false;
  let startTime = null;

  // Metrics
  const recordsWindow = new RollingWindow(5000);
  const itemTimingTracker = new ItemTimingTracker(10);
  let lastEmitTime = 0;
  let lastProgressTime = 0;
  let processedCount = 0;
  let matchedCount = 0;
  let relationsCreated = 0;
  let totalToProcess = 0;
  let latestState = null;

  function emit(type, value) {
    const message = { type, value, timestampMs: Date.now() };
    for (const sub of subscribers) {
      try {
        if (typeof sub.next === 'function') sub.next(message);
      } catch (e) {
        console.error('[place-matching-observable] subscriber error:', e.message);
      }
    }
  }

  function emitError(error) {
    const message = { type: 'error', error: error.message, timestampMs: Date.now() };
    for (const sub of subscribers) {
      try {
        if (typeof sub.error === 'function') sub.error(message);
      } catch (e) {
        console.error('[place-matching-observable] subscriber error:', e.message);
      }
    }
  }

  async function start() {
    if (isRunning) throw new Error('Already running');
    isRunning = true;
    shouldStop = false;
    startTime = performance.now();
    processedCount = 0;
    matchedCount = 0;
    relationsCreated = 0;
    itemTimingTracker.reset();

    const newsDb = new Database(newsDbPath);
    const gazetteerDb = new Database(gazetteerDbPath);

    try {
      // Initialize matcher
      const matcher = new DirectDbArticlePlaceMatcher({
        db: newsDb,
        gazetteerDb: gazetteerDb
      });

      // Count total
      const countQuery = `
        SELECT COUNT(*) as count
        FROM http_responses hr
        WHERE NOT EXISTS (
          SELECT 1 FROM article_place_relations apr WHERE apr.article_id = hr.id
        )
      `;
      totalToProcess = newsDb.prepare(countQuery).get().count;
      if (limit && limit < totalToProcess) totalToProcess = limit;

      emit('next', {
        phase: 'starting',
        processed: 0,
        total: totalToProcess,
        matched: 0,
        relations: 0,
        elapsedMs: 0,
        etaMs: null
      });

      // Get articles
      const articlesQuery = `
        SELECT hr.id, hr.url_id
        FROM http_responses hr
        WHERE NOT EXISTS (
          SELECT 1 FROM article_place_relations apr WHERE apr.article_id = hr.id
        )
        ORDER BY hr.fetched_at DESC
        LIMIT ?
      `;
      const articles = newsDb.prepare(articlesQuery).all(limit || 1000000);

      for (const article of articles) {
        if (shouldStop) break;

        const itemStart = performance.now();
        
        // Match
        const relations = await matcher.matchArticleToPlaces(article.id, ruleLevel);
        
        // Store
        if (relations.length > 0) {
          await matcher.storeArticlePlaces(relations);
          matchedCount++;
          relationsCreated += relations.length;
        }

        processedCount++;
        const now = performance.now();
        const elapsed = now - startTime;
        
        // Metrics
        recordsWindow.add(now, processedCount);
        itemTimingTracker.recordItem(now);
        lastProgressTime = now;

        // Calculate rates/ETA
        const recordsPerSecond = recordsWindow.getRate(now);
        const avgItemMs = itemTimingTracker.getAverageMs();
        let etaMs = null;
        if (totalToProcess > 0 && avgItemMs !== null) {
          const remaining = totalToProcess - processedCount;
          etaMs = Math.round(remaining * avgItemMs);
        }

        // Detailed state for AI diagnosis
        latestState = {
          phase: 'running',
          processed: processedCount,
          total: totalToProcess,
          matched: matchedCount,
          relations: relationsCreated,
          recordsPerSecond: Math.round(recordsPerSecond * 100) / 100,
          elapsedMs: Math.round(elapsed),
          etaMs,
          currentArticleId: article.id,
          lastMatchCount: relations.length,
          // Detailed diagnostics
          lastRelations: relations.map(r => ({
            place: r.place_name,
            confidence: r.confidence,
            type: r.relation_type
          })),
          avgItemMs: Math.round(avgItemMs),
          warnings: []
        };

        // Throttle emit
        if (now - lastEmitTime >= emitIntervalMs) {
          emit('next', latestState);
          lastEmitTime = now;
        }
      }

      // Final emit
      emit('next', { ...latestState, phase: 'complete' });
      emit('complete', { processed: processedCount, matched: matchedCount });

    } catch (err) {
      emitError(err);
    } finally {
      isRunning = false;
      newsDb.close();
      gazetteerDb.close();
    }
  }

  function stop() {
    shouldStop = true;
  }

  function subscribe(observer) {
    const sub = typeof observer === 'function' ? { next: observer } : observer;
    subscribers.add(sub);
    return () => subscribers.delete(sub);
  }

  function getState() {
    return latestState;
  }

  return {
    subscribe,
    start,
    stop,
    getState,
    get isRunning() { return isRunning; }
  };
}

module.exports = { createPlaceMatchingObservable };
