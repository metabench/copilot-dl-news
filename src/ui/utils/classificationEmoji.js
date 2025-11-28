"use strict";

/**
 * Classification Emoji Mapping
 * 
 * Maps content analysis classifications to large, visually distinct emojis
 * for quick visual identification in the UI.
 * 
 * Classification Taxonomy:
 * 
 * | Classification       | Emoji(s)     | Description                                      |
 * |---------------------|--------------|--------------------------------------------------|
 * | article             | 📰           | News article or blog post                        |
 * | nav                 | 🧭           | Navigation/index page                            |
 * | hub                 | 🔗           | Generic hub page (links to other content)        |
 * | place-hub           | 📍           | Hub page for a geographic place                  |
 * | place-place-hub     | 📍📍         | Hub for place within place (e.g., city in state) |
 * | topic-hub           | 🏷️           | Hub page for a topic/category                    |
 * | place-topic-hub     | 📍🏷️         | Topic hub for a place (e.g., /uk/sports)         |
 * | place-place-topic-hub| 📍📍🏷️      | Topic hub nested within places                   |
 * | error               | ⚠️           | Error page (4xx, 5xx responses)                  |
 * | redirect            | ↪️           | Redirect response                                |
 * | api                 | 🔌           | API endpoint response                            |
 * | unknown             | ❓           | Unknown/unclassified content                     |
 * | (default)           | 📄           | Default for any unrecognized classification      |
 * 
 * Hub Hierarchy Examples:
 * - place-hub: /news/uk → UK news hub (📍)
 * - place-place-hub: /news/uk/london → London within UK (📍📍)
 * - topic-hub: /sports → Sports section hub (🏷️)
 * - place-topic-hub: /uk/sports → UK Sports hub (📍🏷️)
 * - place-place-topic-hub: /uk/london/sports → London Sports within UK (📍📍🏷️)
 */

const CLASSIFICATION_EMOJI_MAP = {
  // Content Types
  article: "📰",
  nav: "🧭",
  navigation: "🧭",
  
  // Hub Types
  hub: "🔗",
  "place-hub": "📍",
  "place-place-hub": "📍📍",
  "topic-hub": "🏷️",
  "place-topic-hub": "📍🏷️",
  "place-place-topic-hub": "📍📍🏷️",
  
  // Special Types
  error: "⚠️",
  redirect: "↪️",
  api: "🔌",
  "api-response": "🔌",
  
  // Status
  unknown: "❓",
  unclassified: "❓",
  
  // Article subtypes (if used)
  "article-screened": "📰✓",
  
  // Index/Listing pages
  index: "📋",
  listing: "📋",
  category: "📁",
  
  // Media types
  image: "🖼️",
  video: "🎬",
  audio: "🎵",
  document: "📄",
  pdf: "📕"
};

/**
 * Default emoji for unrecognized classifications
 */
const DEFAULT_EMOJI = "📄";

/**
 * Get emoji(s) for a given classification
 * 
 * @param {string|null|undefined} classification - The content classification
 * @returns {string} One or more emojis representing the classification
 * 
 * @example
 * getClassificationEmoji("article")        // "📰"
 * getClassificationEmoji("place-hub")      // "📍"
 * getClassificationEmoji("place-topic-hub") // "📍🏷️"
 * getClassificationEmoji(null)             // "📄"
 */
function getClassificationEmoji(classification) {
  if (!classification || typeof classification !== "string") {
    return DEFAULT_EMOJI;
  }
  
  const normalized = classification.trim().toLowerCase();
  
  // Direct lookup
  if (CLASSIFICATION_EMOJI_MAP[normalized]) {
    return CLASSIFICATION_EMOJI_MAP[normalized];
  }
  
  // Handle compound classifications with underscores or spaces
  const kebabNormalized = normalized.replace(/[_\s]+/g, "-");
  if (CLASSIFICATION_EMOJI_MAP[kebabNormalized]) {
    return CLASSIFICATION_EMOJI_MAP[kebabNormalized];
  }
  
  // Partial matching for hub variants
  if (normalized.includes("place") && normalized.includes("topic") && normalized.includes("hub")) {
    // Count how many "place" occurrences to determine nesting
    const placeCount = (normalized.match(/place/g) || []).length;
    if (placeCount >= 2) return "📍📍🏷️";
    return "📍🏷️";
  }
  
  if (normalized.includes("place") && normalized.includes("hub")) {
    const placeCount = (normalized.match(/place/g) || []).length;
    if (placeCount >= 2) return "📍📍";
    return "📍";
  }
  
  if (normalized.includes("topic") && normalized.includes("hub")) {
    return "🏷️";
  }
  
  if (normalized.includes("hub")) {
    return "🔗";
  }
  
  if (normalized.includes("article")) {
    return "📰";
  }
  
  if (normalized.includes("nav")) {
    return "🧭";
  }
  
  return DEFAULT_EMOJI;
}

/**
 * Get emoji with label for display
 * 
 * @param {string|null|undefined} classification - The content classification
 * @returns {{emoji: string, label: string, classification: string}} Object with emoji, human label, and original classification
 * 
 * @example
 * getClassificationDisplay("place-topic-hub")
 * // { emoji: "📍🏷️", label: "Place Topic Hub", classification: "place-topic-hub" }
 */
function getClassificationDisplay(classification) {
  const emoji = getClassificationEmoji(classification);
  const normalizedClass = classification ? String(classification).trim().toLowerCase() : "";
  
  // Generate human-readable label
  let label = "Unknown";
  if (normalizedClass) {
    label = normalizedClass
      .replace(/[-_]+/g, " ")
      .split(" ")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }
  
  return {
    emoji,
    label,
    classification: normalizedClass || "unknown"
  };
}

/**
 * Get all known classifications with their emojis
 * Useful for documentation or legend displays
 * 
 * @returns {Array<{classification: string, emoji: string}>}
 */
function getAllClassificationEmojis() {
  return Object.entries(CLASSIFICATION_EMOJI_MAP).map(([classification, emoji]) => ({
    classification,
    emoji
  }));
}

module.exports = {
  getClassificationEmoji,
  getClassificationDisplay,
  getAllClassificationEmojis,
  CLASSIFICATION_EMOJI_MAP,
  DEFAULT_EMOJI
};
