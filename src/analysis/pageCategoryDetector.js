'use strict';

/**
 * Page Category Detection Service
 * 
 * Detects page categories like "In-Depth", "Opinion", "Live Coverage" etc.
 * based on URL patterns, content signals, and linked article characteristics.
 * 
 * @module pageCategoryDetector
 */

/**
 * URL patterns that indicate in-depth/long-form content hubs
 */
const IN_DEPTH_PATTERNS = [
  /\/long-?read/i,
  /\/long-?form/i,
  /\/in-?depth/i,
  /\/feature[s]?\//i,
  /\/series\//i,
  /\/investigation[s]?\//i,
  /\/special-?report[s]?/i,
  /\/documentary/i,
  /\/deep-?dive/i,
  /\/analysis\//i,
  /\/big-?read/i,
  /\/magazine\//i
];

/**
 * URL patterns for opinion content
 */
const OPINION_PATTERNS = [
  /\/opinion[s]?\//i,
  /\/comment[s]?\//i,
  /\/editorial[s]?\//i,
  /\/columnist[s]?\//i,
  /\/voice[s]?\//i,
  /\/perspective[s]?\//i,
  /\/viewpoint[s]?\//i,
  /\/op-?ed/i
];

/**
 * URL patterns for live coverage
 */
const LIVE_PATTERNS = [
  /\/live\//i,
  /\/live-?blog/i,
  /\/as-it-happened/i,
  /\/live-?updates/i,
  /\/breaking/i,
  /\/live-?coverage/i
];

/**
 * URL patterns for explainer content
 */
const EXPLAINER_PATTERNS = [
  /\/explainer[s]?\//i,
  /\/explained\//i,
  /\/guide[s]?\//i,
  /\/what-is-/i,
  /\/how-to-/i,
  /\/faq\//i,
  /\/understand/i,
  /\/101\//i
];

/**
 * URL patterns for multimedia content
 */
const MULTIMEDIA_PATTERNS = [
  /\/video[s]?\//i,
  /\/audio\//i,
  /\/podcast[s]?\//i,
  /\/interactive\//i,
  /\/multimedia\//i,
  /\/gallery/i,
  /\/photo[s]?\//i,
  /\/graphics?\//i,
  /\/visual[s]?\//i
];

/**
 * Category definitions with their detection rules
 */
const CATEGORY_DEFINITIONS = {
  'in-depth': {
    name: 'In-Depth',
    patterns: IN_DEPTH_PATTERNS,
    minArticleLinks: 3,
    minAvgWordCount: 1500,
    preferHighWordCount: true
  },
  'opinion': {
    name: 'Opinion',
    patterns: OPINION_PATTERNS,
    minArticleLinks: 3
  },
  'live': {
    name: 'Live Coverage',
    patterns: LIVE_PATTERNS,
    requiresLiveIndicators: true
  },
  'explainer': {
    name: 'Explainer',
    patterns: EXPLAINER_PATTERNS,
    minArticleLinks: 2
  },
  'multimedia': {
    name: 'Multimedia',
    patterns: MULTIMEDIA_PATTERNS,
    requiresMediaIndicators: true
  }
};

/**
 * Check if a URL matches any patterns in a list
 * @param {string} url - URL to check
 * @param {RegExp[]} patterns - Array of regex patterns
 * @returns {boolean}
 */
function matchesPatterns(url, patterns) {
  if (!url || !patterns || !patterns.length) return false;
  return patterns.some(pattern => pattern.test(url));
}

/**
 * Detect page categories from URL patterns
 * @param {string} url - The URL to analyze
 * @returns {Object[]} Array of matched categories with confidence
 */
function detectCategoriesFromUrl(url) {
  if (!url) return [];
  
  const matches = [];
  
  for (const [slug, def] of Object.entries(CATEGORY_DEFINITIONS)) {
    if (matchesPatterns(url, def.patterns)) {
      matches.push({
        slug,
        name: def.name,
        confidence: 0.7, // URL match alone gives moderate confidence
        reason: 'url-pattern'
      });
    }
  }
  
  return matches;
}

/**
 * Detect if a hub page links to high word count articles
 * @param {Object} options
 * @param {string} options.url - Hub page URL
 * @param {Object} options.db - Database connection
 * @param {string} options.host - Domain host
 * @returns {Object|null} In-depth detection result or null
 */
function detectInDepthHub({ url, db, host }) {
  if (!url || !db) return null;
  
  // First check URL pattern
  const urlMatch = matchesPatterns(url, IN_DEPTH_PATTERNS);
  
  // Query for article word count statistics for this domain
  // to see if this hub's articles have above-average word counts
  try {
    // Get domain's average word count
    const domainStats = db.prepare(`
      SELECT 
        AVG(ca.word_count) as avg_word_count,
        COUNT(*) as article_count
      FROM urls u
      JOIN http_responses hr ON hr.url_id = u.id
      JOIN content_storage cs ON cs.http_response_id = hr.id
      JOIN content_analysis ca ON ca.content_id = cs.id
      WHERE u.host = ?
        AND ca.classification = 'article'
        AND ca.word_count > 0
    `).get(host);
    
    if (!domainStats || !domainStats.article_count) {
      // No data - rely on URL pattern alone
      return urlMatch ? {
        isInDepth: true,
        confidence: 0.5,
        reason: 'url-pattern-only',
        urlMatch: true
      } : null;
    }
    
    const domainAvg = domainStats.avg_word_count || 0;
    
    // Find articles that might be linked from this hub
    // Look for articles with similar URL prefix/section
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    const sectionPrefix = pathParts.length > 0 ? `${urlObj.origin}/${pathParts[0]}/%` : null;
    
    if (!sectionPrefix) {
      return urlMatch ? {
        isInDepth: true,
        confidence: 0.5,
        reason: 'url-pattern-only',
        urlMatch: true
      } : null;
    }
    
    // Get word count stats for articles in this section
    const sectionStats = db.prepare(`
      SELECT 
        AVG(ca.word_count) as avg_word_count,
        MAX(ca.word_count) as max_word_count,
        COUNT(*) as article_count
      FROM urls u
      JOIN http_responses hr ON hr.url_id = u.id
      JOIN content_storage cs ON cs.http_response_id = hr.id
      JOIN content_analysis ca ON ca.content_id = cs.id
      WHERE u.url LIKE ?
        AND ca.classification = 'article'
        AND ca.word_count > 0
    `).get(sectionPrefix);
    
    if (!sectionStats || !sectionStats.article_count) {
      return urlMatch ? {
        isInDepth: true,
        confidence: 0.5,
        reason: 'url-pattern-only',
        urlMatch: true,
        domainAvgWordCount: domainAvg
      } : null;
    }
    
    const sectionAvg = sectionStats.avg_word_count || 0;
    const sectionMax = sectionStats.max_word_count || 0;
    
    // Determine if this section has notably higher word counts
    const aboveAverage = sectionAvg > domainAvg * 1.3; // 30% above domain average
    const hasLongArticles = sectionMax >= 2000;
    const hasHighAverage = sectionAvg >= 1500;
    
    // Calculate confidence based on signals
    let confidence = 0;
    const reasons = [];
    
    if (urlMatch) {
      confidence += 0.4;
      reasons.push('url-pattern');
    }
    
    if (aboveAverage) {
      confidence += 0.25;
      reasons.push(`section-avg-${Math.round(sectionAvg)}-above-domain-${Math.round(domainAvg)}`);
    }
    
    if (hasLongArticles) {
      confidence += 0.2;
      reasons.push(`has-long-articles-max-${sectionMax}`);
    }
    
    if (hasHighAverage) {
      confidence += 0.15;
      reasons.push(`high-avg-${Math.round(sectionAvg)}`);
    }
    
    if (confidence >= 0.4) {
      return {
        isInDepth: true,
        confidence: Math.min(1, confidence),
        reasons,
        urlMatch,
        stats: {
          domainAvgWordCount: Math.round(domainAvg),
          sectionAvgWordCount: Math.round(sectionAvg),
          sectionMaxWordCount: sectionMax,
          sectionArticleCount: sectionStats.article_count
        }
      };
    }
    
    return null;
  } catch (err) {
    console.error('[PageCategoryDetector] Error detecting in-depth hub:', err.message);
    return urlMatch ? {
      isInDepth: true,
      confidence: 0.5,
      reason: 'url-pattern-only-error',
      urlMatch: true,
      error: err.message
    } : null;
  }
}

/**
 * Detect all applicable categories for a page
 * @param {Object} options
 * @param {string} options.url - Page URL
 * @param {string} options.classification - Current page classification (nav, article, etc.)
 * @param {number} options.navLinksCount - Number of navigation links
 * @param {number} options.articleLinksCount - Number of article links
 * @param {number} options.wordCount - Page word count
 * @param {Object} options.db - Database connection (optional, for advanced detection)
 * @returns {Object} Detection result with categories
 */
function detectPageCategories({
  url,
  classification,
  navLinksCount,
  articleLinksCount,
  wordCount,
  db = null
} = {}) {
  const result = {
    categories: [],
    isHub: false,
    signals: {
      urlPatternMatches: [],
      contentSignals: []
    }
  };
  
  if (!url) return result;
  
  // Check if this is a hub-like page
  const isNavClassification = classification === 'nav';
  const hasArticleLinks = typeof articleLinksCount === 'number' && articleLinksCount >= 3;
  result.isHub = isNavClassification || hasArticleLinks;
  
  // Get URL pattern matches
  const urlMatches = detectCategoriesFromUrl(url);
  result.signals.urlPatternMatches = urlMatches.map(m => m.slug);
  
  // Add URL-matched categories
  for (const match of urlMatches) {
    const existing = result.categories.find(c => c.slug === match.slug);
    if (!existing) {
      result.categories.push({
        slug: match.slug,
        name: match.name,
        confidence: match.confidence,
        reasons: [match.reason]
      });
    }
  }
  
  // Enhanced in-depth detection with database stats
  if (db) {
    try {
      const urlObj = new URL(url);
      const inDepthResult = detectInDepthHub({ url, db, host: urlObj.hostname });
      
      if (inDepthResult && inDepthResult.isInDepth) {
        const existing = result.categories.find(c => c.slug === 'in-depth');
        if (existing) {
          // Merge with URL match
          existing.confidence = Math.max(existing.confidence, inDepthResult.confidence);
          if (inDepthResult.reasons) {
            existing.reasons = [...new Set([...existing.reasons, ...inDepthResult.reasons])];
          }
          existing.stats = inDepthResult.stats;
        } else {
          result.categories.push({
            slug: 'in-depth',
            name: 'In-Depth',
            confidence: inDepthResult.confidence,
            reasons: inDepthResult.reasons || [inDepthResult.reason],
            stats: inDepthResult.stats
          });
        }
      }
    } catch (err) {
      // URL parsing error - continue without db detection
    }
  }
  
  // Boost confidence for categories that match hub characteristics
  if (result.isHub) {
    for (const cat of result.categories) {
      const def = CATEGORY_DEFINITIONS[cat.slug];
      if (def && def.minArticleLinks && articleLinksCount >= def.minArticleLinks) {
        cat.confidence = Math.min(1, cat.confidence + 0.15);
        cat.reasons.push(`article-links-${articleLinksCount}`);
      }
    }
  }
  
  return result;
}

/**
 * Store detected categories in the database
 * @param {Object} db - Database connection
 * @param {number} contentId - Content analysis ID
 * @param {Object[]} categories - Detected categories
 * @returns {number} Number of categories stored
 */
function storePageCategories(db, contentId, categories) {
  if (!db || !contentId || !categories || !categories.length) return 0;
  
  let stored = 0;
  
  for (const cat of categories) {
    try {
      // Get or create category ID
      const catRow = db.prepare('SELECT id FROM page_categories WHERE slug = ?').get(cat.slug);
      if (!catRow) continue;
      
      // Insert mapping
      db.prepare(`
        INSERT OR REPLACE INTO page_category_map (content_id, category_id, confidence, detection_method)
        VALUES (?, ?, ?, ?)
      `).run(contentId, catRow.id, cat.confidence, cat.reasons.join(','));
      
      stored++;
    } catch (err) {
      console.error(`[PageCategoryDetector] Failed to store category ${cat.slug}:`, err.message);
    }
  }
  
  return stored;
}

/**
 * Get categories for a content item
 * @param {Object} db - Database connection
 * @param {number} contentId - Content analysis ID
 * @returns {Object[]} Array of categories
 */
function getPageCategories(db, contentId) {
  if (!db || !contentId) return [];
  
  try {
    return db.prepare(`
      SELECT pc.slug, pc.name, pc.description, pcm.confidence, pcm.detection_method, pcm.detected_at
      FROM page_category_map pcm
      JOIN page_categories pc ON pc.id = pcm.category_id
      WHERE pcm.content_id = ?
      ORDER BY pcm.confidence DESC
    `).all(contentId);
  } catch (err) {
    console.error('[PageCategoryDetector] Failed to get categories:', err.message);
    return [];
  }
}

module.exports = {
  CATEGORY_DEFINITIONS,
  IN_DEPTH_PATTERNS,
  OPINION_PATTERNS,
  LIVE_PATTERNS,
  EXPLAINER_PATTERNS,
  MULTIMEDIA_PATTERNS,
  matchesPatterns,
  detectCategoriesFromUrl,
  detectInDepthHub,
  detectPageCategories,
  storePageCategories,
  getPageCategories
};
