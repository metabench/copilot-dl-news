const {
  getCountryByCode,
  getRegionCount,
  listRegions,
  getCityCount,
  listCities,
  getRegionAndCityCounts,
  listTopCities,
  createPlaceSizeCalculator
} = require('../../../data/db/sqlite/v1/queries/ui/gazetteerCountry');

class GazetteerCountryError extends Error {
  constructor(message, statusCode = 500, code = 'GAZETTEER_COUNTRY_ERROR', options = {}) {
    super(message);
    this.name = 'GazetteerCountryError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = options.details || null;
  }
}

function requireEnsureDb() {
  try {
    return require('../../../data/db/sqlite');
  } catch (err) {
    const error = new GazetteerCountryError('Database unavailable.', 503, 'DB_UNAVAILABLE');
    error.cause = err;
    throw error;
  }
}

function withTrace(trace, name, fn) {
  const done = trace && typeof trace.pre === 'function' ? trace.pre(name) : null;
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

const cachedReadHandles = new Map();
let cachedHandleCleanupRegistered = false;
const minimalDataCache = new Map();
const MINIMAL_CACHE_TTL_MS = 60 * 1000;

function normalizeDbKey(dbPath) {
  return dbPath ? String(dbPath) : '::default::';
}

function registerCachedHandleCleanup() {
  if (cachedHandleCleanupRegistered) {
    return;
  }
  cachedHandleCleanupRegistered = true;
  const events = ['exit', 'SIGINT', 'SIGTERM'];
  const cleanup = () => {
    for (const db of cachedReadHandles.values()) {
      try {
        db.close();
      } catch (_) {
        // ignore
      }
    }
    cachedReadHandles.clear();
  };
  for (const evt of events) {
    try {
      process.once(evt, cleanup);
    } catch (_) {
      // ignore inability to register (test environments)
    }
  }
}

function getCachedReadOnlyDb(dbPath, trace) {
  const key = normalizeDbKey(dbPath);
  if (cachedReadHandles.has(key)) {
    return cachedReadHandles.get(key);
  }

  const { openDbReadOnly } = requireEnsureDb();
  const db = withTrace(trace, 'db-open', () => openDbReadOnly(dbPath));
  cachedReadHandles.set(key, db);
  registerCachedHandleCleanup();
  return db;
}

function clearCachedReadHandles() {
  for (const db of cachedReadHandles.values()) {
    try {
      db.close();
    } catch (_) {
      // ignore
    }
  }
  cachedReadHandles.clear();
  minimalDataCache.clear();
}

function effectiveLimit(limit, max) {
  return Number.isFinite(limit) && limit > 0 ? Math.min(Math.trunc(limit), max) : undefined;
}

function normalizedLimit(limit, max) {
  return Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 0), max) : null;
}

function fetchCountryPageData({ dbPath, countryCode, includeStorage = false, trace = null, cityLimit = 50, regionLimit = 100 }) {
  if (!countryCode) {
    throw new GazetteerCountryError('Country code required.', 400, 'INVALID_COUNTRY');
  }

  const upperCode = String(countryCode).trim().toUpperCase();
  const { openDbReadOnly } = requireEnsureDb();
  const db = withTrace(trace, 'db-open', () => openDbReadOnly(dbPath));

  try {
    const country = withTrace(trace, 'get-country', () => getCountryByCode(db, upperCode));

    if (!country) {
      throw new GazetteerCountryError('Country not found', 404, 'NOT_FOUND');
    }

    const regionCount = withTrace(trace, 'count-regions', () => getRegionCount(db, upperCode));
    const cityCount = withTrace(trace, 'count-cities', () => getCityCount(db, upperCode));

    const regionLimitValue = effectiveLimit(regionLimit, 500);
    const cityLimitValue = effectiveLimit(cityLimit, 500);

    const regions = withTrace(trace, 'list-regions', () => listRegions(db, upperCode, regionLimitValue));
    let cities = withTrace(trace, 'list-cities', () => listCities(db, upperCode, cityLimitValue));

    let countryStorage = 0;
    if (includeStorage) {
      const sizeFor = createPlaceSizeCalculator(db);
      cities = cities.map((row) => ({ ...row, size_bytes: sizeFor(row.id) }));
      countryStorage = sizeFor(country.id);
    }

    return {
      country,
      regions,
      regionCount,
      cities,
      cityCount,
      cityLimit: normalizedLimit(cityLimit, 500),
      regionLimit: normalizedLimit(regionLimit, 500),
      countryStorage
    };
  } catch (err) {
    if (err instanceof GazetteerCountryError) {
      throw err;
    }
    const wrapped = new GazetteerCountryError('Failed to load country data.', 500, 'LOAD_FAILED');
    wrapped.cause = err;
    throw wrapped;
  } finally {
    withTrace(trace, 'db-close', () => {
      try {
        db.close();
      } catch (_) {
        // ignore close errors
      }
    });
  }
}

function fetchCountryMinimalData({ dbPath, countryCode, trace = null, cityLimit = 5 }) {
  if (!countryCode) {
    throw new GazetteerCountryError('Country code required.', 400, 'INVALID_COUNTRY');
  }

  const upperCode = String(countryCode).trim().toUpperCase();
  const limitValue = Number.isFinite(cityLimit) && cityLimit > 0 ? Math.min(Math.trunc(cityLimit), 20) : 5;
  const cacheKey = `${normalizeDbKey(dbPath)}::${upperCode}::${limitValue}`;
  const cached = minimalDataCache.get(cacheKey);
  if (cached && (Date.now() - cached.createdAt) < MINIMAL_CACHE_TTL_MS) {
    return cached.value;
  }
  const db = getCachedReadOnlyDb(dbPath, trace);

  try {
    const country = withTrace(trace, 'get-country', () => getCountryByCode(db, upperCode));

    if (!country) {
      throw new GazetteerCountryError('Country not found', 404, 'NOT_FOUND');
    }

    const { regionCount, cityCount } = withTrace(trace, 'counts', () => getRegionAndCityCounts(db, upperCode));
    const topCities = withTrace(trace, 'top-cities', () => listTopCities(db, upperCode, limitValue));

    const payload = {
      country,
      topCities,
      regionCount,
      cityCount,
      cityLimit: limitValue
    };
    minimalDataCache.set(cacheKey, {
      value: payload,
      createdAt: Date.now()
    });
    return payload;
  } catch (err) {
    if (err instanceof GazetteerCountryError) {
      throw err;
    }
    const wrapped = new GazetteerCountryError('Failed to load minimal country data.', 500, 'LOAD_MINIMAL_FAILED');
    wrapped.cause = err;
    throw wrapped;
  } finally {
    withTrace(trace, 'db-close', () => {});
  }
}

module.exports = {
  fetchCountryPageData,
  fetchCountryMinimalData,
  GazetteerCountryError,
  __clearCountryDbCacheForTests: clearCachedReadHandles
};
