/**
 * Context Analysis Matcher
 *
 * Rule Level 2: String matching with context and frequency analysis
 * Better precision through context awareness
 */

class ContextAnalysisMatcher {
  constructor(db) {
    this.db = db;
    this.basicMatcher = new (require('./BasicStringMatcher'))(db);
  }

  async match(content) {
    // Start with basic string matches
    const basicMatches = await this.basicMatcher.match(content);

    // Enhance with context analysis
    const enhancedMatches = [];

    for (const match of basicMatches) {
      const enhanced = await this.analyzeContext(match, content);
      if (enhanced.confidence > 0.4) { // Higher threshold for context analysis
        enhancedMatches.push(enhanced);
      }
    }

    return enhancedMatches.sort((a, b) => b.confidence - a.confidence);
  }

  async analyzeContext(match, content) {
    const text = content.text.toLowerCase();
    const title = content.title.toLowerCase();
    const matchedName = match.details.matchedName;

    let confidence = match.confidence;
    let evidence = match.evidence;
    const contextFactors = [];

    // Factor 1: Position in text (earlier = more important)
    const position = text.indexOf(matchedName);
    if (position >= 0) {
      const relativePosition = position / text.length;
      if (relativePosition < 0.1) { // In first 10% of text
        confidence += 0.1;
        contextFactors.push('early_mention');
      } else if (relativePosition > 0.8) { // In last 20% of text
        confidence -= 0.05;
        contextFactors.push('late_mention');
      }
    }

    // Factor 2: Frequency (multiple mentions = stronger signal)
    const frequency = (text.match(new RegExp(matchedName, 'g')) || []).length;
    if (frequency > 1) {
      confidence += Math.min(0.15, (frequency - 1) * 0.05);
      contextFactors.push(`frequency_${frequency}`);
    }

    // Factor 3: Title mention (very strong signal)
    if (title.includes(matchedName)) {
      confidence += 0.2;
      contextFactors.push('title_mention');
    }

    // Factor 4: Contextual keywords
    const contextWindow = 100; // Characters before/after match
    const matchIndex = text.indexOf(matchedName);
    if (matchIndex >= 0) {
      const start = Math.max(0, matchIndex - contextWindow);
      const end = Math.min(text.length, matchIndex + matchedName.length + contextWindow);
      const context = text.substring(start, end);

      // Look for geopolitical context
      const geoKeywords = [
        'country', 'city', 'region', 'province', 'state', 'capital',
        'government', 'president', 'minister', 'election', 'politics',
        'war', 'conflict', 'peace', 'treaty', 'summit', 'meeting'
      ];

      const hasGeoContext = geoKeywords.some(keyword => context.includes(keyword));
      if (hasGeoContext) {
        confidence += 0.1;
        contextFactors.push('geopolitical_context');
      }

      // Look for travel/tourism context
      const travelKeywords = [
        'visit', 'travel', 'tourist', 'vacation', 'trip', 'journey',
        'flight', 'airport', 'hotel', 'restaurant', 'sightseeing'
      ];

      const hasTravelContext = travelKeywords.some(keyword => context.includes(keyword));
      if (hasTravelContext) {
        confidence += 0.05;
        contextFactors.push('travel_context');
      }

      // Check for negating words (false positives)
      const negatingWords = [
        'not in', 'outside', 'away from', 'born in', 'from', 'former',
        'ex-', 'movie', 'book', 'song', 'band', 'company'
      ];

      const hasNegatingContext = negatingWords.some(word => context.includes(word));
      if (hasNegatingContext) {
        confidence -= 0.15;
        contextFactors.push('negating_context');
      }
    }

    // Factor 5: Place type appropriateness
    const placeInfo = this.getPlaceInfo(match.placeId);
    if (placeInfo) {
      // Cities are more likely in local news
      if (placeInfo.kind === 'city' && this.isLocalNewsContext(content)) {
        confidence += 0.05;
        contextFactors.push('city_local_context');
      }

      // Countries are more likely in international news
      if (placeInfo.kind === 'country' && this.isInternationalNewsContext(content)) {
        confidence += 0.05;
        contextFactors.push('country_international_context');
      }
    }

    // Factor 6: Language match
    if (content.language && placeInfo && placeInfo.language) {
      if (content.language.startsWith(placeInfo.language.split('-')[0])) {
        confidence += 0.05;
        contextFactors.push('language_match');
      }
    }

    // Update evidence
    evidence += ` | Context factors: ${contextFactors.join(', ')}`;

    return {
      ...match,
      confidence: Math.max(0.0, Math.min(1.0, confidence)),
      method: 'context_analysis',
      details: {
        ...match.details,
        contextFactors,
        frequency,
        inTitle: title.includes(matchedName),
        relativePosition: position >= 0 ? position / text.length : null
      },
      evidence
    };
  }

  getPlaceInfo(placeId) {
    return this.db.prepare(`
      SELECT p.kind, p.country_code, p.population,
             pn.lang as language
      FROM places p
      LEFT JOIN place_names pn ON p.canonical_name_id = pn.id
      WHERE p.id = ?
    `).get(placeId);
  }

  isLocalNewsContext(content) {
    const localKeywords = ['local', 'community', 'neighborhood', 'residents', 'city council'];
    const text = (content.title + ' ' + content.text).toLowerCase();
    return localKeywords.some(keyword => text.includes(keyword));
  }

  isInternationalNewsContext(content) {
    const internationalKeywords = ['international', 'global', 'world', 'foreign', 'diplomatic'];
    const text = (content.title + ' ' + content.text).toLowerCase();
    return internationalKeywords.some(keyword => text.includes(keyword));
  }
}

module.exports = ContextAnalysisMatcher;