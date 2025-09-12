#!/usr/bin/env node

const fetch = require('node-fetch');
const cheerio = require('cheerio');
const robotsParser = require('robots-parser');
const fs = require('fs').promises;
const path = require('path');
const { URL } = require('url');

class NewsCrawler {
  constructor(startUrl, options = {}) {
    this.startUrl = startUrl;
    this.domain = new URL(startUrl).hostname;
    this.baseUrl = `${new URL(startUrl).protocol}//${this.domain}`;
    
    // Configuration
    this.rateLimitMs = options.rateLimitMs || 1000; // 1 second between requests
    this.maxDepth = options.maxDepth || 3;
    this.dataDir = options.dataDir || path.join(process.cwd(), 'data');
    
    // State
    this.visited = new Set();
    this.robotsRules = null;
    this.requestQueue = [];
    this.isProcessing = false;
    
    // Statistics
    this.stats = {
      pagesVisited: 0,
      articlesFound: 0,
      articlesSaved: 0
    };
  }

  async init() {
    // Ensure data directory exists
    await fs.mkdir(this.dataDir, { recursive: true });
    
    // Load robots.txt
    await this.loadRobotsTxt();
    
    console.log(`Starting crawler for ${this.domain}`);
    console.log(`Data will be saved to: ${this.dataDir}`);
  }

  async loadRobotsTxt() {
    try {
      const robotsUrl = `${this.baseUrl}/robots.txt`;
      console.log(`Loading robots.txt from: ${robotsUrl}`);
      
      const response = await fetch(robotsUrl);
      if (response.ok) {
        const robotsTxt = await response.text();
        this.robotsRules = robotsParser(robotsUrl, robotsTxt);
        console.log('robots.txt loaded successfully');
      } else {
        console.log('No robots.txt found, proceeding without restrictions');
      }
    } catch (error) {
      console.log('Failed to load robots.txt, proceeding without restrictions');
    }
  }

  isAllowed(url) {
    if (!this.robotsRules) return true;
    return this.robotsRules.isAllowed(url, '*');
  }

  isOnDomain(url) {
    try {
      const urlObj = new URL(url, this.baseUrl);
      return urlObj.hostname === this.domain;
    } catch {
      return false;
    }
  }

  normalizeUrl(url) {
    try {
      const urlObj = new URL(url, this.baseUrl);
      // Remove fragment and normalize
      urlObj.hash = '';
      return urlObj.href;
    } catch {
      return null;
    }
  }

  async fetchPage(url) {
    const normalizedUrl = this.normalizeUrl(url);
    if (!normalizedUrl || this.visited.has(normalizedUrl)) {
      return null;
    }

    if (!this.isOnDomain(normalizedUrl) || !this.isAllowed(normalizedUrl)) {
      console.log(`Skipping ${normalizedUrl} (not allowed or off-domain)`);
      return null;
    }

    this.visited.add(normalizedUrl);
    
    try {
      console.log(`Fetching: ${normalizedUrl}`);
      const response = await fetch(normalizedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)'
        }
      });

      if (!response.ok) {
        console.log(`Failed to fetch ${normalizedUrl}: ${response.status}`);
        return null;
      }

      const html = await response.text();
      this.stats.pagesVisited++;
      
      return { url: normalizedUrl, html };
    } catch (error) {
      console.log(`Error fetching ${normalizedUrl}: ${error.message}`);
      return null;
    }
  }

  findNavigationLinks($) {
    const navigationLinks = new Set();
    
    // Find navigation elements
    const navSelectors = [
      'header a',
      'nav a', 
      'footer a',
      '[role="navigation"] a',
      '.menu a',
      '.nav a',
      '.navigation a',
      '.breadcrumb a',
      '.breadcrumbs a',
      '.pagination a',
      '.pager a'
    ];

    navSelectors.forEach(selector => {
      $(selector).each((i, element) => {
        const href = $(element).attr('href');
        if (href) {
          const normalizedUrl = this.normalizeUrl(href);
          if (normalizedUrl && this.isOnDomain(normalizedUrl)) {
            navigationLinks.add(normalizedUrl);
          }
        }
      });
    });

    return Array.from(navigationLinks);
  }

  findArticleLinks($) {
    const articleLinks = new Set();
    
    // Common selectors for article links
    const articleSelectors = [
      'article a',
      '.article a',
      '.story a',
      '.content a[href*="/"]',
      'a[href*="/article"]',
      'a[href*="/story"]',
      'a[href*="/news"]',
      'a[href*="/world"]',
      'a[href*="/politics"]',
      'a[href*="/business"]',
      'a[href*="/sport"]',
      'a[href*="/culture"]',
      'a[href*="/opinion"]',
      'a[href*="/lifestyle"]',
      'a[href*="/technology"]',
      'h1 a', 'h2 a', 'h3 a' // Headlines often link to articles
    ];

    articleSelectors.forEach(selector => {
      $(selector).each((i, element) => {
        const href = $(element).attr('href');
        if (href) {
          const normalizedUrl = this.normalizeUrl(href);
          if (normalizedUrl && this.isOnDomain(normalizedUrl) && this.looksLikeArticle(normalizedUrl)) {
            articleLinks.add(normalizedUrl);
          }
        }
      });
    });

    return Array.from(articleLinks);
  }

  looksLikeArticle(url) {
    // Heuristics to determine if URL looks like an article
    const urlStr = url.toLowerCase();
    
    // Skip certain patterns that are unlikely to be articles
    const skipPatterns = [
      '/search', '/login', '/register', '/subscribe', '/newsletter',
      '/contact', '/about', '/privacy', '/terms', '/cookies',
      '/rss', '/feed', '.xml', '.json', '/api/', '/admin/',
      '/profile', '/account', '/settings', '/user/',
      '/tag/', '/tags/', '/category/', '/categories/',
      '/page/', '/index', '/sitemap', '/archive',
      '.pdf', '.jpg', '.png', '.gif', '.css', '.js'
    ];

    if (skipPatterns.some(pattern => urlStr.includes(pattern))) {
      return false;
    }

    // Positive indicators for articles
    const articlePatterns = [
      '/article', '/story', '/news', '/post',
      '/world', '/politics', '/business', '/sport',
      '/culture', '/opinion', '/lifestyle', '/technology',
      '/commentisfree', '/uk-news', '/us-news'
    ];

    return articlePatterns.some(pattern => urlStr.includes(pattern)) ||
           /\/\d{4}\/\d{2}\/\d{2}\//.test(urlStr); // Date pattern
  }

  extractArticleMetadata($, url) {
    // Extract title
    const title = $('h1').first().text().trim() || 
                  $('title').text().trim() || 
                  $('[property="og:title"]').attr('content') || 
                  'Unknown Title';

    // Extract date
    let date = '';
    const dateSelectors = [
      '[datetime]',
      '.date',
      '.published',
      '.timestamp',
      '[property="article:published_time"]',
      '[name="article:published_time"]'
    ];

    for (const selector of dateSelectors) {
      const element = $(selector).first();
      if (element.length) {
        date = element.attr('datetime') || element.attr('content') || element.text().trim();
        if (date) break;
      }
    }

    // Extract section from URL or metadata
    let section = '';
    const urlParts = new URL(url).pathname.split('/').filter(Boolean);
    if (urlParts.length > 0) {
      section = urlParts[0];
    }

    // Try to get section from metadata
    const sectionMeta = $('[property="article:section"]').attr('content') ||
                       $('[name="section"]').attr('content') ||
                       $('.section').first().text().trim();
    
    if (sectionMeta) {
      section = sectionMeta;
    }

    return { title, date, section, url };
  }

  async saveArticle(html, metadata) {
    try {
      // Create filename from URL
      const urlObj = new URL(metadata.url);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const filename = pathParts.join('_').replace(/[^a-zA-Z0-9_-]/g, '_') + '.json';
      
      const articleData = {
        ...metadata,
        html,
        crawledAt: new Date().toISOString()
      };

      const filePath = path.join(this.dataDir, filename);
      await fs.writeFile(filePath, JSON.stringify(articleData, null, 2));
      
      this.stats.articlesSaved++;
      console.log(`Saved article: ${metadata.title}`);
    } catch (error) {
      console.log(`Failed to save article ${metadata.url}: ${error.message}`);
    }
  }

  async processPage(url, depth = 0) {
    if (depth > this.maxDepth) return;

    const pageData = await this.fetchPage(url);
    if (!pageData) return;

    const $ = cheerio.load(pageData.html);
    
    // Check if this looks like an article page
    if (this.looksLikeArticle(pageData.url)) {
      const metadata = this.extractArticleMetadata($, pageData.url);
      await this.saveArticle(pageData.html, metadata);
      this.stats.articlesFound++;
    }

    // Find navigation and article links
    const navigationLinks = this.findNavigationLinks($);
    const articleLinks = this.findArticleLinks($);
    
    console.log(`Found ${navigationLinks.length} navigation links and ${articleLinks.length} article links on ${pageData.url}`);

    // Add found links to queue for processing
    const allLinks = [...new Set([...navigationLinks, ...articleLinks])];
    for (const link of allLinks) {
      if (!this.visited.has(link)) {
        this.requestQueue.push({ url: link, depth: depth + 1 });
      }
    }
  }

  async crawl() {
    await this.init();
    
    // Start with the initial URL
    this.requestQueue.push({ url: this.startUrl, depth: 0 });
    
    while (this.requestQueue.length > 0) {
      const { url, depth } = this.requestQueue.shift();
      
      await this.processPage(url, depth);
      
      // Rate limiting
      if (this.requestQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, this.rateLimitMs));
      }
      
      // Log progress periodically
      if (this.stats.pagesVisited % 10 === 0) {
        console.log(`Progress: ${this.stats.pagesVisited} pages visited, ${this.stats.articlesFound} articles found, ${this.stats.articlesSaved} articles saved`);
      }
    }

    console.log('\nCrawling completed!');
    console.log(`Final stats: ${this.stats.pagesVisited} pages visited, ${this.stats.articlesFound} articles found, ${this.stats.articlesSaved} articles saved`);
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const startUrl = args[0] || 'https://www.theguardian.com';
  
  console.log(`Starting news crawler with URL: ${startUrl}`);
  
  const crawler = new NewsCrawler(startUrl, {
    rateLimitMs: 2000, // 2 seconds between requests to be respectful
    maxDepth: 2        // Limit depth to avoid crawling too much
  });

  crawler.crawl()
    .then(() => {
      console.log('Crawler finished successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Crawler failed:', error);
      process.exit(1);
    });
}

module.exports = NewsCrawler;