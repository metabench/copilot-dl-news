"use strict";

const { getCachedStatements, sanitizeLimit } = require("../helpers");

const CACHE_KEY = Symbol.for("db.sqlite.ui.gazetteerPlace");

function tableExists(db, tableName) {
  try {
    return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(tableName));
  } catch (_) {
    return false;
  }
}

function detectArticleConfig(db) {
  try {
    if (!tableExists(db, "articles")) {
      return { mode: "urls-only" };
    }

    const columns = db.prepare("PRAGMA table_info('articles')").all();
    const columnNames = new Set(columns.map((col) => col.name));

    const joinConditions = [];
    if (columnNames.has("url_id")) {
      joinConditions.push("a.url_id = ap.article_url_id");
    }
    if (columnNames.has("url")) {
      joinConditions.push("a.url = u.url");
    }

    if (joinConditions.length === 0) {
      return { mode: "urls-only" };
    }

    const titleSelect = columnNames.has("title") ? "a.title" : "NULL";
    let dateSelect = "NULL";
    if (columnNames.has("published_at")) {
      dateSelect = "a.published_at";
    } else if (columnNames.has("date")) {
      dateSelect = "a.date";
    }

    const joinClause = `LEFT JOIN articles a ON ${joinConditions.join(" OR ")}`;
    const orderByClause = dateSelect !== "NULL"
      ? `ORDER BY (${dateSelect} IS NULL) ASC, ${dateSelect} DESC`
      : "ORDER BY u.url ASC";

    const sql = `
      SELECT u.url,
             ${titleSelect} AS title,
             ${dateSelect} AS date
      FROM article_places ap
      JOIN urls u ON u.id = ap.article_url_id
      ${joinClause}
      WHERE ap.place = ?
      ${orderByClause}
      LIMIT ?
    `;

    return {
      mode: "with-articles",
      sql
    };
  } catch (_) {
    return { mode: "urls-only" };
  }
}

function prepareStatements(db) {
  return getCachedStatements(db, CACHE_KEY, (handle) => {
    const hasArticlePlaces = tableExists(handle, "article_places");
    const hasUrls = tableExists(handle, "urls");
    const canQueryArticles = hasArticlePlaces && hasUrls;
    const articleConfig = canQueryArticles ? detectArticleConfig(handle) : { mode: "urls-only" };
    return {
      placeById: handle.prepare("SELECT * FROM places WHERE id = ?"),
      namesByPlaceId: handle.prepare(`
        SELECT *
        FROM place_names
        WHERE place_id = ?
        ORDER BY is_official DESC, is_preferred DESC, name
      `),
      externalIdsByPlaceId: handle.prepare(`
        SELECT *
        FROM place_external_ids
        WHERE place_id = ?
        ORDER BY source, ext_id
      `),
      parentsByPlaceId: handle.prepare(`
        SELECT ph.parent_id, p.kind, p.country_code, p.adm1_code,
               COALESCE(cn.name, pn.name) AS name
        FROM place_hierarchy ph
        JOIN places p ON p.id = ph.parent_id
        LEFT JOIN place_names pn ON pn.place_id = p.id
        LEFT JOIN place_names cn ON cn.id = p.canonical_name_id
        WHERE ph.child_id = ?
        ORDER BY ph.parent_id
      `),
      childrenByPlaceId: handle.prepare(`
        SELECT ph.child_id, p.kind, p.country_code, p.adm1_code,
               COALESCE(cn.name, pn.name) AS name
        FROM place_hierarchy ph
        JOIN places p ON p.id = ph.child_id
        LEFT JOIN place_names pn ON pn.place_id = p.id
        LEFT JOIN place_names cn ON cn.id = p.canonical_name_id
        WHERE ph.parent_id = ?
        ORDER BY ph.child_id
        LIMIT 200
      `),
      canonicalNameByPlaceId: handle.prepare(`
        SELECT name
        FROM place_names
        WHERE id = (
          SELECT canonical_name_id
          FROM places
          WHERE id = ?
        )
      `),
      articleUrlsOnly: canQueryArticles ? handle.prepare(`
        SELECT u.url,
               NULL AS title,
               NULL AS date
        FROM article_places ap
        JOIN urls u ON u.id = ap.article_url_id
        WHERE ap.place = ?
        ORDER BY u.url ASC
        LIMIT ?
      `) : null,
      articleConfig,
      articleWithMetadata: canQueryArticles && articleConfig.mode === "with-articles"
        ? handle.prepare(articleConfig.sql)
        : null,
      sizePlace: handle.prepare(`
        SELECT COALESCE(LENGTH(kind),0)+COALESCE(LENGTH(country_code),0)+COALESCE(LENGTH(adm1_code),0)+COALESCE(LENGTH(adm2_code),0)+COALESCE(LENGTH(timezone),0)+COALESCE(LENGTH(bbox),0)+COALESCE(LENGTH(source),0)+COALESCE(LENGTH(extra),0) AS total
        FROM places
        WHERE id = ?
      `),
      sizeNames: handle.prepare(`
        SELECT COALESCE(SUM(COALESCE(LENGTH(name),0)+COALESCE(LENGTH(normalized),0)+COALESCE(LENGTH(lang),0)+COALESCE(LENGTH(script),0)+COALESCE(LENGTH(name_kind),0)+COALESCE(LENGTH(source),0)),0) AS total
        FROM place_names
        WHERE place_id = ?
      `),
      sizeExternal: handle.prepare(`
        SELECT COALESCE(SUM(COALESCE(LENGTH(source),0)+COALESCE(LENGTH(ext_id),0)),0) AS total
        FROM place_external_ids
        WHERE place_id = ?
      `),
      sizeHierarchy: handle.prepare(`
        SELECT COALESCE(SUM(COALESCE(LENGTH(relation),0)),0) AS total
        FROM place_hierarchy
        WHERE parent_id = ? OR child_id = ?
      `)
    };
  });
}

function getPlaceById(db, placeId) {
  const { placeById } = prepareStatements(db);
  return placeById.get(placeId) || null;
}

function listPlaceNames(db, placeId) {
  const { namesByPlaceId } = prepareStatements(db);
  return namesByPlaceId.all(placeId);
}

function listExternalIds(db, placeId) {
  const { externalIdsByPlaceId } = prepareStatements(db);
  return externalIdsByPlaceId.all(placeId);
}

function listParentPlaces(db, placeId) {
  const { parentsByPlaceId } = prepareStatements(db);
  return parentsByPlaceId.all(placeId);
}

function listChildPlaces(db, placeId) {
  const { childrenByPlaceId } = prepareStatements(db);
  return childrenByPlaceId.all(placeId);
}

function getCanonicalName(db, placeId) {
  const { canonicalNameByPlaceId } = prepareStatements(db);
  const row = canonicalNameByPlaceId.get(placeId);
  return row ? row.name : null;
}

function createPlaceSizeCalculator(db) {
  const { sizePlace, sizeNames, sizeExternal, sizeHierarchy } = prepareStatements(db);
  const memo = new Map();
  return (placeId) => {
    if (memo.has(placeId)) {
      return memo.get(placeId);
    }
    const place = sizePlace.get(placeId)?.total || 0;
    const names = sizeNames.get(placeId)?.total || 0;
    const external = sizeExternal.get(placeId)?.total || 0;
    const hierarchy = sizeHierarchy.get(placeId, placeId)?.total || 0;
    const total = (place + names + external + hierarchy) | 0;
    memo.set(placeId, total);
    return total;
  };
}

function listPlaceArticles(db, canonicalName, limit) {
  if (!canonicalName) {
    return [];
  }
  const statements = prepareStatements(db);
  const safeLimit = sanitizeLimit(limit, { min: 1, max: 100, fallback: 20 });
  if (!statements.articleUrlsOnly && !statements.articleWithMetadata) {
    return [];
  }
  if (statements.articleConfig.mode === "with-articles" && statements.articleWithMetadata) {
    try {
      return statements.articleWithMetadata.all(canonicalName, safeLimit);
    } catch (_) {
      // Downgrade to URL-only mode if schema has drifted since caching
      statements.articleConfig = { mode: "urls-only" };
      statements.articleWithMetadata = null;
    }
  }
  if (!statements.articleUrlsOnly) {
    return [];
  }
  return statements.articleUrlsOnly.all(canonicalName, safeLimit);
}

module.exports = {
  getPlaceById,
  listPlaceNames,
  listExternalIds,
  listParentPlaces,
  listChildPlaces,
  getCanonicalName,
  createPlaceSizeCalculator,
  listPlaceArticles
};
