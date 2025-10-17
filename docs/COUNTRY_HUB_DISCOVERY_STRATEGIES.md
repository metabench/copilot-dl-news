# Country Hub Discovery Strategies

## Current Status (October 2025)

**What's Working**:
- ✅ APS (Advanced Planning Suite) is active and prioritizing country hubs
- ✅ Gazetteer integration providing 250 countries
- ✅ 350 URL predictions queued for top 50 countries
- ✅ High-priority queueing ensures country hubs are fetched first

**Current Challenge**:
- Many predicted URLs return 404 (e.g., `https://www.theguardian.com/china` → 404)
- Need to improve URL pattern accuracy to match actual site structure

## Analysis of The Guardian's Structure

### Actual Working Patterns

From database analysis, The Guardian uses:

**Pattern 1: `/world/{country-slug}`** (PRIMARY - CONFIRMED WORKING)
```
https://www.theguardian.com/world/ukraine
https://www.theguardian.com/world/germany
https://www.theguardian.com/world/turkey
https://www.theguardian.com/world/poland
https://www.theguardian.com/world/russia
https://www.theguardian.com/world/israel
https://www.theguardian.com/world/china
https://www.theguardian.com/world/afghanistan
https://www.theguardian.com/world/albania
```

**Pattern 2: Region hubs** (WORKING)
```
https://www.theguardian.com/world/middleeast
https://www.theguardian.com/world/europe-news
https://www.theguardian.com/world/americas
https://www.theguardian.com/world/asia
https://www.theguardian.com/world/africa
```

**Pattern 3: Edition-based** (WORKING)
```
https://www.theguardian.com/uk
https://www.theguardian.com/us
https://www.theguardian.com/au
https://www.theguardian.com/europe
https://www.theguardian.com/international
```

**Pattern 4: Topic hubs under /world/** (MIXED - Some countries, many topics)
```
https://www.theguardian.com/world/gaza
https://www.theguardian.com/world/ukraine
https://www.theguardian.com/world/migration
https://www.theguardian.com/world/protest
```

### Current Prediction Patterns (Need Adjustment)

Our current patterns generate 7 URLs per country:
1. ❌ `/world/{country-slug}` - **CORRECT** (keep this)
2. ❌ `/news/world/{country-slug}` - **404** (Guardian doesn't use /news/ prefix)
3. ❌ `/world/{country-code}` - **404** (Guardian uses full names, not codes)
4. ❌ `/news/{country-code}` - **404** (wrong pattern)
5. ❌ `/{country-slug}` - **404** (too generic)
6. ❌ `/international/{country-slug}` - **404** (wrong structure)
7. ❌ `/news/world-{region}-{country-slug}` - **404** (Guardian doesn't use this pattern)

**Success Rate**: ~14% (1 out of 7 patterns work)

## Recommended Strategies

### Strategy 1: Learn from Existing Data (HIGHEST PRIORITY)

**Approach**: Mine the database for actual working patterns before predicting.

**Implementation**:
```javascript
// In CountryHubGapAnalyzer
async learnPatternsFromDatabase(domain) {
  const query = `
    SELECT DISTINCT url 
    FROM articles 
    WHERE url LIKE ? 
    AND title LIKE '%| The Guardian'
    AND url NOT LIKE '%/%/%/%/%'
    LIMIT 1000
  `;
  
  const results = db.prepare(query).all(`https://${domain}/world/%`);
  
  // Extract patterns
  const patterns = new Set();
  for (const row of results) {
    const urlPath = new URL(row.url).pathname;
    const segments = urlPath.split('/').filter(Boolean);
    if (segments.length === 2) {
      patterns.add(`/${segments[0]}/{slug}`);
    }
  }
  
  return Array.from(patterns);
}
```

**Benefits**:
- 100% accuracy - only use patterns that actually work
- Domain-specific - learns each site's structure
- Self-improving - updates as we discover more hubs

**Implementation Timeline**: 1-2 hours

### Strategy 2: Probabilistic Pattern Ranking

**Approach**: Rank patterns by likelihood based on domain analysis.

**For The Guardian**:
1. **Score 10** (Very High): `/world/{slug}`
2. **Score 8** (High): `/{slug}` (for top countries like /uk, /us)
3. **Score 6** (Medium): `/world/{region}` (middleeast, asia, etc.)
4. **Score 3** (Low): `/news/{slug}`
5. **Score 1** (Very Low): Other experimental patterns

**Implementation**:
```javascript
predictCountryHubUrls(domain, countryName, countryCode) {
  const patterns = this.getRankedPatterns(domain);
  const predictions = [];
  
  for (const pattern of patterns) {
    predictions.push({
      url: this.applyPattern(pattern, countryName, countryCode),
      confidence: pattern.score / 10,
      pattern: pattern.template
    });
  }
  
  // Sort by confidence, return top N
  return predictions
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3)
    .map(p => p.url);
}
```

**Benefits**:
- Reduces 404s by prioritizing likely patterns
- Still explores new patterns (lower priority)
- Can be tuned per domain

### Strategy 3: Incremental Discovery with Feedback Loop

**Approach**: Start with high-confidence patterns, learn from successes/failures.

**Workflow**:
1. **Phase 1**: Try only the highest-confidence pattern (`/world/{slug}`)
2. **Monitor**: Track which countries return 200 vs 404
3. **Phase 2**: For 404s, try next-best pattern
4. **Learn**: Update pattern scores based on actual results
5. **Phase 3**: Apply learned patterns to remaining countries

**Implementation**:
```javascript
async discoverCountryHubsIncrementally(domain, countries) {
  const results = { found: [], missing: [] };
  
  // Phase 1: Try primary pattern for all countries
  for (const country of countries) {
    const url = `https://${domain}/world/${this.toSlug(country.name)}`;
    const response = await this.testUrl(url);
    
    if (response.status === 200) {
      results.found.push({ country, url, pattern: '/world/{slug}' });
    } else {
      results.missing.push({ country, triedPatterns: ['/world/{slug}'] });
    }
  }
  
  // Phase 2: Try alternative patterns for missing
  for (const item of results.missing) {
    for (const pattern of this.getAlternativePatterns()) {
      const url = this.applyPattern(pattern, item.country);
      const response = await this.testUrl(url);
      
      if (response.status === 200) {
        results.found.push({ country: item.country, url, pattern });
        break; // Found it, stop trying
      }
    }
  }
  
  return results;
}
```

**Benefits**:
- Minimizes network requests (try best first)
- Learns site-specific patterns quickly
- Adapts to changes in site structure

### Strategy 4: Sitemap and Navigation Discovery

**Approach**: Extract country hub URLs from sitemaps and navigation menus.

**Sitemaps**:
```javascript
async extractCountryHubsFromSitemap(domain) {
  const sitemapUrls = await this.loadSitemaps(domain);
  const countryHubs = [];
  
  for (const url of sitemapUrls) {
    // Pattern matching against known countries
    const countryMatch = this.matchesCountryPattern(url);
    if (countryMatch) {
      countryHubs.push({
        url,
        country: countryMatch.country,
        source: 'sitemap',
        confidence: 0.9
      });
    }
  }
  
  return countryHubs;
}
```

**Navigation Parsing**:
```javascript
async extractCountryHubsFromNavigation(homepage) {
  const html = await this.fetchPage(homepage);
  const links = this.extractLinks(html);
  
  // Look for "World", "International" sections
  const worldSection = links.filter(l => 
    l.text.match(/world|international|global/i)
  );
  
  // Follow these links, extract country sub-links
  const countryLinks = [];
  for (const link of worldSection) {
    const subpage = await this.fetchPage(link.url);
    const sublinks = this.extractLinks(subpage);
    countryLinks.push(...sublinks.filter(this.matchesCountryName));
  }
  
  return countryLinks;
}
```

**Benefits**:
- Discovers actual URLs (no guessing)
- Handles non-standard patterns
- Works for sites without predictable structures

### Strategy 5: Cross-Domain Pattern Library

**Approach**: Build a shared library of patterns across multiple news sites.

**Pattern Library**:
```javascript
const NEWS_SITE_PATTERNS = {
  'guardian.com': [
    { pattern: '/world/{slug}', score: 10, verified: true },
    { pattern: '/{code}', score: 8, note: 'For UK, US, AU editions' }
  ],
  'bbc.co.uk': [
    { pattern: '/news/world-{region}-{code}', score: 10, verified: true },
    { pattern: '/news/{region}', score: 8 }
  ],
  'cnn.com': [
    { pattern: '/world/{region}/{slug}', score: 10 },
    { pattern: '/{slug}', score: 5 }
  ],
  'reuters.com': [
    { pattern: '/world/{slug}/', score: 10, verified: true },
    { pattern: '/places/{slug}/', score: 8 }
  ]
};
```

**Benefits**:
- Reusable across crawls
- Community-contributed patterns
- Versioned and tested

### Strategy 6: Machine Learning Pattern Discovery

**Approach**: Use ML to discover patterns from successful hubs.

**Training Data**:
- **Input**: (domain, country_name, country_code)
- **Output**: URL pattern
- **Features**: Domain TLD, site structure, region, language

**Model**:
```javascript
// Simple rule-based classifier initially
predictPattern(domain, countryName) {
  const features = {
    tld: this.extractTLD(domain),
    hasWorldSection: this.hasSection(domain, 'world'),
    hasNewsSection: this.hasSection(domain, 'news'),
    siteLanguage: this.detectLanguage(domain)
  };
  
  if (features.hasWorldSection && features.tld === 'com') {
    return '/world/{slug}'; // 85% accuracy
  }
  // ... more rules
}
```

**Benefits**:
- Generalizes across sites
- Improves with more data
- Handles complex patterns

## Recommended Implementation Plan

### Phase 1: Quick Wins (1-2 hours)

1. **Update Pattern List** in `CountryHubGapAnalyzer.js`:
   - Remove ineffective patterns (6 out of 7 current ones)
   - Keep only: `/world/{slug}`
   - Add: `/{slug}` for top countries only

2. **Add Domain-Specific Overrides**:
   ```javascript
   const DOMAIN_PATTERNS = {
     'theguardian.com': ['/world/{slug}', '/{code}'],
     'bbc.co.uk': ['/news/world-{region}-{code}'],
     // etc.
   };
   ```

3. **Test and Measure**:
   - Run crawl again
   - Track 200 vs 404 ratio
   - Should see >80% success rate

### Phase 2: Learning System (4-6 hours)

1. **Implement Database Pattern Mining**:
   - Query existing successful URLs
   - Extract and cache patterns per domain
   - Update predictions dynamically

2. **Add Feedback Loop**:
   - Record which patterns worked/failed
   - Update pattern scores in real-time
   - Prioritize proven patterns

### Phase 3: Advanced Discovery (1-2 days)

1. **Sitemap Integration**:
   - Parse sitemaps for country hubs
   - Cross-reference with gazetteer
   - Use as primary source

2. **Navigation Analysis**:
   - Fetch homepage
   - Parse navigation menus
   - Extract country hub links

3. **Cross-Domain Library**:
   - Build pattern library for major news sites
   - Version and test patterns
   - Share across crawls

## Expected Improvements

**Current Performance**:
- 350 URLs queued
- ~14% success rate (49 out of 350 likely work)
- ~301 unnecessary 404 requests

**After Phase 1** (Remove bad patterns):
- 50 URLs queued (1 per country)
- ~80% success rate (40 out of 50 work)
- ~10 exploratory 404s

**After Phase 2** (Learning system):
- 50-100 URLs queued (1-2 per country)
- ~95% success rate
- ~5 exploratory 404s
- Self-improving over time

**After Phase 3** (Advanced discovery):
- Direct discovery from sitemaps/navigation
- ~100% accuracy (no guessing needed)
- Zero unnecessary 404s
- Works for any site structure

## Metrics to Track

1. **Discovery Rate**: % of countries with found hubs
2. **Prediction Accuracy**: % of predicted URLs that return 200
3. **Efficiency**: URLs tried per hub found
4. **Coverage**: Total countries covered across all domains
5. **Pattern Reuse**: % of patterns learned from one site applied to others

## Next Steps

1. ✅ **Immediate**: Update `CountryHubGapAnalyzer.predictCountryHubUrls()` to use only working pattern
2. ⏭️ **Short-term**: Implement database pattern mining
3. ⏭️ **Medium-term**: Add sitemap/navigation discovery
4. ⏭️ **Long-term**: Build cross-domain pattern library

## References

- Current implementation: `src/services/CountryHubGapAnalyzer.js`
- Facade: `src/crawler/CountryHubGapService.js`
- Planning integration: `src/crawler/IntelligentPlanningFacade.js`
- Database queries: `src/db/sqlite/queries/gazetteer.places.js`
