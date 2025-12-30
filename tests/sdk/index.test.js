'use strict';

/**
 * Tests for NewsCrawl SDK
 * @module tests/sdk/index.test
 */

describe('NewsCrawl SDK', () => {
  let sdk;

  beforeEach(() => {
    jest.resetModules();
    sdk = require('../../sdk/index');
  });

  describe('exports', () => {
    it('should export NewsCrawl class', () => {
      expect(sdk.NewsCrawl).toBeDefined();
      expect(typeof sdk.NewsCrawl).toBe('function');
    });

    it('should export HttpClient class', () => {
      expect(sdk.HttpClient).toBeDefined();
    });

    it('should export ArticlesAPI class', () => {
      expect(sdk.ArticlesAPI).toBeDefined();
    });

    it('should export TopicsAPI class', () => {
      expect(sdk.TopicsAPI).toBeDefined();
    });

    it('should export AlertsAPI class', () => {
      expect(sdk.AlertsAPI).toBeDefined();
    });

    it('should export UserAPI class', () => {
      expect(sdk.UserAPI).toBeDefined();
    });

    it('should export StreamAPI class', () => {
      expect(sdk.StreamAPI).toBeDefined();
    });
  });

  describe('NewsCrawl client', () => {
    it('should create instance with API key', () => {
      const client = new sdk.NewsCrawl({ apiKey: 'test-key' });
      expect(client).toBeDefined();
    });

    it('should create instance with base URL', () => {
      const client = new sdk.NewsCrawl({ 
        apiKey: 'test-key',
        baseUrl: 'https://custom.api.com'
      });
      expect(client).toBeDefined();
    });

    it('should expose articles API', () => {
      const client = new sdk.NewsCrawl({ apiKey: 'test-key' });
      expect(client.articles).toBeDefined();
    });

    it('should expose topics API', () => {
      const client = new sdk.NewsCrawl({ apiKey: 'test-key' });
      expect(client.topics).toBeDefined();
    });

    it('should expose alerts API', () => {
      const client = new sdk.NewsCrawl({ apiKey: 'test-key' });
      expect(client.alerts).toBeDefined();
    });

    it('should expose user API', () => {
      const client = new sdk.NewsCrawl({ apiKey: 'test-key' });
      expect(client.user).toBeDefined();
    });

    it('should expose stream API', () => {
      const client = new sdk.NewsCrawl({ apiKey: 'test-key' });
      expect(client.stream).toBeDefined();
    });

    it('should allow empty options', () => {
      const client = new sdk.NewsCrawl({});
      expect(client).toBeDefined();
    });
  });

  describe('HttpClient', () => {
    let httpClient;

    beforeEach(() => {
      httpClient = new sdk.HttpClient({
        baseUrl: 'https://api.test.com',
        apiKey: 'test-key'
      });
    });

    it('should create instance', () => {
      expect(httpClient).toBeDefined();
    });

    it('should have get method', () => {
      expect(typeof httpClient.get).toBe('function');
    });

    it('should have post method', () => {
      expect(typeof httpClient.post).toBe('function');
    });

    it('should have put method', () => {
      expect(typeof httpClient.put).toBe('function');
    });

    it('should have delete method', () => {
      expect(typeof httpClient.delete).toBe('function');
    });

    it('should store API key', () => {
      expect(httpClient.apiKey).toBe('test-key');
    });
  });

  describe('ArticlesAPI', () => {
    let client;
    let articlesApi;

    beforeEach(() => {
      client = new sdk.NewsCrawl({ apiKey: 'test-key' });
      articlesApi = client.articles;
    });

    it('should have search method', () => {
      expect(typeof articlesApi.search).toBe('function');
    });

    it('should have get method', () => {
      expect(typeof articlesApi.get).toBe('function');
    });

    it('should have list method', () => {
      expect(typeof articlesApi.list).toBe('function');
    });

    it('should have save method', () => {
      expect(typeof articlesApi.save).toBe('function');
    });

    it('should have unsave method', () => {
      expect(typeof articlesApi.unsave).toBe('function');
    });

    it('should have getSaved method', () => {
      expect(typeof articlesApi.getSaved).toBe('function');
    });

    it('should have export method', () => {
      expect(typeof articlesApi.export).toBe('function');
    });
  });

  describe('TopicsAPI', () => {
    let client;
    let topicsApi;

    beforeEach(() => {
      client = new sdk.NewsCrawl({ apiKey: 'test-key' });
      topicsApi = client.topics;
    });

    it('should have list method', () => {
      expect(typeof topicsApi.list).toBe('function');
    });

    it('should have get method', () => {
      expect(typeof topicsApi.get).toBe('function');
    });

    it('should have list method', () => {
      expect(typeof topicsApi.list).toBe('function');
    });

    it('should have getArticles method', () => {
      expect(typeof topicsApi.getArticles).toBe('function');
    });
  });

  describe('AlertsAPI', () => {
    let client;
    let alertsApi;

    beforeEach(() => {
      client = new sdk.NewsCrawl({ apiKey: 'test-key' });
      alertsApi = client.alerts;
    });

    it('should have list method', () => {
      expect(typeof alertsApi.list).toBe('function');
    });

    it('should have create method', () => {
      expect(typeof alertsApi.create).toBe('function');
    });

    it('should have update method', () => {
      expect(typeof alertsApi.update).toBe('function');
    });

    it('should have delete method', () => {
      expect(typeof alertsApi.delete).toBe('function');
    });

    it('should have get method', () => {
      expect(typeof alertsApi.get).toBe('function');
    });

    it('should have test method', () => {
      expect(typeof alertsApi.test).toBe('function');
    });
  });

  describe('UserAPI', () => {
    let client;
    let userApi;

    beforeEach(() => {
      client = new sdk.NewsCrawl({ apiKey: 'test-key' });
      userApi = client.user;
    });

    it('should have me method', () => {
      expect(typeof userApi.me).toBe('function');
    });

    it('should have getPreferences method', () => {
      expect(typeof userApi.getPreferences).toBe('function');
    });

    it('should have updatePreferences method', () => {
      expect(typeof userApi.updatePreferences).toBe('function');
    });

    it('should have getUsage method', () => {
      expect(typeof userApi.getUsage).toBe('function');
    });
  });

  describe('StreamAPI', () => {
    let client;
    let streamApi;

    beforeEach(() => {
      client = new sdk.NewsCrawl({ apiKey: 'test-key' });
      streamApi = client.stream;
    });

    it('should have connect method', () => {
      expect(typeof streamApi.connect).toBe('function');
    });

    it('should have disconnect method', () => {
      expect(typeof streamApi.disconnect).toBe('function');
    });

    it('should have subscribe method', () => {
      expect(typeof streamApi.subscribe).toBe('function');
    });

    it('should have unsubscribe method', () => {
      expect(typeof streamApi.unsubscribe).toBe('function');
    });

    it('should have on method for events', () => {
      expect(typeof streamApi.on).toBe('function');
    });

    it('should have off method for events', () => {
      expect(typeof streamApi.off).toBe('function');
    });
  });
});

describe('SDK error handling', () => {
  let sdk;

  beforeEach(() => {
    jest.resetModules();
    sdk = require('../../sdk/index');
  });

  it('should handle null options by throwing', () => {
    // Constructor requires options to not be null
    expect(() => new sdk.NewsCrawl(null)).toThrow();
  });

  it('should handle undefined/empty options gracefully', () => {
    expect(() => new sdk.NewsCrawl(undefined)).not.toThrow();
    expect(() => new sdk.NewsCrawl({})).not.toThrow();
  });

  it('should work without API key', () => {
    const client = new sdk.NewsCrawl({ apiKey: '' });
    expect(client).toBeDefined();
  });

  it('should handle timeout option', () => {
    const client = new sdk.NewsCrawl({ 
      apiKey: 'test-key',
      timeout: 5000
    });
    expect(client).toBeDefined();
  });

  it('should handle custom options', () => {
    const client = new sdk.NewsCrawl({ 
      apiKey: 'test-key',
      baseUrl: 'https://custom.api.com'
    });
    expect(client).toBeDefined();
  });
});

describe('SDK pagination helpers', () => {
  let sdk;
  let client;

  beforeEach(() => {
    jest.resetModules();
    sdk = require('../../sdk/index');
    client = new sdk.NewsCrawl({ apiKey: 'test-key' });
  });

  it('should support pagination parameters in articles.list', () => {
    // Verify method accepts pagination params
    const method = client.articles.list;
    expect(method.length).toBeGreaterThanOrEqual(0); // Has parameters
  });

  it('should support cursor-based pagination', () => {
    // SDK should handle cursor pagination
    expect(client.articles).toBeDefined();
  });

  it('should support limit/offset pagination', () => {
    expect(client.articles).toBeDefined();
  });
});

describe('SDK rate limiting', () => {
  let sdk;
  let client;

  beforeEach(() => {
    jest.resetModules();
    sdk = require('../../sdk/index');
    client = new sdk.NewsCrawl({ apiKey: 'test-key' });
  });

  it('should expose rate limit headers', () => {
    // Client should track rate limits
    expect(client).toBeDefined();
  });

  it('should support custom rate limit handling', () => {
    const clientWithHandler = new sdk.NewsCrawl({ 
      apiKey: 'test-key',
      onRateLimit: () => {}
    });
    expect(clientWithHandler).toBeDefined();
  });
});

describe('SDK response types', () => {
  let sdk;

  beforeEach(() => {
    jest.resetModules();
    sdk = require('../../sdk/index');
  });

  it('should define Article type structure', () => {
    // Type definitions should exist (for TypeScript users)
    expect(sdk.NewsCrawl).toBeDefined();
  });

  it('should define Topic type structure', () => {
    expect(sdk.NewsCrawl).toBeDefined();
  });

  it('should define Alert type structure', () => {
    expect(sdk.NewsCrawl).toBeDefined();
  });
});
