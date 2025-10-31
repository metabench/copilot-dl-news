/**
 * HubValidationEngine - Core validation logic for all hub types
 *
 * Extracted from HubValidator to handle the business logic for validating
 * different types of hubs (place, topic, place-topic, place-place).
 */

const { getAllPlaceNames } = require('../db/sqlite/v1/queries/gazetteerPlaceNames');
const { getTopicTermsForLanguage } = require('../db/sqlite/v1/queries/topicKeywords');
const { getSkipTermsForLanguage } = require('../db/sqlite/v1/queries/crawlSkipTerms');
const { discoverPlacePlacePatternsFromMappings, updateDsplWithPlacePlacePatterns } = require('../services/shared/dspl');
const { HubUrlValidator } = require('./HubUrlValidator');
const { HubNormalizer } = require('./HubNormalizer');

class HubValidationEngine {
  constructor(db) {
    this.db = db;
    this.urlValidator = new HubUrlValidator();
    this.normalizer = new HubNormalizer();
    this.placeNames = null;
    this.newsTopics = null;
    this.newsIndicators = null;
    this.commonNames = null;
    this.initialized = false;
  }

  /**
   * Initialize validation data
   */
  initialize() {
    if (this.initialized) return;
    // Load topics from database (multi-lingual support, currently using English)
    this.newsTopics = getTopicTermsForLanguage(this.db, 'en');

    // Load skip terms from database (news indicators and common person names)
    this.newsIndicators = getSkipTermsForLanguage(this.db, 'en');
    this.commonNames = getSkipTermsForLanguage(this.db, 'en');
    if (!this.placeNames) {
      this.placeNames = getAllPlaceNames(this.db);
    }
    this.initialized = true;
  }

  /**
   * Validate if a title/URL combination represents a place hub
   * @param {string} title - Article title
   * @param {string} url - Article URL
   * @returns {Object} - { isValid: boolean, reason: string, placeName: string|null }
   */
  validatePlaceHub(title, url) {
    this.initialize();

    // Extract potential place name from title
    const extracted = this._extractPlaceName(title);
    if (!extracted) {
      return { isValid: false, reason: 'No place name pattern found', placeName: null };
    }

    const { name, pattern } = extracted;
    const nameLower = name.toLowerCase();

    // Check 1: Is this a known news topic instead of a place?
    if (this.newsTopics.has(nameLower)) {
      return { isValid: false, reason: `"${name}" is a news topic, not a place`, placeName: null };
    }

    // Check 2: Is this a person's name?
    if (this.commonNames.has(nameLower)) {
      return { isValid: false, reason: `"${name}" is a person's name, not a place`, placeName: null };
    }

    // Check 3: Does the title contain news-specific indicators?
    const titleLower = title.toLowerCase();
    for (const indicator of this.newsIndicators) {
      if (titleLower.includes(indicator) && !titleLower.startsWith('latest ') && !titleLower.includes(' news')) {
        return { isValid: false, reason: `Title contains news indicator: "${indicator}"`, placeName: null };
      }
    }

    // Check 4: Is the name in the gazetteer?
    if (!this.placeNames.has(nameLower)) {
      return { isValid: false, reason: `"${name}" not found in gazetteer`, placeName: null };
    }

    // Check 5: Does the URL structure support it being a place hub?
    if (!this.urlValidator.validatePlaceUrl(url, nameLower)) {
      return { isValid: false, reason: 'URL structure does not match place hub pattern', placeName: null };
    }

    // Check 6: Make sure it's not a dated article (place hubs are timeless)
    if (this.normalizer.isDatedArticle(url)) {
      return { isValid: false, reason: 'URL contains date - appears to be article, not hub', placeName: null };
    }

    // All checks passed!
    return { isValid: true, reason: 'Validated as place hub', placeName: name };
  }

  /**
   * Validate if a title/URL combination represents a topic hub
   * @param {string} title - Article title
   * @param {string} url - Article URL
   * @returns {Object} - { isValid: boolean, reason: string, topicName: string|null }
   */
  validateTopicHub(title, url) {
    this.initialize();

    // Extract potential topic name from title
    const extracted = this._extractTopicName(title);
    if (!extracted) {
      return { isValid: false, reason: 'No topic name pattern found', topicName: null };
    }

    const { name } = extracted;
    const nameLower = name.toLowerCase();

    // Check 1: Is this actually a known news topic?
    if (!this.newsTopics.has(nameLower)) {
      return { isValid: false, reason: `"${name}" is not a recognized news topic`, topicName: null };
    }

    // Check 2: Does the URL structure support it being a topic hub?
    if (!this.urlValidator.validateTopicUrl(url, nameLower)) {
      return { isValid: false, reason: 'URL structure does not match topic hub pattern', topicName: null };
    }

    // Check 3: Make sure it's not a dated article
    if (this.normalizer.isDatedArticle(url)) {
      return { isValid: false, reason: 'URL contains date - appears to be article, not hub', topicName: null };
    }

    // Check 4: Make sure it's not a person's name (edge case)
    if (this.commonNames.has(nameLower)) {
      return { isValid: false, reason: `"${name}" is a person's name, not a topic`, topicName: null };
    }

    // All checks passed!
    return { isValid: true, reason: 'Validated as topic hub', topicName: name };
  }

  /**
   * Validate if a title/URL combination represents a place-topic combination hub
   * @param {string} title - Article title
   * @param {string} url - Article URL
   * @param {Object} expected - Expected place and topic
   * @param {string} expected.place - Expected place name
   * @param {string} expected.topic - Expected topic slug
   * @returns {Object} - { isValid: boolean, reason: string, placeName: string|null, topicName: string|null }
   */
  validatePlaceTopicHub(title, url, expected = {}) {
    this.initialize();

    const expectedPlace = expected.place || null;
    const expectedTopic = expected.topic || null;

    if (!expectedPlace || !expectedTopic) {
      return {
        isValid: false,
        reason: 'Both place and topic must be specified for combination validation',
        placeName: null,
        topicName: null
      };
    }

    // Extract potential place name from title
    const placeExtracted = this._extractPlaceName(title);
    if (!placeExtracted) {
      return {
        isValid: false,
        reason: 'No place name pattern found in title',
        placeName: null,
        topicName: null
      };
    }

    const { name: placeName } = placeExtracted;
    const placeNameLower = placeName.toLowerCase();

    // Extract potential topic name from title
    const topicExtracted = this._extractTopicName(title);
    const topicName = topicExtracted ? topicExtracted.name : null;
    const topicNameLower = topicName ? topicName.toLowerCase() : null;

    // Check 1: Is the place name valid?
    if (this.newsTopics.has(placeNameLower)) {
      return {
        isValid: false,
        reason: `"${placeName}" is a news topic, not a place`,
        placeName: null,
        topicName: null
      };
    }

    if (this.commonNames.has(placeNameLower)) {
      return {
        isValid: false,
        reason: `"${placeName}" is a person's name, not a place`,
        placeName: null,
        topicName: null
      };
    }

    if (!this.placeNames.has(placeNameLower)) {
      return {
        isValid: false,
        reason: `"${placeName}" not found in gazetteer`,
        placeName: null,
        topicName: null
      };
    }

    // Check 2: Is the topic name valid?
    if (!topicNameLower || !this.newsTopics.has(topicNameLower)) {
      return {
        isValid: false,
        reason: `"${topicName || 'unknown'}" is not a recognized news topic`,
        placeName: null,
        topicName: null
      };
    }

    if (this.commonNames.has(topicNameLower)) {
      return {
        isValid: false,
        reason: `"${topicName}" is a person's name, not a topic`,
        placeName: null,
        topicName: null
      };
    }

    // Check 3: Does the title contain news-specific indicators that would disqualify it?
    const titleLower = title.toLowerCase();
    for (const indicator of this.newsIndicators) {
      if (titleLower.includes(indicator) && !titleLower.startsWith('latest ') && !titleLower.includes(' news')) {
        return {
          isValid: false,
          reason: `Title contains news indicator: "${indicator}"`,
          placeName: null,
          topicName: null
        };
      }
    }

    // Check 4: Does the URL structure support it being a place-topic combination hub?
    if (!this.urlValidator.validatePlaceTopicUrl(url, placeNameLower, topicNameLower)) {
      return {
        isValid: false,
        reason: 'URL structure does not match place-topic combination hub pattern',
        placeName: null,
        topicName: null
      };
    }

    // Check 5: Make sure it's not a dated article
    if (this.normalizer.isDatedArticle(url)) {
      return {
        isValid: false,
        reason: 'URL contains date - appears to be article, not hub',
        placeName: null,
        topicName: null
      };
    }

    // Check 6: Verify the extracted names match expectations
    if (placeNameLower !== expectedPlace.toLowerCase()) {
      return {
        isValid: false,
        reason: `Place name mismatch: expected "${expectedPlace}", found "${placeName}"`,
        placeName: placeName,
        topicName: null
      };
    }

    if (topicNameLower !== expectedTopic.toLowerCase()) {
      return {
        isValid: false,
        reason: `Topic name mismatch: expected "${expectedTopic}", found "${topicName}"`,
        placeName: placeName,
        topicName: topicName
      };
    }

    // All checks passed!
    return {
      isValid: true,
      reason: 'Validated as place-topic combination hub',
      placeName: placeName,
      topicName: topicName
    };
  }

  /**
   * Validate if a title/URL combination represents a place-place hierarchical hub
   * @param {string} title - Article title
   * @param {string} url - Article URL
   * @param {Object} expected - Expected parent and child places
   * @param {string} expected.parent - Expected parent place name
   * @param {string} expected.child - Expected child place name
   * @returns {Object} - { isValid: boolean, reason: string, parentName: string|null, childName: string|null }
   */
  validatePlacePlaceHub(title, url, expected = {}) {
    this.initialize();

    const expectedParent = expected.parent || null;
    const expectedChild = expected.child || null;

    if (!expectedParent || !expectedChild) {
      return {
        isValid: false,
        reason: 'Both parent and child places must be specified for hierarchical validation',
        parentName: null,
        childName: null
      };
    }

    // Extract potential place names from title
    const parentExtracted = this._extractPlaceName(title);
    if (!parentExtracted) {
      return {
        isValid: false,
        reason: 'No parent place name pattern found in title',
        parentName: null,
        childName: null
      };
    }

    const { name: parentName } = parentExtracted;
    const parentNameLower = parentName.toLowerCase();

    // Look for child place in title (could be after parent or in different patterns)
    let childName = null;
    let childPattern = null;

    // Pattern 1: "ParentPlace - ChildPlace" or "ParentPlace, ChildPlace"
    const combinedPattern = title.match(new RegExp(`${parentName}\\s*[-,]\\s*([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*)`, 'i'));
    if (combinedPattern) {
      childName = combinedPattern[1];
      childPattern = 'combined';
    }

    // Pattern 2: "ChildPlace, ParentPlace" (reverse order)
    if (!childName) {
      const reversePattern = title.match(new RegExp(`([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*)\\s*,\\s*${parentName}`, 'i'));
      if (reversePattern) {
        childName = reversePattern[1];
        childPattern = 'reverse';
      }
    }

    // Pattern 3: Look for child place in URL if not found in title
    if (!childName) {
      const urlParts = url.split('/').filter(part => part.length > 0);
      for (const part of urlParts) {
        const slugName = part.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        if (slugName !== parentName && this.placeNames.has(slugName.toLowerCase())) {
          childName = slugName;
          childPattern = 'url-slug';
          break;
        }
      }
    }

    if (!childName) {
      return {
        isValid: false,
        reason: 'No child place name found in title or URL',
        parentName: parentName,
        childName: null
      };
    }

    const childNameLower = childName.toLowerCase();

    // Check 1: Are both places valid?
    if (this.newsTopics.has(parentNameLower)) {
      return {
        isValid: false,
        reason: `"${parentName}" is a news topic, not a place`,
        parentName: null,
        childName: null
      };
    }

    if (this.newsTopics.has(childNameLower)) {
      return {
        isValid: false,
        reason: `"${childName}" is a news topic, not a place`,
        parentName: null,
        childName: null
      };
    }

    if (this.commonNames.has(parentNameLower)) {
      return {
        isValid: false,
        reason: `"${parentName}" is a person's name, not a place`,
        parentName: null,
        childName: null
      };
    }

    if (this.commonNames.has(childNameLower)) {
      return {
        isValid: false,
        reason: `"${childName}" is a person's name, not a place`,
        parentName: null,
        childName: null
      };
    }

    if (!this.placeNames.has(parentNameLower)) {
      return {
        isValid: false,
        reason: `"${parentName}" not found in gazetteer`,
        parentName: null,
        childName: null
      };
    }

    if (!this.placeNames.has(childNameLower)) {
      return {
        isValid: false,
        reason: `"${childName}" not found in gazetteer`,
        parentName: parentName,
        childName: null
      };
    }

    // Check 2: Does the title contain news-specific indicators?
    const titleLower = title.toLowerCase();
    for (const indicator of this.newsIndicators) {
      if (titleLower.includes(indicator) && !titleLower.startsWith('latest ') && !titleLower.includes(' news')) {
        return {
          isValid: false,
          reason: `Title contains news indicator: "${indicator}"`,
          parentName: null,
          childName: null
        };
      }
    }

    // Check 3: Does the URL structure support hierarchical place-place hub pattern?
    if (!this.urlValidator.validatePlacePlaceUrl(url, parentNameLower, childNameLower)) {
      return {
        isValid: false,
        reason: 'URL structure does not match place-place hierarchical hub pattern',
        parentName: parentName,
        childName: childName
      };
    }

    // Check 4: Make sure it's not a dated article
    if (this.normalizer.isDatedArticle(url)) {
      return {
        isValid: false,
        reason: 'URL contains date - appears to be article, not hub',
        parentName: parentName,
        childName: childName
      };
    }

    // Check 5: Verify the extracted names match expectations
    if (parentNameLower !== expectedParent.toLowerCase()) {
      return {
        isValid: false,
        reason: `Parent place name mismatch: expected "${expectedParent}", found "${parentName}"`,
        parentName: parentName,
        childName: childName
      };
    }

    if (childNameLower !== expectedChild.toLowerCase()) {
      return {
        isValid: false,
        reason: `Child place name mismatch: expected "${expectedChild}", found "${childName}"`,
        parentName: parentName,
        childName: childName
      };
    }

    // All checks passed!
    const result = {
      isValid: true,
      reason: 'Validated as place-place hierarchical hub',
      parentName: parentName,
      childName: childName
    };

    // Learn patterns from verified mappings for this domain
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;
      const dsplDir = process.env.DSPL_DIR || './data/dspls';

      // Discover new patterns from verified mappings
      const newPatterns = discoverPlacePlacePatternsFromMappings(this.db, domain);

      if (newPatterns.length > 0) {
        // Update DSPL with new patterns
        updateDsplWithPlacePlacePatterns(dsplDir, domain, newPatterns);
      }
    } catch (dsplError) {
      // DSPL learning is optional - don't fail validation if it fails
      console.warn(`[HubValidationEngine] DSPL learning failed: ${dsplError.message}`);
    }

    return result;
  }

  /**
   * Extract place name from title using various patterns
   * @param {string} title - Title to extract from
   * @returns {Object|null} - { name, pattern } or null
   */
  _extractPlaceName(title) {
    // Pattern 1: "PlaceName | Publication"
    const pattern1 = title.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+\|/);
    if (pattern1) {
      return { name: pattern1[1], pattern: 'prefix' };
    }

    // Pattern 2: "Latest PlaceName news"
    const pattern2 = title.match(/^Latest\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+news/i);
    if (pattern2) {
      return { name: pattern2[1], pattern: 'latest' };
    }

    // Pattern 3: "PlaceName news and comment"
    const pattern3 = title.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+news/i);
    if (pattern3) {
      return { name: pattern3[1], pattern: 'news' };
    }

    return null;
  }

  /**
   * Extract topic name from title using various patterns
   * @param {string} title - Title to extract from
   * @returns {Object|null} - { name, pattern } or null
   */
  _extractTopicName(title) {
    // Pattern 1: "TopicName | Publication"
    const pattern1 = title.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+\|/);
    if (pattern1) {
      return { name: pattern1[1], pattern: 'prefix' };
    }

    // Pattern 2: "Latest TopicName news"
    const pattern2 = title.match(/^Latest\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+news/i);
    if (pattern2) {
      return { name: pattern2[1], pattern: 'latest' };
    }

    // Pattern 3: "TopicName news and comment"
    const pattern3 = title.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+news/i);
    if (pattern3) {
      return { name: pattern3[1], pattern: 'news' };
    }

    // Pattern 4: "TopicName | SiteName" (more flexible)
    const pattern4 = title.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+\|/);
    if (pattern4) {
      return { name: pattern4[1], pattern: 'title-pipe' };
    }

    return null;
  }
}

module.exports = { HubValidationEngine };