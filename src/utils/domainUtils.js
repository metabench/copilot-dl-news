/**
 * Domain extraction and manipulation utilities
 * 
 * Centralizes domain-related logic to ensure consistent handling
 * across the crawler codebase (throttling, resume, deduplication, etc.)
 */

const { tof } = require('lang-tools');

/**
 * Extract hostname from URL, returning null for invalid URLs
 * @param {string|URL} url - URL to extract domain from
 * @returns {string|null} - Lowercase hostname or null
 */
function extractDomain(url) {
  if (!url) return null;
  
  try {
    const parsed = tof(url) === 'string' ? new URL(url) : url;
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Extract base domain (without subdomain)
 * Example: www.bbc.co.uk → bbc.co.uk
 * @param {string|URL} url - URL to extract base domain from
 * @returns {string|null} - Base domain or null
 */
function extractBaseDomain(url) {
  const hostname = extractDomain(url);
  if (!hostname) return null;
  
  const parts = hostname.split('.');
  
  // Handle special TLDs (co.uk, com.au, etc.)
  const specialTlds = ['co.uk', 'com.au', 'co.nz', 'co.za', 'com.br'];
  const tld = parts.slice(-2).join('.');
  
  if (specialTlds.includes(tld) && parts.length >= 3) {
    // Return domain.co.uk
    return parts.slice(-3).join('.');
  }
  
  if (parts.length >= 2) {
    // Return domain.com
    return parts.slice(-2).join('.');
  }
  
  return hostname;
}

/**
 * Group URLs by domain
 * @param {string[]} urls - Array of URLs to group
 * @param {boolean} useBaseDomain - Group by base domain instead of full hostname
 * @returns {Map<string, string[]>} - Map of domain → URLs
 */
function groupByDomain(urls, useBaseDomain = false) {
  const groups = new Map();
  const extractor = useBaseDomain ? extractBaseDomain : extractDomain;
  
  for (const url of urls) {
    const domain = extractor(url);
    if (!domain) continue;
    
    if (!groups.has(domain)) {
      groups.set(domain, []);
    }
    groups.get(domain).push(url);
  }
  
  return groups;
}

/**
 * Check if two URLs are from the same domain
 * @param {string|URL} url1 - First URL
 * @param {string|URL} url2 - Second URL
 * @param {boolean} useBaseDomain - Compare base domains instead of full hostnames
 * @returns {boolean} - True if same domain
 */
function isSameDomain(url1, url2, useBaseDomain = false) {
  const extractor = useBaseDomain ? extractBaseDomain : extractDomain;
  const domain1 = extractor(url1);
  const domain2 = extractor(url2);
  
  if (!domain1 || !domain2) return false;
  return domain1 === domain2;
}

/**
 * Deduplicate URLs by domain, keeping only first URL per domain
 * @param {string[]} urls - URLs to deduplicate
 * @param {boolean} useBaseDomain - Deduplicate by base domain
 * @returns {string[]} - Deduplicated URLs
 */
function deduplicateByDomain(urls, useBaseDomain = false) {
  const seen = new Set();
  const extractor = useBaseDomain ? extractBaseDomain : extractDomain;
  const result = [];
  
  for (const url of urls) {
    const domain = extractor(url);
    if (!domain) continue;
    
    if (!seen.has(domain)) {
      seen.add(domain);
      result.push(url);
    }
  }
  
  return result;
}

/**
 * Extract domains from multiple URLs, returning unique domains
 * @param {string[]} urls - URLs to extract domains from
 * @param {boolean} useBaseDomain - Extract base domains
 * @returns {Set<string>} - Set of unique domains
 */
function extractUniqueDomains(urls, useBaseDomain = false) {
  const domains = new Set();
  const extractor = useBaseDomain ? extractBaseDomain : extractDomain;
  
  for (const url of urls) {
    const domain = extractor(url);
    if (domain) domains.add(domain);
  }
  
  return domains;
}

/**
 * Check if a domain matches a pattern (supports wildcards)
 * @param {string} domain - Domain to check
 * @param {string} pattern - Pattern with optional wildcards (*.example.com)
 * @returns {boolean} - True if matches
 */
function matchesDomainPattern(domain, pattern) {
  if (!domain || !pattern) return false;
  
  // Convert wildcard pattern to regex
  const regexPattern = pattern
    .replace(/\./g, '\\.')  // Escape dots
    .replace(/\*/g, '.*');  // Wildcards match anything
  
  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(domain);
}

/**
 * Get domain depth (number of subdomain levels)
 * Example: www.news.bbc.co.uk → 2 (www, news)
 * @param {string|URL} url - URL to analyze
 * @returns {number} - Number of subdomain levels
 */
function getDomainDepth(url) {
  const hostname = extractDomain(url);
  if (!hostname) return 0;
  
  const parts = hostname.split('.');
  const baseDomain = extractBaseDomain(url);
  const baseParts = baseDomain ? baseDomain.split('.').length : 0;
  
  return parts.length - baseParts;
}

/**
 * Normalize domain for comparison (lowercase, remove www)
 * @param {string} domain - Domain to normalize
 * @returns {string} - Normalized domain
 */
function normalizeDomain(domain) {
  if (!domain) return '';
  
  let normalized = domain.toLowerCase().trim();
  
  // Remove www prefix
  if (normalized.startsWith('www.')) {
    normalized = normalized.slice(4);
  }
  
  return normalized;
}

module.exports = {
  extractDomain,
  extractBaseDomain,
  groupByDomain,
  isSameDomain,
  deduplicateByDomain,
  extractUniqueDomains,
  matchesDomainPattern,
  getDomainDepth,
  normalizeDomain
};
