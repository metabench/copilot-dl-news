const {
  getPlaceById,
  listPlaceNames,
  listExternalIds,
  listParentPlaces,
  listChildPlaces,
  getCanonicalName,
  createPlaceSizeCalculator,
  listPlaceArticles
} = require('../../../data/db/sqlite/v1/queries/ui/gazetteerPlace');

function assertDb(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new TypeError('Expected an opened SQLite database instance');
  }
}

function coercePositiveInt(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new RangeError(`${label} must be a positive integer`);
  }
  return n;
}

function slugify(value) {
  if (!value) return '';
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function withTrace(trace, name, fn) {
  if (!trace || typeof trace.pre !== 'function') {
    return fn();
  }
  const done = trace.pre(name);
  try {
    return fn();
  } finally {
    if (typeof done === 'function') {
      try {
        done();
      } catch (_) {
        // noop
      }
    }
  }
}

function computePlaceSize(db, placeId) {
  assertDb(db);
  const id = coercePositiveInt(placeId, 'placeId');
  try {
    const calculator = getSizeCalculator(db);
    const total = calculator(id);
    return {
      sizeBytes: Number.isFinite(total) ? total : 0,
      method: 'approx'
    };
  } catch (_) {
    return {
      sizeBytes: 0,
      method: 'approx'
    };
  }
}

const sizeCalculatorCache = new WeakMap();

function getSizeCalculator(db) {
  if (sizeCalculatorCache.has(db)) {
    return sizeCalculatorCache.get(db);
  }
  const calculator = createPlaceSizeCalculator(db);
  sizeCalculatorCache.set(db, calculator);
  return calculator;
}

function fetchPlaceDetails(db, placeId, options = {}) {
  assertDb(db);
  const id = coercePositiveInt(placeId, 'placeId');
  const trace = options.trace || null;

  const place = withTrace(trace, 'get-place', () => getPlaceById(db, id));
  if (!place) {
    return null;
  }

  const names = withTrace(trace, 'get-names', () => listPlaceNames(db, id));
  const externalIds = withTrace(trace, 'get-ext', () => listExternalIds(db, id));
  const parents = withTrace(trace, 'parents', () => listParentPlaces(db, id));
  const children = withTrace(trace, 'children', () => listChildPlaces(db, id));
  const canonicalName = withTrace(trace, 'canonical-name', () => getCanonicalName(db, id));
  const canonicalSlug = canonicalName ? slugify(canonicalName) : null;

  const { sizeBytes, method } = withTrace(trace, 'size', () => computePlaceSize(db, id)) || { sizeBytes: 0, method: 'approx' };

  return {
    place,
    names,
    externalIds,
    parents,
    children,
    canonicalName,
    canonicalSlug,
    sizeBytes,
    sizeMethod: method
  };
}

function fetchPlaceArticles(db, placeId, options = {}) {
  assertDb(db);
  const id = coercePositiveInt(placeId, 'placeId');
  const limit = Number.isFinite(options.limit) ? Math.max(1, Math.min(100, options.limit | 0)) : 20;
  const trace = options.trace || null;
  const canonicalNameOverride = options.canonicalName;
  const canonicalName = typeof canonicalNameOverride === 'string' && canonicalNameOverride.trim().length
    ? canonicalNameOverride
    : withTrace(trace, 'canonical-name', () => getCanonicalName(db, id));
  if (!canonicalName) {
    return [];
  }
  return withTrace(trace, 'articles', () => listPlaceArticles(db, canonicalName, limit));
}

function listPlaceHubs(db, { host = null, limit = 50 } = {}) {
  assertDb(db);
  const lim = Math.max(1, Math.min(200, Number(limit) || 50));
  const prepared = host
    ? db.prepare('SELECT * FROM place_hubs WHERE LOWER(host) = ? ORDER BY last_seen_at DESC LIMIT ?')
    : db.prepare('SELECT * FROM place_hubs ORDER BY last_seen_at DESC LIMIT ?');

  try {
    if (host) {
      return prepared.all(String(host).toLowerCase(), lim);
    }
    return prepared.all(lim);
  } catch (_) {
    return [];
  }
}

function listPlaceHubsBySlug(db, slug, { limit = 10 } = {}) {
  assertDb(db);
  const normalized = slugify(slug);
  if (!normalized) {
    return [];
  }
  const lim = Math.max(1, Math.min(200, Number(limit) || 10));
  try {
    return db.prepare('SELECT host, url, topic_slug, topic_label, last_seen_at FROM place_hubs WHERE place_slug = ? ORDER BY last_seen_at DESC LIMIT ?').all(normalized, lim);
  } catch (_) {
    return [];
  }
}

function resolvePlaces(db, query, { limit = 10 } = {}) {
  assertDb(db);
  const q = String(query || '').trim();
  if (!q) {
    return [];
  }

  const like = `%${q.toLowerCase()}%`;
  const lim = Math.max(1, Math.min(200, Number(limit) || 10));

  return db.prepare(`
    SELECT p.id, p.kind, p.country_code, p.adm1_code,
           COALESCE(cn.name, pn.name) AS name
    FROM places p
    LEFT JOIN place_names pn ON pn.place_id = p.id
    LEFT JOIN place_names cn ON cn.id = p.canonical_name_id
    WHERE EXISTS (
      SELECT 1 FROM place_names nx
      WHERE nx.place_id = p.id
        AND (LOWER(nx.normalized) LIKE ? OR LOWER(nx.name) LIKE ?)
    )
    ORDER BY (p.kind!='city') ASC,
             (p.kind!='region') ASC,
             (p.population IS NULL) ASC,
             p.population DESC
    LIMIT ?
  `).all(like, like, lim);
}

module.exports = {
  fetchPlaceDetails,
  fetchPlaceArticles,
  listPlaceHubs,
  listPlaceHubsBySlug,
  resolvePlaces,
  computePlaceSize
};
