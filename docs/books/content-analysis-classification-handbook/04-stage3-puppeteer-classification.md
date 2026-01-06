# Chapter 4: Stage 3 Puppeteer Classification

## Overview

Stage 3 uses browser rendering for the most accurate classification. It's the most expensive stage but handles JavaScript-heavy sites and complex DOM.

**File:** [src/classifiers/Stage3PuppeteerClassifier.js](../../../src/classifiers/Stage3PuppeteerClassifier.js)

## When to Use Stage 3

### Criteria for Activation

```javascript
function shouldUsePuppeteer(stage1Result, stage2Result) {
  // Low confidence from earlier stages
  if (Math.max(stage1Result.confidence, stage2Result.confidence) < 0.7) {
    return true;
  }

  // Disagreement between stages
  if (stage1Result.classification !== stage2Result.classification) {
    return true;
  }

  // Known JS-heavy domains
  const jsHeavyDomains = ['medium.com', 'substack.com', 'notion.so'];
  if (jsHeavyDomains.some(d => stage1Result.signals.host.includes(d))) {
    return true;
  }

  return false;
}
```

### Cost-Benefit Analysis

| Factor | Value |
|--------|-------|
| Time per page | 1-5 seconds |
| Memory usage | ~100MB per browser |
| Accuracy boost | +5-15% for JS sites |
| When to skip | High confidence (>0.85) from Stage 1+2 |

## Browser Management

### Initialization

```javascript
async initialize() {
  this.browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920,1080'
    ]
  });
}
```

### Page Pool

```javascript
class PagePool {
  constructor(browser, maxPages = 5) {
    this.browser = browser;
    this.maxPages = maxPages;
    this.available = [];
    this.inUse = new Set();
  }

  async acquire() {
    if (this.available.length > 0) {
      const page = this.available.pop();
      this.inUse.add(page);
      return page;
    }

    if (this.inUse.size < this.maxPages) {
      const page = await this.browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });
      this.inUse.add(page);
      return page;
    }

    // Wait for available page
    return new Promise(resolve => {
      const check = setInterval(() => {
        if (this.available.length > 0) {
          clearInterval(check);
          resolve(this.acquire());
        }
      }, 100);
    });
  }

  release(page) {
    this.inUse.delete(page);
    this.available.push(page);
  }
}
```

## Classification Process

### Main Classification Method

```javascript
async classify(url, options = {}) {
  const {
    timeout = 30000,
    waitUntil = 'domcontentloaded',
    extraWait = 1000
  } = options;

  const page = await this.pagePool.acquire();
  const startTime = Date.now();

  try {
    // Navigate
    await page.goto(url, { waitUntil, timeout });

    // Wait for JS rendering
    await page.waitForTimeout(extraWait);

    // Extract signals
    const signals = await this.extractRenderedSignals(page);
    const html = await page.content();

    // Use Stage 2 on rendered content
    const baseResult = this.stage2Classifier.classify(html, url);

    // Apply Puppeteer-specific boosts
    const confidence = this.adjustConfidence(baseResult.confidence, signals);

    return {
      classification: baseResult.classification,
      confidence,
      source: 'puppeteer',
      signals: { ...baseResult.signals, ...signals },
      renderTimeMs: Date.now() - startTime
    };

  } finally {
    this.pagePool.release(page);
  }
}
```

### Rendered Signal Extraction

```javascript
async extractRenderedSignals(page) {
  return page.evaluate(() => {
    // Visible article detection
    const article = document.querySelector('article, [role="article"], .article');
    const hasVisibleArticle = article && article.offsetHeight > 100;

    // Lazy-loaded content
    const lazyImages = document.querySelectorAll('img[data-src], img[loading="lazy"]').length;
    const loadedImages = document.querySelectorAll('img[src]:not([src=""])').length;

    // Dynamic content
    const dynamicContent = document.querySelectorAll('[data-component], [data-reactroot]').length;

    // Viewport analysis
    const viewportHeight = window.innerHeight;
    const documentHeight = document.body.scrollHeight;
    const scrollRatio = documentHeight / viewportHeight;

    // Visible text
    const visibleText = Array.from(document.querySelectorAll('p'))
      .filter(p => p.offsetHeight > 0)
      .map(p => p.textContent)
      .join(' ');
    const visibleWordCount = visibleText.split(/\s+/).length;

    // Ad detection
    const adElements = document.querySelectorAll('[class*="ad"], [id*="ad"], [data-ad]').length;

    return {
      hasVisibleArticle,
      lazyImages,
      loadedImages,
      dynamicContent,
      scrollRatio,
      visibleWordCount,
      adElements
    };
  });
}
```

### Confidence Adjustment

```javascript
adjustConfidence(baseConfidence, signals) {
  let confidence = baseConfidence;

  // Boost for visible article
  if (signals.hasVisibleArticle) {
    confidence = Math.min(0.99, confidence + 0.10);
  }

  // Boost for high visible word count
  if (signals.visibleWordCount > 300) {
    confidence = Math.min(0.99, confidence + 0.05);
  }

  // Boost for JS-rendered content
  if (signals.dynamicContent > 5) {
    confidence = Math.min(0.99, confidence + 0.05);
  }

  // Penalty for excessive ads
  if (signals.adElements > 10) {
    confidence = Math.max(0.3, confidence - 0.10);
  }

  return confidence;
}
```

## Timeout Tuning

### Adaptive Timeouts

```javascript
function getTimeoutForDomain(host) {
  // Known slow sites
  const slowSites = {
    'medium.com': 45000,
    'substack.com': 40000,
    'notion.so': 50000
  };

  for (const [domain, timeout] of Object.entries(slowSites)) {
    if (host.includes(domain)) return timeout;
  }

  // Default
  return 30000;
}
```

### Wait Strategies

```javascript
async waitForContent(page, options = {}) {
  const { strategy = 'auto', maxWait = 5000 } = options;

  switch (strategy) {
    case 'networkidle':
      await page.waitForNetworkIdle({ timeout: maxWait });
      break;

    case 'selector':
      await page.waitForSelector('article, main, .content', { timeout: maxWait });
      break;

    case 'mutation':
      await page.evaluate((maxWait) => {
        return new Promise(resolve => {
          const observer = new MutationObserver((mutations, obs) => {
            if (document.body.innerText.length > 500) {
              obs.disconnect();
              resolve();
            }
          });
          observer.observe(document.body, { childList: true, subtree: true });
          setTimeout(() => {
            observer.disconnect();
            resolve();
          }, maxWait);
        });
      }, maxWait);
      break;

    case 'auto':
    default:
      // Simple fixed wait
      await page.waitForTimeout(1000);
  }
}
```

## Error Handling

### Timeout Recovery

```javascript
async classifyWithRetry(url, options = {}) {
  const { maxRetries = 2 } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await this.classify(url, {
        ...options,
        timeout: options.timeout * (1 + attempt * 0.5)  // Increase timeout on retry
      });
    } catch (error) {
      if (attempt === maxRetries) {
        return {
          classification: 'unknown',
          confidence: 0.2,
          source: 'puppeteer-failed',
          error: error.message
        };
      }

      // Wait before retry
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}
```

### Resource Cleanup

```javascript
async dispose() {
  // Close all pages
  for (const page of this.pagePool.inUse) {
    try {
      await page.close();
    } catch (e) {}
  }

  for (const page of this.pagePool.available) {
    try {
      await page.close();
    } catch (e) {}
  }

  // Close browser
  if (this.browser) {
    await this.browser.close();
    this.browser = null;
  }
}
```

## Cost Optimization

### Selective Usage

```javascript
function decideStage3Usage(url, stage1, stage2, budget) {
  // Skip if budget exhausted
  if (budget.puppeteerQuota <= 0) {
    return false;
  }

  // Skip if high confidence
  if (stage1.confidence >= 0.9 && stage2.confidence >= 0.9) {
    return false;
  }

  // Use for verification of high-value URLs
  if (isHighValueUrl(url) && stage2.confidence < 0.85) {
    return true;
  }

  // Use for disagreement
  if (stage1.classification !== stage2.classification) {
    return true;
  }

  return false;
}
```

### Resource Limits

```javascript
class Stage3ResourceManager {
  constructor(options = {}) {
    this.maxConcurrent = options.maxConcurrent || 3;
    this.maxPerMinute = options.maxPerMinute || 30;
    this.currentCount = 0;
    this.minuteCount = 0;
  }

  async acquire() {
    while (this.currentCount >= this.maxConcurrent) {
      await new Promise(r => setTimeout(r, 100));
    }

    while (this.minuteCount >= this.maxPerMinute) {
      await new Promise(r => setTimeout(r, 1000));
    }

    this.currentCount++;
    this.minuteCount++;

    return () => {
      this.currentCount--;
    };
  }
}
```

## Result Structure

```javascript
{
  classification: 'article',
  confidence: 0.92,
  source: 'puppeteer',
  signals: {
    // From Stage 2
    wordCount: 1500,
    paragraphs: 15,
    linkDensity: 0.06,
    // From Puppeteer
    hasVisibleArticle: true,
    lazyImages: 5,
    loadedImages: 12,
    dynamicContent: 8,
    visibleWordCount: 1450,
    scrollRatio: 3.5
  },
  renderTimeMs: 2500
}
```

## Next Chapter

Continue to [Chapter 5: Stage Aggregator](./05-stage-aggregator.md) for combining results from all stages.
