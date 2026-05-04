'use strict';

/**
 * Remote Crawler Module — P2P distributed crawl capabilities for NewsCrawler.
 *
 * Exports:
 * - RemoteCrawlerAdapter: Network bridge wrapping any NewsCrawler instance
 * - PeerCrawlServer: Express API for hosting peer crawlers
 * - PeerProtocol: Wire format for inter-peer communication
 */

const { RemoteCrawlerAdapter } = require('./RemoteCrawlerAdapter');
const { createPeerApp, createPeerServer } = require('./PeerCrawlServer');
const {
  PROTOCOL_VERSION,
  MessageTypes,
  generateNodeId,
  createAnnouncement,
  createWorkAssignment,
  createResultSync,
  createIntelligenceShare,
  createHeartbeat,
  validateMessage,
} = require('./PeerProtocol');

module.exports = {
  // Adapter
  RemoteCrawlerAdapter,

  // Server
  createPeerApp,
  createPeerServer,

  // Protocol
  PROTOCOL_VERSION,
  MessageTypes,
  generateNodeId,
  createAnnouncement,
  createWorkAssignment,
  createResultSync,
  createIntelligenceShare,
  createHeartbeat,
  validateMessage,
};
