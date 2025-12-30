'use strict';

/**
 * Tests for WebSocket Server
 */

const http = require('http');
const WebSocket = require('ws');
const express = require('express');
const {
  WebSocketServerManager,
  WSConnection,
  createWebSocketServer,
  HEARTBEAT_INTERVAL_MS,
  MAX_MISSED_PONGS
} = require('../../../src/api/streaming/WebSocketServer');
const {
  EventBroadcaster,
  resetBroadcaster
} = require('../../../src/api/streaming/EventBroadcaster');

describe('WebSocketServer', () => {
  let server;
  let wsManager;
  let broadcaster;
  let port;

  beforeEach((done) => {
    resetBroadcaster();
    broadcaster = new EventBroadcaster();
    
    const app = express();
    server = http.createServer(app);
    
    wsManager = createWebSocketServer({
      server,
      path: '/ws',
      broadcaster,
      logger: { log: () => {}, error: () => {}, debug: () => {} }
    });
    
    server.listen(0, () => {
      port = server.address().port;
      done();
    });
  });

  afterEach((done) => {
    broadcaster.removeAllListeners();
    wsManager.close();
    server.close(done);
  });

  function createClient() {
    return new WebSocket(`ws://localhost:${port}/ws`);
  }

  describe('connection', () => {
    it('should accept WebSocket connections', (done) => {
      const ws = createClient();
      
      ws.on('open', () => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
        ws.close();
        done();
      });
    });

    it('should send connected message', (done) => {
      const ws = createClient();
      
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        expect(msg.type).toBe('connected');
        expect(msg.connectionId).toBeDefined();
        ws.close();
        done();
      });
    });

    it('should track connections in stats', (done) => {
      const ws = createClient();
      
      ws.on('open', () => {
        setTimeout(() => {
          const stats = wsManager.getStats();
          expect(stats.activeConnections).toBe(1);
          ws.close();
          done();
        }, 50);
      });
    });

    it('should clean up on disconnect', (done) => {
      const ws = createClient();
      
      ws.on('open', () => {
        ws.close();
      });
      
      ws.on('close', () => {
        setTimeout(() => {
          const stats = wsManager.getStats();
          expect(stats.activeConnections).toBe(0);
          done();
        }, 50);
      });
    });
  });

  describe('subscribe action', () => {
    it('should acknowledge subscribe', (done) => {
      const ws = createClient();
      const messages = [];
      
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        messages.push(msg);
        
        if (msg.type === 'connected') {
          ws.send(JSON.stringify({
            action: 'subscribe',
            types: ['article:new'],
            domains: ['example.com'],
            replay: false
          }));
        }
        
        if (msg.type === 'subscribed') {
          expect(msg.types).toContain('article:new');
          expect(msg.domains).toContain('example.com');
          ws.close();
          done();
        }
      });
    });

    it('should receive events after subscribe', (done) => {
      const ws = createClient();
      
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        
        if (msg.type === 'connected') {
          ws.send(JSON.stringify({
            action: 'subscribe',
            types: ['article:new'],
            replay: false
          }));
        }
        
        if (msg.type === 'subscribed') {
          // Emit event after subscribing
          broadcaster.emitEvent('article:new', { id: 123 });
        }
        
        if (msg.type === 'article:new') {
          expect(msg.payload.id).toBe(123);
          ws.close();
          done();
        }
      });
    });

    it('should filter events by type', (done) => {
      const ws = createClient();
      const receivedEvents = [];
      
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        
        if (msg.type === 'connected') {
          ws.send(JSON.stringify({
            action: 'subscribe',
            types: ['article:new'],
            replay: false
          }));
        }
        
        if (msg.type === 'subscribed') {
          broadcaster.emitEvent('crawl:started', {}); // Should not receive
          broadcaster.emitEvent('article:new', { id: 1 }); // Should receive
        }
        
        if (msg.type === 'article:new') {
          receivedEvents.push(msg);
          // Wait a bit to ensure crawl:started wasn't received
          setTimeout(() => {
            expect(receivedEvents).toHaveLength(1);
            expect(receivedEvents.every(e => e.type === 'article:new')).toBe(true);
            ws.close();
            done();
          }, 100);
        }
      });
    });

    it('should filter events by domain', (done) => {
      const ws = createClient();
      const receivedEvents = [];
      
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        
        if (msg.type === 'connected') {
          ws.send(JSON.stringify({
            action: 'subscribe',
            domains: ['example.com'],
            replay: false
          }));
        }
        
        if (msg.type === 'subscribed') {
          broadcaster.emitEvent('article:new', { host: 'other.org', id: 1 }); // Filtered
          broadcaster.emitEvent('article:new', { host: 'example.com', id: 2 }); // Passes
        }
        
        if (msg.type === 'article:new') {
          receivedEvents.push(msg);
          setTimeout(() => {
            expect(receivedEvents).toHaveLength(1);
            expect(receivedEvents[0].payload.id).toBe(2);
            ws.close();
            done();
          }, 100);
        }
      });
    });

    it('should replay history on subscribe', (done) => {
      // Emit events before connection
      broadcaster.emitEvent('article:new', { id: 1 });
      broadcaster.emitEvent('article:new', { id: 2 });

      const ws = createClient();
      const replayedEvents = [];
      
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        
        if (msg.type === 'connected') {
          ws.send(JSON.stringify({
            action: 'subscribe',
            types: ['article:new']
          }));
        }
        
        if (msg.replayed) {
          replayedEvents.push(msg);
          if (replayedEvents.length >= 2) {
            expect(replayedEvents).toHaveLength(2);
            ws.close();
            done();
          }
        }
      });
    });
  });

  describe('unsubscribe action', () => {
    it('should acknowledge unsubscribe', (done) => {
      const ws = createClient();
      
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        
        if (msg.type === 'connected') {
          ws.send(JSON.stringify({
            action: 'subscribe',
            types: ['article:new', 'crawl:started'],
            replay: false
          }));
        }
        
        if (msg.type === 'subscribed') {
          ws.send(JSON.stringify({
            action: 'unsubscribe',
            types: ['article:new']
          }));
        }
        
        if (msg.type === 'unsubscribed') {
          expect(msg.removedTypes).toContain('article:new');
          expect(msg.remainingTypes).toContain('crawl:started');
          expect(msg.remainingTypes).not.toContain('article:new');
          ws.close();
          done();
        }
      });
    });

    it('should stop receiving unsubscribed events', (done) => {
      const ws = createClient();
      const receivedEvents = [];
      
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        
        if (msg.type === 'connected') {
          ws.send(JSON.stringify({
            action: 'subscribe',
            types: ['article:new'],
            replay: false
          }));
        }
        
        if (msg.type === 'subscribed') {
          ws.send(JSON.stringify({
            action: 'unsubscribe',
            types: ['article:new']
          }));
        }
        
        if (msg.type === 'unsubscribed') {
          // Emit after unsubscribe
          broadcaster.emitEvent('article:new', { id: 1 });
          
          // Wait to ensure event is not received
          setTimeout(() => {
            expect(receivedEvents).toHaveLength(0);
            ws.close();
            done();
          }, 100);
        }
        
        if (msg.type === 'article:new') {
          receivedEvents.push(msg);
        }
      });
    });
  });

  describe('ping action', () => {
    it('should respond with pong', (done) => {
      const ws = createClient();
      
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        
        if (msg.type === 'connected') {
          ws.send(JSON.stringify({ action: 'ping' }));
        }
        
        if (msg.type === 'pong') {
          expect(msg.timestamp).toBeDefined();
          ws.close();
          done();
        }
      });
    });
  });

  describe('get-stats action', () => {
    it('should return connection stats', (done) => {
      const ws = createClient();
      
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        
        if (msg.type === 'connected') {
          ws.send(JSON.stringify({ action: 'get-stats' }));
        }
        
        if (msg.type === 'stats') {
          expect(msg.stats.connectionId).toBeDefined();
          expect(msg.stats.connectedAt).toBeDefined();
          expect(msg.stats.eventsSent).toBeDefined();
          ws.close();
          done();
        }
      });
    });
  });

  describe('error handling', () => {
    it('should handle invalid JSON', (done) => {
      const ws = createClient();
      
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        
        if (msg.type === 'connected') {
          ws.send('not json');
        }
        
        if (msg.type === 'error') {
          expect(msg.error).toBe('INVALID_JSON');
          ws.close();
          done();
        }
      });
    });

    it('should handle unknown action', (done) => {
      const ws = createClient();
      
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        
        if (msg.type === 'connected') {
          ws.send(JSON.stringify({ action: 'unknown_action' }));
        }
        
        if (msg.type === 'error') {
          expect(msg.error).toBe('UNKNOWN_ACTION');
          ws.close();
          done();
        }
      });
    });
  });

  describe('manager methods', () => {
    it('should broadcast to all connections', (done) => {
      const ws1 = createClient();
      const ws2 = createClient();
      const messages1 = [];
      const messages2 = [];
      let connected = 0;
      
      const checkDone = () => {
        if (messages1.some(m => m.type === 'broadcast') &&
            messages2.some(m => m.type === 'broadcast')) {
          ws1.close();
          ws2.close();
          done();
        }
      };
      
      ws1.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        messages1.push(msg);
        if (msg.type === 'connected') {
          connected++;
          if (connected === 2) {
            wsManager.broadcast({ type: 'broadcast', data: 'test' });
          }
        }
        checkDone();
      });
      
      ws2.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        messages2.push(msg);
        if (msg.type === 'connected') {
          connected++;
          if (connected === 2) {
            wsManager.broadcast({ type: 'broadcast', data: 'test' });
          }
        }
        checkDone();
      });
    });

    it('should get stats with connection info', (done) => {
      const ws = createClient();
      
      ws.on('open', () => {
        setTimeout(() => {
          const stats = wsManager.getStats();
          expect(stats.activeConnections).toBe(1);
          expect(stats.path).toBe('/ws');
          expect(stats.connections).toHaveLength(1);
          expect(stats.connections[0].id).toBeDefined();
          ws.close();
          done();
        }, 50);
      });
    });
  });
});
