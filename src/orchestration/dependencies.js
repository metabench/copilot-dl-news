'use strict';

/**
 * Orchestration Dependencies Factory
 * 
 * Creates standardized dependency injection containers for orchestration layers.
 * Ensures CLI tools and API routes use identical dependencies and configuration.
 */

const { ensureDb } = require('../db/sqlite/ensureDb');
const { createSQLiteDatabase } = require('../db/sqlite');
const { createPlaceHubCandidatesStore } = require('../db/placeHubCandidatesStore');
const { createGuessPlaceHubsQueries } = require('../db/sqlite/v1/queries/guessPlaceHubsQueries');
const { CountryHubGapAnalyzer } = require('../services/CountryHubGapAnalyzer');
const { RegionHubGapAnalyzer } = require('../services/RegionHubGapAnalyzer');
const { CityHubGapAnalyzer } = require('../services/CityHubGapAnalyzer');
const { TopicHubGapAnalyzer } = require('../services/TopicHubGapAnalyzer');
const HubValidator = require('../hub-validation/HubValidator');
const { createFetchRecorder } = require('../utils/fetch/fetchRecorder');

const fetchImpl = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

/**
 * Create default logger with configurable verbosity
 */
function createLogger(verbose = false) {
  if (!verbose) {
    return {
      info: () => {},
      warn: () => {},
      error: console.error.bind(console)
    };
  }
  
  return {
    info: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console)
  };
}

/**
 * Create orchestration dependencies for place hub guessing
 * 
 * @param {Object} options - Configuration options
 * @param {string} options.dbPath - Database file path
 * @param {boolean} [options.verbose=false] - Enable verbose logging
 * @param {Function} [options.fetchFn] - Custom fetch function
 * @param {Function} [options.now] - Custom time function (for testing)
 * @returns {Object} Dependency container
 */
function createPlaceHubDependencies(options = {}) {
  const {
    dbPath,
    verbose = false,
    fetchFn = fetchImpl,
    now = () => new Date()
  } = options;

  if (!dbPath) {
    throw new Error('Database path is required');
  }

  const logger = createLogger(verbose);
  
  // Database connections
  const db = ensureDb(dbPath);
  const newsDb = createSQLiteDatabase(dbPath);
  
  // Query adapters
  const queries = createGuessPlaceHubsQueries(db);
  
  // Analyzers (services)
  const analyzers = {
    country: new CountryHubGapAnalyzer({ db, logger }),
    region: new RegionHubGapAnalyzer({ db, logger }),
    city: new CityHubGapAnalyzer({ db, logger }),
    topic: new TopicHubGapAnalyzer({ db, logger })
  };
  
  // Validator
  const validator = new HubValidator(db);
  if (typeof validator.initialize === 'function') {
    try {
      validator.initialize();
    } catch (error) {
      // Ignore validator initialization errors
      if (verbose) {
        logger.warn(`[orchestration] Validator initialization failed: ${error?.message || error}`);
      }
    }
  }
  
  // Stores
  let candidatesStore = null;
  try {
    candidatesStore = createPlaceHubCandidatesStore(db);
  } catch (error) {
    if (verbose) {
      logger.warn(`[orchestration] Candidate store unavailable: ${error?.message || error}`);
    }
  }
  
  const fetchRecorder = createFetchRecorder({
    newsDb,
    legacyDb: db,
    logger,
    source: 'guess-place-hubs'
  });

  return {
    db,
    newsDb,
    logger,
    fetchFn,
    now,
    queries,
    analyzers,
    validator,
    stores: {
      candidates: candidatesStore,
      fetchRecorder
    }
  };
}

/**
 * Validate orchestration dependencies
 * 
 * @param {Object} deps - Dependency container
 * @throws {Error} If required dependencies are missing
 */
function validateDependencies(deps) {
  const required = ['db', 'logger', 'fetchFn', 'queries', 'analyzers', 'validator', 'stores'];
  const missing = required.filter((key) => !(key in deps));
  
  if (missing.length > 0) {
    throw new Error(`Missing required dependencies: ${missing.join(', ')}`);
  }
  
  if (!deps.analyzers.country || !deps.analyzers.region || !deps.analyzers.city || !deps.analyzers.topic) {
    throw new Error('Analyzers must include country, region, city, and topic');
  }
  
  if (!deps.stores.fetchRecorder) {
    throw new Error('Fetch recorder is required');
  }
}

module.exports = {
  createPlaceHubDependencies,
  validateDependencies,
  createLogger
};
