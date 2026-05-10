'use strict';

const { createSqliteHubGapAnalysisAccess } = require('news-crawler-db');

/**
 * SitePatternAnalyzer
 * 
 * Analyzes URL patterns from downloaded pages for a host to discover:
 * - Section patterns (e.g., /world, /news, /sport)
 * - Place hub patterns (e.g., /world/{place}, /news/{country})
 * - Topic patterns (e.g., /topics/{topic})
 * 
 * Only runs on hosts with 500+ pages (configurable threshold).
 */

const PAGE_THRESHOLD = 500;

/**
 * Common section names that often contain place hubs
 */
const PLACE_HUB_SECTIONS = [
  'world', 'news', 'international', 'global', 'mundo', 'monde',
  'politics', 'politica', 'politique',
  'regions', 'places', 'countries', 'locations',
  'uk-news', 'us-news', 'australia', 'europe', 'asia', 'africa', 'americas',
  'internacionales', 'nacional', 'local'
];

/**
 * Section names that are NOT likely place hubs
 */
const NON_PLACE_SECTIONS = [
  'video', 'audio', 'podcast', 'podcasts', 'live', 'series',
  'author', 'authors', 'contributor', 'contributors',
  'tag', 'tags', 'topic', 'topics', 'category', 'categories',
  'search', 'results', 'login', 'register', 'subscribe',
  'about', 'contact', 'help', 'faq', 'terms', 'privacy',
  'api', 'rss', 'feed', 'sitemap', 'robots.txt',
  '_services', 'static', 'assets', 'images', 'css', 'js'
];

/**
 * Extract path from a full URL
 */
function extractPath(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname;
  } catch {
    return null;
  }
}

/**
 * Check if a path segment looks like a date
 */
function isDateLike(segment) {
  if (/^\d{4}$/.test(segment)) return true; // year
  if (/^\d{1,2}$/.test(segment)) return true; // day/month
  if (/^\d{4}-\d{2}/.test(segment)) return true; // ISO date
  if (/^20\d{2}/.test(segment)) return true; // starts with year
  return false;
}

/**
 * Check if a segment looks like an article ID
 */
function isArticleId(segment) {
  if (/^\d+$/.test(segment)) return true; // pure numbers
  if (/^[a-f0-9]{8,}$/i.test(segment)) return true; // hex hash
  if (segment.length > 50) return true; // very long slug
  return false;
}

function getHostVariants(host) {
  const normalizedHost = host.replace(/^www\./, '');
  return Array.from(new Set([host, `www.${normalizedHost}`, normalizedHost]));
}

function getHubGapAccess(dbHandle) {
  return dbHandle?.hubGapAnalysis || createSqliteHubGapAnalysisAccess(dbHandle);
}

/**
 * Analyze URLs from a host to discover patterns
 * 
 * @param {object} dbHandle - Database handle
 * @param {string} host - Host to analyze
 * @param {object} options - Options
 * @returns {object} Analysis results with discovered patterns
 */
function analyzeHostPatterns(dbHandle, host, options = {}) {
  const {
    maxUrls = 5000,
    minChildCount = 3,
    minArticleCount = 5
  } = options;

  const dbAccess = getHubGapAccess(dbHandle);
  const hostVariants = getHostVariants(host);
  
  // Get page count to verify eligibility
  const pageCount = dbAccess.countSuccessfulFetchedPagesForHostVariants(host, { hostVariants });
  
  if (pageCount < PAGE_THRESHOLD) {
    return {
      host,
      pageCount,
      eligible: false,
      reason: `Only ${pageCount} pages (need ${PAGE_THRESHOLD})`,
      patterns: []
    };
  }
  
  // Get URLs for this host
  const urls = dbAccess.listSuccessfulFetchedUrlsForHostVariants(host, { hostVariants, limit: maxUrls });
  
  // Analyze path segments
  const firstSegmentCounts = {};
  const secondLevelPaths = {};
  
  for (const { url } of urls) {
    const urlPath = extractPath(url);
    if (!urlPath || urlPath === '/') continue;
    
    const segments = urlPath.split('/').filter(s => s);
    if (segments.length === 0) continue;
    
    const first = segments[0].toLowerCase();
    
    // Skip date-like and system paths
    if (isDateLike(first) || NON_PLACE_SECTIONS.includes(first)) continue;
    
    firstSegmentCounts[first] = (firstSegmentCounts[first] || 0) + 1;
    
    // Collect depth-2 paths (potential hub patterns)
    if (segments.length >= 2) {
      const second = segments[1].toLowerCase();
      
      // Skip if second segment is date-like or article ID
      if (isDateLike(second) || isArticleId(second)) continue;
      
      const secondLevel = `/${first}/${second}`;
      if (!secondLevelPaths[secondLevel]) {
        secondLevelPaths[secondLevel] = { 
          count: 0, 
          children: new Set(),
          examples: []
        };
      }
      secondLevelPaths[secondLevel].count++;
      
      // Track child pages (depth 3+)
      if (segments.length >= 3) {
        const third = segments[2];
        if (!isDateLike(third) && !isArticleId(third)) {
          secondLevelPaths[secondLevel].children.add(third);
        }
      }
      
      // Keep some examples
      if (secondLevelPaths[secondLevel].examples.length < 3) {
        secondLevelPaths[secondLevel].examples.push(urlPath);
      }
    }
  }
  
  // Identify section patterns (first-level segments that look like news sections)
  const sectionPatterns = Object.entries(firstSegmentCounts)
    .filter(([seg, count]) => {
      if (count < minArticleCount) return false;
      if (seg.length < 3) return false;
      // Prefer known news section names
      return PLACE_HUB_SECTIONS.includes(seg) || count >= 20;
    })
    .sort((a, b) => {
      // Prioritize known place hub sections
      const aIsPlace = PLACE_HUB_SECTIONS.includes(a[0]) ? 1 : 0;
      const bIsPlace = PLACE_HUB_SECTIONS.includes(b[0]) ? 1 : 0;
      if (aIsPlace !== bIsPlace) return bIsPlace - aIsPlace;
      return b[1] - a[1];
    })
    .slice(0, 10)
    .map(([seg, count]) => ({
      type: 'section',
      template: `/${seg}/{place}`,
      firstSegment: seg,
      articleCount: count,
      confidence: PLACE_HUB_SECTIONS.includes(seg) ? 0.8 : 0.5,
      isPlaceHubLikely: PLACE_HUB_SECTIONS.includes(seg)
    }));
  
  // Identify place hub patterns (depth-2 paths with children)
  const hubPatterns = Object.entries(secondLevelPaths)
    .filter(([path, data]) => {
      if (data.children.size < minChildCount) return false;
      if (data.count < minArticleCount) return false;
      
      const segs = path.split('/').filter(s => s);
      const first = segs[0];
      const second = segs[1];
      
      // Skip non-place patterns
      if (NON_PLACE_SECTIONS.includes(second)) return false;
      
      return true;
    })
    .map(([path, data]) => {
      const segs = path.split('/').filter(s => s);
      const first = segs[0];
      
      // Calculate confidence based on evidence
      let confidence = 0.5;
      if (PLACE_HUB_SECTIONS.includes(first)) confidence += 0.2;
      if (data.children.size >= 10) confidence += 0.1;
      if (data.count >= 50) confidence += 0.1;
      confidence = Math.min(confidence, 1.0);
      
      return {
        type: 'place-hub',
        template: `${path}/{article}`,
        path,
        firstSegment: first,
        articleCount: data.count,
        childCount: data.children.size,
        examples: data.examples,
        confidence
      };
    })
    .sort((a, b) => {
      // Sort by confidence * evidence
      const scoreA = a.confidence * Math.log(a.childCount + 1);
      const scoreB = b.confidence * Math.log(b.childCount + 1);
      return scoreB - scoreA;
    })
    .slice(0, 20);
  
  return {
    host,
    pageCount,
    eligible: true,
    patterns: [...sectionPatterns, ...hubPatterns],
    summary: {
      sectionCount: sectionPatterns.length,
      hubCount: hubPatterns.length,
      topSections: sectionPatterns.slice(0, 5).map(p => p.firstSegment),
      topHubs: hubPatterns.slice(0, 5).map(p => p.path)
    }
  };
}

/**
 * Save discovered patterns to database
 * 
 * @param {object} dbHandle - Database handle
 * @param {string} host - Host
 * @param {Array} patterns - Patterns from analyzeHostPatterns
 * @returns {object} Save result
 */
function savePatterns(dbHandle, host, patterns) {
  return getHubGapAccess(dbHandle).saveSiteUrlPatterns(host, patterns);
}

/**
 * Get patterns for a host from the database
 * 
 * @param {object} dbHandle - Database handle  
 * @param {string} host - Host to look up
 * @param {object} options - Options
 * @returns {Array} Patterns for this host
 */
function getHostPatterns(dbHandle, host, options = {}) {
  const { type = null, minConfidence = 0.0, activeOnly = true } = options;
  
  return getHubGapAccess(dbHandle).listSiteUrlPatterns(getHostVariants(host), {
    type,
    minConfidence,
    activeOnly
  });
}

/**
 * Get section patterns that are good for place hub guessing
 * 
 * @param {object} dbHandle - Database handle
 * @param {string} host - Host
 * @returns {Array} Section patterns like '/world/{place}'
 */
function getPlaceHubPatterns(dbHandle, host) {
  const patterns = getHostPatterns(dbHandle, host, { 
    type: 'section',
    minConfidence: 0.5 
  });
  
  return patterns.map(p => ({
    template: p.path_template,
    section: p.first_segment,
    confidence: p.confidence,
    articleCount: p.article_count
  }));
}

/**
 * Run analysis on all eligible hosts and save results
 * 
 * @param {object} dbHandle - Database handle
 * @param {object} options - Options
 * @returns {object} Summary of analysis run
 */
function analyzeAllEligibleHosts(dbHandle, options = {}) {
  const { threshold = PAGE_THRESHOLD, force = false } = options;
  
  const dbAccess = getHubGapAccess(dbHandle);
  const eligibleHosts = dbAccess.listEligibleHostsForSitePatternAnalysis({ threshold });
  
  const results = [];
  
  for (const { host, page_count } of eligibleHosts) {
    // Skip if already analyzed (unless force)
    if (!force) {
      if (dbAccess.countRecentSiteUrlPatterns(host, { days: 7 }) > 0) {
        results.push({ host, status: 'skipped', reason: 'Recently analyzed' });
        continue;
      }
    }
    
    const analysis = analyzeHostPatterns(dbHandle, host, options);
    
    if (analysis.eligible && analysis.patterns.length > 0) {
      const saveResult = savePatterns(dbHandle, host, analysis.patterns);
      results.push({
        host,
        status: 'analyzed',
        pageCount: page_count,
        patternCount: analysis.patterns.length,
        ...saveResult
      });
    } else {
      results.push({
        host,
        status: 'no-patterns',
        pageCount: page_count,
        reason: analysis.reason || 'No patterns found'
      });
    }
  }
  
  return {
    hostsAnalyzed: results.filter(r => r.status === 'analyzed').length,
    hostsSkipped: results.filter(r => r.status === 'skipped').length,
    hostsNoPatterns: results.filter(r => r.status === 'no-patterns').length,
    totalPatterns: results.reduce((sum, r) => sum + (r.patternCount || 0), 0),
    results
  };
}

module.exports = {
  PAGE_THRESHOLD,
  PLACE_HUB_SECTIONS,
  analyzeHostPatterns,
  savePatterns,
  getHostPatterns,
  getPlaceHubPatterns,
  analyzeAllEligibleHosts
};
