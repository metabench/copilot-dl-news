/**
 * Analysis and Summary Utilities
 *
 * Utility functions for DSPL analysis, domain readiness assessment, and summary generation.
 * Extracted from placeHubGuessing.js to improve modularity.
 */

/**
 * Summarize DSPL patterns for requested kinds
 * @param {Object} dsplEntry - DSPL entry data
 * @param {Array} requestedKinds - Requested place kinds
 * @returns {Object} - DSPL pattern summary
 */
function summarizeDsplPatterns(dsplEntry, requestedKinds) {
  if (!dsplEntry) {
    return { available: false, patterns: {} };
  }

  const patterns = {};
  const availableKinds = new Set();

  for (const kind of requestedKinds) {
    const kindPatterns = dsplEntry[kind] || [];
    if (kindPatterns.length > 0) {
      availableKinds.add(kind);
      patterns[kind] = {
        count: kindPatterns.length,
        examples: kindPatterns.slice(0, 3).map(p => p.pattern || p)
      };
    }
  }

  return {
    available: availableKinds.size > 0,
    availableKinds: Array.from(availableKinds),
    patterns
  };
}

/**
 * Assess domain readiness for hub guessing
 * @param {Object} params - Assessment parameters
 * @param {Object} params.domain - Domain information
 * @param {Array} params.kinds - Requested kinds
 * @param {Object} params.metrics - Domain metrics
 * @param {Object} params.dsplEntry - DSPL entry
 * @param {Object} params.latestDetermination - Latest determination
 * @returns {Object} - Readiness assessment
 */
function assessDomainReadiness({ domain, kinds, metrics = {}, dsplEntry = null, latestDetermination = null } = {}) {
  const assessment = {
    domain: domain.host,
    ready: false,
    reasons: [],
    recommendations: [],
    metrics: { ...metrics }
  };

  // Check DSPL availability
  const dsplSummary = summarizeDsplPatterns(dsplEntry, kinds);
  assessment.dspl = dsplSummary;

  if (!dsplSummary.available) {
    assessment.reasons.push('No DSPL patterns available for requested kinds');
    assessment.recommendations.push('Consider running pattern discovery for this domain');
  }

  // Check recent activity
  const now = Date.now();
  const lastFetchAge = metrics.lastFetchMs ? now - metrics.lastFetchMs : null;
  const lastAnalysisAge = metrics.lastAnalysisMs ? now - metrics.lastAnalysisMs : null;

  if (lastFetchAge && lastFetchAge > 7 * 24 * 60 * 60 * 1000) { // 7 days
    assessment.reasons.push(`Last fetch was ${Math.round(lastFetchAge / (24 * 60 * 60 * 1000))} days ago`);
    assessment.recommendations.push('Consider refreshing domain data');
  }

  if (lastAnalysisAge && lastAnalysisAge > 30 * 24 * 60 * 60 * 1000) { // 30 days
    assessment.reasons.push(`Last analysis was ${Math.round(lastAnalysisAge / (24 * 60 * 60 * 1000))} days ago`);
    assessment.recommendations.push('Consider re-analyzing domain');
  }

  // Check latest determination
  if (latestDetermination) {
    const detAge = now - new Date(latestDetermination.created_at).getTime();
    if (detAge < 24 * 60 * 60 * 1000) { // Within last day
      assessment.reasons.push('Recent determination exists - may be redundant');
      assessment.recommendations.push('Review recent determination before proceeding');
    }
  }

  // Overall readiness
  assessment.ready = assessment.reasons.length === 0;

  return assessment;
}

/**
 * Select places from analyzers
 * @param {Object} analyzers - Analyzer instances
 * @param {Array} requestedKinds - Requested place kinds
 * @param {number} limit - Maximum places to select
 * @returns {Object} - Selected places and unsupported kinds
 */
function selectPlaces({ countryAnalyzer, regionAnalyzer, cityAnalyzer }, requestedKinds, limit) {
  const places = [];
  const unsupported = [];
  let remaining = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : null;

  const take = (items, transform) => {
    if (!Array.isArray(items) || items.length === 0) {
      return;
    }

    for (const item of items) {
      if (remaining !== null && remaining <= 0) {
        return;
      }

      places.push(transform(item));
      if (remaining !== null) {
        remaining -= 1;
      }
    }
  };

  for (const kind of requestedKinds) {
    if (remaining !== null && remaining <= 0) {
      break;
    }

    switch (kind) {
      case 'country': {
        const analyzer = countryAnalyzer;
        if (!analyzer || typeof analyzer.getTopCountries !== 'function') {
          unsupported.push(kind);
          break;
        }

        const count = remaining !== null ? Math.max(remaining, 0) : undefined;
        const countries = analyzer.getTopCountries(count);
        take(countries, (country) => ({
          placeId: country.id ?? country.placeId ?? country.place_id ?? null,
          kind: 'country',
          name: country.name,
          code: country.code,
          importance: country.importance || 0
        }));
        break;
      }
      case 'region': {
        const analyzer = regionAnalyzer;
        if (!analyzer || typeof analyzer.getTopRegions !== 'function') {
          unsupported.push(kind);
          break;
        }

        const count = remaining !== null ? Math.max(remaining, 0) : undefined;
        const regions = analyzer.getTopRegions(count);
        take(regions, (region) => ({
          placeId: region.id ?? region.placeId ?? region.place_id ?? null,
          kind: 'region',
          name: region.name,
          code: region.code || null,
          countryCode: region.countryCode || null,
          importance: region.importance || 0
        }));
        break;
      }
      case 'city': {
        const analyzer = cityAnalyzer;
        if (!analyzer || typeof analyzer.getTopCities !== 'function') {
          unsupported.push(kind);
          break;
        }

        const count = remaining !== null ? Math.max(remaining, 0) : undefined;
        const cities = analyzer.getTopCities(count);
        take(cities, (city) => ({
          placeId: city.id ?? city.placeId ?? city.place_id ?? null,
          kind: 'city',
          name: city.name,
          code: city.code || null,
          countryCode: city.countryCode || null,
          regionName: city.regionName || null,
          importance: city.importance || 0
        }));
        break;
      }
      default:
        unsupported.push(kind);
        break;
    }
  }

  return { places, unsupported };
}

/**
 * Select topics from analyzer
 * @param {Object} analyzers - Analyzer instances
 * @param {Array} requestedTopics - Requested topics (empty array means auto-discover)
 * @param {number} limit - Maximum topics to select
 * @returns {Object} - Selected topics and unsupported topics
 */
function selectTopics({ topicAnalyzer }, requestedTopics, limit) {
  const topics = [];
  const unsupported = [];

  if (!topicAnalyzer) {
    return { topics: [], unsupported: requestedTopics };
  }

  if (requestedTopics.length === 0) {
    // Auto-discover: get top topics
    if (typeof topicAnalyzer.getTopTopics === 'function') {
      const topTopics = topicAnalyzer.getTopTopics(limit);
      topics.push(...topTopics);
    }
  } else {
    // Specific topics requested
    for (const topicSlug of requestedTopics) {
      // For now, just create topic objects from slugs
      // In a full implementation, this would look up topic details
      topics.push({
        slug: topicSlug,
        name: topicSlug,
        category: 'general',
        lang: 'en'
      });
    }
  }

  return { topics: topics.slice(0, limit), unsupported };
}

/**
 * Collect hub changes between existing and new snapshots
 * @param {Object} existingHub - Existing hub data
 * @param {Object} nextSnapshot - New snapshot data
 * @returns {Object} - Change summary
 */
function collectHubChanges(existingHub, nextSnapshot) {
  const changes = {
    hasChanges: false,
    added: [],
    removed: [],
    modified: []
  };

  if (!existingHub && !nextSnapshot) {
    return changes;
  }

  if (!existingHub && nextSnapshot) {
    changes.hasChanges = true;
    changes.added = [nextSnapshot];
    return changes;
  }

  if (existingHub && !nextSnapshot) {
    changes.hasChanges = true;
    changes.removed = [existingHub];
    return changes;
  }

  // Compare URLs
  if (existingHub.url !== nextSnapshot.url) {
    changes.hasChanges = true;
    changes.modified.push({
      field: 'url',
      from: existingHub.url,
      to: nextSnapshot.url
    });
  }

  // Compare titles
  if (existingHub.title !== nextSnapshot.title) {
    changes.hasChanges = true;
    changes.modified.push({
      field: 'title',
      from: existingHub.title,
      to: nextSnapshot.title
    });
  }

  return changes;
}

module.exports = {
  summarizeDsplPatterns,
  assessDomainReadiness,
  selectPlaces,
  selectTopics,
  collectHubChanges
};
