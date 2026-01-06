# Experiment 005: Analysis Performance Investigation

## Objective
Investigate why some analysis attempts take a long time (e.g., >20s) and identify optimization opportunities.

## Target
- **URL**: `https://www.theguardian.com/news/gallery/2026/jan/02/snow-gaza-wolf-supermoon-photos-of-the-day-friday`
- **Size**: 420.9 KB (HTML)
- **Observed Time**: ~29s (timeout)

## Findings

1. **JSDOM Bottleneck**: Creating a JSDOM instance for this 420KB HTML takes **~10-11 seconds**.
   - Verified via `measure_jsdom.js`.
   - This is the baseline cost for any analysis requiring DOM parsing (Readability or XPath learning).

2. **Double Parsing**: The `analyzePage` pipeline was parsing the HTML twice:
   - **Pass 1**: `ArticleXPathService.learnXPathFromHtml` (uses JSDOM internally) -> ~10s.
   - **Pass 2**: `Readability` fallback (uses `createJsdom`) -> ~11s.
   - **Total**: ~21-22s + overhead = ~29s.

3. **XPath Learning Failure**: The target page is a gallery with low word count (15 words) and high link count (180). `ArticleXPathAnalyzer` fails to identify a valid article candidate, returning `null`. This forces the fallback to Readability.

## Optimization

Refactored `src/analysis/page-analyzer.js` to reuse the JSDOM instance:
- If `xpathService` needs to learn, it creates a JSDOM instance.
- `ArticleXPathService` now exposes `learnXPathFromDocument` to accept an existing document.
- If learning fails, the same JSDOM instance is passed to `Readability`.

## Results
- **Before**: ~22s (CPU time) / ~29s (Wall time)
- **After**: ~11s (CPU time)
- **Improvement**: ~50% reduction in execution time for new/difficult domains.

## Scripts
- `profile_url.js`: Profiles the full analysis pipeline for the target URL.
- `measure_jsdom.js`: Measures raw JSDOM creation time.
- `debug_xpath.js`: Debugs the XPath learning process.
