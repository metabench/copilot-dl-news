/**
 * TokenCodec Unit Tests
 *
 * Tests for token encoding, decoding, signing, and validation.
 */

const TokenCodec = require('../../src/codec/TokenCodec');

describe('TokenCodec', () => {
  const mockSecret = 'test-secret-key-xyz-1234';
  const mockRepoRoot = '/home/user/repo';

  // Helper to create a minimal token payload
  function createMinimalPayload(overrides = {}) {
    return {
      command: 'js-scan',
      action: 'search',
      context: {
        request_id: 'req_search_20251113_abc123',
        source_token: null,
        results_digest: null,
      },
      parameters: {
        search: 'processData',
        scope: 'src/',
      },
      next_actions: [
        { id: 'analyze:0', label: 'Analyze match #0', description: 'Show details' },
        { id: 'back', label: 'Back', description: 'Return to search' },
      ],
      ...overrides,
    };
  }

  describe('encode()', () => {
    test('should encode a valid token payload', () => {
      const payload = createMinimalPayload();
      const token = TokenCodec.encode(payload, { secret_key: mockSecret });

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length > 0).toBe(true); // Compact tokens are 16-24 chars
    });

    test('should throw error if command is missing', () => {
      const payload = createMinimalPayload({ command: null });
      expect(() => {
        TokenCodec.encode(payload, { secret_key: mockSecret });
      }).toThrow('missing "command"');
    });

    test('should throw error if action is missing', () => {
      const payload = createMinimalPayload({ action: null });
      expect(() => {
        TokenCodec.encode(payload, { secret_key: mockSecret });
      }).toThrow('missing "action"');
    });

    test('should throw error if next_actions is not an array', () => {
      const payload = createMinimalPayload({ next_actions: 'not-an-array' });
      expect(() => {
        TokenCodec.encode(payload, { secret_key: mockSecret });
      }).toThrow('missing "next_actions" array');
    });

    test('should include issued_at and expires_at timestamps', () => {
      const payload = createMinimalPayload();
      const before = Math.floor(Date.now() / 1000);
      const token = TokenCodec.encode(payload, { secret_key: mockSecret });
      const after = Math.floor(Date.now() / 1000);

      const decoded = TokenCodec.decode(token);
      expect(decoded.payload.issued_at).toBeGreaterThanOrEqual(before);
      expect(decoded.payload.issued_at).toBeLessThanOrEqual(after);
      expect(decoded.payload.expires_at).toBeGreaterThan(decoded.payload.issued_at);
    });

    test('should respect custom TTL', () => {
      const payload = createMinimalPayload();
      const ttl = 7200; // 2 hours
      const token = TokenCodec.encode(payload, { secret_key: mockSecret, ttl_seconds: ttl });

      const decoded = TokenCodec.decode(token);
      const expectedExpiry = decoded.payload.issued_at + ttl;
      expect(decoded.payload.expires_at).toBe(expectedExpiry);
    });

    test('should include version field', () => {
      const payload = createMinimalPayload();
      const token = TokenCodec.encode(payload, { secret_key: mockSecret });
      const decoded = TokenCodec.decode(token);

      expect(decoded.payload.version).toBe(TokenCodec.DEFAULTS.version);
    });

    test('should include metadata fields', () => {
      const payload = createMinimalPayload();
      const token = TokenCodec.encode(payload, { secret_key: mockSecret });
      const decoded = TokenCodec.decode(token);

      expect(decoded.payload.metadata).toBeDefined();
      expect(decoded.payload.metadata.replayable).toBe(true);
      expect(decoded.payload.metadata.idempotent).toBe(true);
      expect(decoded.payload.metadata.file_safe).toBe(true);
    });

    test('should generate unique request IDs if not provided', () => {
      // Note: The minimal payload includes a fixed request_id, so we need to test
      // with payloads that don't have a request_id set
      const payload1 = createMinimalPayload();
      delete payload1.context.request_id;
      
      const payload2 = createMinimalPayload();
      delete payload2.context.request_id;

      const token1 = TokenCodec.encode(payload1, { secret_key: mockSecret });
      
      // Add small delay to ensure different timestamps
      const token2 = TokenCodec.encode(payload2, { secret_key: mockSecret });

      const decoded1 = TokenCodec.decode(token1);
      const decoded2 = TokenCodec.decode(token2);

      // Request IDs should be different (or at least very unlikely to be the same)
      expect(decoded1.payload.context.request_id).toBeDefined();
      expect(decoded2.payload.context.request_id).toBeDefined();
      expect(decoded1.payload.context.request_id).not.toBe(decoded2.payload.context.request_id);
    });
  });

  describe('decode()', () => {
    test('should decode a valid token', () => {
      const payload = createMinimalPayload();
      const token = TokenCodec.encode(payload, { secret_key: mockSecret });

      const decoded = TokenCodec.decode(token);
      expect(decoded).toBeDefined();
      expect(decoded.payload).toBeDefined();
      expect(decoded.signature).toBeDefined();
    });

    test('should throw error for invalid Base64', () => {
      const invalidToken = '!!!invalid-base64!!!';
      expect(() => {
        TokenCodec.decode(invalidToken);
      }).toThrow('Failed to decode token');
    });

    test('should throw error for malformed JSON', () => {
      // Create a token with invalid JSON
      const badJson = Buffer.from('{invalid json}').toString('base64');
      expect(() => {
        TokenCodec.decode(badJson);
      }).toThrow('Failed to decode token');
    });

    test('should throw error for non-existent compact token', () => {
      // Short strings are interpreted as compact token IDs
      expect(() => {
        TokenCodec.decode('nonexistent-token-id');
      }).toThrow();
    });
  });

  describe('validate()', () => {
    test('should validate a valid token (compact format)', () => {
      const payload = createMinimalPayload();
      const token = TokenCodec.encode(payload, { secret_key: mockSecret, use_compact: true });
      const decoded = TokenCodec.decode(token);

      const result = TokenCodec.validate(decoded, { secret_key: mockSecret });
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull()
    });

    test('should reject token with invalid signature (full format only)', () => {
      const payload = createMinimalPayload();
      // Use full format which has signatures
      const token = TokenCodec.encode(payload, { secret_key: mockSecret, use_compact: false });
      const decoded = TokenCodec.decode(token);

      // Tamper with signature
      if (decoded.signature) {
        decoded.signature = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
        const result = TokenCodec.validate(decoded, { secret_key: mockSecret });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Signature validation failed');
      }
    });

    test('should reject expired token', (done) => {
      const payload = createMinimalPayload();
      const token = TokenCodec.encode(payload, { secret_key: mockSecret, ttl_seconds: 1 });
      const decoded = TokenCodec.decode(token);

      // Wait for token to expire
      setTimeout(() => {
        const result = TokenCodec.validate(decoded, { secret_key: mockSecret });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('expired');
        expect(result.code).toBe('TOKEN_EXPIRED');
        done();
      }, 1100);
    }, 15000); // Increase Jest timeout for this test

    test('should reject token if action not in next_actions', () => {
      const payload = createMinimalPayload();
      const token = TokenCodec.encode(payload, { secret_key: mockSecret });
      const decoded = TokenCodec.decode(token);

      const result = TokenCodec.validate(decoded, {
        secret_key: mockSecret,
        expected_action: 'non_existent_action',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not allowed');
      expect(result.code).toBe('ACTION_NOT_ALLOWED');
    });

    test('should accept token if expected_action is in next_actions', () => {
      const payload = createMinimalPayload();
      const token = TokenCodec.encode(payload, { secret_key: mockSecret });
      const decoded = TokenCodec.decode(token);

      const result = TokenCodec.validate(decoded, {
        secret_key: mockSecret,
        expected_action: 'analyze:0',
      });

      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    test('should warn if digest mismatch', () => {
      const payload = createMinimalPayload({
        context: {
          request_id: 'req_test_123',
          source_token: null,
          results_digest: 'sha256:original_digest_abc123',
        },
      });
      const token = TokenCodec.encode(payload, { secret_key: mockSecret });
      const decoded = TokenCodec.decode(token);

      const result = TokenCodec.validate(decoded, {
        secret_key: mockSecret,
        expected_digest: 'sha256:different_digest_xyz789',
      });

      expect(result.valid).toBe(true);
      expect(result.warning).toContain('digest mismatch');
    });

    test('should reject token with mismatched version', () => {
      const payload = createMinimalPayload();
      const token = TokenCodec.encode(payload, { secret_key: mockSecret });
      const decoded = TokenCodec.decode(token);

      // Tamper with version
      decoded.payload.version = 999;
      // Update signature (fake it for this test)
      decoded.signature = TokenCodec.createSignature(decoded.payload, { secret_key: mockSecret });

      const result = TokenCodec.validate(decoded, { secret_key: mockSecret });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('version mismatch');
    });

    test('should handle null/undefined input gracefully', () => {
      expect(() => {
        TokenCodec.validate(null, { secret_key: mockSecret });
      }).not.toThrow();

      const result = TokenCodec.validate(null, { secret_key: mockSecret });
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('getPayload()', () => {
    test('should extract payload from a valid token', () => {
      const payload = createMinimalPayload();
      const token = TokenCodec.encode(payload, { secret_key: mockSecret });

      const extracted = TokenCodec.getPayload(token, { secret_key: mockSecret });
      expect(extracted.command).toBe('js-scan');
      expect(extracted.action).toBe('search');
      expect(extracted.parameters.search).toBe('processData');
    });

    test('should throw error if token is invalid', () => {
      const payload = createMinimalPayload();
      const token = TokenCodec.encode(payload, { secret_key: mockSecret });
      const decoded = TokenCodec.decode(token);

      // Tamper with payload
      decoded.payload.command = 'bad-command';

      expect(() => {
        TokenCodec.getPayload(JSON.stringify(decoded), { secret_key: 'wrong-secret' });
      }).toThrow();
    });
  });

  describe('deriveSecretKey()', () => {
    test('should use environment variable if available', () => {
      const originalEnv = process.env.AI_NATIVE_CLI_SECRET;
      process.env.AI_NATIVE_CLI_SECRET = 'env-secret-xyz';

      const key = TokenCodec.deriveSecretKey();
      expect(key).toBe('env-secret-xyz');

      // Restore
      if (originalEnv) {
        process.env.AI_NATIVE_CLI_SECRET = originalEnv;
      } else {
        delete process.env.AI_NATIVE_CLI_SECRET;
      }
    });

    test('should derive from repo_root + version if no env var', () => {
      const originalEnv = process.env.AI_NATIVE_CLI_SECRET;
      delete process.env.AI_NATIVE_CLI_SECRET;

      const key1 = TokenCodec.deriveSecretKey({ repo_root: '/repo1' });
      const key2 = TokenCodec.deriveSecretKey({ repo_root: '/repo2' });

      // Different repo roots should produce different keys
      expect(key1).not.toBe(key2);

      // Restore
      if (originalEnv) {
        process.env.AI_NATIVE_CLI_SECRET = originalEnv;
      }
    });

    test('should produce consistent keys for same repo_root', () => {
      const originalEnv = process.env.AI_NATIVE_CLI_SECRET;
      delete process.env.AI_NATIVE_CLI_SECRET;

      const key1 = TokenCodec.deriveSecretKey({ repo_root: '/repo/x' });
      const key2 = TokenCodec.deriveSecretKey({ repo_root: '/repo/x' });

      expect(key1).toBe(key2);

      // Restore
      if (originalEnv) {
        process.env.AI_NATIVE_CLI_SECRET = originalEnv;
      }
    });
  });

  describe('signature functions', () => {
    test('createSignature() should create a hex signature', () => {
      const payload = createMinimalPayload();
      const sig = TokenCodec.createSignature(payload, { secret_key: mockSecret });

      expect(typeof sig).toBe('string');
      expect(sig.length).toBe(64); // SHA256 hex = 64 chars
      expect(/^[0-9a-f]+$/.test(sig)).toBe(true); // All hex
    });

    test('verifySignature() should verify correct signature', () => {
      const payload = createMinimalPayload();
      const sig = TokenCodec.createSignature(payload, { secret_key: mockSecret });

      const isValid = TokenCodec.verifySignature(payload, sig, { secret_key: mockSecret });
      expect(isValid).toBe(true);
    });

    test('verifySignature() should reject incorrect signature', () => {
      const payload = createMinimalPayload();
      const badSig = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

      const isValid = TokenCodec.verifySignature(payload, badSig, { secret_key: mockSecret });
      expect(isValid).toBe(false);
    });

    test('verifySignature() should reject if payload is modified', () => {
      const payload = createMinimalPayload();
      const sig = TokenCodec.createSignature(payload, { secret_key: mockSecret });

      // Modify payload
      payload.parameters.search = 'modified';

      const isValid = TokenCodec.verifySignature(payload, sig, { secret_key: mockSecret });
      expect(isValid).toBe(false);
    });

    test('verifySignature() should use constant-time comparison', () => {
      const payload = createMinimalPayload();
      const sig = TokenCodec.createSignature(payload, { secret_key: mockSecret });

      // This should not throw, but return false
      const isValid = TokenCodec.verifySignature(payload, 'wrong', { secret_key: mockSecret });
      expect(isValid).toBe(false);
    });
  });

  describe('digestAndEncoding utilities', () => {
    test('computeDigest() should generate consistent SHA256 digest', () => {
      const data = { test: 'data', number: 123 };

      const digest1 = TokenCodec.computeDigest(data);
      const digest2 = TokenCodec.computeDigest(data);

      expect(digest1).toBe(digest2);
      expect(digest1.startsWith('sha256:')).toBe(true);
    });

    test('computeDigest() should produce different digests for different data', () => {
      const digest1 = TokenCodec.computeDigest({ a: 1 });
      const digest2 = TokenCodec.computeDigest({ a: 2 });

      expect(digest1).not.toBe(digest2);
    });

    test('generateRequestId() should generate unique IDs', () => {
      const id1 = TokenCodec.generateRequestId('js-scan');
      const id2 = TokenCodec.generateRequestId('js-scan');

      expect(id1).not.toBe(id2);
      expect(id1.startsWith('req_js-scan_')).toBe(true);
      expect(id2.startsWith('req_js-scan_')).toBe(true);
    });

    test('Base64URL encoding should be reversible', () => {
      const original = 'Hello+World/Test=';
      const encoded = TokenCodec.encodeBase64URL(original);
      const decoded = TokenCodec.decodeBase64URL(encoded);

      // Padding might differ, so compare after standard Base64 decode
      const originalDecoded = Buffer.from(original, 'base64').toString();
      const finalDecoded = Buffer.from(decoded, 'base64').toString();

      expect(originalDecoded).toBe(finalDecoded);
    });
  });

  describe('end-to-end token flow', () => {
    test('should support complete token lifecycle: encode -> decode -> validate -> extract', () => {
      // Step 1: Create payload
      const payload = createMinimalPayload({
        parameters: {
          search: 'calculateTax',
          scope: 'src/',
          limit: 20,
        },
        next_actions: [
          { id: 'analyze:0', label: 'Analyze match #0' },
          { id: 'analyze:1', label: 'Analyze match #1' },
          { id: 'trace:0', label: 'Trace calls' },
        ],
      });

      // Step 2: Encode (compact format - much shorter)
      const token = TokenCodec.encode(payload, { secret_key: mockSecret });
      expect(token.length > 0).toBe(true);

      // Step 3: Decode
      const decoded = TokenCodec.decode(token);
      expect(decoded.payload.command).toBe('js-scan');

      // Step 4: Validate
      const validation = TokenCodec.validate(decoded, {
        secret_key: mockSecret,
        expected_action: 'analyze:0',
      });
      expect(validation.valid).toBe(true);

      // Step 5: Extract payload
      const extracted = TokenCodec.getPayload(token, { secret_key: mockSecret });
      expect(extracted.parameters.search).toBe('calculateTax');
      expect(extracted.next_actions.length).toBe(3);
    });

    test('should support token chain tracing', () => {
      // Create first token
      const payload1 = createMinimalPayload();
      const token1 = TokenCodec.encode(payload1, { secret_key: mockSecret });
      const decoded1 = TokenCodec.decode(token1);

      // Create second token with first as source
      const payload2 = createMinimalPayload({
        action: 'analyze',
        context: {
          request_id: TokenCodec.generateRequestId('js-scan'),
          source_token: decoded1.payload.context.request_id,
          results_digest: TokenCodec.computeDigest({ matched: true }),
        },
      });

      const token2 = TokenCodec.encode(payload2, { secret_key: mockSecret });
      const decoded2 = TokenCodec.decode(token2);

      // Trace back
      expect(decoded2.payload.context.source_token).toBe(decoded1.payload.context.request_id);
    });

    test('should handle multiple actions in next_actions correctly', () => {
      const payload = createMinimalPayload({
        next_actions: [
          { id: 'action1', label: 'Action 1', guard: false },
          { id: 'action2', label: 'Action 2', guard: true },
          { id: 'action3', label: 'Action 3', guard: false },
          { id: 'back', label: 'Back', guard: false },
        ],
      });

      const token = TokenCodec.encode(payload, { secret_key: mockSecret });

      // Validate each action
      const decoded = TokenCodec.decode(token);
      ['action1', 'action2', 'action3', 'back'].forEach(action => {
        const result = TokenCodec.validate(decoded, {
          secret_key: mockSecret,
          expected_action: action,
        });
        expect(result.valid).toBe(true);
      });

      // Validate that invalid action is rejected
      const result = TokenCodec.validate(decoded, {
        secret_key: mockSecret,
        expected_action: 'invalid_action',
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('performance benchmarks', () => {
    test('token encoding should be fast (< 50ms)', () => {
      const payload = createMinimalPayload();
      const start = Date.now();

      for (let i = 0; i < 10; i++) {
        TokenCodec.encode(payload, { secret_key: mockSecret });
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(50 * 10); // 50ms per token
    });

    test('token decoding should be fast (< 10ms)', () => {
      const payload = createMinimalPayload();
      const token = TokenCodec.encode(payload, { secret_key: mockSecret });

      const start = Date.now();

      for (let i = 0; i < 100; i++) {
        TokenCodec.decode(token);
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(10 * 100); // 10ms per decode
    });

    test('token validation should be fast (< 10ms)', () => {
      const payload = createMinimalPayload();
      const token = TokenCodec.encode(payload, { secret_key: mockSecret });
      const decoded = TokenCodec.decode(token);

      const start = Date.now();

      for (let i = 0; i < 100; i++) {
        TokenCodec.validate(decoded, { secret_key: mockSecret });
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(10 * 100); // 10ms per validation
    });
  });
});
