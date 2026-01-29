'use strict';

/**
 * Article Viewer Server
 * 
 * Provides a clean, distraction-free reading experience for extracted articles.
 * Articles are rendered using jsgui3 SSR with the content extracted by Mozilla
 * Readability stored in the content_analysis table.
 * 
 * Routes:
 *   GET /                     - Article list with search and pagination
 *   GET /article/:id          - Single article view
 *   GET /api/articles         - JSON API for article list
 *   GET /api/article/:id      - JSON API for single article
 * 
 * Usage:
 *   node src/ui/server/articleViewer/server.js
 *   # Visit http://localhost:3015
 */

const express = require('express');
const jsgui = require('jsgui3-html');
const { ArticleListControl } = require('./controls/ArticleListControl');
const { ArticleViewerControl } = require('./controls/ArticleViewerControl');
const { getArticleAdapter } = require('./articleAdapter');

const app = express();
const PORT = process.env.PORT || 3015;

// Parse query strings
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

/**
 * Render a jsgui3 control to HTML
 */
function renderControl(control, title = 'Article Viewer') {
  const ctx = control.context;
  
  // Create document structure
  const doc = new jsgui.Document({ context: ctx });
  const head = doc.head();
  
  // Title
  const titleEl = head.add(new jsgui.Control({ context: ctx, tagName: 'title' }));
  titleEl.add(new jsgui.StringControl({ context: ctx, text: title }));
  
  // Meta
  head.add(new jsgui.Control({
    context: ctx,
    tagName: 'meta',
    attr: { charset: 'UTF-8' }
  }));
  head.add(new jsgui.Control({
    context: ctx,
    tagName: 'meta',
    attr: { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  }));
  
  // Base styles
  const style = head.add(new jsgui.Control({ context: ctx, tagName: 'style' }));
  style.add(new jsgui.StringControl({
    context: ctx,
    text: `
      * { box-sizing: border-box; }
      body { margin: 0; padding: 0; background: #f5f5f5; }
      a:hover { text-decoration: underline !important; }
      input:focus, button:focus { outline: 2px solid #0066cc; outline-offset: 2px; }
      
      /* Article content styles */
      .article-content p { margin-bottom: 1.5em; }
      .article-content h2, .article-content h3 { margin-top: 2em; margin-bottom: 0.5em; }
      .article-content blockquote {
        margin: 1.5em 0;
        padding: 0.5em 1em;
        border-left: 4px solid #0066cc;
        background: #f0f7ff;
        font-style: italic;
      }
      .article-content ul, .article-content ol { margin: 1em 0; padding-left: 1.5em; }
      .article-content img { max-width: 100%; height: auto; margin: 1em 0; }
      .article-content figure { margin: 1.5em 0; }
      .article-content figcaption { font-size: 0.9em; color: #666; text-align: center; }
    `
  }));
  
  // Body
  const body = doc.body();
  body.add(control);
  
  return doc.all_html();
}

/**
 * Article list page
 */
app.get('/', async (req, res) => {
  try {
    const adapter = getArticleAdapter();
    
    // Parse query params
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(10, parseInt(req.query.pageSize) || 50));
    const sortBy = ['date', 'title', 'word_count', 'host'].includes(req.query.sortBy)
      ? req.query.sortBy
      : 'date';
    const sortDir = req.query.sortDir === 'asc' ? 'asc' : 'desc';
    const classification = req.query.classification || null;
    const searchQuery = req.query.q || null;
    
    // Fetch articles
    const result = adapter.getArticleList({
      page,
      pageSize,
      sortBy,
      sortDir,
      classification,
      searchQuery
    });
    
    // Render control
    const ctx = new jsgui.Context();
    const control = new ArticleListControl({
      context: ctx,
      articles: result.articles,
      totalCount: result.totalCount,
      page,
      pageSize,
      sortBy,
      sortDir,
      filter: { q: searchQuery, classification },
      basePath: ''
    });
    control.compose();
    
    const html = renderControl(control, 'Article Library');
    res.type('html').send(html);
  } catch (err) {
    console.error('Error rendering article list:', err);
    res.status(500).send('Error loading articles: ' + err.message);
  }
});

/**
 * Single article view
 */
app.get('/article/:id', async (req, res) => {
  try {
    const adapter = getArticleAdapter();
    const articleId = parseInt(req.params.id);
    
    if (isNaN(articleId)) {
      return res.status(400).send('Invalid article ID');
    }
    
    // Fetch article with content
    const article = adapter.getArticleById(articleId);
    
    if (!article) {
      return res.status(404).send('Article not found');
    }
    
    // Render control
    const ctx = new jsgui.Context();
    const control = new ArticleViewerControl({
      context: ctx,
      article,
      showHtml: req.query.html === '1',
      basePath: ''
    });
    control.compose();
    
    const title = article.title ? `${article.title} | Article Viewer` : 'Article Viewer';
    const html = renderControl(control, title);
    res.type('html').send(html);
  } catch (err) {
    console.error('Error rendering article:', err);
    res.status(500).send('Error loading article: ' + err.message);
  }
});

/**
 * JSON API: Article list
 */
app.get('/api/articles', async (req, res) => {
  try {
    const adapter = getArticleAdapter();
    
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(10, parseInt(req.query.pageSize) || 50));
    const sortBy = ['date', 'title', 'word_count', 'host'].includes(req.query.sortBy)
      ? req.query.sortBy
      : 'date';
    const sortDir = req.query.sortDir === 'asc' ? 'asc' : 'desc';
    const classification = req.query.classification || null;
    const searchQuery = req.query.q || null;
    
    const result = adapter.getArticleList({
      page,
      pageSize,
      sortBy,
      sortDir,
      classification,
      searchQuery
    });
    
    res.json({
      success: true,
      ...result,
      page,
      pageSize
    });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * JSON API: Single article
 */
app.get('/api/article/:id', async (req, res) => {
  try {
    const adapter = getArticleAdapter();
    const articleId = parseInt(req.params.id);
    
    if (isNaN(articleId)) {
      return res.status(400).json({ success: false, error: 'Invalid article ID' });
    }
    
    const article = adapter.getArticleById(articleId);
    
    if (!article) {
      return res.status(404).json({ success: false, error: 'Article not found' });
    }
    
    res.json({ success: true, article });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`📰 Article Viewer running at http://localhost:${PORT}`);
    console.log(`   - Article list: http://localhost:${PORT}/`);
    console.log(`   - Article view: http://localhost:${PORT}/article/:id`);
    console.log(`   - API: http://localhost:${PORT}/api/articles`);
  });
}

module.exports = { app };
