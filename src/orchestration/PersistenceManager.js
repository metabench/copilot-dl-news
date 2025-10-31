const { slugify } = require('../tools/slugify');
const { extractTitle } = require('./utils/domainUtils');
const { collectHubChanges } = require('./utils/analysisUtils');

/**
 * PersistenceManager - Handles database persistence operations for hubs
 *
 * This module manages the creation, updating, and auditing of place hubs,
 * topic hubs, and combination hubs in the database.
 */
class PersistenceManager {
  constructor() {
    // Persistence configuration and state
  }

  /**
   * Persist a validated place hub
   *
   * @param {Object} params - Persistence parameters
   * @param {string} params.candidateUrl - Hub URL
   * @param {Object} params.place - Place information
   * @param {Object} params.result - Fetch result
   * @param {Object} params.validationResult - Validation result
   * @param {Object} params.candidateSignals - Candidate signals
   * @param {Object} params.normalizedDomain - Normalized domain
   * @param {Object} params.queries - Query adapter
   * @param {Object} params.summary - Processing summary
   */
  persistValidatedHub(params) {
    const {
      candidateUrl,
      place,
      result,
      validationResult,
      candidateSignals,
      normalizedDomain,
      queries,
      summary
    } = params;

    const existingHub = queries.getPlaceHub(normalizedDomain.host, candidateUrl);
    const snapshot = {
      url: candidateUrl,
      domain: normalizedDomain.host,
      placeSlug: slugify(place.name),
      placeKind: place.kind,
      title: extractTitle(result.body),
      navLinksCount: validationResult.navLinkCount || 0,
      articleLinksCount: validationResult.articleLinkCount || 0,
      evidence: JSON.stringify(candidateSignals)
    };

    if (!existingHub) {
      queries.insertPlaceHub(snapshot);
      summary.insertedHubs += 1;
      summary.diffPreview.inserted.push({
        url: candidateUrl,
        placeKind: place.kind,
        placeName: place.name,
        status: 'validated'
      });
    } else {
      const changes = collectHubChanges(existingHub, snapshot);
      if (changes.length > 0) {
        queries.updatePlaceHub(snapshot);
        summary.updatedHubs += 1;
        summary.diffPreview.updated.push({
          url: candidateUrl,
          placeKind: place.kind,
          placeName: place.name,
          changes
        });
      }
    }
  }

  /**
   * Persist a validated topic hub
   *
   * @param {Object} params - Persistence parameters
   * @param {string} params.candidateUrl - Hub URL
   * @param {Object} params.topic - Topic information
   * @param {Object} params.result - Fetch result
   * @param {Object} params.validationResult - Validation result
   * @param {Object} params.candidateSignals - Candidate signals
   * @param {Object} params.normalizedDomain - Normalized domain
   * @param {Object} params.queries - Query adapter
   * @param {Object} params.summary - Processing summary
   */
  persistValidatedTopicHub(params) {
    const {
      candidateUrl,
      topic,
      result,
      validationResult,
      candidateSignals,
      normalizedDomain,
      queries,
      summary
    } = params;

    const existingHub = queries.getTopicHub(normalizedDomain.host, candidateUrl);
    const snapshot = {
      url: candidateUrl,
      domain: normalizedDomain.host,
      topicSlug: topic.slug,
      topicLabel: topic.label,
      title: extractTitle(result.body),
      navLinksCount: validationResult.navLinkCount || 0,
      articleLinksCount: validationResult.articleLinkCount || 0,
      evidence: JSON.stringify(candidateSignals)
    };

    if (!existingHub) {
      queries.insertTopicHub(snapshot);
      summary.insertedHubs += 1;
      summary.diffPreview.inserted.push({
        url: candidateUrl,
        topicSlug: topic.slug,
        topicLabel: topic.label,
        status: 'validated'
      });
    } else {
      const changes = collectHubChanges(existingHub, snapshot);
      if (changes.length > 0) {
        queries.updateTopicHub(snapshot);
        summary.updatedHubs += 1;
        summary.diffPreview.updated.push({
          url: candidateUrl,
          topicSlug: topic.slug,
          topicLabel: topic.label,
          changes
        });
      }
    }
  }

  /**
   * Persist a validated combination hub
   *
   * @param {Object} params - Persistence parameters
   * @param {string} params.candidateUrl - Hub URL
   * @param {Object} params.place - Place information
   * @param {Object} params.topic - Topic information
   * @param {Object} params.result - Fetch result
   * @param {Object} params.detectionResult - Detection result from placeHubDetector
   * @param {Object} params.candidateSignals - Candidate signals
   * @param {Object} params.normalizedDomain - Normalized domain
   * @param {Object} params.queries - Query adapter
   * @param {Object} params.summary - Processing summary
   */
  persistValidatedCombinationHub(params) {
    const {
      candidateUrl,
      place,
      topic,
      result,
      detectionResult,
      candidateSignals,
      normalizedDomain,
      queries,
      summary
    } = params;

    const existingHub = queries.getPlaceHub(normalizedDomain.host, candidateUrl);
    const snapshot = {
      url: candidateUrl,
      domain: normalizedDomain.host,
      placeSlug: detectionResult.placeSlug,
      placeKind: detectionResult.placeKind,
      placeLabel: detectionResult.placeLabel,
      placeSource: detectionResult.placeSource,
      placeId: detectionResult.placeId,
      placeCountry: detectionResult.placeCountry,
      topicSlug: detectionResult.topic.slug,
      topicLabel: detectionResult.topic.label,
      topicKind: detectionResult.topic.kind,
      topicSource: detectionResult.topic.source,
      topicConfidence: detectionResult.topic.confidence,
      title: detectionResult.title || extractTitle(result.body),
      navLinksCount: detectionResult.navLinksCount || 0,
      articleLinksCount: detectionResult.articleLinksCount || 0,
      evidence: JSON.stringify(candidateSignals)
    };

    if (!existingHub) {
      queries.insertPlaceHub(snapshot);
      summary.insertedHubs += 1;
      summary.diffPreview.inserted.push({
        url: candidateUrl,
        placeKind: place.kind,
        placeName: place.name,
        topicSlug: topic.slug,
        topicLabel: topic.label,
        status: 'validated'
      });
    } else {
      const changes = collectHubChanges(existingHub, snapshot);
      if (changes.length > 0) {
        queries.updatePlaceHub(snapshot);
        summary.updatedHubs += 1;
        summary.diffPreview.updated.push({
          url: candidateUrl,
          placeKind: place.kind,
          placeName: place.name,
          topicSlug: topic.slug,
          topicLabel: topic.label,
          changes
        });
      }
    }
  }

  /**
   * Record audit entry for validation decision
   *
   * @param {Object} params - Audit parameters
   * @param {string} params.domain - Domain being processed
   * @param {string} params.url - URL that was validated
   * @param {string} params.placeKind - Kind of place/topic
   * @param {string} params.placeName - Name of place/topic
   * @param {string} params.decision - Accept/reject decision
   * @param {string} params.validationMetricsJson - JSON validation metrics
   * @param {string} params.attemptId - Attempt identifier
   * @param {string} params.runId - Run identifier
   * @param {Object} params.queries - Query adapter
   * @param {Object} params.logger - Logger instance
   * @param {boolean} params.verbose - Whether to log warnings
   */
  recordAuditEntry(params) {
    const {
      domain,
      url,
      placeKind,
      placeName,
      decision,
      validationMetricsJson,
      attemptId,
      runId,
      queries,
      logger,
      verbose
    } = params;

    try {
      queries.recordAuditEntry({
        domain,
        url,
        placeKind,
        placeName,
        decision,
        validationMetricsJson,
        attemptId,
        runId
      });
    } catch (auditError) {
      if (verbose) {
        const message = auditError?.message || String(auditError);
        logger?.warn?.(`[orchestration] Failed to record audit entry for ${url}: ${message}`);
      }
    }
  }

  /**
   * Record final domain determination
   *
   * @param {Object} params - Determination parameters
   * @param {string} params.domain - Domain being processed
   * @param {boolean} params.rateLimitTriggered - Whether rate limiting occurred
   * @param {Object} params.summary - Processing summary
   * @param {Object} params.queries - Query adapter
   */
  recordFinalDetermination(params) {
    const {
      domain,
      rateLimitTriggered,
      summary,
      queries
    } = params;

    const determination = rateLimitTriggered ? 'rate-limited' : 'processed';
    const reason = rateLimitTriggered
      ? 'Processing aborted due to rate limiting'
      : `Processed ${summary.totalPlaces} places${summary.totalTopics ? `, ${summary.totalTopics} topics` : ''}${summary.totalCombinations ? `, ${summary.totalCombinations} combinations` : ''}, ${summary.insertedHubs} hubs inserted, ${summary.updatedHubs} updated`;

    queries.recordDomainDetermination({
      domain,
      determination,
      reason,
      details: {
        totalPlaces: summary.totalPlaces,
        totalTopics: summary.totalTopics || 0,
        totalCombinations: summary.totalCombinations || 0,
        totalUrls: summary.totalUrls,
        fetched: summary.fetched,
        cached: summary.cached,
        validationSucceeded: summary.validationSucceeded,
        validationFailed: summary.validationFailed,
        insertedHubs: summary.insertedHubs,
        updatedHubs: summary.updatedHubs
      }
    });
  }

  /**
   * Check if hub persistence should be applied
   *
   * @param {Object} options - Processing options
   * @returns {boolean} Whether to apply persistence
   */
  shouldApplyPersistence(options) {
    return Boolean(options.apply);
  }

  /**
   * Create hub snapshot for persistence
   *
   * @param {Object} params - Snapshot parameters
   * @param {string} params.url - Hub URL
   * @param {string} params.domain - Domain
   * @param {Object} params.place - Place information
   * @param {Object} params.topic - Topic information (optional)
   * @param {Object} params.result - Fetch result
   * @param {Object} params.validationResult - Validation result
   * @param {Object} params.candidateSignals - Candidate signals
   * @param {string} params.hubType - Type of hub ('place', 'topic', 'combination')
   * @returns {Object} Hub snapshot
   */
  createHubSnapshot(params) {
    const {
      url,
      domain,
      place,
      topic,
      result,
      validationResult,
      candidateSignals,
      hubType
    } = params;

    const baseSnapshot = {
      url,
      domain,
      title: extractTitle(result.body),
      navLinksCount: validationResult.navLinkCount || 0,
      articleLinksCount: validationResult.articleLinkCount || 0,
      evidence: JSON.stringify(candidateSignals)
    };

    switch (hubType) {
      case 'place':
        return {
          ...baseSnapshot,
          placeSlug: slugify(place.name),
          placeKind: place.kind
        };

      case 'topic':
        return {
          ...baseSnapshot,
          topicSlug: topic.slug,
          topicLabel: topic.label
        };

      case 'combination':
        return {
          ...baseSnapshot,
          placeSlug: place.placeSlug || slugify(place.name),
          placeKind: place.placeKind || place.kind,
          placeLabel: place.placeLabel,
          placeSource: place.placeSource,
          placeId: place.placeId,
          placeCountry: place.placeCountry,
          topicSlug: topic.slug,
          topicLabel: topic.label,
          topicKind: topic.kind,
          topicSource: topic.source,
          topicConfidence: topic.confidence
        };

      default:
        throw new Error(`Unknown hub type: ${hubType}`);
    }
  }
}

module.exports = { PersistenceManager };