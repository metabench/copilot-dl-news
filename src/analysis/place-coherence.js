'use strict';

/**
 * PlaceCoherence - Multi-mention coherence pass for place disambiguation
 * 
 * When an article mentions multiple places, they should be geographically coherent.
 * This module re-scores candidates based on spatial clustering with other resolved places.
 * 
 * @example
 * const { PlaceCoherence } = require('./place-coherence');
 * const coherence = new PlaceCoherence(db);
 * 
 * // Single article coherence
 * const adjustedResults = coherence.applyCoherence(mentionResults);
 * 
 * // Batch processing
 * const batchResults = await coherence.processBatch(articleIds);
 * 
 * @module analysis/place-coherence
 */

/**
 * Earth radius in kilometers for distance calculations
 */
const EARTH_RADIUS_KM = 6371;

/**
 * Default coherence weight in final scoring
 */
const DEFAULT_COHERENCE_WEIGHT = 0.15;

/**
 * Distance thresholds for coherence scoring (km)
 */
const DISTANCE_THRESHOLDS = {
  SAME_CITY: 50,      // Very high coherence
  SAME_REGION: 200,   // High coherence
  SAME_COUNTRY: 1000, // Medium coherence
  NEARBY: 3000        // Low coherence
};

/**
 * Calculate haversine distance between two points
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in kilometers
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => deg * Math.PI / 180;
  
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) ** 2;
            
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return EARTH_RADIUS_KM * c;
}

/**
 * Convert distance to coherence score (0-1)
 * Closer places = higher coherence
 * @param {number} distanceKm - Distance in kilometers
 * @returns {number} Coherence score 0-1
 */
function distanceToCoherence(distanceKm) {
  if (distanceKm <= DISTANCE_THRESHOLDS.SAME_CITY) {
    return 1.0;
  } else if (distanceKm <= DISTANCE_THRESHOLDS.SAME_REGION) {
    return 0.8;
  } else if (distanceKm <= DISTANCE_THRESHOLDS.SAME_COUNTRY) {
    return 0.5;
  } else if (distanceKm <= DISTANCE_THRESHOLDS.NEARBY) {
    return 0.2;
  }
  return 0.0;
}

/**
 * Place coherence analyzer
 */
class PlaceCoherence {
  /**
   * @param {Object} db - Database connection (better-sqlite3)
   * @param {Object} [options] - Configuration options
   * @param {number} [options.coherenceWeight=0.15] - Weight of coherence in final score
   * @param {number} [options.minMentions=2] - Minimum mentions to apply coherence
   */
  constructor(db, options = {}) {
    this.db = db;
    this.coherenceWeight = options.coherenceWeight || DEFAULT_COHERENCE_WEIGHT;
    this.minMentions = options.minMentions || 2;
    
    // Cache for place coordinates
    this._coordCache = new Map();
  }
  
  /**
   * Apply coherence pass to a set of mention results
   * 
   * @param {Object[]} mentionResults - Array of mention disambiguation results
   * @param {number} mentionResults[].mention_id - Mention identifier
   * @param {Object[]} mentionResults[].candidates - Candidate places with scores
   * @returns {Object[]} Results with coherence-adjusted scores
   */
  applyCoherence(mentionResults) {
    if (!mentionResults || mentionResults.length < this.minMentions) {
      return mentionResults; // Not enough mentions for coherence
    }
    
    // First pass: Get top candidates for each mention
    const topCandidates = mentionResults.map(mr => {
      const sorted = [...mr.candidates].sort((a, b) => b.score - a.score);
      return {
        mention_id: mr.mention_id,
        topCandidate: sorted[0] || null,
        allCandidates: mr.candidates
      };
    }).filter(tc => tc.topCandidate);
    
    if (topCandidates.length < this.minMentions) {
      return mentionResults;
    }
    
    // Build spatial graph of top candidates
    const graph = this._buildCoherenceGraph(topCandidates);
    
    // Second pass: Adjust scores based on coherence
    const adjusted = mentionResults.map(mr => {
      const adjustedCandidates = mr.candidates.map(candidate => {
        const coherenceScore = this._computeCoherenceScore(candidate, graph, mr.mention_id);
        const adjustedScore = candidate.score + (coherenceScore * this.coherenceWeight);
        
        return {
          ...candidate,
          originalScore: candidate.score,
          coherenceScore,
          score: adjustedScore
        };
      });
      
      // Re-sort by adjusted score
      adjustedCandidates.sort((a, b) => b.score - a.score);
      
      // Recompute confidence
      const top = adjustedCandidates[0];
      const second = adjustedCandidates[1];
      const confidence = top && second 
        ? top.score / (top.score + second.score)
        : (top ? 1.0 : 0.0);
      
      return {
        ...mr,
        candidates: adjustedCandidates,
        coherenceApplied: true,
        confidence
      };
    });
    
    return adjusted;
  }
  
  /**
   * Process a batch of articles for coherence
   * 
   * @param {number[]} articleIds - Article IDs to process
   * @param {Object} [options] - Processing options
   * @returns {Promise<Object>} Batch processing results
   */
  async processBatch(articleIds, options = {}) {
    const results = {
      processed: 0,
      adjusted: 0,
      errors: 0,
      articles: []
    };
    
    for (const articleId of articleIds) {
      try {
        const mentions = this._getMentionsForArticle(articleId);
        
        if (mentions.length >= this.minMentions) {
          const adjusted = this.applyCoherence(mentions);
          this._saveAdjustedResults(adjusted);
          results.adjusted++;
        }
        
        results.processed++;
        results.articles.push({ articleId, success: true });
        
      } catch (error) {
        results.errors++;
        results.articles.push({ articleId, success: false, error: error.message });
      }
    }
    
    return results;
  }
  
  /**
   * Explain the coherence calculation for a specific result
   * 
   * @param {Object} mentionResult - Single mention result
   * @param {Object[]} otherResults - Other mention results in same article
   * @returns {Object} Explanation object
   */
  explain(mentionResult, otherResults) {
    const explanation = {
      mention_id: mentionResult.mention_id,
      coherenceApplied: false,
      reasoning: [],
      distances: []
    };
    
    if (otherResults.length < this.minMentions - 1) {
      explanation.reasoning.push('Not enough other mentions for coherence');
      return explanation;
    }
    
    const topCandidate = mentionResult.candidates[0];
    if (!topCandidate) {
      explanation.reasoning.push('No candidates to evaluate');
      return explanation;
    }
    
    // Get coordinates
    const coords = this._getCoordinates(topCandidate.place_id);
    if (!coords) {
      explanation.reasoning.push('Missing coordinates for top candidate');
      return explanation;
    }
    
    // Calculate distances to other top candidates
    for (const other of otherResults) {
      const otherTop = other.candidates[0];
      if (!otherTop || otherTop.place_id === topCandidate.place_id) continue;
      
      const otherCoords = this._getCoordinates(otherTop.place_id);
      if (!otherCoords) continue;
      
      const distance = haversineDistance(
        coords.latitude, coords.longitude,
        otherCoords.latitude, otherCoords.longitude
      );
      
      const coherence = distanceToCoherence(distance);
      
      explanation.distances.push({
        otherPlace: otherTop.name,
        otherPlaceId: otherTop.place_id,
        distanceKm: Math.round(distance),
        coherenceContribution: coherence
      });
    }
    
    if (explanation.distances.length > 0) {
      explanation.coherenceApplied = true;
      const avgCoherence = explanation.distances.reduce((sum, d) => sum + d.coherenceContribution, 0) 
                         / explanation.distances.length;
      explanation.averageCoherence = avgCoherence;
      explanation.reasoning.push(`Average coherence with ${explanation.distances.length} other places: ${avgCoherence.toFixed(2)}`);
    }
    
    return explanation;
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Private Methods
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Build coherence graph from top candidates
   */
  _buildCoherenceGraph(topCandidates) {
    const nodes = [];
    
    for (const tc of topCandidates) {
      const coords = this._getCoordinates(tc.topCandidate.place_id);
      if (coords) {
        nodes.push({
          mention_id: tc.mention_id,
          place_id: tc.topCandidate.place_id,
          latitude: coords.latitude,
          longitude: coords.longitude,
          score: tc.topCandidate.score
        });
      }
    }
    
    // Pre-compute pairwise distances
    const edges = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const distance = haversineDistance(
          nodes[i].latitude, nodes[i].longitude,
          nodes[j].latitude, nodes[j].longitude
        );
        edges.push({
          from: nodes[i].mention_id,
          to: nodes[j].mention_id,
          distance,
          coherence: distanceToCoherence(distance)
        });
      }
    }
    
    return { nodes, edges };
  }
  
  /**
   * Compute coherence score for a candidate
   */
  _computeCoherenceScore(candidate, graph, mentionId) {
    const coords = this._getCoordinates(candidate.place_id);
    if (!coords) return 0;
    
    // Find edges involving this mention
    const relevantEdges = graph.edges.filter(e => 
      e.from === mentionId || e.to === mentionId
    );
    
    if (relevantEdges.length === 0) return 0;
    
    // For each other node, compute coherence if this candidate were selected
    let totalCoherence = 0;
    let count = 0;
    
    for (const node of graph.nodes) {
      if (node.mention_id === mentionId) continue;
      
      const distance = haversineDistance(
        coords.latitude, coords.longitude,
        node.latitude, node.longitude
      );
      
      totalCoherence += distanceToCoherence(distance);
      count++;
    }
    
    return count > 0 ? totalCoherence / count : 0;
  }
  
  /**
   * Get coordinates for a place (with caching)
   */
  _getCoordinates(placeId) {
    if (this._coordCache.has(placeId)) {
      return this._coordCache.get(placeId);
    }
    
    try {
      const row = this.db.prepare(`
        SELECT latitude, longitude 
        FROM gazetteer 
        WHERE place_id = ?
      `).get(placeId);
      
      if (row && row.latitude && row.longitude) {
        const coords = { latitude: row.latitude, longitude: row.longitude };
        this._coordCache.set(placeId, coords);
        return coords;
      }
    } catch (error) {
      console.error('Error fetching coordinates:', error.message);
    }
    
    this._coordCache.set(placeId, null);
    return null;
  }
  
  /**
   * Get mention results for an article
   */
  _getMentionsForArticle(articleId) {
    // This would query the database for mention results
    // Implementation depends on how mentions are stored
    const rows = this.db.prepare(`
      SELECT pm.mention_id, pm.mention_text, pm.context_snippet,
             rp.place_id, rp.confidence, rp.disambiguation_method,
             g.name, g.country_code, g.population
      FROM place_mentions pm
      LEFT JOIN resolved_places rp ON pm.mention_id = rp.mention_id
      LEFT JOIN gazetteer g ON rp.place_id = g.place_id
      WHERE pm.article_id = ?
      ORDER BY pm.mention_id
    `).all(articleId);
    
    // Group by mention
    const mentionMap = new Map();
    for (const row of rows) {
      if (!mentionMap.has(row.mention_id)) {
        mentionMap.set(row.mention_id, {
          mention_id: row.mention_id,
          mention_text: row.mention_text,
          context_snippet: row.context_snippet,
          candidates: []
        });
      }
      
      if (row.place_id) {
        mentionMap.get(row.mention_id).candidates.push({
          place_id: row.place_id,
          name: row.name,
          country_code: row.country_code,
          population: row.population,
          score: row.confidence || 0,
          method: row.disambiguation_method
        });
      }
    }
    
    return Array.from(mentionMap.values());
  }
  
  /**
   * Save adjusted results back to database
   */
  _saveAdjustedResults(adjustedResults) {
    const updateStmt = this.db.prepare(`
      UPDATE resolved_places 
      SET confidence = ?, 
          disambiguation_method = COALESCE(disambiguation_method, '') || '+coherence'
      WHERE mention_id = ? AND place_id = ?
    `);
    
    const transaction = this.db.transaction((results) => {
      for (const result of results) {
        const top = result.candidates[0];
        if (top && result.coherenceApplied) {
          updateStmt.run(result.confidence, result.mention_id, top.place_id);
        }
      }
    });
    
    transaction(adjustedResults);
  }
}

module.exports = {
  PlaceCoherence,
  haversineDistance,
  distanceToCoherence,
  DISTANCE_THRESHOLDS,
  DEFAULT_COHERENCE_WEIGHT
};
