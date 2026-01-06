'use strict';

/**
 * Place Disambiguation Explain API Routes
 * 
 * Provides transparency into disambiguation decisions:
 * - Why was this place chosen over alternatives?
 * - What features contributed to the score?
 * - How did coherence affect the ranking?
 * - What publisher priors were applied?
 * 
 * @module api/routes/places
 */

const express = require('express');
const Database = require('better-sqlite3');
const { PublisherPrior } = require('../../analysis/publisher-prior');
const { PlaceCoherence, haversineDistance, distanceToCoherence } = require('../../analysis/place-coherence');
const { createMultiLanguagePlaceQueries } = require('../../db/sqlite/v1/queries/multiLanguagePlaces');

/**
 * Create places API router
 * @param {Object} options - Router options
 * @param {string} options.dbPath - Database path
 * @param {boolean} [options.verbose=false] - Enable verbose logging
 * @returns {express.Router} Express router
 */
function createPlacesRouter(options = {}) {
  const router = express.Router();
  const { dbPath, verbose = false } = options;
  
  if (!dbPath) {
    throw new Error('Database path is required for places router');
  }
  
  // Lazy-initialize database and components
  let db = null;
  let publisherPrior = null;
  let placeCoherence = null;
  let multiLangQueries = null;
  
  function getDb() {
    if (!db) {
      db = new Database(dbPath);
      publisherPrior = new PublisherPrior(db);
      placeCoherence = new PlaceCoherence(db);
      multiLangQueries = createMultiLanguagePlaceQueries(db);
    }
    return { db, publisherPrior, placeCoherence, multiLangQueries };
  }
  
  /**
   * POST /api/places/explain
   * Explain a disambiguation decision
   * 
   * Body:
   * {
   *   mention: "London",
   *   context: "The protests in London drew thousands of people",
   *   host: "bbc.com",
   *   candidates: [
   *     { place_id: 123, name: "London", country_code: "GB" },
   *     { place_id: 456, name: "London", country_code: "CA" }
   *   ],
   *   otherMentions: [
   *     { name: "Manchester", place_id: 789, latitude: 53.48, longitude: -2.24 }
   *   ]
   * }
   */
  router.post('/explain', async (req, res, next) => {
    try {
      const { db: dbConn, publisherPrior, placeCoherence, multiLangQueries } = getDb();
      
      const { mention, context, host, candidates = [], otherMentions = [] } = req.body;
      
      if (!mention) {
        return res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'mention is required',
          timestamp: new Date().toISOString()
        });
      }
      
      // Score each candidate
      const scoredCandidates = candidates.map(candidate => {
        const scores = {};
        
        // 1. Population score
        const population = Number(candidate.population || 0);
        scores.population = population > 0 
          ? Math.log10(population) / 7 
          : 0;
        
        // 2. Feature class boost
        const featureBoosts = {
          'PPLC': 0.3,  // Capital
          'PPLA': 0.2,  // Admin capital
          'PPLA2': 0.1,
          'PPL': 0.0,
          'PCLI': 0.4   // Independent entity
        };
        scores.featureClass = featureBoosts[candidate.feature_code] || 0;
        
        // 3. Publisher prior
        if (host) {
          const priorResult = publisherPrior.explain(host, candidate.country_code, {
            placeId: candidate.place_id
          });
          scores.publisherPrior = priorResult.prior;
          scores.publisherPriorExplanation = priorResult.explanation;
        } else {
          scores.publisherPrior = 0.1; // default
          scores.publisherPriorExplanation = { reason: 'No host provided' };
        }
        
        // 4. Context match
        scores.contextMatch = 0;
        if (context) {
          const contextLower = context.toLowerCase();
          if (candidate.country_name && contextLower.includes(candidate.country_name.toLowerCase())) {
            scores.contextMatch += 0.5;
          }
          if (candidate.admin1_name && contextLower.includes(candidate.admin1_name.toLowerCase())) {
            scores.contextMatch += 0.3;
          }
        }
        scores.contextMatch = Math.min(scores.contextMatch, 1.0);
        
        // 5. Coherence (if other mentions provided)
        scores.coherence = 0;
        scores.coherenceDetails = [];
        if (otherMentions.length > 0 && candidate.latitude && candidate.longitude) {
          let totalCoherence = 0;
          for (const other of otherMentions) {
            if (other.latitude && other.longitude) {
              const dist = haversineDistance(
                candidate.latitude, candidate.longitude,
                other.latitude, other.longitude
              );
              const coherenceScore = distanceToCoherence(dist);
              totalCoherence += coherenceScore;
              scores.coherenceDetails.push({
                otherPlace: other.name,
                distanceKm: Math.round(dist),
                coherenceContribution: coherenceScore
              });
            }
          }
          scores.coherence = otherMentions.length > 0 
            ? totalCoherence / otherMentions.length 
            : 0;
        }
        
        // Compute total weighted score
        const weights = {
          population: 0.30,
          featureClass: 0.15,
          publisherPrior: 0.20,
          contextMatch: 0.20,
          coherence: 0.15
        };
        
        const totalScore = 
          scores.population * weights.population +
          scores.featureClass * weights.featureClass +
          scores.publisherPrior * weights.publisherPrior +
          scores.contextMatch * weights.contextMatch +
          scores.coherence * weights.coherence;
        
        return {
          place_id: candidate.place_id,
          name: candidate.name,
          country_code: candidate.country_code,
          scores,
          weights,
          totalScore,
          normalizedScore: null // computed after ranking
        };
      });
      
      // Sort by total score
      scoredCandidates.sort((a, b) => b.totalScore - a.totalScore);
      
      // Compute normalized scores and confidence
      const topScore = scoredCandidates[0]?.totalScore || 0;
      const secondScore = scoredCandidates[1]?.totalScore || 0;
      const confidence = topScore > 0 && (topScore + secondScore) > 0
        ? topScore / (topScore + secondScore)
        : 0;
      
      for (let i = 0; i < scoredCandidates.length; i++) {
        scoredCandidates[i].rank = i + 1;
        scoredCandidates[i].normalizedScore = topScore > 0 
          ? scoredCandidates[i].totalScore / topScore 
          : 0;
      }
      
      const response = {
        mention,
        host: host || null,
        selected: scoredCandidates[0] || null,
        confidence,
        candidateCount: scoredCandidates.length,
        ranking: scoredCandidates,
        reasoning: generateReasoning(scoredCandidates, confidence),
        timestamp: new Date().toISOString()
      };
      
      res.status(200).json(response);
      
    } catch (error) {
      next(error);
    }
  });
  
  /**
   * GET /api/places/:placeId/names
   * Get all names for a place in all languages
   */
  router.get('/:placeId/names', async (req, res, next) => {
    try {
      const { multiLangQueries } = getDb();
      const placeId = parseInt(req.params.placeId, 10);
      
      if (!Number.isFinite(placeId)) {
        return res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'placeId must be a number',
          timestamp: new Date().toISOString()
        });
      }
      
      const lang = req.query.lang || null;
      const names = multiLangQueries.getPlaceNames(placeId, { lang });
      const availableLangs = multiLangQueries.getAvailableLanguages(placeId);
      const preferred = multiLangQueries.getPreferredName(placeId, lang || 'en');
      
      res.status(200).json({
        placeId,
        preferredName: preferred,
        availableLanguages: availableLangs,
        names,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      next(error);
    }
  });
  
  /**
   * GET /api/places/search
   * Search places by name with multi-language support
   * 
   * Query params:
   * - q: Search query
   * - lang: Language filter (optional)
   * - limit: Max results (default 20)
   */
  router.get('/search', async (req, res, next) => {
    try {
      const { multiLangQueries } = getDb();
      const { q, lang, limit = '20' } = req.query;
      
      if (!q) {
        return res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'q (query) parameter is required',
          timestamp: new Date().toISOString()
        });
      }
      
      const candidates = multiLangQueries.findByName(q, { 
        lang, 
        autoDetect: true 
      });
      
      // Detect language if not provided
      const detected = multiLangQueries.detectScript(q);
      
      res.status(200).json({
        query: q,
        detectedScript: detected.script,
        detectedLang: detected.lang,
        requestedLang: lang || null,
        results: candidates.slice(0, parseInt(limit, 10)),
        totalMatches: candidates.length,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      next(error);
    }
  });
  
  /**
   * GET /api/places/publisher-coverage/:host
   * Get publisher coverage data for disambiguation priors
   */
  router.get('/publisher-coverage/:host', async (req, res, next) => {
    try {
      const { publisherPrior } = getDb();
      const { host } = req.params;
      const countryCode = req.query.country;
      
      if (countryCode) {
        // Get detailed explanation for specific country
        const explanation = publisherPrior.explain(host, countryCode);
        res.status(200).json(explanation);
      } else {
        // Get overall coverage stats
        const coverage = publisherPrior._getCoverage(host);
        res.status(200).json({
          host: coverage.host,
          hasData: coverage.hasAnyData,
          totalPlaces: coverage.totalPlaces,
          countryCoverage: Object.fromEntries(coverage.countryCoverage),
          kindCoverage: Object.fromEntries(coverage.kindCoverage),
          timestamp: new Date().toISOString()
        });
      }
      
    } catch (error) {
      next(error);
    }
  });
  
  /**
   * POST /api/places/coherence
   * Calculate coherence scores for a set of candidates
   * 
   * Body:
   * {
   *   mentions: [
   *     { 
   *       mention_id: 1,
   *       candidates: [
   *         { place_id: 123, latitude: 51.5, longitude: -0.12 }
   *       ]
   *     }
   *   ]
   * }
   */
  router.post('/coherence', async (req, res, next) => {
    try {
      const { mentions = [] } = req.body;
      
      if (!Array.isArray(mentions) || mentions.length < 2) {
        return res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'At least 2 mentions required for coherence calculation',
          timestamp: new Date().toISOString()
        });
      }
      
      // Build pairwise distance matrix
      const allCandidates = [];
      for (const m of mentions) {
        for (const c of (m.candidates || [])) {
          if (c.latitude && c.longitude) {
            allCandidates.push({
              mention_id: m.mention_id,
              place_id: c.place_id,
              name: c.name,
              lat: c.latitude,
              lon: c.longitude
            });
          }
        }
      }
      
      // Calculate pairwise distances
      const distances = [];
      for (let i = 0; i < allCandidates.length; i++) {
        for (let j = i + 1; j < allCandidates.length; j++) {
          const a = allCandidates[i];
          const b = allCandidates[j];
          // Skip same mention comparisons
          if (a.mention_id === b.mention_id) continue;
          
          const dist = haversineDistance(a.lat, a.lon, b.lat, b.lon);
          distances.push({
            from: { mention_id: a.mention_id, place_id: a.place_id, name: a.name },
            to: { mention_id: b.mention_id, place_id: b.place_id, name: b.name },
            distanceKm: Math.round(dist),
            coherenceScore: distanceToCoherence(dist)
          });
        }
      }
      
      // Sort by coherence (highest first)
      distances.sort((a, b) => b.coherenceScore - a.coherenceScore);
      
      res.status(200).json({
        mentionCount: mentions.length,
        candidateCount: allCandidates.length,
        pairwiseDistances: distances,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      next(error);
    }
  });
  
  return router;
}

/**
 * Generate human-readable reasoning for disambiguation
 * @param {Array} candidates - Scored candidates
 * @param {number} confidence - Confidence score
 * @returns {string} Reasoning text
 */
function generateReasoning(candidates, confidence) {
  if (candidates.length === 0) {
    return 'No candidates found for this mention.';
  }
  
  const top = candidates[0];
  const reasons = [];
  
  // Population
  if (top.scores.population > 0.5) {
    reasons.push(`${top.name} has a large population (score: ${top.scores.population.toFixed(2)})`);
  }
  
  // Publisher prior
  if (top.scores.publisherPrior > 0.3) {
    reasons.push(`Publisher has coverage of ${top.country_code} (prior: ${top.scores.publisherPrior.toFixed(2)})`);
  }
  
  // Context match
  if (top.scores.contextMatch > 0.3) {
    reasons.push(`Context mentions related geographic terms (score: ${top.scores.contextMatch.toFixed(2)})`);
  }
  
  // Coherence
  if (top.scores.coherence > 0.5) {
    reasons.push(`Geographic coherence with other mentioned places (score: ${top.scores.coherence.toFixed(2)})`);
  }
  
  // Feature class
  if (top.scores.featureClass > 0.1) {
    reasons.push(`Place is a capital or major administrative center (boost: ${top.scores.featureClass.toFixed(2)})`);
  }
  
  // Confidence
  const confDesc = confidence > 0.8 ? 'high' : confidence > 0.6 ? 'moderate' : 'low';
  
  if (reasons.length === 0) {
    return `Selected ${top.name}, ${top.country_code} with ${confDesc} confidence based on default scoring.`;
  }
  
  return `Selected ${top.name}, ${top.country_code} with ${confDesc} confidence (${(confidence * 100).toFixed(0)}%). ` +
         `Key factors: ${reasons.join('; ')}.`;
}

module.exports = {
  createPlacesRouter
};
