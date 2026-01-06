# Chapter 3: Stage 2 Content Classification

## Overview

Stage 2 analyzes HTML structure to classify pages. It extracts content signals like word count, link density, and schema.org markup.

**File:** [src/classifiers/Stage2ContentClassifier.js](../../../src/classifiers/Stage2ContentClassifier.js)

## Signal Extraction

### Content Signals

```javascript
extractSignals(html, url) {
  const $ = cheerio.load(html);

  // Text analysis
  const bodyText = $('body').text();
  const words = bodyText.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;

  // Structure analysis
  const paragraphs = $('p').length;
  const h2Count = $('h2').length;
  const h3Count = $('h3').length;

  // Link analysis
  const allLinks = $('a');
  const linkText = allLinks.text();
  const linkDensity = linkText.length / Math.max(bodyText.length, 1);

  // Navigation analysis
  const navLinks = $('nav a, .nav a, .navigation a, header a').length;

  // Schema.org analysis
  const hasArticleSchema = $('[itemtype*="Article"]').length > 0 ||
                           $('[itemtype*="NewsArticle"]').length > 0;
  const hasArticleBody = $('[itemprop="articleBody"]').length > 0;

  // Main content detection
  const hasMainContent = $('main, article, .content, #content, .article').length > 0;

  return {
    wordCount,
    paragraphs,
    h2Count,
    h3Count,
    linkCount: allLinks.length,
    linkDensity,
    navLinks,
    hasArticleSchema,
    hasArticleBody,
    hasMainContent,
    hasJsonLd: $('script[type="application/ld+json"]').length > 0
  };
}
```

### Signal Thresholds

```javascript
const DEFAULT_THRESHOLDS = {
  // Article indicators
  minArticleWordCount: 180,
  highWordCount: 350,
  minArticleParagraphs: 4,
  maxArticleLinkDensity: 0.20,

  // Navigation indicators
  minNavLinkDensity: 0.35,
  minNavLinks: 50,

  // Hub indicators
  maxHubWordCount: 500,
  minHubLinks: 20
};
```

## Classification Logic

### Article Detection

```javascript
classifyAsArticle(signals) {
  let confidence = 0.5;
  const reasons = [];

  // Word count
  if (signals.wordCount >= this.thresholds.highWordCount) {
    confidence += 0.15;
    reasons.push('high-word-count');
  } else if (signals.wordCount >= this.thresholds.minArticleWordCount) {
    confidence += 0.10;
    reasons.push('sufficient-word-count');
  } else {
    confidence -= 0.20;
    reasons.push('low-word-count');
  }

  // Paragraphs
  if (signals.paragraphs >= this.thresholds.minArticleParagraphs) {
    confidence += 0.10;
    reasons.push('sufficient-paragraphs');
  } else if (signals.paragraphs <= 1) {
    confidence -= 0.15;
    reasons.push('few-paragraphs');
  }

  // Link density
  if (signals.linkDensity <= this.thresholds.maxArticleLinkDensity) {
    confidence += 0.10;
    reasons.push('low-link-density');
  } else if (signals.linkDensity >= 0.35) {
    confidence -= 0.20;
    reasons.push('high-link-density');
  }

  // Schema.org
  if (signals.hasArticleSchema) {
    confidence += 0.15;
    reasons.push('article-schema');
  }
  if (signals.hasArticleBody) {
    confidence += 0.10;
    reasons.push('article-body-schema');
  }

  // Main content
  if (signals.hasMainContent) {
    confidence += 0.05;
    reasons.push('main-content-element');
  }

  return {
    classification: 'article',
    confidence: Math.max(0, Math.min(1, confidence)),
    reasons
  };
}
```

### Navigation Detection

```javascript
classifyAsNav(signals) {
  let confidence = 0.3;
  const reasons = [];

  // High link density
  if (signals.linkDensity >= this.thresholds.minNavLinkDensity) {
    confidence += 0.25;
    reasons.push('high-link-density');
  }

  // Many nav links
  if (signals.navLinks >= this.thresholds.minNavLinks) {
    confidence += 0.20;
    reasons.push('many-nav-links');
  } else if (signals.navLinks >= 100) {
    confidence += 0.30;
    reasons.push('very-many-nav-links');
  }

  // Low word count
  if (signals.wordCount < 200) {
    confidence += 0.10;
    reasons.push('low-word-count');
  }

  // Few paragraphs
  if (signals.paragraphs < 3) {
    confidence += 0.05;
    reasons.push('few-paragraphs');
  }

  return {
    classification: 'nav',
    confidence: Math.max(0, Math.min(1, confidence)),
    reasons
  };
}
```

### Hub Detection

```javascript
classifyAsHub(signals) {
  let confidence = 0.4;
  const reasons = [];

  // Moderate link count
  if (signals.linkCount >= this.thresholds.minHubLinks &&
      signals.linkCount < 100) {
    confidence += 0.15;
    reasons.push('moderate-links');
  }

  // Low word count with links
  if (signals.wordCount < this.thresholds.maxHubWordCount &&
      signals.linkCount > 10) {
    confidence += 0.15;
    reasons.push('low-words-with-links');
  }

  // Has main content but link-heavy
  if (signals.hasMainContent &&
      signals.linkDensity > 0.15 && signals.linkDensity < 0.35) {
    confidence += 0.10;
    reasons.push('main-content-link-heavy');
  }

  return {
    classification: 'hub',
    confidence: Math.max(0, Math.min(1, confidence)),
    reasons
  };
}
```

## Combined Classification

```javascript
classify(html, url) {
  const signals = this.extractSignals(html, url);

  // Get scores for each category
  const articleScore = this.classifyAsArticle(signals);
  const navScore = this.classifyAsNav(signals);
  const hubScore = this.classifyAsHub(signals);

  // Select best match
  const candidates = [articleScore, navScore, hubScore];
  const best = candidates.sort((a, b) => b.confidence - a.confidence)[0];

  // Check if clear winner
  const second = candidates[1];
  if (best.confidence - second.confidence < 0.15) {
    // Close call - reduce confidence
    best.confidence *= 0.9;
    best.reasons.push('close-decision');
  }

  return {
    classification: best.classification,
    confidence: best.confidence,
    reasons: best.reasons,
    signals,
    alternatives: candidates.slice(1)
  };
}
```

## Schema.org Analysis

### JSON-LD Extraction

```javascript
extractJsonLdSignals($) {
  const scripts = $('script[type="application/ld+json"]');
  const signals = { schemaTypes: [], schemaScore: 0 };

  scripts.each((_, script) => {
    try {
      const data = JSON.parse($(script).text());
      const types = Array.isArray(data['@type']) ? data['@type'] : [data['@type']];

      for (const type of types) {
        signals.schemaTypes.push(type);

        // Score based on type
        if (/^(News)?Article$/i.test(type)) signals.schemaScore += 3;
        if (/^BlogPosting$/i.test(type)) signals.schemaScore += 2;
        if (/^WebPage$/i.test(type)) signals.schemaScore += 0.5;
        if (/^CollectionPage$/i.test(type)) signals.schemaScore -= 1;
      }
    } catch (e) {
      // Invalid JSON-LD
    }
  });

  return signals;
}
```

### Microdata Extraction

```javascript
extractMicrodataSignals($) {
  const signals = { hasMicrodata: false, schemaScore: 0 };

  if ($('[itemtype*="Article"]').length > 0) {
    signals.hasMicrodata = true;
    signals.schemaScore += 2;
  }

  if ($('[itemprop="articleBody"]').length > 0) {
    signals.schemaScore += 1.5;
  }

  if ($('[itemprop="headline"]').length > 0) {
    signals.schemaScore += 0.5;
  }

  if ($('[itemprop="datePublished"]').length > 0) {
    signals.schemaScore += 0.5;
  }

  return signals;
}
```

## Voting System Integration

### Combining with URL Signals

```javascript
combineSignals(urlSignals, contentSignals) {
  let articleVotes = 0;
  let navVotes = 0;
  const reasons = [];

  // Link density voting
  if (contentSignals.linkDensity > 0.20 && contentSignals.linkCount > 40) {
    navVotes += 1;
    reasons.push('high-link-density');
  }

  if (contentSignals.linkDensity < 0.08 && contentSignals.paragraphs >= 3) {
    articleVotes += 1;
    reasons.push('low-link-density-with-paragraphs');
  }

  // Link count voting
  if (contentSignals.linkCount > 100) {
    navVotes += 2;
    reasons.push('very-high-link-count');
  }

  // Word count voting
  if (contentSignals.wordCount > 150) {
    articleVotes += 1;
    reasons.push('sufficient-words');
  }

  if (contentSignals.wordCount < 60 && contentSignals.linkCount > 20) {
    navVotes += 1;
    reasons.push('low-words-high-links');
  }

  // Schema voting
  if (contentSignals.schemaScore >= 3) {
    articleVotes += 2;
    reasons.push('strong-article-schema');
  }

  return {
    articleVotes,
    navVotes,
    reasons,
    prediction: articleVotes > navVotes ? 'article' : navVotes > 0 ? 'nav' : 'other'
  };
}
```

## Result Structure

```javascript
{
  classification: 'article',
  confidence: 0.85,
  reasons: [
    'high-word-count',
    'sufficient-paragraphs',
    'low-link-density',
    'article-schema'
  ],
  signals: {
    wordCount: 1250,
    paragraphs: 12,
    h2Count: 3,
    h3Count: 5,
    linkCount: 45,
    linkDensity: 0.08,
    navLinks: 25,
    hasArticleSchema: true,
    hasArticleBody: true,
    hasMainContent: true,
    schemaScore: 4.5
  },
  alternatives: [
    { classification: 'hub', confidence: 0.35 },
    { classification: 'nav', confidence: 0.25 }
  ]
}
```

## Performance Considerations

- Cheerio parsing: ~50-100ms for typical pages
- Signal extraction: ~10-30ms
- Classification logic: ~5ms
- **Total: ~65-135ms**

## Next Chapter

Continue to [Chapter 4: Stage 3 Puppeteer Classification](./04-stage3-puppeteer-classification.md) for browser-based classification.
