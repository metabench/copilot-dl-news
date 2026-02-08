# Hub Content Analysis and Improvement Workflow

## Overview

This workflow enables AI agents to systematically analyze suspect place and topic hub matches by downloading and examining actual HTML content, identifying logic deficiencies, implementing improvements, and validating changes through targeted CLI testing.

## Workflow Phases

### Phase 1: Content Acquisition and Analysis

#### Step 1.1: Identify Suspect Hubs
**Objective**: Select URLs that may be incorrectly classified or have low confidence scores.

**CLI Commands**:
```bash
# Get hubs with validation issues
node scripts/adhoc/analyze-hub-quality.js

# Query specific suspect hubs from database
node tools/db-query.js "SELECT url, place_slug, place_kind, title FROM place_hubs WHERE title IS NULL OR url LIKE '%/live/%' OR url LIKE '%/interactive/%' LIMIT 10"

# Check recent validation failures
node tools/db-query.js "SELECT * FROM hub_validation_cache WHERE confidence < 0.5 ORDER BY validated_at DESC LIMIT 5"
```

#### Step 1.2: Download HTML Content
**Objective**: Fetch and cache actual HTML content for analysis.

**Implementation**:
```javascript
// In hub-analysis-workflow.js
async function downloadHubContent(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; HubAnalysisBot/1.0)'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const html = await response.text();
  const title = extractTitle(html);

  return {
    url,
    html,
    title,
    fetchedAt: new Date().toISOString(),
    statusCode: response.status
  };
}
```

**CLI Usage**:
```bash
# Download content for specific suspect URLs
node hub-analysis-workflow.js download --urls "https://example.com/suspect-hub1,https://example.com/suspect-hub2"

# Download content for hubs with low confidence
node hub-analysis-workflow.js download --low-confidence --limit 5
```

#### Step 1.3: Content Structure Analysis
**Objective**: Analyze HTML structure to understand hub vs article patterns.

**Analysis Categories**:

**Navigation Patterns**:
- Breadcrumb navigation (`<nav class="breadcrumb">`)
- Sidebar navigation menus
- Footer category links
- Header dropdown menus

**Content Structure**:
- Multiple H2/H3 sections (hub indicator)
- Single H1 with byline (article indicator)
- Category/archive listings
- Interactive elements (forms, comments)

**Temporal Patterns**:
- Date in URL path (`/2025/oct/14/`)
- Publish date metadata
- "Latest updates" sections
- Archive organization

**Link Analysis**:
- Internal navigation links (>50% of total links)
- Article links vs category links
- Anchor text relevance
- Link distribution patterns

### Phase 2: Logic Deficiency Identification

#### Step 2.1: Pattern Recognition
**Objective**: Identify what makes content a hub vs article.

**Hub Characteristics**:
- **Structural**: Multiple navigation sections, category organization
- **Temporal**: Timeless content, no specific publish dates in primary content
- **Purpose**: Aggregation point for related content, not individual story
- **Links**: High proportion of internal navigation/category links

**Article Characteristics**:
- **Structural**: Single story with byline, publish date
- **Temporal**: Specific publication timestamp
- **Purpose**: Individual news story or feature
- **Links**: Scattered related story links, social sharing

**Topic Hub Variants**:
- **Place Topic Hubs**: `/world/france/climate-change` - combines place + topic
- **Category Hubs**: `/sport/football` - topic-specific aggregation
- **Regional Hubs**: `/asia/china` - geographic topic focus

#### Step 2.2: Current Logic Gap Analysis
**Objective**: Map current validation failures to specific logic deficiencies.

**Common Deficiencies**:

1. **Link Count Threshold Too Low**: Interactive articles with many related links pass validation
2. **Title Matching Too Broad**: Place names in titles don't guarantee hub content
3. **Date Pattern Detection Insufficient**: Some hubs have date-like patterns in URLs
4. **No Semantic Content Analysis**: Can't distinguish navigation from content links
5. **Domain-Specific Logic**: Guardian patterns don't apply to other sites

**Gap Analysis Template**:
```javascript
function analyzeValidationGap(content, currentResult, expectedResult) {
  return {
    url: content.url,
    currentValidation: currentResult,
    expectedValidation: expectedResult,
    gaps: {
      linkAnalysis: analyzeLinkGap(content),
      structureAnalysis: analyzeStructureGap(content),
      temporalAnalysis: analyzeTemporalGap(content),
      semanticAnalysis: analyzeSemanticGap(content)
    },
    improvementSuggestions: generateSuggestions(content, currentResult, expectedResult)
  };
}
```

### Phase 3: Logic Improvement Implementation

#### Step 3.1: Signal-Based Validation Framework
**Objective**: Replace binary validation with multi-signal confidence scoring.

**Signal Definition**:
```javascript
const VALIDATION_SIGNALS = {
  titleRelevance: {
    weight: 0.25,
    analyzer: analyzeTitleRelevance,
    description: 'How well title matches expected place/topic'
  },
  linkStructure: {
    weight: 0.20,
    analyzer: analyzeLinkStructure,
    description: 'Navigation vs content link distribution'
  },
  contentStructure: {
    weight: 0.20,
    analyzer: analyzeContentStructure,
    description: 'Hub-like organization vs article structure'
  },
  temporalPatterns: {
    weight: 0.15,
    analyzer: analyzeTemporalPatterns,
    description: 'Timeless hub vs time-specific article'
  },
  navigationQuality: {
    weight: 0.10,
    analyzer: analyzeNavigationQuality,
    description: 'Quality and organization of navigation elements'
  },
  domainPatterns: {
    weight: 0.10,
    analyzer: analyzeDomainPatterns,
    description: 'Domain-specific hub pattern recognition'
  }
};
```

#### Step 3.2: Domain-Agnostic Pattern Learning
**Objective**: Learn and apply patterns across domains without hardcoding.

**Pattern Learning System**:
```javascript
class DomainPatternLearner {
  constructor() {
    this.patterns = new Map(); // domain -> patterns
    this.successPatterns = new Map(); // pattern -> success rate
  }

  learnFromValidation(url, content, isValid, confidence) {
    const domain = new URL(url).hostname;
    const patterns = this.extractPatterns(url, content);

    patterns.forEach(pattern => {
      const key = `${domain}:${pattern.type}:${pattern.value}`;
      const current = this.successPatterns.get(key) || { successes: 0, total: 0 };

      current.total++;
      if (isValid && confidence > 0.7) current.successes++;

      this.successPatterns.set(key, current);
    });
  }

  getReliablePatterns(domain, minSuccessRate = 0.8, minSamples = 5) {
    return Array.from(this.successPatterns.entries())
      .filter(([key, stats]) =>
        key.startsWith(`${domain}:`) &&
        stats.total >= minSamples &&
        (stats.successes / stats.total) >= minSuccessRate
      )
      .map(([key, stats]) => ({
        pattern: key.split(':').slice(1).join(':'),
        successRate: stats.successes / stats.total,
        confidence: Math.min(stats.total / 20, 1.0) // More samples = higher confidence
      }));
  }
}
```

#### Step 3.3: Content Structure Analyzers
**Objective**: Implement sophisticated content analysis beyond simple regex.

**Navigation Pattern Detection**:
```javascript
function analyzeNavigationPatterns(html) {
  const $ = cheerio.load(html);

  const navigationScore = {
    breadcrumbNav: $('nav.breadcrumb, .breadcrumb, [class*="breadcrumb"]').length > 0 ? 1 : 0,
    sidebarNav: $('aside nav, .sidebar nav, [class*="sidebar"] nav').length > 0 ? 1 : 0,
    headerNav: $('header nav, nav[class*="main"], [class*="nav"][class*="main"]').length > 0 ? 1 : 0,
    footerNav: $('footer nav, nav[class*="footer"]').length > 0 ? 1 : 0,
    categorySections: $('section[class*="categor"], [class*="section"][class*="cat"]').length,
    archiveLinks: $('a[href*="/archive"], a[href*="/category"], a[href*="/topic"]').length
  };

  const totalScore = Object.values(navigationScore).reduce((sum, val) => sum + val, 0);
  return {
    score: Math.min(totalScore / 6, 1.0), // Normalize to 0-1
    indicators: navigationScore,
    strength: totalScore > 3 ? 'strong' : totalScore > 1 ? 'moderate' : 'weak'
  };
}
```

**Content Structure Classification**:
```javascript
function classifyContentStructure(html) {
  const $ = cheerio.load(html);

  // Article indicators
  const articleIndicators = {
    byline: $('[class*="byline"], [class*="author"], .author').length > 0,
    publishDate: $('[class*="date"], [class*="published"], time[datetime]').length > 0,
    socialSharing: $('[class*="share"], [class*="social"], .social-share').length > 0,
    comments: $('[class*="comment"], #comments, .comments').length > 0,
    singleH1: $('h1').length === 1,
    readingTime: $('[class*="reading"], [class*="time"]').length > 0
  };

  // Hub indicators
  const hubIndicators = {
    multipleH2: $('h2').length > 2,
    categoryList: $('ul[class*="category"], [class*="list"][class*="cat"]').length > 0,
    navigationSections: $('section nav, nav section').length > 0,
    archiveStructure: $('[class*="archive"], [class*="listing"]').length > 0,
    subNavigation: $('nav nav, [class*="subnav"]').length > 0,
    topicClusters: $('[class*="topic"], [class*="cluster"]').length > 0
  };

  const articleScore = Object.values(articleIndicators).filter(Boolean).length;
  const hubScore = Object.values(hubIndicators).filter(Boolean).length;

  if (hubScore > articleScore + 1) return { type: 'hub', confidence: 0.8 };
  if (articleScore > hubScore + 1) return { type: 'article', confidence: 0.8 };
  return { type: 'unclear', confidence: 0.5 };
}
```

### Phase 4: Targeted Testing and Validation

#### Step 4.1: Test Case Design
**Objective**: Create specific test cases that validate improvements.

**Test Case Categories**:

**True Positive Hubs**:
- Country hubs: `/world/france`, `/news/world/europe/germany`
- City hubs: `/cities/london`, `/news/cities/new-york`
- Topic hubs: `/sport/football`, `/business/technology`
- Place-topic hubs: `/world/asia/china/climate-change`

**False Positive Articles**:
- Individual news articles with place names in title
- Interactive features with many links
- Search results pages
- Archive pages with date patterns

**Edge Cases**:
- Multi-part articles
- Live blog updates
- Photo galleries
- Video pages

#### Step 4.2: CLI Testing Commands
**Objective**: Run specific tests to validate improvements.

**Validation Testing**:
```bash
# Test specific URLs with new validation logic
node hub-analysis-workflow.js validate --urls "https://example.com/hub1,https://example.com/article1" --detailed

# Compare old vs new validation results
node hub-analysis-workflow.js compare-validation --urls-file suspect-urls.txt

# Test confidence scoring on known good/bad examples
node hub-analysis-workflow.js test-confidence --good-urls good-hubs.txt --bad-urls bad-articles.txt

# Analyze validation accuracy by category
node hub-analysis-workflow.js analyze-accuracy --category hubs --min-confidence 0.7
```

**Pattern Learning Testing**:
```bash
# Test pattern learning from successful validations
node hub-analysis-workflow.js learn-patterns --domain example.com --min-success-rate 0.8

# Apply learned patterns to new URLs
node hub-analysis-workflow.js apply-patterns --domain example.com --urls new-urls.txt

# Validate pattern effectiveness
node hub-analysis-workflow.js validate-patterns --domain example.com --test-urls validation-set.txt
```

#### Step 4.3: Performance and Accuracy Metrics
**Objective**: Measure improvement effectiveness.

**Metrics to Track**:
```javascript
const VALIDATION_METRICS = {
  precision: 'TP / (TP + FP)',           // % of predicted hubs that are actually hubs
  recall: 'TP / (TP + FN)',              // % of actual hubs correctly identified
  f1Score: '2 * (precision * recall) / (precision + recall)',
  confidenceAccuracy: 'correlation between confidence and actual validity',
  domainAdaptation: 'performance improvement on new domains',
  patternLearning: 'reduction in false positives through learned patterns'
};
```

**Reporting Commands**:
```bash
# Generate validation performance report
node hub-analysis-workflow.js report --metrics precision,recall,f1 --time-range 7d

# Compare before/after improvement metrics
node hub-analysis-workflow.js compare-improvements --baseline-date 2025-10-20

# Analyze domain-specific performance
node hub-analysis-workflow.js domain-analysis --domains "bbc.com,cnn.com,nytimes.com"
```

### Phase 5: Integration and Deployment

#### Step 5.1: HubValidator Integration
**Objective**: Integrate improved logic into existing HubValidator.

**Backward Compatibility**:
```javascript
class EnhancedHubValidator extends HubValidator {
  // Override validateHubContent with new logic
  async validateHubContent(url, placeName) {
    // Try new enhanced validation first
    const enhanced = await this.enhancedValidateHubContent(url, placeName);

    // Fall back to original logic if needed
    if (enhanced.confidence < 0.3) {
      const original = await super.validateHubContent(url, placeName);
      return {
        ...original,
        confidence: original.isValid ? 0.5 : 0.1, // Low confidence fallback
        method: 'fallback'
      };
    }

    return enhanced;
  }

  async enhancedValidateHubContent(url, placeName) {
    // New multi-signal validation logic
    const content = await this.downloadContent(url);
    const signals = await this.analyzeAllSignals(content, placeName);
    const confidence = this.calculateConfidence(signals);

    return {
      isValid: confidence >= 0.6,
      confidence,
      signals,
      reason: this.generateReason(signals, confidence),
      method: 'enhanced'
    };
  }
}
```

#### Step 5.2: Pattern Learning Integration
**Objective**: Make pattern learning part of the regular validation process.

**Automated Learning**:
```javascript
class AdaptiveHubValidator extends EnhancedHubValidator {
  constructor(db) {
    super(db);
    this.patternLearner = new DomainPatternLearner();
    this.loadExistingPatterns();
  }

  async validateHubContent(url, placeName) {
    const result = await super.validateHubContent(url, placeName);

    // Learn from validation result
    if (result.confidence > 0.7) {
      this.patternLearner.learnFromValidation(url, result.content, result.isValid, result.confidence);
    }

    return result;
  }

  async loadExistingPatterns() {
    // Load previously learned patterns from database
    const patterns = this.db.prepare('SELECT * FROM learned_patterns').all();
    patterns.forEach(p => this.patternLearner.addPattern(p));
  }
}
```

#### Step 5.3: guess-place-hubs.js Integration
**Objective**: Update the hub discovery tool to use enhanced validation.

**Integration Points**:
```javascript
// In guess-place-hubs.js
const validation = await hubValidator.validateHubContent(result.finalUrl, place.name);

// Enhanced validation result handling
if (!validation.isValid) {
  // Still record but with low confidence
  if (validation.confidence > 0.3) {
    recordDecision({
      stage: 'VALIDATION',
      status: 'low-confidence',
      url: candidateUrl,
      outcome: 'marginal-hub',
      message: `Low confidence hub (${(validation.confidence * 100).toFixed(1)}%): ${validation.reason}`
    });

    // Still insert but mark as needing review
    insertHubStmt.run(/* ... */, 'needs-review', validation.confidence);
  } else {
    // Reject as before
    recordDecision({
      stage: 'VALIDATION',
      status: null,
      url: candidateUrl,
      outcome: 'invalid-content',
      message: `Content validation failed: ${validation.reason}`
    });
  }
}
```

### Workflow Execution Checklist

**Pre-Analysis**:
- [ ] Run `scripts/adhoc/analyze-hub-quality.js` to identify suspect hubs
- [ ] Select 5-10 diverse suspect URLs for analysis
- [ ] Ensure test URLs cover different hub types (country, city, topic, place-topic)

**Content Analysis**:
- [ ] Download HTML for selected URLs
- [ ] Analyze content structure manually and programmatically
- [ ] Identify patterns that distinguish hubs from articles
- [ ] Document current logic failures and why they occur

**Logic Improvement**:
- [ ] Implement enhanced signal-based validation
- [ ] Add domain-agnostic pattern learning
- [ ] Create sophisticated content structure analysis
- [ ] Test improvements on known good/bad examples

**Validation Testing**:
- [ ] Run targeted CLI tests on improvement validation
- [ ] Compare old vs new validation results
- [ ] Measure precision/recall improvements
- [ ] Test pattern learning effectiveness

**Integration**:
- [ ] Update HubValidator with enhanced logic
- [ ] Integrate pattern learning into validation process
- [ ] Update guess-place-hubs.js to use confidence scoring
- [ ] Test end-to-end hub discovery improvements

This workflow ensures AI agents can systematically improve hub validation through direct content analysis, pattern learning, and targeted testing, resulting in more accurate and domain-agnostic hub discovery.