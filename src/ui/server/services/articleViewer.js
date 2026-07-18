'use strict';

const {
  getArticleContentByFetchId,
  getArticleContentByUrlId,
  listArticlesWithContent,
  countArticlesWithContent
} = require('news-crawler-db');
const { decompress } = require('../../../shared/utils/compression');
const { HtmlArticleExtractor } = require('../../../shared/utils/HtmlArticleExtractor');

const extractor = new HtmlArticleExtractor({ minWordCount: 20 });

function decompressContent(contentBlob, algorithm = 'none') {
  if (!contentBlob) return null;
  try {
    const decompressed = decompress(contentBlob, algorithm);
    return decompressed.toString('utf-8');
  } catch (err) {
    console.error('Decompression error:', err.message);
    return null;
  }
}

function extractArticleFromHtml(html, url) {
  return extractor.extract(html, url);
}

function getExtractedArticle(db, fetchId) {
  const article = getArticleContentByFetchId(db, fetchId);
  if (!article) return null;
  const html = decompressContent(article.contentBlob, article.compressionAlgorithm);
  if (!html) {
    return {
      ...article,
      extraction: { success: false, error: 'Failed to decompress content' },
      html: null
    };
  }
  const extraction = extractArticleFromHtml(html, article.url);
  return {
    ...article,
    extraction,
    html,
    contentBlob: undefined
  };
}

function getExtractedArticleByUrlId(db, urlId) {
  const article = getArticleContentByUrlId(db, urlId);
  if (!article) return null;
  const html = decompressContent(article.contentBlob, article.compressionAlgorithm);
  if (!html) {
    return {
      ...article,
      extraction: { success: false, error: 'Failed to decompress content' },
      html: null
    };
  }
  const extraction = extractArticleFromHtml(html, article.url);
  return {
    ...article,
    extraction,
    html,
    contentBlob: undefined
  };
}

module.exports = {
  getArticleContentByFetchId,
  getArticleContentByUrlId,
  decompressContent,
  extractArticleFromHtml,
  getExtractedArticle,
  getExtractedArticleByUrlId,
  listArticlesWithContent,
  countArticlesWithContent
};
