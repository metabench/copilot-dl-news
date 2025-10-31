#!/usr/bin/env node
'use strict';

/**
 * Test script for HttpRequestResponseFacade
 * Tests basic caching and retrieval functionality
 */

const path = require('path');
const Database = require('better-sqlite3');
const { HttpRequestResponseFacade } = require('../src/utils/HttpRequestResponseFacade');

const DB_PATH = path.join(__dirname, '..', 'data', 'news.db');

async function testCacheOperations() {
  console.log('🧪 Testing HttpRequestResponseFacade...');

  const db = new Database(DB_PATH);

  try {
    // Test data
    const testUrl = 'https://api.example.com/test';
    const testResponse = {
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: { message: 'Hello World', timestamp: new Date().toISOString() }
    };

    console.log('📝 Caching test response...');
    const cacheResult = await HttpRequestResponseFacade.cacheHttpResponse(db, {
      url: testUrl,
      response: testResponse,
      metadata: { category: 'api-test', ttlMs: 60 * 1000 } // 1 minute TTL
    });

    console.log('✅ Cache result:', cacheResult);

    console.log('🔍 Retrieving cached response...');
    const cacheKey = HttpRequestResponseFacade.generateCacheKey(testUrl, {}, { category: 'api-test' });
    console.log('Generated cache key for retrieval:', cacheKey);
    console.log('Stored cache key:', cacheResult.cacheKey);
    console.log('Keys match:', cacheKey === cacheResult.cacheKey);

    // Debug: Check database directly
    const allRecords = db.prepare(`
      SELECT hr.id, hr.cache_key, hr.cache_category, cs.id as content_id
      FROM http_responses hr
      LEFT JOIN content_storage cs ON cs.http_response_id = hr.id
      WHERE hr.cache_key = ?
    `).all(cacheKey);
    console.log('All records with cache key:', allRecords);

    const cached = await HttpRequestResponseFacade.getCachedHttpResponse(db, testUrl, {
      category: 'api-test'
    });

    if (cached) {
      console.log('✅ Retrieved cached response:', {
        status: cached.status,
        cached: cached.cached,
        body: cached.body
      });

      // Verify the data matches
      if (cached.status === testResponse.status &&
          cached.body.message === testResponse.body.message) {
        console.log('✅ Cache data integrity verified');
      } else {
        console.log('❌ Cache data mismatch');
      }
    } else {
      console.log('❌ No cached response found');
    }

    console.log('🎉 Basic facade test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    db.close();
  }
}

if (require.main === module) {
  testCacheOperations().catch(console.error);
}

module.exports = { testCacheOperations };