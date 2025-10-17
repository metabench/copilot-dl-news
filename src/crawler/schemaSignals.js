'use strict';

const ARTICLE_TYPE_ALIASES = new Set([
  'article',
  'newsarticle',
  'reportagenewsarticle',
  'backgroundnewsarticle',
  'opinionnewsarticle',
  'analysisnewsarticle',
  'askpublicnewsarticle',
  'blogposting',
  'liveblogposting',
  'medicalscholarlyarticle',
  'scholarlyarticle',
  'socialmediapost'
]);

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function normalizeType(raw) {
  if (!raw) return null;
  const str = String(raw).trim();
  if (!str) return null;
  const segments = str.split(/[#/]/);
  const tail = segments[segments.length - 1] || str;
  return tail.trim().toLowerCase();
}

function grabFirstNonEmpty(...values) {
  for (const value of values) {
    if (!value) continue;
    if (Array.isArray(value)) {
      const nonEmpty = value.find((v) => typeof v === 'string' && v.trim());
      if (nonEmpty) return String(nonEmpty).trim();
    } else if (typeof value === 'string' && value.trim()) {
      return value.trim();
    } else if (typeof value === 'object') {
      if (value.name && typeof value.name === 'string' && value.name.trim()) {
        return value.name.trim();
      }
    }
  }
  return null;
}

function collectTypesFromJsonLd(node, accumulator, metrics) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) collectTypesFromJsonLd(item, accumulator, metrics);
    return;
  }
  if (typeof node !== 'object') return;

  const types = toArray(node['@type']).map(normalizeType).filter(Boolean);
  for (const type of types) {
    accumulator.add(type);
    if (ARTICLE_TYPE_ALIASES.has(type)) {
      metrics.hasArticleType = true;
      metrics.jsonLdArticleTypes.add(type);
    }
  }

  const headline = grabFirstNonEmpty(node.headline, node.name, node.alternativeHeadline);
  if (headline) metrics.hasHeadline = true;

  const date = grabFirstNonEmpty(node.datePublished, node.dateCreated, node.uploadDate);
  if (date) metrics.hasDatePublished = true;

  const author = grabFirstNonEmpty(node.author, node.creator, node.accountablePerson);
  if (author) metrics.hasAuthor = true;

  if (node.articleBody || node.text || node.reviewBody) {
    metrics.hasArticleBody = true;
  }

  const publisher = grabFirstNonEmpty(node.publisher);
  if (publisher) metrics.hasPublisher = true;

  if (node.wordCount && Number(node.wordCount) > 0) {
    const parsed = Number(node.wordCount);
    if (Number.isFinite(parsed)) {
      metrics.schemaWordCount = Math.max(metrics.schemaWordCount, parsed);
    }
  }

  const potentialChildren = [];
  for (const key of Object.keys(node)) {
    if (key.startsWith('@')) continue;
    potentialChildren.push(node[key]);
  }
  for (const child of potentialChildren) {
    collectTypesFromJsonLd(child, accumulator, metrics);
  }
}

function parseJsonLd($) {
  const scriptNodes = $('script[type="application/ld+json"]');
  const metrics = {
    hasArticleType: false,
    jsonLdArticleTypes: new Set(),
    hasHeadline: false,
    hasDatePublished: false,
    hasAuthor: false,
    hasArticleBody: false,
    hasPublisher: false,
    schemaWordCount: -Infinity,
    sources: new Set()
  };

  const allTypes = new Set();

  scriptNodes.each((_, el) => {
    let raw = $(el).contents().text();
    if (!raw) return;
    raw = raw.trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      collectTypesFromJsonLd(parsed, allTypes, metrics);
      metrics.sources.add('json-ld');
    } catch (_) {
      // Ignore malformed JSON-LD blocks
    }
  });

  if (metrics.schemaWordCount === -Infinity) {
    metrics.schemaWordCount = null;
  }

  return {
    articleTypes: Array.from(metrics.jsonLdArticleTypes),
    hasArticleType: metrics.hasArticleType,
    hasHeadline: metrics.hasHeadline,
    hasDatePublished: metrics.hasDatePublished,
    hasAuthor: metrics.hasAuthor,
    hasArticleBody: metrics.hasArticleBody,
    hasPublisher: metrics.hasPublisher,
    schemaWordCount: metrics.schemaWordCount,
    sources: metrics.sources,
    allTypes: Array.from(allTypes)
  };
}

function parseMicrodata($) {
  const articleSelectors = '[itemscope][itemtype*="schema.org/"], [itemscope][itemtype*="schema.org\\."]';
  const nodes = $(articleSelectors);
  const metrics = {
    hasArticleType: false,
    articleTypes: new Set(),
    hasHeadline: false,
    hasDatePublished: false,
    hasAuthor: false,
    hasArticleBody: false,
    hasPublisher: false
  };

  nodes.each((_, el) => {
    const typeAttr = $(el).attr('itemtype');
    if (!typeAttr) return;
    const types = typeAttr.split(/\s+/).map(normalizeType).filter(Boolean);
    const matched = types.some((type) => ARTICLE_TYPE_ALIASES.has(type));
    if (!matched) return;

    metrics.hasArticleType = true;
    types.forEach((type) => metrics.articleTypes.add(type));

    const scoped = $(el);
    if (scoped.find('[itemprop="headline"]').length || scoped.attr('itemprop') === 'headline') {
      metrics.hasHeadline = true;
    }
    if (scoped.find('[itemprop="datePublished"], [itemprop="dateCreated"]').length) {
      metrics.hasDatePublished = true;
    }
    if (scoped.find('[itemprop="author"], [itemprop="creator"]').length) {
      metrics.hasAuthor = true;
    }
    if (scoped.find('[itemprop="articleBody"], [itemprop="reviewBody"]').length) {
      metrics.hasArticleBody = true;
    }
    if (scoped.find('[itemprop="publisher"]').length) {
      metrics.hasPublisher = true;
    }
  });

  return {
    hasArticleType: metrics.hasArticleType,
    articleTypes: Array.from(metrics.articleTypes),
    hasHeadline: metrics.hasHeadline,
    hasDatePublished: metrics.hasDatePublished,
    hasAuthor: metrics.hasAuthor,
    hasArticleBody: metrics.hasArticleBody,
    hasPublisher: metrics.hasPublisher
  };
}

function extractSchemaSignals({ $, html }) {
  if (!$) {
    throw new Error('extractSchemaSignals requires a cheerio instance');
  }

  const jsonLd = parseJsonLd($);
  const microdata = parseMicrodata($);

  const ogTypeArticle = Boolean($('meta[property="og:type"], meta[name="og:type"]').filter((_, el) => {
    const value = ($(el).attr('content') || '').trim().toLowerCase();
    return value === 'article' || value === 'newsarticle';
  }).length);

  const articleTag = $('article').length > 0;
  const articleRole = $('[role="article"]').length > 0;
  const articleBody = $('[itemprop="articleBody"]').length > 0;

  const structuredSources = new Set(jsonLd.sources || []);
  if (microdata.hasArticleType) structuredSources.add('microdata');
  if (ogTypeArticle) structuredSources.add('opengraph');

  const articleTypes = new Set([
    ...jsonLd.articleTypes,
    ...microdata.articleTypes
  ]);

  const hasArticleType = jsonLd.hasArticleType || microdata.hasArticleType;

  const hasHeadline = jsonLd.hasHeadline || microdata.hasHeadline || $('meta[property="og:title"], meta[name="twitter:title"]').length > 0;
  const hasDatePublished = jsonLd.hasDatePublished || microdata.hasDatePublished || $('meta[property="article:published_time"], meta[name="article:published_time"], time[datetime]').length > 0;
  const hasAuthor = jsonLd.hasAuthor || microdata.hasAuthor || $('meta[name="author"], [rel="author"], .byline, .article-byline').length > 0;
  const hasArticleBody = jsonLd.hasArticleBody || microdata.hasArticleBody || articleBody;
  const hasPublisher = jsonLd.hasPublisher || microdata.hasPublisher || $('meta[property="og:site_name"], meta[name="application-name"]').length > 0;

  const schemaWordCount = jsonLd.schemaWordCount;

  let score = 0;
  if (hasArticleType) score += 3;
  if (ogTypeArticle) score += 1;
  if (articleTag || articleRole) score += 1;
  if (hasHeadline) score += 1;
  if (hasDatePublished) score += 1;
  if (hasAuthor) score += 1;
  if (hasArticleBody) score += 2;
  if (hasPublisher) score += 0.5;
  if (schemaWordCount && schemaWordCount >= 200) score += 1;

  const sources = Array.from(structuredSources);
  const confidence = Math.max(0, Math.min(1, score / 8));
  let strength = 'weak';
  if (score >= 6) strength = 'strong';
  else if (score >= 3.5) strength = 'medium';
  else if (score <= 0.5) strength = 'weak';

  return {
    hasStructuredData: hasArticleType || ogTypeArticle || articleTag || articleRole,
    hasArticleType,
    articleTypes: Array.from(articleTypes),
    hasHeadline,
    hasDatePublished,
    hasAuthor,
    hasArticleBody,
    hasPublisher,
    schemaWordCount,
    ogTypeArticle,
    hasArticleTag: articleTag,
    hasArticleRole: articleRole,
    strength,
    score,
    confidence,
    sources
  };
}

module.exports = {
  extractSchemaSignals
};
