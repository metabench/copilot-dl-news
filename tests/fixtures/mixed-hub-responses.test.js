/**
 * Example test demonstrating mixed response fixtures for place hub guessing
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { ensureDb } = require('../../src/db/sqlite/ensureDb');
const { createMockFetch, scenarios, createMixedBatchResponses } = require('../fixtures/mixed-hub-responses');

function createTempDbPath(label) {
  const name = `mixed-responses-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`;
  return path.join(os.tmpdir(), name);
}

function stubLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };
}

describe('Mixed Hub Response Fixtures', () => {
  test('provides realistic response scenarios', () => {
    // Test that all scenarios are properly structured
    expect(scenarios.successfulCountryHub).toHaveProperty('url');
    expect(scenarios.successfulCountryHub).toHaveProperty('response');
    expect(scenarios.successfulCountryHub.response.status).toBe(200);
    expect(scenarios.successfulCountryHub.response.ok).toBe(true);
    
    expect(scenarios.notFoundCountryHub.response.status).toBe(404);
    expect(scenarios.notFoundCountryHub.response.ok).toBe(false);
    
    expect(scenarios.rateLimitedRequest.response.status).toBe(429);
    expect(scenarios.rateLimitedRequest.response.headers.get('retry-after')).toBe('60');
    
    expect(scenarios.serverError.response.status).toBe(500);
  });
  
  test('creates mock fetch function with predefined responses', async () => {
    const responseMap = {
      'https://example.com/world/france': scenarios.successfulCountryHub.response,
      'https://example.com/world/atlantis': scenarios.notFoundCountryHub.response
    };
    
    const mockFetch = createMockFetch(responseMap);
    
    // Test successful response
    const successResponse = await mockFetch('https://example.com/world/france');
    expect(successResponse.status).toBe(200);
    expect(successResponse.ok).toBe(true);
    const successBody = await successResponse.text();
    expect(successBody).toContain('France Hub');
    
    // Test 404 response
    const notFoundResponse = await mockFetch('https://example.com/world/atlantis');
    expect(notFoundResponse.status).toBe(404);
    expect(notFoundResponse.ok).toBe(false);
    const notFoundBody = await notFoundResponse.text();
    expect(notFoundBody).toContain('404 - Page Not Found');
    
    // Test unmapped URL defaults to 404
    const unmappedResponse = await mockFetch('https://example.com/unknown');
    expect(unmappedResponse.status).toBe(404);
  });
  
  test('handles HEAD requests by returning empty body', async () => {
    const responseMap = {
      'https://example.com/world/france': scenarios.successfulCountryHub.response
    };
    
    const mockFetch = createMockFetch(responseMap);
    
    // Test HEAD request
    const headResponse = await mockFetch('https://example.com/world/france', { method: 'HEAD' });
    expect(headResponse.status).toBe(200);
    const headBody = await headResponse.text();
    expect(headBody).toBe('');
  });
  
  test('creates mixed batch responses for multi-domain testing', () => {
    const domains = ['news1.com', 'news2.com', 'news3.com', 'news4.com', 'news5.com'];
    const responses = createMixedBatchResponses(domains);
    
    // Should have responses for all domains
    expect(Object.keys(responses)).toHaveLength(5);
    
    // Check that different response types are included
    const statusCodes = Object.values(responses).map(r => r.status);
    expect(statusCodes).toContain(200); // Success
    expect(statusCodes).toContain(404); // Not Found
    expect(statusCodes).toContain(429); // Rate Limit
    expect(statusCodes).toContain(500); // Server Error
  });
  
  test('realistic hub HTML contains expected elements', async () => {
    const response = scenarios.successfulCountryHub.response;
    const html = await response.text();
    
    // Check for HTML structure
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>France Hub</title>');
    expect(html).toContain('<h1>France Hub</h1>');
    
    // Check for article links
    expect(html).toContain('class="article-link"');
    expect(html).toContain('Breaking News Story');
    expect(html).toContain('href="/article-');
    
    // Check for navigation
    expect(html).toContain('<nav>');
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/world"');
  });
  
  test('rate limit response includes retry-after header', async () => {
    const response = scenarios.rateLimitedRequest.response;
    
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
    
    const html = await response.text();
    expect(html).toContain('429 - Too Many Requests');
    expect(html).toContain('Retry after: 60 seconds');
  });
  
  test('server error responses have appropriate content', async () => {
    const response = scenarios.serverError.response;
    
    expect(response.status).toBe(500);
    expect(response.ok).toBe(false);
    
    const html = await response.text();
    expect(html).toContain('500 - Internal Server Error');
    expect(html).toContain('The server encountered an error');
  });
  
  test('redirect responses include location header', () => {
    const response = scenarios.permanentRedirect.response;
    
    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('https://newssite.com/world/united-kingdom');
    
    const tempResponse = scenarios.temporaryRedirect.response;
    expect(tempResponse.status).toBe(302);
    expect(tempResponse.headers.get('location')).toBe('https://newssite.com/world/united-states');
  });
});

// Example of how to use fixtures in integration tests
describe('Integration Test Example', () => {
  test('demonstrates fixture usage in place hub testing', async () => {
    const dbPath = createTempDbPath('integration');
    const db = ensureDb(dbPath);
    
    try {
      // Set up test data
      const placeRow = db.prepare(`
        INSERT INTO places(kind, country_code, status)
        VALUES ('country', 'FR', 'current')
      `).run();
      const placeId = placeRow.lastInsertRowid;
      const nameRow = db.prepare(`
        INSERT INTO place_names(place_id, name, is_preferred)
        VALUES (?, 'France', 1)
      `).run(placeId);
      db.prepare('UPDATE places SET canonical_name_id = ? WHERE id = ?').run(nameRow.lastInsertRowid, placeId);
      
      // Create mock fetch with mixed responses
      const responseMap = {
        'https://example.com/world/france': scenarios.successfulCountryHub.response,
        'https://example.com/world/atlantis': scenarios.notFoundCountryHub.response,
        'https://example.com/world/germany': scenarios.rateLimitedRequest.response
      };
      
      const mockFetch = createMockFetch(responseMap);
      const logger = stubLogger();
      
      // Test successful case
      const successResponse = await mockFetch('https://example.com/world/france');
      expect(successResponse.status).toBe(200);
      expect(successResponse.ok).toBe(true);
      
      // Test 404 case
      const notFoundResponse = await mockFetch('https://example.com/world/atlantis');
      expect(notFoundResponse.status).toBe(404);
      
      // Test rate limit case
      const rateLimitResponse = await mockFetch('https://example.com/world/germany');
      expect(rateLimitResponse.status).toBe(429);
      expect(rateLimitResponse.headers.get('retry-after')).toBe('60');
      
      // Verify fetch function was called
      expect(mockFetch).toHaveBeenCalledTimes(3);
      
    } finally {
      db.close();
      try {
        fs.unlinkSync(dbPath);
      } catch (e) {
        // Ignore cleanup errors in tests
      }
    }
  });
});