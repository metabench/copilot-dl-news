# Analysis Problems Investigation: Guardian /world URL

## Summary of Issues Found

The analysis for `https://www.theguardian.com/world` has **5 critical problems** that reveal underlying architectural issues with how the system classifies pages and extracts link data.

---

## Issue #1: Wrong Classification - Article vs Navigation Hub

**Problem**: Page classified as `"article"` when it's clearly a **navigation hub/listing page**

**Root Cause**: `buildAnalysis()` in `src/analysis/page-analyzer.js` determines classification based solely on whether `articleRow.text` exists:

```javascript
if (articleRow && articleRow.text) {
  base.kind = 'article';  // ← Sets classification to 'article' if text exists
  // ...
} else if (fetchRow) {
  base.kind = ['article', 'nav'].includes(fetchRow.classification) ? fetchRow.classification : 'minimal';
}
```

**Why This Is Wrong**: 
- The Guardian's `/world` page has extractable body text (920 words)
- But this is **aggregated summaries** from multiple articles, NOT a single article
- The extraction happens via Readability → JSDOM, which treats the page body as "article content"
- No logic checks if the page is actually a **collection/hub** with multiple article links

**Evidence**: 
- analysis.kind = "article"
- analysis.meta.method = "readability+heuristics@v1"
- analysis.meta.articleXPath = "/html/body" (too broad, matches the entire page wrapper)
- Extracted text is 920 words of summary content, not a cohesive article

---

## Issue #2: Zero Article Links

**Problem**: Reports `"Article Links: 0"` but a news hub should list multiple article links

**Root Cause**: The columns `nav_links_count` and `article_links_count` are in `content_analysis` table, not `http_responses`:

```
Database schema mismatch:
- http_responses columns: id, url_id, request_started_at, fetched_at, http_status, content_type, ...
  (NO nav_links_count, NO article_links_count)

- content_analysis columns: id, content_id, analysis_version, classification, title, ..., 
  nav_links_count, article_links_count, analysis_json, ...

- fetches table (legacy): has nav_links_count, article_links_count
```

**Why This Is Wrong**:
- `show-analysis.js` queries `http_responses` for these columns:
  ```sql
  SELECT ... hr.nav_links_count, hr.article_links_count FROM http_responses hr ...
  ```
- This will fail silently (or show NULL) because the columns don't exist there
- The actual data IS in `content_analysis` table, but display code doesn't query it

**Evidence**: When querying correctly:
```javascript
SELECT nav_links_count, article_links_count FROM content_analysis 
WHERE url = 'https://www.theguardian.com/world'
```
Returns `null, null` - meaning the values were NEVER POPULATED during analysis.

---

## Issue #3: Zero Navigation Links

**Problem**: Reports `"Navigation Links: 0"` 

**Root Cause**: Same as Issue #2 - the link extraction code either:
1. Never runs for this page (because it's classified as "article")
2. OR runs but doesn't populate the `nav_links_count` field

**Where Should This Be Calculated?**

Looking through the codebase, link extraction should happen in:
- `detectPlaceHub()` in `src/tools/placeHubDetector.js` - extracts `navLinksCount` and `articleLinksCount`
- BUT this is only called if the page is a **place hub candidate**

The flow is:
```
analyzePage() 
  ↓
buildAnalysis() sets kind='article'
  ↓
detectPlaceHub() called with article classification
  ↓
detectPlaceHub() likely skips link extraction if classification != 'nav'/'hub'
  ↓
navLinksCount and articleLinksCount never populated
```

---

## Issue #4: Overly Broad Article XPath

**Problem**: `articleXPath = "/html/body"` is the entire page, not the article content

**Root Cause**: The XPath learning system doesn't exist or didn't learn a pattern for this domain:

```javascript
if (xpathService) {
  // Try to extract with learned XPath
  extractedText = xpathService.extractTextWithXPath(url, html);
  
  if (!extractedText && !xpathService.hasXPathForDomain(domain)) {
    // Try to LEARN a new XPath
    const learnedPattern = await xpathService.learnXPathFromHtml(url, html);
  }
}

// If all fails, use Readability (which gives broad /html/body)
if (!extractedText) {
  const readable = new Readability(dom.window.document).parse();
  if (readable && readable.textContent) {
    extractedText = readable.textContent.trim();
    extractionMethod = 'readability';
  }
}
```

**Why**: For `theguardian.com`, either:
- No domain-specific XPath pattern exists
- XPath learning didn't run or failed
- Readability fallback returned the body content directly

---

## Issue #5: Place Extraction Detecting Random Countries

**Problem**: Analysis extracted 150+ place mentions including spam/noise:
- "Tonga" appears 40+ times (likely in navigational elements)
- "Andorra" appears 15+ times
- "Osh" (Kyrgyzstan region) appears multiple times

**Root Cause**: The place extraction runs on ALL extracted text without distinguishing:
1. Article headline/body
2. Navigation elements
3. Boilerplate/footer text

When Readability extracts `/html/body`, it includes:
- Article text (valid)
- Navigation menus (false positives)
- Related articles section (false positives)
- Footer elements (false positives)

The gazetteer matcher is too greedy - it finds ANY place name in the text, even in link text or metadata.

---

## Architectural Problems Revealed

1.  **Classification Logic Is Broken**
    *   Uses presence of text as proxy for "article" classification
    *   Doesn't distinguish articles from hubs/collections
    *   Should use heuristics like: link density, schema markup, page structure

2.  **Link Extraction Never Runs for Articles**
    *   Link counting logic is in `detectPlaceHub()`
    *   But `detectPlaceHub()` may be skipped if page classified as "article"
    *   Need separate link extraction for all page types

3.  **XPath Extraction Not Learning**
    *   Guardian is a major site but has no learned XPath patterns
    *   XPath learning may be failing silently
    *   Or learning system isn't being called for hub pages

4.  **Place Extraction Too Greedy**
    *   Includes boilerplate text in analysis
    *   No content segmentation (body vs nav vs footer)
    *   Should filter by relevance before extracting places

5.  **Database Schema Confusion**
    *   Link counts exist in both `content_analysis` AND legacy `fetches` table
    *   But display code queries wrong table
    *   Schema migration incomplete

---

## Deeper Architectural Flaw: Conflicting Classification Systems

The root of the misclassification is an architectural flaw where **two separate and conflicting classification systems exist**, and the simpler one is overriding the more intelligent one.

1.  **Simplistic Classification (The Problem):** In `src/analysis/page-analyzer.js`, the `buildAnalysis` function prematurely classifies a page as an `"article"` simply if any text is extracted (e.g., by Readability). This is a flawed heuristic, as hub pages also contain text.

    ```javascript
    // src/analysis/page-analyzer.js -> buildAnalysis()
    if (articleRow && articleRow.text) {
      base.kind = 'article'; // <-- This is the core problem.
    }
    ```

2.  **Intelligent Classification (The Unused Solution):** In `src/analysis/articleDetection.js`, there is a much more sophisticated function, `evaluateArticleCandidate`. This function calculates a score based on multiple signals:
    *   Word count
    *   Link density
    *   Schema.org metadata
    *   URL patterns
    *   Navigation/article link counts

This `evaluateArticleCandidate` function is designed to correctly distinguish between articles and navigation hubs, but its result is not being used to set the final `classification` stored in the database. The simplistic logic in `buildAnalysis` runs first and sets the wrong value.

**Conclusion:**

The analysis process is flawed. It should first gather all available signals (text content, link counts, schema data) and *then* run the `evaluateArticleCandidate` function to determine the final classification. Instead, it makes a premature decision based on a single, unreliable signal (the presence of text) and stores that incorrect classification.

This architectural issue is the primary reason the Guardian `/world` page is misidentified, which in turn causes the incorrect link extraction and place detection behavior. Fixing this would resolve the majority of the problems found.

---

## How to Fix

### Quick Fix (Display Layer)
Fix `show-analysis.js` to query `content_analysis` table for link counts:
```javascript
SELECT ca.nav_links_count, ca.article_links_count 
FROM content_analysis ca
```

### Real Fixes (Logic Layer)

1. **Improve Classification**
   - Check for link density (hubs have many links)
   - Check for schema markup (articles have Article schema)
   - Check page structure (hubs have collection-like structure)
   - Don't classify as "article" just because text exists

2. **Extract Links for All Pages**
   - Move link extraction out of `detectPlaceHub()` 
   - Always extract article/nav link counts
   - Store in `content_analysis` table regardless of classification

3. **Fix XPath Learning**
   - Debug why `theguardian.com` has no XPath patterns
   - Ensure learning runs for discovery sites
   - Fall back gracefully when learning fails

4. **Improve Place Extraction**
   - Segment content before extraction (body vs boilerplate)
   - Filter out navigation/footer elements
   - Use confidence thresholds to filter noise
   - De-duplicate and score place mentions by context

5. **Fix Display Query**
   - Update `show-analysis.js` to query correct columns
   - Ensure data flows from analysis → storage → display correctly

---

## Test Case

URL: `https://www.theguardian.com/world`

**Current (Wrong)**:
- Classification: article ❌
- Article Links: 0 ❌
- Navigation Links: 0 ❌
- Article XPath: /html/body ❌
- Places: 150+ (mostly noise) ❌

**Expected (Correct)**:
- Classification: nav/hub ✓
- Article Links: 20-30 (individual stories) ✓
- Navigation Links: 10-15 (section nav) ✓
- Article XPath: (specific article container, not body) ✓
- Places: 5-10 (relevant geo mentions) ✓
