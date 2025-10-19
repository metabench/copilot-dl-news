/**
 * Basic String Matcher
 *
 * Rule Level 1: Simple exact and fuzzy string matching
 * Fast, high-recall, moderate precision
 */

class BasicStringMatcher {
  constructor(db) {
    this.db = db;
    this.placeNames = null;
    this.loadPlaceNames();
  }

  loadPlaceNames() {
    // Load place names for matching (materialized for performance)
    this.placeNames = this.db.prepare(`
      SELECT
        p.id as place_id,
        p.kind,
        p.population,
        COALESCE(pn.name, '') as name,
        LOWER(COALESCE(pn.normalized, pn.name, '')) as normalized,
        LENGTH(COALESCE(pn.name, '')) as name_length,
        COALESCE(pn.is_preferred, 0) as is_preferred,
        COALESCE(pn.is_official, 0) as is_official
      FROM places p
      LEFT JOIN place_names pn ON p.id = pn.place_id
      WHERE pn.name IS NOT NULL AND LENGTH(pn.name) > 2
      ORDER BY p.population DESC, name_length DESC
    `).all();

    // Group by normalized name for faster lookup
    this.nameToPlaces = new Map();
    for (const row of this.placeNames) {
      const key = row.normalized;
      if (!this.nameToPlaces.has(key)) {
        this.nameToPlaces.set(key, []);
      }
      this.nameToPlaces.get(key).push(row);
    }
  }

  async match(content) {
    const matches = [];
    const text = (content.title + ' ' + content.text).toLowerCase();

    // Track matches to avoid duplicates
    const matchedPlaces = new Set();

    // Exact matches first (highest confidence)
    for (const [normalizedName, places] of this.nameToPlaces) {
      if (text.includes(normalizedName)) {
        for (const place of places) {
          if (matchedPlaces.has(place.place_id)) continue;

          const confidence = this.calculateConfidence(place, normalizedName, text, 'exact');
          if (confidence > 0.3) { // Minimum confidence threshold
            matches.push({
              placeId: place.place_id,
              confidence,
              method: 'exact_string',
              details: {
                matchedName: normalizedName,
                originalName: place.name,
                position: text.indexOf(normalizedName),
                inTitle: content.title.toLowerCase().includes(normalizedName)
              },
              evidence: `Exact match for "${place.name}" in article text`,
              falsePositiveLikelihood: this.estimateFalsePositiveRisk(place, normalizedName)
            });
            matchedPlaces.add(place.place_id);
          }
        }
      }
    }

    // Fuzzy matches for partial matches (lower confidence)
    const words = text.split(/\s+/);
    for (const word of words) {
      if (word.length < 4) continue; // Skip very short words

      for (const [normalizedName, places] of this.nameToPlaces) {
        if (matchedPlaces.has(places[0].place_id)) continue;

        const similarity = this.calculateStringSimilarity(word, normalizedName);
        if (similarity > 0.85) { // High similarity threshold
          for (const place of places) {
            if (matchedPlaces.has(place.place_id)) continue;

            const confidence = this.calculateConfidence(place, normalizedName, text, 'fuzzy') * similarity;
            if (confidence > 0.25) {
              matches.push({
                placeId: place.place_id,
                confidence,
                method: 'fuzzy_match',
                details: {
                  matchedName: normalizedName,
                  originalName: place.name,
                  fuzzyWord: word,
                  similarity
                },
                evidence: `Fuzzy match for "${place.name}" (similarity: ${(similarity * 100).toFixed(1)}%)`,
                falsePositiveLikelihood: this.estimateFalsePositiveRisk(place, normalizedName) * 1.5
              });
              matchedPlaces.add(place.place_id);
            }
          }
        }
      }
    }

    // Sort by confidence
    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  calculateConfidence(place, matchedName, text, matchType) {
    let confidence = 0.5; // Base confidence

    // Boost for exact matches
    if (matchType === 'exact') {
      confidence += 0.3;
    }

    // Boost for preferred/official names
    if (place.is_preferred) confidence += 0.1;
    if (place.is_official) confidence += 0.1;

    // Boost for populous places (more likely to be relevant)
    if (place.population > 1000000) confidence += 0.1;
    else if (place.population > 100000) confidence += 0.05;

    // Boost for longer names (less ambiguous)
    if (matchedName.length > 6) confidence += 0.1;

    // Boost if appears in title
    if (text.includes(matchedName) && text.indexOf(matchedName) < 200) {
      confidence += 0.1;
    }

    // Penalize very common words that might be false positives
    const commonWords = ['will', 'can', ' paris', 'london', 'berlin', 'rome', 'madrid'];
    if (commonWords.some(word => matchedName.includes(word))) {
      confidence -= 0.2;
    }

    return Math.max(0.0, Math.min(1.0, confidence));
  }

  estimateFalsePositiveRisk(place, matchedName) {
    let risk = 0.1; // Base risk

    // Higher risk for short, common names
    if (matchedName.length < 5) risk += 0.3;

    // Higher risk for common English words
    const commonWords = new Set([
      'paris', 'london', 'berlin', 'rome', 'madrid', 'cairo', 'tokyo',
      'china', 'india', 'brazil', 'mexico', 'canada', 'australia'
    ]);
    if (commonWords.has(matchedName.toLowerCase())) {
      risk += 0.4;
    }

    // Lower risk for populous, well-known places
    if (place.population > 500000) risk -= 0.2;

    return Math.max(0.0, Math.min(1.0, risk));
  }

  calculateStringSimilarity(str1, str2) {
    // Simple Levenshtein distance ratio
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }
}

module.exports = BasicStringMatcher;