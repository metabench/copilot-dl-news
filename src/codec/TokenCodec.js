/**
 * TokenCodec — Encode, decode, sign, and validate continuation tokens
 *
 * Continuation tokens are stateless, signed records that encode:
 * - What operation was completed
 * - What parameters were used
 * - What results were returned (digest, not full data)
 * - What actions can happen next
 *
 * NEW (Compact Token Format):
 * Tokens are now indexed references stored in memory cache:
 *   Token format: "cmd-v1-reqID-actionID-checksum" (typically 16-24 chars)
 *   Data stored in: process-scoped or file-based cache (tmp/.ai-cache/)
 *   Size reduction: 846 chars → 16 chars (50x smaller!)
 *
 * Lookup flow:
 *   1. AI receives compact token (16 chars)
 *   2. AI passes token to CLI via stdin
 *   3. CLI looks up token in cache, retrieves full payload
 *   4. CLI validates payload and executes action
 *
 * Cache management:
 *   - In-process: Map<tokenId, payload> for same-session reuse
 *   - File-based: tmp/.ai-cache/YYYY-MM-DD/ for cross-session
 *   - TTL: 1 hour (same as original tokens)
 *   - Cleanup: Automatic on startup, manual with --cache-cleanup
 *
 * @module TokenCodec
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * In-process token cache (shared across CLI invocations in same process)
 */
const IN_PROCESS_CACHE = new Map();

/**
 * Get cache directory for file-based persistence
 */
function getCacheDir() {
  return path.join(os.tmpdir(), '.ai-cache');
}

/**
 * Get cache file path for a given date
 */
function getCachePath(date) {
  const dir = getCacheDir();
  const dateStr = date.toISOString().split('T')[0];
  return path.join(dir, `tokens-${dateStr}.json`);
}

/**
 * Load cache from file
 */
function loadCacheFromFile() {
  try {
    const cachePath = getCachePath(new Date());
    if (fs.existsSync(cachePath)) {
      const data = fs.readFileSync(cachePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    // Ignore file errors, cache is optional
  }
  return {};
}

/**
 * Save cache to file (one file per day)
 */
function saveCacheToFile(cacheData) {
  try {
    const cacheDir = getCacheDir();
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    const cachePath = getCachePath(new Date());
    fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2), 'utf-8');
  } catch (err) {
    // Ignore file errors, tokens can still be used in-process
  }
}

/**
 * Store a token payload in cache
 * Returns the compact token ID
 */
function storeTokenInCache(tokenId, payload) {
  // Store in-process
  IN_PROCESS_CACHE.set(tokenId, payload);

  // Also store in file for persistence
  try {
    const cacheData = loadCacheFromFile();
    cacheData[tokenId] = {
      ...payload,
      _cached_at: new Date().toISOString()
    };
    saveCacheToFile(cacheData);
  } catch (err) {
    // Continue even if file save fails
  }

  return tokenId;
}

/**
 * Retrieve token payload from cache
 */
function retrieveTokenFromCache(tokenId) {
  // Try in-process cache first
  if (IN_PROCESS_CACHE.has(tokenId)) {
    return IN_PROCESS_CACHE.get(tokenId);
  }

  // Fall back to file cache
  try {
    const cacheData = loadCacheFromFile();
    if (cacheData[tokenId]) {
      // Also cache in-process for future lookups
      IN_PROCESS_CACHE.set(tokenId, cacheData[tokenId]);
      return cacheData[tokenId];
    }
  } catch (err) {
    // Ignore file errors
  }

  return null;
}

/**
 * Generate a compact token ID
 * Format: cmd-v1-reqID-actionID-checksum
 * Example: js-scan-v1-abc123-analyze-0-def456
 * Typical length: 20-24 characters
 */
function generateCompactTokenId(command, requestId, actionId, payloadChecksum) {
  const shortReqId = requestId.substring(requestId.lastIndexOf('_') + 1);
  const shortAction = actionId.split(':')[0].substring(0, 3); // e.g., 'ana' from 'analyze'
  const shortChecksum = payloadChecksum.substring(0, 4);
  return `${command.substring(0, 3)}-${shortReqId}-${shortAction}-${shortChecksum}`.toLowerCase();
}

/**
 * Compute checksum of payload for token ID
 */
function computePayloadChecksum(payload) {
  const json = JSON.stringify(payload);
  const hash = crypto.createHash('sha256').update(json).digest('hex');
  return hash.substring(0, 8);
}

/**
 * Default configuration for tokens.
 * Can be overridden per-token or globally.
 */
const DEFAULTS = {
  ttl_seconds: 3600,        // 1 hour
  version: 1,               // Token format version
  replayable: true,         // Can be called multiple times
  idempotent: true,         // Safe to retry
  file_safe: true,          // Can be stored in version control
  use_compact_tokens: true, // Use compact token references by default
};

/**
 * Derive secret key for signing tokens.
 *
 * Strategy:
 * 1. Use environment variable if available (production)
 * 2. Fall back to hash(repo_root + version) for deterministic dev
 *
 * @param {Object} options
 * @param {string} options.repo_root - Repository root directory
 * @param {number} options.version - Token format version
 * @returns {string} Secret key (32+ bytes hex)
 */
function deriveSecretKey(options = {}) {
  const { repo_root = process.cwd(), version = DEFAULTS.version } = options;

  // Production: use environment variable if available
  if (process.env.AI_NATIVE_CLI_SECRET) {
    return process.env.AI_NATIVE_CLI_SECRET;
  }

  // Development: derive from repo root + version
  // This ensures tokens are bound to the repository
  const material = `${repo_root}:v${version}`;
  const hash = crypto.createHash('sha256').update(material).digest('hex');
  return hash;
}

/**
 * Generate a continuation token (compact format).
 *
 * NEW: Returns a compact reference (16-24 chars) instead of full payload.
 * Full payload is stored in cache (in-process + file).
 *
 * @param {Object} payload - Token payload
 * @param {string} payload.command - CLI command (js-scan, js-edit, workflow)
 * @param {string} payload.action - Operation (search, locate, extract, etc.)
 * @param {Object} payload.context - Operation context
 * @param {string} payload.context.request_id - Unique request ID
 * @param {string} [payload.context.source_token] - Parent token (for chain tracing)
 * @param {string} [payload.context.results_digest] - SHA256 of results
 * @param {Object} payload.parameters - Original parameters
 * @param {Array<Object>} payload.next_actions - Available next actions
 * @param {Object} [options]
 * @param {number} [options.ttl_seconds] - Time to live (default 3600)
 * @param {string} [options.secret_key] - Secret key for signing
 * @param {string} [options.repo_root] - Repository root (for key derivation)
 * @param {boolean} [options.use_compact] - Use compact token format (default true)
 * @returns {string} Compact token ID (16-24 chars) or full Base64URL token
 */
function encode(payload, options = {}) {
  const {
    ttl_seconds = DEFAULTS.ttl_seconds,
    secret_key = deriveSecretKey(options),
    repo_root = options.repo_root || process.cwd(),
    use_compact = DEFAULTS.use_compact_tokens,
  } = options;

  // Ensure payload has required fields
  if (!payload.command) throw new Error('Token payload missing "command"');
  if (!payload.action) throw new Error('Token payload missing "action"');
  if (!payload.context) throw new Error('Token payload missing "context"');
  if (!payload.parameters) throw new Error('Token payload missing "parameters"');
  if (!Array.isArray(payload.next_actions)) {
    throw new Error('Token payload missing "next_actions" array');
  }

  const now = Math.floor(Date.now() / 1000);
  const expires_at = now + ttl_seconds;

  // Build complete token payload
  const tokenPayload = {
    version: DEFAULTS.version,
    issued_at: now,
    expires_at,
    command: payload.command,
    action: payload.action,
    context: {
      request_id: payload.context.request_id || generateRequestId(),
      source_token: payload.context.source_token || null,
      results_digest: payload.context.results_digest || null,
    },
    parameters: payload.parameters,
    next_actions: payload.next_actions,
    metadata: {
      ttl_seconds,
      replayable: DEFAULTS.replayable,
      idempotent: DEFAULTS.idempotent,
      file_safe: DEFAULTS.file_safe,
    },
  };

  if (!use_compact) {
    // LEGACY: Return full Base64URL token (for backwards compatibility)
    const signature = createSignature(tokenPayload, { secret_key });
    const tokenData = {
      payload: tokenPayload,
      signature,
    };
    const json = JSON.stringify(tokenData);
    const encoded = Buffer.from(json).toString('base64');
    return encodeBase64URL(encoded);
  }

  // NEW: Store in cache and return compact reference
  const checksum = computePayloadChecksum(tokenPayload);
  const tokenId = generateCompactTokenId(
    payload.command,
    tokenPayload.context.request_id,
    payload.action,
    checksum
  );

  storeTokenInCache(tokenId, tokenPayload);
  return tokenId;
}

/**
 * Decode a continuation token (handles both compact and full formats).
 *
 * NEW: Compact tokens are looked up in cache.
 * LEGACY: Full Base64URL tokens are decoded directly.
 *
 * Strategy:
 * 1. Try to decode as full Base64URL token first (if it looks like Base64)
 * 2. Fall back to compact token lookup (short IDs)
 *
 * @param {string} token - Token (compact ID or Base64URL)
 * @returns {{payload: Object, signature: string|null}} Decoded token
 * @throws {Error} If token is invalid format
 */
function decode(token) {
  // Heuristic: if token contains Base64 characters and is reasonably long, try as full token first
  if (token.length >= 50 || /[+/_=-]/.test(token)) {
    try {
      const decoded = decodeBase64URL(token);
      const json = Buffer.from(decoded, 'base64').toString('utf-8');
      const tokenData = JSON.parse(json);

      if (tokenData.payload && tokenData.signature) {
        return {
          ...tokenData,
          _is_compact: false
        };
      }
    } catch (err) {
      // Fall through to compact token lookup
    }
  }

  // Try as compact token ID (short reference)
  const payload = retrieveTokenFromCache(token);
  if (payload) {
    return {
      payload,
      signature: null,
      _token_id: token,
      _is_compact: true
    };
  }

  // If not in cache and doesn't look like full token, it's invalid
  if (token.length >= 50 || /[+/_=-]/.test(token)) {
    throw new Error(`Failed to decode token: Invalid token format`);
  }

  // Short token not found in cache
  throw new Error(`Token not found in cache: ${token}`);
}

/**
 * Validate a decoded token.
 *
 * NEW: Compact tokens skip signature validation (cache-based).
 * LEGACY: Full tokens validate signature and expiration.
 *
 * @param {Object} decoded - Decoded token {payload, signature, _is_compact}
 * @param {Object} [options]
 * @param {string} [options.secret_key] - Secret key for verification
 * @param {string} [options.repo_root] - Repository root
 * @param {string} [options.expected_action] - Check that token allows this action
 * @param {string} [options.expected_digest] - Check results digest (optional)
 * @returns {{valid: boolean, error: string|null, warning: string|null}}
 */
function validate(decoded, options = {}) {
  const {
    secret_key = deriveSecretKey(options),
    expected_action = null,
    expected_digest = null,
  } = options;

  try {
    // Check structure
    if (!decoded || !decoded.payload) {
      return { valid: false, error: 'Invalid token structure' };
    }

    const { payload, signature, _is_compact } = decoded;

    // Compact tokens skip signature validation (they're cache-based)
    if (!_is_compact && signature) {
      // Validate signature for full tokens
      if (!verifySignature(payload, signature, { secret_key })) {
        return { valid: false, error: 'Signature validation failed (token may be tampered with)' };
      }
    }

    // Check expiration (applies to both formats)
    const now = Math.floor(Date.now() / 1000);
    if (payload.expires_at <= now) {
      return {
        valid: false,
        error: 'Token expired',
        code: 'TOKEN_EXPIRED',
        recovery: {
          reissue_token: true,
        },
      };
    }

    // Check version
    if (payload.version !== DEFAULTS.version) {
      return {
        valid: false,
        error: `Token version mismatch (expected ${DEFAULTS.version}, got ${payload.version})`,
      };
    }

    // Check action whitelist
    if (expected_action) {
      const allowedActions = payload.next_actions.map(a => a.id);
      if (!allowedActions.includes(expected_action)) {
        return {
          valid: false,
          error: `Action '${expected_action}' not allowed by this token`,
          code: 'ACTION_NOT_ALLOWED',
          allowed_actions: allowedActions,
        };
      }
    }

    // Check digest (optional)
    let warning = null;
    if (expected_digest && payload.context.results_digest) {
      if (payload.context.results_digest !== expected_digest) {
        warning = 'Results digest mismatch (files may have changed since token was issued)';
      }
    }

    return { valid: true, error: null, warning };
  } catch (err) {
    return { valid: false, error: `Validation error: ${err.message}` };
  }
}

/**
 * Create a signature for a token payload.
 *
 * Signature ensures:
 * - Token wasn't tampered with
 * - Token is bound to this repository
 * - Token is bound to this version of the CLI
 *
 * @param {Object} payload - Token payload (JSON)
 * @param {Object} options
 * @param {string} options.secret_key - Secret key for signing
 * @returns {string} HMAC-SHA256 signature (hex)
 */
function createSignature(payload, options = {}) {
  const { secret_key = deriveSecretKey() } = options;

  const json = JSON.stringify(payload);
  const hmac = crypto.createHmac('sha256', secret_key);
  hmac.update(json);
  return hmac.digest('hex');
}

/**
 * Verify a token signature.
 *
 * @param {Object} payload - Token payload (JSON)
 * @param {string} signature - Expected signature (hex)
 * @param {Object} options
 * @param {string} options.secret_key - Secret key for verification
 * @returns {boolean} True if signature is valid
 */
function verifySignature(payload, signature, options = {}) {
  try {
    const expected = createSignature(payload, options);
    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(signature, 'hex')
    );
  } catch (err) {
    return false;
  }
}

/**
 * Extract the payload from a token (convenience method).
 *
 * @param {string} token - Encoded token
 * @param {Object} [options] - Options for validate()
 * @returns {Object} Token payload
 * @throws {Error} If token is invalid
 */
function getPayload(token, options = {}) {
  const decoded = decode(token);
  const validation = validate(decoded, options);

  if (!validation.valid) {
    throw new Error(validation.error);
  }

  return decoded.payload;
}

/**
 * Generate a unique request ID.
 *
 * Format: req_<command>_<timestamp>_<random>
 * Example: req_search_20251113_abc123
 *
 * @param {string} [command] - Command name (js-scan, js-edit, etc.)
 * @returns {string} Request ID
 */
function generateRequestId(command = 'generic') {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `req_${command}_${timestamp}_${random}`;
}

/**
 * Compute SHA256 digest of data.
 *
 * Used for results_digest field to detect stale results.
 *
 * @param {string|Object} data - Data to digest
 * @returns {string} "sha256:<hex>"
 */
function computeDigest(data) {
  const json = typeof data === 'string' ? data : JSON.stringify(data);
  const hash = crypto.createHash('sha256').update(json).digest('hex');
  return `sha256:${hash}`;
}

/**
 * Base64URL encoding (RFC 4648).
 *
 * @param {string} str - Base64 string
 * @returns {string} Base64URL string
 */
function encodeBase64URL(str) {
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Base64URL decoding (RFC 4648).
 *
 * @param {string} str - Base64URL string
 * @returns {string} Base64 string
 */
function decodeBase64URL(str) {
  // Add padding if needed
  let padded = str + '==='.substring(0, (4 - (str.length % 4)) % 4);
  // Convert URL-safe to standard Base64
  return padded.replace(/-/g, '+').replace(/_/g, '/');
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  encode,
  decode,
  validate,
  getPayload,
  createSignature,
  verifySignature,
  deriveSecretKey,
  computeDigest,
  generateRequestId,
  encodeBase64URL,
  decodeBase64URL,
  DEFAULTS,
};
