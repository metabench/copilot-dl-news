'use strict';

const os = require('os');
const crypto = require('crypto');

/**
 * PeerProtocol — Wire format definitions for P2P crawler communication.
 *
 * Defines message types, serialisation helpers, and validation for
 * inter-peer communication. All messages are plain JSON objects that
 * can be sent over HTTP or WebSocket.
 *
 * @example
 * const { MessageTypes, createAnnouncement, createWorkAssignment } = require('./PeerProtocol');
 * const msg = createAnnouncement({ nodeId: 'abc', domains: ['bbc.com'] });
 */

// ── Protocol version ────────────────────────────────────────
const PROTOCOL_VERSION = '1.0.0';

// ── Message types ───────────────────────────────────────────
const MessageTypes = Object.freeze({
  /** Peer announces itself to the network/hub */
  ANNOUNCE: 'announce',
  /** Hub assigns work (domains + config) to a peer */
  WORK_ASSIGN: 'work-assign',
  /** Hub acknowledges work assignment */
  WORK_ACK: 'work-ack',
  /** Peer sends a batch of crawl results to hub */
  RESULT_SYNC: 'result-sync',
  /** Hub acknowledges receipt of results */
  RESULT_ACK: 'result-ack',
  /** Peer shares domain intelligence */
  INTEL_SHARE: 'intel-share',
  /** Heartbeat (keep-alive) */
  HEARTBEAT: 'heartbeat',
  /** Status request */
  STATUS_REQUEST: 'status-request',
  /** Status response */
  STATUS_RESPONSE: 'status-response',
});

// ── Node ID generation ──────────────────────────────────────

/**
 * Generate a unique node ID based on hostname + random suffix.
 * Format: `<hostname>-<random4hex>`
 *
 * @returns {string}
 */
function generateNodeId() {
  const host = os.hostname().replace(/[^a-zA-Z0-9-]/g, '').toLowerCase().slice(0, 24);
  const suffix = crypto.randomBytes(2).toString('hex');
  return `${host}-${suffix}`;
}

// ── Message factories ───────────────────────────────────────

/**
 * Create an announcement message for peer registration.
 *
 * @param {Object} params
 * @param {string} params.nodeId - Unique peer identifier
 * @param {string[]} [params.domains=[]] - List of domains this peer manages
 * @param {string} [params.baseUrl] - This peer's base URL (e.g. http://192.168.1.2:3200)
 * @param {Object} [params.capabilities={}] - Declared capabilities
 * @param {Object} [params.system={}] - System info (OS, memory, etc.)
 * @returns {Object} Announcement message
 */
function createAnnouncement({ nodeId, domains = [], baseUrl = null, capabilities = {}, system = {} }) {
  return {
    type: MessageTypes.ANNOUNCE,
    version: PROTOCOL_VERSION,
    nodeId,
    timestamp: new Date().toISOString(),
    baseUrl,
    domains,
    capabilities: {
      crawlTypes: capabilities.crawlTypes || ['basic'],
      puppeteer: capabilities.puppeteer || false,
      maxConcurrent: capabilities.maxConcurrent || 5,
      export: true,
      intelligenceSharing: true,
      ...capabilities,
    },
    system: {
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      totalMemoryMb: Math.round(os.totalmem() / (1024 * 1024)),
      freeMemoryMb: Math.round(os.freemem() / (1024 * 1024)),
      nodeVersion: process.version,
      ...system,
    },
  };
}

/**
 * Create a work assignment message.
 *
 * @param {Object} params
 * @param {string} params.assignedBy - Hub node ID
 * @param {string} params.targetNodeId - Peer to assign work to
 * @param {Object[]} params.domains - Array of { domain, maxPages, seedUrls?, crawlType? }
 * @param {Object} [params.options={}] - Crawl options overrides
 * @returns {Object} Work assignment message
 */
function createWorkAssignment({ assignedBy, targetNodeId, domains, options = {} }) {
  return {
    type: MessageTypes.WORK_ASSIGN,
    version: PROTOCOL_VERSION,
    assignedBy,
    targetNodeId,
    timestamp: new Date().toISOString(),
    assignmentId: `wa-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`,
    domains: domains.map(d => ({
      domain: typeof d === 'string' ? d : d.domain,
      maxPages: (typeof d === 'object' ? d.maxPages : undefined) || options.maxPages || 200,
      seedUrls: (typeof d === 'object' ? d.seedUrls : undefined) || [],
      crawlType: (typeof d === 'object' ? d.crawlType : undefined) || options.crawlType || 'basic',
    })),
    options,
  };
}

/**
 * Create a result sync message wrapping export batch data.
 *
 * @param {Object} params
 * @param {string} params.nodeId - Sending peer
 * @param {string} params.domain - Domain this batch covers
 * @param {Object} params.batch - Export batch from RemoteCrawlerAdapter.exportBatch()
 * @returns {Object} Result sync message
 */
function createResultSync({ nodeId, domain, batch }) {
  return {
    type: MessageTypes.RESULT_SYNC,
    version: PROTOCOL_VERSION,
    nodeId,
    domain,
    timestamp: new Date().toISOString(),
    batchId: batch.batchId || `sync-${Date.now().toString(36)}`,
    watermark: batch.watermark || null,
    counts: batch.counts || { urls: 0, links: 0 },
    batch,
  };
}

/**
 * Create an intelligence share message.
 *
 * @param {Object} params
 * @param {string} params.nodeId - Sharing peer
 * @param {string} params.domain - Domain the intelligence covers
 * @param {Object} params.intelligence - Domain intelligence data
 * @returns {Object} Intelligence share message
 */
function createIntelligenceShare({ nodeId, domain, intelligence }) {
  return {
    type: MessageTypes.INTEL_SHARE,
    version: PROTOCOL_VERSION,
    nodeId,
    domain,
    timestamp: new Date().toISOString(),
    intelligence,
  };
}

/**
 * Create a heartbeat message.
 *
 * @param {Object} params
 * @param {string} params.nodeId
 * @param {Object} [params.summary={}] - Brief status summary
 * @returns {Object} Heartbeat message
 */
function createHeartbeat({ nodeId, summary = {} }) {
  return {
    type: MessageTypes.HEARTBEAT,
    version: PROTOCOL_VERSION,
    nodeId,
    timestamp: new Date().toISOString(),
    summary,
  };
}

// ── Validation ──────────────────────────────────────────────

/**
 * Validate a protocol message has required fields.
 *
 * @param {Object} msg - Message to validate
 * @returns {{ valid: boolean, error?: string }}
 */
function validateMessage(msg) {
  if (!msg || typeof msg !== 'object') {
    return { valid: false, error: 'Message must be a non-null object' };
  }
  if (!msg.type || !Object.values(MessageTypes).includes(msg.type)) {
    return { valid: false, error: `Unknown message type: ${msg.type}` };
  }
  if (!msg.version) {
    return { valid: false, error: 'Missing protocol version' };
  }
  if (!msg.nodeId && msg.type !== MessageTypes.WORK_ASSIGN) {
    return { valid: false, error: 'Missing nodeId' };
  }
  return { valid: true };
}

module.exports = {
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
