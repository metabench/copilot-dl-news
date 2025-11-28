# Working Notes - URL Classification Improvement

## Session: 2025-11-27

### Context

The user identified a fundamental issue with the classification system:
1. Classifications currently only exist after content is fetched
2. URLs discovered but not yet fetched have no classification
3. The system can't distinguish between URL-only predictions and content-verified classifications
4. Pattern matching from similar verified URLs could improve predictions

### What Was Created

#### 1. Design Document (`PLAN.md`)
- Comprehensive analysis of current system
- Proposed database schema changes
- New service architecture
- Implementation phases

#### 2. Migration Script (`tools/migrations/add-url-classification-tables.js`)
Three new tables:
- `url_classifications` - Stores predictions for unfetched URLs
- `url_classification_patterns` - Learned patterns from verified data
- `domain_classification_profiles` - Per-domain classification behaviors

**Status: ✅ APPLIED** - Migration ran successfully.

#### 3. UrlClassificationService (`src/services/UrlClassificationService.js`)
Predicts classifications using multiple strategies:
1. **Learned patterns** (highest confidence) - Regex patterns learned from verified URLs
2. **Similar URL matching** - Find URLs with same structure but different slugs
3. **Domain profile matching** - Domain-specific patterns
4. **URL signals** (lowest confidence) - Date paths, section keywords, etc.

Key methods:
- `predictClassification(url)` - Main prediction method
- `storePrediction(urlId, prediction)` - Persist predictions
- `verifyPrediction(urlId, actualClassification)` - Update after fetch
- `_matchLearnedPattern()` - Check against learned patterns
- `_findSimilarVerifiedUrl()` - Find structurally similar verified URLs

**Status: ✅ COMPLETE** - Service implemented and tested.

#### 4. UrlPatternLearningService (`src/services/UrlPatternLearningService.js`)
Learns URL patterns from verified content classifications:
- `learnPatternsFromDomain(domain)` - Analyze a domain's URLs
- `learnFromAllDomains(minUrls)` - Batch learning
- `_extractPattern(pathname)` - Convert pathname to regex
- `_buildDomainProfile(domain, urls)` - Build domain behavior profile

Pattern extraction logic:
- `2024` → `\d{4}` (year)
- `11` → `\d{1,2}` (month/day)
- `my-article-headline-slug` → `[a-z0-9-]+` (slug)
- `a1b2c3d4` → `[a-f0-9]+` (hash)
- `news` → `news` (literal section)

**Status: ✅ COMPLETE** - Service implemented and tested.

### Pattern Learning Results

Initial learning from existing verified URLs completed:

```
📊 Learning Results:
   Domains processed: 2
   Total patterns learned: 1811

🏆 Top domains by patterns learned:
   1. www.theguardian.com: 1796 patterns (39667 URLs)
   2. www.bbc.com: 15 patterns (879 URLs)

📈 Final Statistics:
   Total patterns: 1811
   Domains with patterns: 2
   Average patterns/domain: 905.50
   Average accuracy: 1.000
   Domain profiles: 2
```

### Classification Prediction Tests

Test results show the system working correctly:

| URL | Classification | Confidence | Source |
|-----|---------------|------------|--------|
| `/world/2025/dec/01/some-news-story` | article | 95% | learned_pattern |
| `/sport/2024/nov/15/match-report` | article | 95% | learned_pattern |
| `/us-news/2025/jan/20/inauguration` | article | 95% | learned_pattern |
| `example.com/news/2025/12/01/story` | article | 45% | url_signals |
| `/search?q=test` | other | 60% | url_signals |

### Integration Points Identified

1. **URL Discovery** - When a new URL is discovered:
   ```javascript
   const prediction = urlClassificationService.predictClassification(url);
   if (prediction) {
     urlClassificationService.storePrediction(urlId, prediction);
   }
   ```

2. **Content Classification** - After ArticleProcessor classifies content:
   ```javascript
   urlClassificationService.verifyPrediction(urlId, actualClassification);
   ```

3. **Queue Prioritization** - Use prediction confidence to prioritize:
   ```javascript
   const prediction = urlClassificationService.getPrediction(urlId);
   const priority = prediction?.confidence || 0.5;
   ```

### Files Affected by This Session

Created:
- `docs/sessions/2025-11-27-url-classification-improvement/PLAN.md` ✅
- `docs/sessions/2025-11-27-url-classification-improvement/WORKING_NOTES.md` ✅
- `docs/sessions/2025-11-27-url-classification-improvement/improved-ingestion-system.svg` ✅
- `tools/migrations/add-url-classification-tables.js` ✅
- `tools/run-pattern-learning.js` ✅
- `src/services/UrlClassificationService.js` ✅
- `src/services/UrlPatternLearningService.js` ✅

Not yet modified (pending integration):
- `src/crawler/PageExecutionService.js` - Hook into URL discovery
- `src/crawler/ArticleProcessor.js` - Hook into content classification verification
- Data Explorer UI - Show prediction status

### Remaining Work

1. **Crawler Integration** (Next priority)
   - Hook `UrlClassificationService` into `PageExecutionService`
   - Hook verification into `ArticleProcessor`
   
2. **UI Integration**
   - Add predicted classification column to URL lists
   - Add confidence badges
   - Add filter for "predicted vs verified"

3. **Future Enhancements**
   - Periodic pattern re-learning
   - Pattern accuracy degradation tracking
   - Cross-domain pattern transfer

### Key Insights

1. **Structural similarity is strong** - URLs like `/news/2024/11/27/headline-one` and `/news/2024/11/26/headline-two` should have same classification

2. **Domain-specific patterns** - Each domain has its own URL conventions. BBC, Guardian, NYT all structure URLs differently.

3. **Confidence cascading** - Best to worst: learned patterns > similar URLs > domain profile > URL signals

4. **Verification feedback loop** - Every fetch improves future predictions by updating pattern accuracy

5. **Pattern anchoring matters** - Patterns must end with `$` to avoid false positives (e.g., `/world$` shouldn't match `/world/2024/...`)
