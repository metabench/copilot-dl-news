"use strict";

/**
 * Pattern Learning Queries (SQLite)
 *
 * Provides small, focused queries used by PatternLearner so the service
 * can remain SQL-free.
 */

function assertDatabase(db) {
  if (!db || typeof db.prepare !== "function") {
    throw new Error("createPatternLearningQueries requires a better-sqlite3 database handle");
  }
}

function createPatternLearningQueries(db) {
  assertDatabase(db);

  const optionalErrors = Object.create(null);

  const safePrepare = (key, sql) => {
    try {
      return db.prepare(sql);
    } catch (error) {
      optionalErrors[key] = error;
      return null;
    }
  };

  const urlsForDomainStmt = safePrepare("urlsForDomain", `
    SELECT url FROM urls WHERE host = ?
    UNION
    SELECT url FROM fetches WHERE host = ?
  `);

  const preferredPlaceNamesStmt = safePrepare("preferredPlaceNames", `
    SELECT p.id, pn.name, p.country_code
      FROM places p
      JOIN place_names pn ON p.id = pn.place_id
     WHERE p.kind = ?
       AND pn.is_preferred = 1
  `);

  return {
    /**
     * Get URLs observed for a domain across url and fetch tables.
     * @param {string} host
     * @returns {Array<{url: string}>}
     */
    getUrlsForDomain(host) {
      if (!urlsForDomainStmt || !host) return [];
      try {
        return urlsForDomainStmt.all(host, host) || [];
      } catch (_) {
        return [];
      }
    },

    /**
     * Get preferred place names for a given kind.
     * @param {string} kind
     * @returns {Array<{id: number, name: string, country_code: string}>}
     */
    getPreferredPlacesByKind(kind) {
      if (!preferredPlaceNamesStmt || !kind) return [];
      try {
        return preferredPlaceNamesStmt.all(kind) || [];
      } catch (_) {
        return [];
      }
    }
  };
}

module.exports = { createPatternLearningQueries };
