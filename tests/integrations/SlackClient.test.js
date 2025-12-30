'use strict';

const { SlackClient } = require('../../src/integrations/SlackClient');

describe('SlackClient', () => {
  let client;
  let mockFetch;
  let mockLogger;

  beforeEach(() => {
    mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue('ok')
    });
    mockLogger = {
      info: jest.fn(),
      error: jest.fn()
    };
    client = new SlackClient({ logger: mockLogger, fetch: mockFetch });
  });

  describe('constructor', () => {
    it('should create client with logger and fetch', () => {
      expect(client).toBeDefined();
      expect(client.logger).toBe(mockLogger);
      expect(client.fetch).toBe(mockFetch);
    });

    it('should use defaults if none provided', () => {
      const defaultClient = new SlackClient();
      expect(defaultClient).toBeDefined();
      expect(defaultClient.logger).toBe(console);
    });
  });

  describe('postMessage', () => {
    it('should send message to webhook URL', async () => {
      const webhookUrl = 'https://hooks.slack.com/services/xxx';
      
      await client.postMessage(webhookUrl, {
        text: 'Hello, Slack!'
      });

      expect(mockFetch).toHaveBeenCalledWith(
        webhookUrl,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.any(String)
        })
      );
    });

    it('should throw if webhook URL is missing', async () => {
      await expect(client.postMessage(null, { text: 'Test' }))
        .rejects.toThrow('Slack webhook URL is required');
    });

    it('should return success on 200 response', async () => {
      const result = await client.postMessage(
        'https://hooks.slack.com/services/xxx',
        { text: 'Test' }
      );

      expect(result.success).toBe(true);
    });

    it('should return failure on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await client.postMessage(
        'https://hooks.slack.com/services/xxx',
        { text: 'Test' }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should return failure on non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: jest.fn().mockResolvedValue('invalid_payload')
      });

      const result = await client.postMessage(
        'https://hooks.slack.com/services/xxx',
        { text: 'Test' }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('400');
    });

    it('should include blocks if provided', async () => {
      await client.postMessage('https://hooks.slack.com/services/xxx', {
        text: 'Test',
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'Hello' } }]
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.blocks).toBeDefined();
      expect(callBody.blocks.length).toBe(1);
    });
  });

  describe('formatArticle', () => {
    it('should format article as Block Kit message', () => {
      const article = {
        title: 'Breaking: Major Event',
        url: 'https://example.com/article',
        source: 'Example News',
        summary: 'This is a summary of the article.',
        topics: ['politics', 'economy']
      };

      const message = client.formatArticle(article);

      expect(message.text).toContain('Breaking: Major Event');
      expect(message.blocks).toBeDefined();
      expect(message.blocks.length).toBeGreaterThan(0);
      
      // Check header block
      const headerBlock = message.blocks.find(b => b.type === 'header');
      expect(headerBlock).toBeDefined();
      expect(headerBlock.text.text).toContain('New Article');
    });

    it('should include source in context', () => {
      const article = {
        title: 'Test Article',
        url: 'https://example.com/article',
        source: 'Test Source'
      };

      const message = client.formatArticle(article);

      const contextBlocks = message.blocks.filter(b => b.type === 'context');
      expect(contextBlocks.length).toBeGreaterThan(0);
      
      const contextText = contextBlocks.map(b => 
        b.elements.map(e => e.text).join(' ')
      ).join(' ');
      expect(contextText).toContain('Test Source');
    });

    it('should include topics in context', () => {
      const article = {
        title: 'Test Article',
        url: 'https://example.com/article',
        topics: ['tech', 'ai']
      };

      const message = client.formatArticle(article);
      const text = JSON.stringify(message);
      
      expect(text).toContain('tech');
      expect(text).toContain('ai');
    });

    it('should include summary when available', () => {
      const article = {
        title: 'Test Article',
        url: 'https://example.com',
        summary: 'A very long summary about the article content.'
      };

      const message = client.formatArticle(article);
      const text = JSON.stringify(message);
      
      expect(text).toContain('summary about the article');
    });

    it('should include published date when available', () => {
      const article = {
        title: 'Test Article',
        url: 'https://example.com',
        publishedAt: '2024-01-15T12:00:00Z'
      };

      const message = client.formatArticle(article);

      const contextBlocks = message.blocks.filter(b => b.type === 'context');
      expect(contextBlocks.length).toBeGreaterThan(0);
    });
  });

  describe('formatAlert', () => {
    it('should format alert as Block Kit message', () => {
      const alert = {
        name: 'Tech Alert',
        conditions: 'keyword: AI'
      };

      const message = client.formatAlert(alert);

      expect(message.text).toContain('Tech Alert');
      expect(message.blocks).toBeDefined();
      
      const headerBlock = message.blocks.find(b => b.type === 'header');
      expect(headerBlock.text.text).toContain('Alert');
    });

    it('should include trigger article if provided', () => {
      const alert = {
        name: 'Test Alert'
      };
      const trigger = {
        article: { 
          title: 'Triggering Article',
          url: 'https://example.com/trigger'
        }
      };

      const message = client.formatAlert(alert, trigger);
      const text = JSON.stringify(message);
      
      expect(text).toContain('Triggering Article');
    });

    it('should include conditions if provided', () => {
      const alert = {
        name: 'Test Alert',
        conditions: { keyword: 'technology', source: 'TechNews' }
      };

      const message = client.formatAlert(alert);
      const text = JSON.stringify(message);
      
      expect(text).toContain('Conditions');
    });

    it('should include action button', () => {
      const alert = { name: 'Test Alert' };
      const trigger = { article: { url: 'https://example.com/article' } };

      const message = client.formatAlert(alert, trigger);

      const actionsBlock = message.blocks.find(b => b.type === 'actions');
      expect(actionsBlock).toBeDefined();
      expect(actionsBlock.elements.length).toBeGreaterThan(0);
    });
  });

  describe('formatBreakingNews', () => {
    it('should format breaking news with urgency styling', () => {
      const news = {
        title: 'BREAKING: Major Event Unfolding',
        summary: 'Details are emerging about a significant event.',
        url: 'https://example.com/breaking'
      };

      const message = client.formatBreakingNews(news);

      expect(message.blocks).toBeDefined();
      expect(message.text).toContain('BREAKING');
      
      const headerBlock = message.blocks.find(b => b.type === 'header');
      expect(headerBlock.text.text).toMatch(/🚨|BREAKING/);
    });

    it('should include urgent emoji', () => {
      const news = {
        headline: 'Breaking News',
        url: 'https://example.com'
      };

      const message = client.formatBreakingNews(news);
      const text = JSON.stringify(message);
      
      expect(text).toContain('🚨');
    });

    it('should use title or headline', () => {
      const news1 = { title: 'Title Version' };
      const news2 = { headline: 'Headline Version' };

      expect(client.formatBreakingNews(news1).text).toContain('Title Version');
      expect(client.formatBreakingNews(news2).text).toContain('Headline Version');
    });

    it('should include Read More button when URL present', () => {
      const news = {
        title: 'News',
        url: 'https://example.com/story'
      };

      const message = client.formatBreakingNews(news);

      const actionsBlock = message.blocks.find(b => b.type === 'actions');
      expect(actionsBlock).toBeDefined();
      
      const button = actionsBlock.elements.find(e => e.url === 'https://example.com/story');
      expect(button).toBeDefined();
    });
  });

  describe('formatCrawlCompleted', () => {
    it('should format crawl completion summary', () => {
      const crawl = {
        pagesProcessed: 150,
        newArticles: 45,
        duration: 3600000,
        errors: 3,
        domains: ['example.com', 'news.com']
      };

      const message = client.formatCrawlCompleted(crawl);

      expect(message.blocks).toBeDefined();
      expect(message.text).toContain('150');
      
      const text = JSON.stringify(message);
      expect(text).toContain('45');
    });

    it('should show duration in human-readable format', () => {
      const crawl = {
        pagesProcessed: 100,
        duration: 7200000 // 2 hours
      };

      const message = client.formatCrawlCompleted(crawl);
      const text = JSON.stringify(message);
      
      expect(text).toMatch(/2h/);
    });

    it('should show errors count', () => {
      const crawl = {
        pagesProcessed: 50,
        errors: 10
      };

      const message = client.formatCrawlCompleted(crawl);
      const text = JSON.stringify(message);
      
      expect(text).toContain('10');
    });

    it('should include domains if provided', () => {
      const crawl = {
        pagesProcessed: 100,
        domains: ['example.com', 'news.com', 'blog.org']
      };

      const message = client.formatCrawlCompleted(crawl);
      const text = JSON.stringify(message);
      
      expect(text).toContain('example.com');
    });
  });

  describe('escapeMarkdown', () => {
    it('should escape ampersands', () => {
      expect(client.escapeMarkdown('A & B')).toBe('A &amp; B');
    });

    it('should escape angle brackets', () => {
      expect(client.escapeMarkdown('<script>')).toBe('&lt;script&gt;');
    });

    it('should handle empty/null text', () => {
      expect(client.escapeMarkdown('')).toBe('');
      expect(client.escapeMarkdown(null)).toBe('');
    });
  });

  describe('formatDuration', () => {
    it('should format hours and minutes', () => {
      expect(client.formatDuration(7200000)).toBe('2h 0m');
    });

    it('should format minutes and seconds', () => {
      expect(client.formatDuration(90000)).toBe('1m 30s');
    });

    it('should format seconds only', () => {
      expect(client.formatDuration(15000)).toBe('15s');
    });

    it('should handle null/undefined', () => {
      expect(client.formatDuration(null)).toBe('N/A');
      expect(client.formatDuration(undefined)).toBe('N/A');
    });
  });
});
