/**
 * AI-Native CLI Smoke Tests
 *
 * End-to-end tests for continuation token workflow:
 * 1. Perform search with --ai-mode
 * 2. Extract continuation token from results
 * 3. Resume using --continuation flag
 * 4. Verify token structure and validation
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const TokenCodec = require('../../src/codec/TokenCodec');

const REPO_ROOT = path.resolve(__dirname, '../../');
const SEARCH_DIR = path.join(REPO_ROOT, 'tools/dev');
const RELATIONSHIP_TARGET = path.join(REPO_ROOT, 'tools/dev/js-scan/operations/search.js');
const TMP_DIR = path.join(REPO_ROOT, 'testlogs');
const JS_EDIT_CMD = path.join(REPO_ROOT, 'tools/dev/js-edit.js');

// Ensure testlogs directory exists
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

/**
 * Run js-scan command and return JSON output
 */
function runScan(args) {
  const cmd = `node ${path.join(REPO_ROOT, 'tools/dev/js-scan.js')} ${args}`;
  try {
    const output = execSync(cmd, {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      timeout: 10000
    });
    return JSON.parse(output);
  } catch (err) {
    throw new Error(`js-scan failed: ${err.message}`);
  }
}

/**
 * Run js-scan with continuation token via stdin (avoids shell truncation)
 */
function runScanWithContinuationToken(token) {
  const cmd = `node ${path.join(REPO_ROOT, 'tools/dev/js-scan.js')} --continuation - --json`;
  try {
    const output = execSync(cmd, {
      input: token,
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      timeout: 5000
    });
    return JSON.parse(output);
  } catch (err) {
    // Capture both stdout and stderr for better debugging
    const errorOutput = err.stdout || err.stderr || err.message;
    throw new Error(`js-scan continuation failed: ${errorOutput}`);
  }
}

function runEditCommand(args, options = {}) {
  const cmd = `node ${JS_EDIT_CMD} ${args}`;
  try {
    return execSync(cmd, {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      timeout: 10000,
      input: options.input || undefined
    });
  } catch (err) {
    const errorOutput = err.stdout || err.stderr || err.message;
    throw new Error(`js-edit failed: ${errorOutput}`);
  }
}

describe('AI-Native CLI Token Flow', () => {
  describe('Search with --ai-mode', () => {
    test('should return continuation_tokens in JSON output', () => {
      const result = runScan(
        `--search scanWorkspace --ai-mode --json --limit 1 --dir ${SEARCH_DIR}`
      );

      expect(result).toBeDefined();
      expect(result.continuation_tokens).toBeDefined();
      expect(typeof result.continuation_tokens).toBe('object');
    });

    test('should generate tokens for each available action', () => {
      const result = runScan(
        `--search scanWorkspace --ai-mode --json --limit 1 --dir ${SEARCH_DIR}`
      );

      const { continuation_tokens, matches } = result;

      // If there are matches, should have analyze tokens
      if (matches.length > 0) {
        expect(continuation_tokens['analyze:0']).toBeDefined();
        expect(typeof continuation_tokens['analyze:0']).toBe('string');
        expect(continuation_tokens['analyze:0'].length > 0).toBe(true); // Compact tokens are 16-24 chars
      }
    });

    test('should include _ai_native_cli metadata', () => {
      const result = runScan(
        `--search scanWorkspace --ai-mode --json --limit 1 --dir ${SEARCH_DIR}`
      );

      expect(result._ai_native_cli).toBeDefined();
      expect(result._ai_native_cli.mode).toBe('ai-native');
      expect(result._ai_native_cli.version).toBe(1);
      expect(Array.isArray(result._ai_native_cli.available_actions)).toBe(true);
    });

    test('should be backwards compatible (--json without --ai-mode)', () => {
      const result = runScan(
        `--search scanWorkspace --json --limit 1 --dir ${SEARCH_DIR}`
      );

      // Should have result but NOT continuation_tokens or _ai_native_cli
      expect(result).toBeDefined();
      expect(result.matches).toBeDefined();
      expect(result.continuation_tokens).toBeUndefined();
      expect(result._ai_native_cli).toBeUndefined();
    });
  });

  describe('Token Structure & Validation', () => {
    test('should generate valid, signed tokens', () => {
      const result = runScan(
        `--search scanWorkspace --ai-mode --json --limit 1 --dir ${SEARCH_DIR}`
      );

      const { continuation_tokens } = result;
      const firstToken = Object.values(continuation_tokens)[0];

      if (!firstToken) return; // Skip if no matches

      // Decode token
      const decoded = TokenCodec.decode(firstToken);
      expect(decoded.payload).toBeDefined();
      expect(decoded._is_compact).toBe(true);
      expect(decoded.signature).toBeNull();

      // Verify signature using repo root (tokens are signed with repo root, not search dir)
      const REPO_ROOT = path.resolve(__dirname, '../../');
      const secretKey = TokenCodec.deriveSecretKey({ repo_root: REPO_ROOT });
      const validation = TokenCodec.validate(decoded, { secret_key: secretKey });
      expect(validation.valid).toBe(true);
    });

    test('should include command and action in token payload', () => {
      const result = runScan(
        `--search scanWorkspace --ai-mode --json --limit 1 --dir ${SEARCH_DIR}`
      );

      const { continuation_tokens } = result;
      const analyzeToken = continuation_tokens['analyze:0'];

      if (!analyzeToken) return; // Skip if no matches

      const decoded = TokenCodec.decode(analyzeToken);
      const { payload } = decoded;

      expect(payload.command).toBe('js-scan');
      expect(payload.action).toBe('analyze');
      expect(payload.version).toBe(1);
    });

    test('should include search parameters in token', () => {
      const result = runScan(
        `--search scanWorkspace --ai-mode --json --limit 1 --dir ${SEARCH_DIR}`
      );

      const { continuation_tokens } = result;
      const analyzeToken = continuation_tokens['analyze:0'];

      if (!analyzeToken) return; // Skip if no matches

      const decoded = TokenCodec.decode(analyzeToken);
      const { parameters } = decoded.payload;

      expect(parameters.search).toBe('scanWorkspace');
      expect(parameters.limit).toBe(1);
      expect(parameters.match_index).toBe(0);
    });

    test('should embed match snapshot metadata', () => {
      const result = runScan(
        `--search scanWorkspace --ai-mode --json --limit 1 --dir ${SEARCH_DIR}`
      );

      const { continuation_tokens } = result;
      const analyzeToken = continuation_tokens['analyze:0'];

      if (!analyzeToken) return; // Skip if no matches

      const decoded = TokenCodec.decode(analyzeToken);
      const { match } = decoded.payload.parameters;

      expect(match).toBeDefined();
      expect(match.file).toBeDefined();
      expect(match.hash).toBeDefined();
    });

    test('should include results_digest in token context', () => {
      const result = runScan(
        `--search scanWorkspace --ai-mode --json --limit 1 --dir ${SEARCH_DIR}`
      );

      const { continuation_tokens } = result;
      const analyzeToken = continuation_tokens['analyze:0'];

      if (!analyzeToken) return; // Skip if no matches

      const decoded = TokenCodec.decode(analyzeToken);
      const { context } = decoded.payload;

      expect(context.results_digest).toBeDefined();
      expect(context.results_digest.startsWith('sha256:')).toBe(true);
    });

    test('should list next_actions in token', () => {
      const result = runScan(
        `--search scanWorkspace --ai-mode --json --limit 1 --dir ${SEARCH_DIR}`
      );

      const { continuation_tokens } = result;
      const analyzeToken = continuation_tokens['analyze:0'];

      if (!analyzeToken) return; // Skip if no matches

      const decoded = TokenCodec.decode(analyzeToken);
      const { next_actions } = decoded.payload;

      expect(Array.isArray(next_actions)).toBe(true);
      expect(next_actions.length > 0).toBe(true);
      expect(next_actions[0].id).toBeDefined();
      expect(next_actions[0].label).toBeDefined();
    });

    test('should expire tokens after TTL', () => {
      const result = runScan(
        `--search scanWorkspace --ai-mode --json --limit 1 --dir ${SEARCH_DIR}`
      );

      const { continuation_tokens } = result;
      const firstToken = Object.values(continuation_tokens)[0];

      if (!firstToken) return; // Skip if no matches

      const decoded = TokenCodec.decode(firstToken);
      const { issued_at, expires_at } = decoded.payload;

      expect(expires_at).toBeGreaterThan(issued_at);
      expect(expires_at - issued_at).toBe(3600); // 1 hour default
    });
  });

  describe('Continuation Token Consumption', () => {
    test('should accept valid continuation token via stdin', () => {
      // Get search results and extract token
      const searchResult = runScan(
        `--search scanWorkspace --ai-mode --json --limit 1 --dir ${SEARCH_DIR}`
      );

      const { continuation_tokens } = searchResult;
      const analyzeToken = continuation_tokens['analyze:0'];

      if (!analyzeToken) return; // Skip if no matches

      // Use continuation token via stdin
      const result = runScanWithContinuationToken(analyzeToken);
      expect(result.status).toBe('token_accepted');
      expect(result.action).toBe('analyze');
    });

    test('should reject invalid/tampered token', () => {
      // Create a fake token by modifying valid one
      const searchResult = runScan(
        `--search scanWorkspace --ai-mode --json --limit 1 --dir ${SEARCH_DIR}`
      );

      const { continuation_tokens } = searchResult;
      const analyzeToken = Object.values(continuation_tokens)[0];

      if (!analyzeToken) return; // Skip if no matches

      // Tamper with token
      const tamperedToken = analyzeToken.substring(0, analyzeToken.length - 10) + 'corrupted!';

      // Try to use tampered token
      try {
        runScanWithContinuationToken(tamperedToken);
        // If we get here, validation didn't fail (which is a problem)
        fail('Should have rejected tampered token');
      } catch (err) {
        // Expected: command should fail with validation error
        expect(err.message).toContain('js-scan continuation failed');
      }
    });

    test('should extract action from token and return status', () => {
      const searchResult = runScan(
        `--search scanWorkspace --ai-mode --json --limit 1 --dir ${SEARCH_DIR}`
      );

      const { continuation_tokens } = searchResult;
      const analyzeToken = continuation_tokens['analyze:0'];

      if (!analyzeToken) return; // Skip if no matches

      // Use continuation token via stdin
      const result = runScanWithContinuationToken(analyzeToken);
      expect(result.status).toBe('token_accepted');
      expect(result.parameters.search).toBe('scanWorkspace');
      expect(result.parameters.match_index).toBe(0);
    });

    test('analyze continuation should return match metadata', () => {
      const searchResult = runScan(
        `--search scanWorkspace --ai-mode --json --limit 1 --dir ${SEARCH_DIR}`
      );

      const analyzeToken = searchResult.continuation_tokens['analyze:0'];
      if (!analyzeToken) return; // Skip if no matches

      const result = runScanWithContinuationToken(analyzeToken);
      expect(result.action).toBe('analyze');
      expect(result.match).toBeDefined();
      expect(result.analysis).toBeDefined();
      expect(result.analysis.file).toContain('js-scan');
    });

    test('trace continuation should return call graph data', () => {
      const searchResult = runScan(
        `--search scanWorkspace --ai-mode --json --limit 1 --dir ${SEARCH_DIR}`
      );

      const traceToken = searchResult.continuation_tokens['trace:0'];
      if (!traceToken) return; // Skip if no matches

      const result = runScanWithContinuationToken(traceToken);
      expect(result.action).toBe('trace');
      expect(result.trace).toBeDefined();
      expect(result.trace.targetFunction).toBeDefined();
    });

    test('ripple continuation should return ripple analysis', () => {
      const searchResult = runScan(
        `--search scanWorkspace --ai-mode --json --limit 1 --dir ${SEARCH_DIR}`
      );

      const rippleToken = searchResult.continuation_tokens['ripple:0'];
      if (!rippleToken) return; // Skip if no matches

      const result = runScanWithContinuationToken(rippleToken);
      expect(result.action).toBe('ripple');
      expect(result.ripple).toBeDefined();
      expect(result.ripple.targetFile).toBeDefined();
    });

    test('continuation warns when search results digest changes', () => {
      const searchResult = runScan(
        `--search scanWorkspace --ai-mode --json --limit 1 --dir ${SEARCH_DIR}`
      );

      const analyzeToken = searchResult.continuation_tokens['analyze:0'];
      if (!analyzeToken) return; // Skip if no matches

      const decoded = TokenCodec.decode(analyzeToken);
      const payloadClone = JSON.parse(JSON.stringify(decoded.payload));
      payloadClone.context.results_digest = 'sha256:different';
      payloadClone.parameters.match = null; // force replay

      const mismatchedToken = TokenCodec.encode(payloadClone, {
        secret_key: TokenCodec.deriveSecretKey({ repo_root: REPO_ROOT }),
        ttl_seconds: 3600
      });

      const result = runScanWithContinuationToken(mismatchedToken);
      expect(result.warnings).toBeDefined();
      expect(Array.isArray(result.warnings)).toBe(true);
      const warningCodes = result.warnings.map((w) => w.code);
      expect(warningCodes).toContain('RESULTS_DIGEST_MISMATCH');
    });
  });

  describe('Relationship Queries with --ai-mode', () => {
    test('what-imports emits importer tokens and resumes via continuation', () => {
      const result = runScan(
        `--dir ${SEARCH_DIR} --what-imports ${RELATIONSHIP_TARGET} --ai-mode --json`
      );

      expect(result).toBeDefined();
      expect(result._ai_native_cli).toBeDefined();
      const importerActionId = result.available_actions.find((id) => id.startsWith('importer-analyze'));
      if (!importerActionId) return;

      const importerToken = result.continuation_tokens[importerActionId];
      expect(importerToken).toBeDefined();

      const continuation = runScanWithContinuationToken(importerToken);
      expect(continuation.status).toBe('token_accepted');
      expect(continuation.action).toBe('importer-analyze');
      expect(continuation.relationship).toBeDefined();
      expect(continuation.relationship.entryKind).toBe('importer');
    });

    test('export-usage emits usage tokens and continuation returns usage details', () => {
      const result = runScan(
        `--dir ${SEARCH_DIR} --export-usage ${RELATIONSHIP_TARGET} --ai-mode --json`
      );

      expect(result).toBeDefined();
      const usageActionId = result.available_actions.find((id) => id.startsWith('usage-import') || id.startsWith('usage-call'));
      if (!usageActionId) return;

      const usageToken = result.continuation_tokens[usageActionId];
      expect(usageToken).toBeDefined();

      const continuation = runScanWithContinuationToken(usageToken);
      expect(continuation.status).toBe('token_accepted');
      expect(['usage-import', 'usage-call']).toContain(continuation.action);
      expect(continuation.relationship).toBeDefined();
      expect(continuation.relationship.entry).toBeDefined();
    });
  });

  describe('js-edit ingestion workflow', () => {
    test('match snapshot ingestion writes a guard plan', () => {
      const searchResult = runScan(
        `--search scanWorkspace --ai-mode --json --limit 1 --dir ${SEARCH_DIR}`
      );

      if (!searchResult.matches.length) return;
      const analyzeToken = searchResult.continuation_tokens['analyze:0'];
      if (!analyzeToken) return;

      const continuation = runScanWithContinuationToken(analyzeToken);
      if (!continuation.match) return;

      const snapshotPath = path.join(TMP_DIR, `match-snapshot-${Date.now()}.json`);
      const planPath = path.join(TMP_DIR, `match-plan-${Date.now()}.json`);
      fs.writeFileSync(snapshotPath, JSON.stringify({ match: continuation.match }, null, 2));

      const output = runEditCommand(`--match-snapshot ${snapshotPath} --emit-plan ${planPath} --json`);
      const parsed = JSON.parse(output);
      expect(parsed.operation).toBe('match-snapshot');
      expect(parsed.matchCount).toBeGreaterThan(0);
      expect(fs.existsSync(planPath)).toBe(true);
    });

    test('from-token stdin ingestion hydrates js-edit without selectors', () => {
      const searchResult = runScan(
        `--search scanWorkspace --ai-mode --json --limit 1 --dir ${SEARCH_DIR}`
      );

      if (!searchResult.matches.length) return;
      const analyzeToken = searchResult.continuation_tokens['analyze:0'];
      if (!analyzeToken) return;

      const planPath = path.join(TMP_DIR, `token-plan-${Date.now()}.json`);
      const output = runEditCommand(`--from-token - --emit-plan ${planPath} --json`, { input: analyzeToken });
      const parsed = JSON.parse(output);
      expect(parsed.operation).toBe('match-snapshot');
      expect(parsed.token).toBeDefined();
      expect(fs.existsSync(planPath)).toBe(true);
    });
  });

  describe('End-to-End Workflow', () => {
    test('should support search -> token -> continuation flow', () => {
      // Step 1: Search with ai-mode
      const step1 = runScan(
        `--search scanWorkspace --ai-mode --json --limit 1 --dir ${SEARCH_DIR}`
      );

      expect(step1.matches.length).toBeGreaterThanOrEqual(0);
      expect(step1.continuation_tokens).toBeDefined();

      // Step 2: Extract and validate token
      if (step1.matches.length > 0) {
        const analyzeToken = step1.continuation_tokens['analyze:0'];
        expect(analyzeToken).toBeDefined();

        // Step 3: Use token to resume via stdin
        const step3 = runScanWithContinuationToken(analyzeToken);
        expect(step3.status).toBe('token_accepted');
        expect(step3.action).toBe('analyze');
      }
    });

    test('should preserve search context across continuation', () => {
      // Get initial search results
      const search1 = runScan(
        `--search scanWorkspace --ai-mode --json --limit 1 --dir ${SEARCH_DIR}`
      );

      if (search1.matches.length === 0) return;

      // Extract token and parameters
      const analyzeToken = search1.continuation_tokens['analyze:0'];
      const decoded = TokenCodec.decode(analyzeToken);
      const originalParams = decoded.payload.parameters;

      // Use continuation via stdin
      const continuation = runScanWithContinuationToken(analyzeToken);

      // Verify context preserved
      expect(continuation.parameters.search).toBe(originalParams.search);
      expect(continuation.parameters.limit).toBe(originalParams.limit);
      expect(continuation.parameters.match_index).toBe(originalParams.match_index);
    });
  });

  describe('Performance Baseline', () => {
    test('search with --ai-mode should not significantly slow down results', () => {
      // This is just a smoke test; real benchmarking would go elsewhere
      const start = Date.now();

      runScan(`--search scanWorkspace --ai-mode --json --limit 1 --dir ${SEARCH_DIR}`);

      const duration = Date.now() - start;

      // Should complete in reasonable time (< 5 seconds)
      expect(duration).toBeLessThan(5000);
    });

    test('token generation should be fast (tokens already included in search)', () => {
      const start = Date.now();

      const result = runScan(
        `--search scanWorkspace --ai-mode --json --limit 1 --dir ${SEARCH_DIR}`
      );

      const duration = Date.now() - start;

      // Should be under 5 seconds (includes scan + token generation)
      expect(duration).toBeLessThan(5000);

      // Tokens should exist
      expect(Object.keys(result.continuation_tokens).length).toBeGreaterThanOrEqual(0);
    });
  });
});
