/**
 * HubUrlValidator - URL structure validation for different hub types
 *
 * Extracted from HubValidator to handle URL pattern validation
 * for place hubs, topic hubs, and combination hubs.
 */

class HubUrlValidator {
  /**
   * Validate URL structure for place hubs
   * @param {string} url - URL to validate
   * @param {string} placeName - Place name in lowercase
   * @returns {boolean} - True if URL matches place hub pattern
   */
  validatePlaceUrl(url, placeName) {
    const urlLower = url.toLowerCase();
    const placeNameForUrl = placeName.replace(/\s+/g, '-');

    // Common patterns for place hubs:
    // - /world/france
    // - /australia-news
    // - /us-news/texas

    if (urlLower.includes(`/${placeNameForUrl}`) ||
        urlLower.includes(`-${placeNameForUrl}`) ||
        urlLower.includes(`/${placeName.replace(/\s+/g, '')}`)) {
      return true;
    }

    // Special case: country/region sections
    if (urlLower.includes('/world/') ||
        urlLower.includes('/australia-news') ||
        urlLower.includes('/us-news') ||
        urlLower.includes('/uk-news')) {
      return true;
    }

    return false;
  }

  /**
   * Validate URL structure for topic hubs
   * @param {string} url - URL to validate
   * @param {string} topicName - Topic name in lowercase
   * @returns {boolean} - True if URL matches topic hub pattern
   */
  validateTopicUrl(url, topicName) {
    const urlLower = url.toLowerCase();

    // Direct topic match in URL
    if (urlLower.includes(`/${topicName}/`) ||
        urlLower.endsWith(`/${topicName}`)) {
      return true;
    }

    // Special mappings
    const topicMappings = {
      'sport': 'sport',
      'sports': 'sport',
      'opinion': 'commentisfree',
      'commentisfree': 'commentisfree',
      'lifestyle': 'lifeandstyle',
      'lifeandstyle': 'lifeandstyle'
    };

    const mappedTopic = topicMappings[topicName] || topicName;
    if (urlLower.includes(`/${mappedTopic}/`) ||
        urlLower.endsWith(`/${mappedTopic}`)) {
      return true;
    }

    return false;
  }

  /**
   * Validate URL structure for place-topic combination hubs
   * @param {string} url - URL to validate
   * @param {string} placeName - Place name in lowercase
   * @param {string} topicName - Topic name in lowercase
   * @returns {boolean} - True if URL matches combination pattern
   */
  validatePlaceTopicUrl(url, placeName, topicName) {
    const urlLower = url.toLowerCase();
    const placeSlug = placeName.replace(/\s+/g, '-');
    const topicSlug = topicName.replace(/\s+/g, '-');

    // Common patterns for place-topic combination hubs:
    // - /place/topic (e.g., /france/sport)
    // - /news/place/topic (e.g., /news/france/sport)
    // - /place-news/topic (e.g., /france-news/sport)
    // - /topic/place (e.g., /sport/france)

    const patterns = [
      `/${placeSlug}/${topicSlug}`,
      `/news/${placeSlug}/${topicSlug}`,
      `/${placeSlug}-news/${topicSlug}`,
      `/${topicSlug}/${placeSlug}`,
      `/news/${topicSlug}/${placeSlug}`,
      `/${topicSlug}-${placeSlug}`,
      `/${placeSlug}-${topicSlug}`
    ];

    for (const pattern of patterns) {
      if (urlLower.includes(pattern)) {
        return true;
      }
    }

    // Check for compressed forms
    if (urlLower.includes(`/${placeSlug}${topicSlug}`) ||
        urlLower.includes(`/${topicSlug}${placeSlug}`)) {
      return true;
    }

    return false;
  }

  /**
   * Validate URL structure for place-place hierarchical hubs
   * @param {string} url - URL to validate
   * @param {string} parentName - Parent place name in lowercase
   * @param {string} childName - Child place name in lowercase
   * @returns {boolean} - True if URL matches hierarchical pattern
   */
  validatePlacePlaceUrl(url, parentName, childName) {
    const urlLower = url.toLowerCase();
    const parentSlug = parentName.replace(/\s+/g, '-');
    const childSlug = childName.replace(/\s+/g, '-');

    // Common patterns for place-place hierarchical hubs:
    // - /parent/child (e.g., /us/california)
    // - /world/parent/child (e.g., /world/us/california)
    // - /news/parent/child (e.g., /news/us/california)
    // - /places/parent/child (e.g., /places/us/california)
    // - /location/parent/child (e.g., /location/us/california)

    const patterns = [
      `/${parentSlug}/${childSlug}`,
      `/world/${parentSlug}/${childSlug}`,
      `/news/${parentSlug}/${childSlug}`,
      `/places/${parentSlug}/${childSlug}`,
      `/location/${parentSlug}/${childSlug}`,
      `/${parentSlug}/news/${childSlug}`,
      `/${parentSlug}/places/${childSlug}`
    ];

    for (const pattern of patterns) {
      if (urlLower.includes(pattern)) {
        return true;
      }
    }

    // Check for compressed forms (no separators)
    if (urlLower.includes(`/${parentSlug}${childSlug}`) ||
        urlLower.includes(`/${childSlug}${parentSlug}`)) {
      return true;
    }

    // Check for country-specific patterns
    const countryPrefixes = ['us-news', 'uk-news', 'australia-news', 'canada-news'];
    for (const prefix of countryPrefixes) {
      if (urlLower.includes(`/${prefix}/${childSlug}`)) {
        return true;
      }
    }

    return false;
  }
}

module.exports = { HubUrlValidator };