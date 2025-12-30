'use strict';

/**
 * Tests for SSE Controller
 */

const express = require('express');
const request = require('supertest');
const {
  createSSEHandler,
  parseArrayParam,
  KEEPALIVE_INTERVAL_MS
} = require('../../../src/api/streaming/SSEController');
const {
  EventBroadcaster,
  resetBroadcaster
} = require('../../../src/api/streaming/EventBroadcaster');

describe('SSEController', () => {
  let app;
  let broadcaster;

  beforeEach(() => {
    resetBroadcaster();
    broadcaster = new EventBroadcaster();
    app = express();
    
    const sseHandler = createSSEHandler({
      broadcaster,
      keepaliveMs: 100000, // Long timeout to not interfere
      replayLimit: 10
    });
    
    app.get('/stream', sseHandler);
    app.get('/stream/stats', sseHandler.stats);
  });

  afterEach(() => {
    broadcaster.removeAllListeners();
  });

  describe('parseArrayParam', () => {
    it('should return empty array for undefined', () => {
      expect(parseArrayParam(undefined)).toEqual([]);
    });

    it('should return empty array for empty string', () => {
      expect(parseArrayParam('')).toEqual([]);
    });

    it('should parse comma-separated string', () => {
      expect(parseArrayParam('a,b,c')).toEqual(['a', 'b', 'c']);
    });

    it('should trim whitespace', () => {
      expect(parseArrayParam(' a , b , c ')).toEqual(['a', 'b', 'c']);
    });

    it('should handle array input', () => {
      expect(parseArrayParam(['a', 'b'])).toEqual(['a', 'b']);
    });
  });

  describe('SSE stream endpoint', () => {
    it('should set correct headers', async () => {
      const response = await request(app)
        .get('/stream')
        .buffer(false)
        .parse((res, callback) => {
          // Close connection after headers
          res.destroy();
          callback(null, {});
        });

      expect(response.headers['content-type']).toContain('text/event-stream');
      expect(response.headers['cache-control']).toContain('no-cache');
    });

    it('should send connected event', (done) => {
      const req = request(app)
        .get('/stream')
        .buffer(false)
        .parse((res, callback) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk.toString();
            if (data.includes('"type":"connected"')) {
              res.destroy();
              const lines = data.split('\n').filter(l => l.startsWith('data:'));
              const event = JSON.parse(lines[0].replace('data: ', ''));
              expect(event.type).toBe('connected');
              expect(event.payload.connectionId).toBeDefined();
              callback(null, {});
              done();
            }
          });
        });

      req.end();
    });

    it('should receive emitted events', (done) => {
      const events = [];

      const req = request(app)
        .get('/stream?replay=false')
        .buffer(false)
        .parse((res, callback) => {
          res.on('data', (chunk) => {
            const lines = chunk.toString().split('\n').filter(l => l.startsWith('data:'));
            for (const line of lines) {
              const event = JSON.parse(line.replace('data: ', ''));
              events.push(event);
              
              if (event.type === 'article:new') {
                res.destroy();
                expect(event.payload.id).toBe(123);
                callback(null, {});
                done();
              }
            }
          });
        });

      req.end();

      // Emit event after connection
      setTimeout(() => {
        broadcaster.emitEvent('article:new', { id: 123, title: 'Test' });
      }, 50);
    });

    it('should filter by event type', (done) => {
      const events = [];

      const req = request(app)
        .get('/stream?types=article:new&replay=false')
        .buffer(false)
        .parse((res, callback) => {
          res.on('data', (chunk) => {
            const lines = chunk.toString().split('\n').filter(l => l.startsWith('data:'));
            for (const line of lines) {
              const event = JSON.parse(line.replace('data: ', ''));
              if (event.type !== 'connected') {
                events.push(event);
              }
              
              if (events.length >= 2) {
                res.destroy();
                // Should have received article:new events only
                expect(events.every(e => e.type === 'article:new')).toBe(true);
                callback(null, {});
                done();
              }
            }
          });
        });

      req.end();

      setTimeout(() => {
        broadcaster.emitEvent('article:new', { id: 1 });
        broadcaster.emitEvent('crawl:started', {}); // Should be filtered out
        broadcaster.emitEvent('article:new', { id: 2 });
      }, 50);
    });

    it('should filter by domain', (done) => {
      const events = [];

      const req = request(app)
        .get('/stream?domains=example.com&replay=false')
        .buffer(false)
        .parse((res, callback) => {
          res.on('data', (chunk) => {
            const lines = chunk.toString().split('\n').filter(l => l.startsWith('data:'));
            for (const line of lines) {
              const event = JSON.parse(line.replace('data: ', ''));
              if (event.type !== 'connected') {
                events.push(event);
              }
              
              if (events.length >= 1) {
                res.destroy();
                expect(events[0].payload.host).toBe('example.com');
                callback(null, {});
                done();
              }
            }
          });
        });

      req.end();

      setTimeout(() => {
        broadcaster.emitEvent('article:new', { id: 1, host: 'other.org' }); // Filtered
        broadcaster.emitEvent('article:new', { id: 2, host: 'example.com' }); // Passes
      }, 50);
    });

    it('should replay history on connect', (done) => {
      // Emit events before connection
      broadcaster.emitEvent('article:new', { id: 1 });
      broadcaster.emitEvent('article:new', { id: 2 });

      const events = [];

      const req = request(app)
        .get('/stream?types=article:new')
        .buffer(false)
        .parse((res, callback) => {
          res.on('data', (chunk) => {
            const lines = chunk.toString().split('\n').filter(l => l.startsWith('data:'));
            for (const line of lines) {
              const event = JSON.parse(line.replace('data: ', ''));
              events.push(event);
              
              if (events.length >= 3) { // connected + 2 replayed
                res.destroy();
                const replayed = events.filter(e => e.replayed);
                expect(replayed).toHaveLength(2);
                callback(null, {});
                done();
              }
            }
          });
        });

      req.end();
    });

    it('should skip replay when replay=false', (done) => {
      // Emit events before connection
      broadcaster.emitEvent('article:new', { id: 1 });

      const events = [];

      const req = request(app)
        .get('/stream?replay=false')
        .buffer(false)
        .parse((res, callback) => {
          let receivedConnected = false;
          res.on('data', (chunk) => {
            const lines = chunk.toString().split('\n').filter(l => l.startsWith('data:'));
            for (const line of lines) {
              const event = JSON.parse(line.replace('data: ', ''));
              events.push(event);
              
              if (event.type === 'connected') {
                receivedConnected = true;
                // Wait a bit to ensure no replay events
                setTimeout(() => {
                  res.destroy();
                  const replayed = events.filter(e => e.replayed);
                  expect(replayed).toHaveLength(0);
                  callback(null, {});
                  done();
                }, 100);
              }
            }
          });
        });

      req.end();
    });
  });

  describe('stats endpoint', () => {
    it('should return stats', async () => {
      const response = await request(app)
        .get('/stream/stats')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.stats).toBeDefined();
      expect(response.body.stats.broadcaster).toBeDefined();
    });
  });
});
