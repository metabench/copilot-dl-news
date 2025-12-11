"use strict";

const { withNewsDb } = require("../../db/dbAccess");

const ACTIVE_SET_KEY = "decisionConfigSet.activeSlug";

async function getActiveDecisionConfigSlug({ dbPath, fallback = null } = {}) {
  if (!dbPath) return fallback;
  try {
    const value = await withNewsDb(dbPath, (db) => db.getSetting(ACTIVE_SET_KEY, fallback));
    return value ?? fallback;
  } catch (_) {
    return fallback;
  }
}

async function setActiveDecisionConfigSlug({ dbPath, slug } = {}) {
  if (!dbPath) {
    throw new Error("dbPath is required to persist active decision config set");
  }
  if (!slug) {
    throw new Error("slug is required to set active decision config set");
  }
  await withNewsDb(dbPath, (db) => db.setSetting(ACTIVE_SET_KEY, slug));
  return slug;
}

async function loadActiveDecisionConfigSet({ repository, dbPath, requestedSlug = null, fallbackToProduction = true } = {}) {
  if (!repository) {
    throw new Error("repository is required to load decision config sets");
  }

  if (requestedSlug) {
    const configSet = await repository.load(requestedSlug);
    return { configSet, slug: requestedSlug, source: "requested" };
  }

  let slug = await getActiveDecisionConfigSlug({ dbPath, fallback: null });
  let source = slug ? "db" : "";
  if (slug) {
    try {
      const configSet = await repository.load(slug);
      return { configSet, slug, source };
    } catch (_) {
      slug = null;
      source = "";
    }
  }

  if (fallbackToProduction) {
    try {
      const configSet = await repository.fromProduction("production-snapshot");
      return { configSet, slug: configSet.slug, source: "production" };
    } catch (_) {
      /* ignore */
    }
  }

  return { configSet: null, slug: null, source };
}

module.exports = {
  ACTIVE_SET_KEY,
  getActiveDecisionConfigSlug,
  setActiveDecisionConfigSlug,
  loadActiveDecisionConfigSet
};
