# Continuation Token Specification

**Version:** 1.0 (Design Phase)  
**Date:** November 13, 2025  

---

## 1. Overview

A **continuation token** is a stateless, signed record that encodes:
- What operation was just completed
- What parameters were used
- What the results were (digest, not full data)
- What actions can happen next

It allows AI agents to:
1. Invoke a CLI command and get structured results + tokens
2. Pick a token corresponding to the next action
3. Invoke CLI again with that token
4. Receive new results + new tokens

**Example Flow:**
```
search → [results + tokens] → pick token → new results + tokens → pick token → ...
```

---

## 2. Token Structure

### 2.1 Format

```
CONTINUATION_TOKEN = Base64URLEncode(JSON_PAYLOAD + SIGNATURE)
```

### 2.2 JSON Payload

```json
{
  "version": 1,
  "issued_at": 1700000000,
  "expires_at": 1700003600,
  "command": "js-scan|js-edit|workflow",
  "action": "string (search|locate|analyze|extract|...)",
  
  "context": {
    "request_id": "req_abc123xyz",
    "source_token": "parent_token (optional, for chain tracing)",
    "results_digest": "sha256:f1e2d3c4... (hash of returned results)"
  },
  
  "parameters": {
    // Original parameters that led to this token
    // E.g. { "search": "processData", "scope": "src/" }
  },
  
  "next_actions": [
    {
      "id": "analyze:0",
      "label": "Analyze first match",
      "description": "Show detailed info about match #1"
    },
    {
      "id": "analyze:1",
      "label": "Analyze second match",
      "description": "Show detailed info about match #2"
    },
    {
      "id": "back",
      "label": "Back to search",
      "description": "Return to previous search results"
    }
  ],
  
  "metadata": {
    "ttl_seconds": 3600,
    "replayable": true,
    "idempotent": true,
    "file_safe": true  // Can be stored in version control
  }
}
```

### 2.3 Signature

```
SIGNATURE = HMAC_SHA256(
  secret_key = derived from CLI_SECRET_KEY + version,
  message = JSON_PAYLOAD
)
```

**Secret Key Derivation:**
```
CLI_SECRET_KEY = env.AI_NATIVE_CLI_SECRET || hash(repo_root + cli_version)
```

This ensures:
- Tokens are authentic (signed by the CLI)
- Tokens are bound to the repository (can't reuse across repos)
- Tokens are version-specific (upgrade-proof)

---

## 3. Token Lifecycle

### 3.1 Generation

```
CLI receives request
  ↓
Process request (search, locate, etc.)
  ↓
Build result JSON
  ↓
Compute digest of result (sha256)
  ↓
Generate next_actions (what can happen next?)
  ↓
Encode continuation tokens for each action
  ↓
Sign each token
  ↓
Return JSON + tokens
```

### 3.2 Consumption (Resume)

```
AI provides token via --continuation "token_xyz..."
  ↓
CLI decodes token
  ↓
Validate signature
  ↓
Check expiration
  ↓
Verify action in next_actions
  ↓
Reconstruct parameters from token
  ↓
Execute action
  ↓
Check digest (optional: ensure no file changes)
  ↓
Return new result + new tokens
```

### 3.3 Validation Rules

| Rule | Action on Failure |
|------|-------------------|
| Signature invalid | Reject with 401 Unauthorized |
| Token expired | Reject with 410 Gone + suggest re-issue |
| Action not in next_actions | Reject with 400 Bad Request |
| Results digest mismatch (if checking) | Warn with 202 Stale + offer re-search |
| File not found (for file-based ops) | Reject with 404 + suggest re-search |

---

## 4. Token Types by Operation

### 4.1 Search Token (js-scan)

```json
{
  "command": "js-scan",
  "action": "search",
  "context": {
    "request_id": "req_search_20251113_abc",
    "results_digest": "sha256:abcdef..."
  },
  "parameters": {
    "search": "processData",
    "scope": "src/",
    "limit": 20
  },
  "next_actions": [
    { "id": "analyze:0", "label": "Analyze match #1" },
    { "id": "analyze:1", "label": "Analyze match #2" },
    { "id": "trace:0", "label": "Trace callers of match #1" },
    { "id": "ripple:0", "label": "Ripple analysis of match #1" }
  ]
}
```

### 4.2 Locate Token (js-edit)

```json
{
  "command": "js-edit",
  "action": "locate",
  "context": {
    "request_id": "req_locate_20251113_xyz",
    "results_digest": "sha256:xyz123..."
  },
  "parameters": {
    "file": "src/app.js",
    "locate": "fetchData"
  },
  "next_actions": [
    { "id": "extract", "label": "Extract function", "guard": true },
    { "id": "replace", "label": "Replace implementation", "guard": true },
    { "id": "rename", "label": "Rename function", "guard": true },
    { "id": "move", "label": "Move to another module", "guard": true },
    { "id": "context", "label": "Show context", "guard": false }
  ]
}
```

**Note:** `guard: true` means operation requires `--fix` or explicit confirmation.

### 4.3 Extract Token (js-edit)

```json
{
  "command": "js-edit",
  "action": "extract_preview",
  "context": {
    "source_token": "token_locate_xyz...",
    "results_digest": "sha256:preview_hash..."
  },
  "parameters": {
    "file": "src/app.js",
    "extract": "fetchData",
    "to_module": "src/api.js"
  },
  "next_actions": [
    { "id": "apply", "label": "Apply extraction", "guard": true },
    { "id": "show_diff", "label": "Show full diff", "guard": false },
    { "id": "cancel", "label": "Cancel extraction", "guard": false }
  ]
}
```

---

## 5. Token Size & Optimization

### 5.1 Size Budget

```
Target: < 2KB per token (including JSON + signature)

Breakdown:
  - Payload JSON: ~1KB
  - Signature: ~86 bytes (SHA256 hex)
  - Base64 encoding overhead: ~33%
  = Total: ~1.5KB ✓
```

### 5.2 Optimization Strategies

**Abbreviations:**
```json
// Full
{ "action": "extract", "parameters": { ... } }

// Abbreviated
{ "a": "extract", "p": { ... } }
```

**Lazy results:**
```json
// Don't embed full results in token
// Only digest + ability to re-fetch
{
  "results_digest": "sha256:abcdef...",
  "can_refetch": true  // Can --continuation --refetch
}
```

**Compression:**
```javascript
// Use gzip if token > 2KB
const zipped = gzip(JSON.stringify(payload));
const token = base64(zipped + signature);
```

---

## 6. Usage Patterns

### 6.1 Simple Menu Navigation

```bash
# Get initial results
$ js-scan --search "myFunc" --ai-mode --json
{
  "results": [...],
  "continuation_tokens": {
    "analyze:0": "TOKEN_A",
    "analyze:1": "TOKEN_B",
    "ripple:0": "TOKEN_C"
  }
}

# Pick one
$ js-scan --continuation TOKEN_A --json
```

### 6.2 Preview-Before-Apply

```bash
# Locate and get safe operations
$ js-edit --file src/app.js --locate myFunc --ai-mode --json
{
  "location": {...},
  "continuation_tokens": {
    "extract_preview": "TOKEN_EXTRACT_PREVIEW",
    "rename_preview": "TOKEN_RENAME_PREVIEW"
  }
}

# Get preview (dry-run)
$ js-edit --continuation TOKEN_EXTRACT_PREVIEW --json
{
  "status": "preview",
  "changes": [...],
  "continuation_tokens": {
    "apply": "TOKEN_APPLY",
    "cancel": "TOKEN_CANCEL"
  }
}

# Apply if looks good
$ js-edit --continuation TOKEN_APPLY --fix --json
{
  "status": "success",
  "files_modified": [...]
}
```

### 6.3 Workflow Orchestration

```bash
# Run workflow with checkpoints
$ js-tools --workflow my-refactor.json --checkpoint-mode --json

# After each step:
{
  "current_step": "decide",
  "awaiting_input": true,
  "continuation_tokens": {
    "choice:yes": "TOKEN_YES",
    "choice:no": "TOKEN_NO"
  }
}

# Pick choice
$ js-tools --workflow-resume TOKEN_YES --json
```

---

## 7. Error Handling

### 7.1 Invalid Token

```bash
$ js-scan --continuation "invalid_token" --json

Response:
{
  "status": "error",
  "code": "INVALID_TOKEN",
  "message": "Token signature invalid or corrupted",
  "recovery": {
    "suggestion": "Re-issue token by running: js-scan --search 'myFunc'",
    "recovery_token": "TOKEN_REISSUE"
  }
}
```

### 7.2 Expired Token

```bash
$ js-scan --continuation "expired_token" --json

Response:
{
  "status": "error",
  "code": "TOKEN_EXPIRED",
  "message": "Token expired (issued 2 hours ago)",
  "recovery": {
    "suggestion": "Re-search or use --refresh on previous search token",
    "can_refresh": true,
    "refresh_token": "TOKEN_REFRESH"
  }
}
```

### 7.3 Stale Results (File Changed)

```bash
$ js-edit --continuation "token_extract" --fix --json

Response:
{
  "status": "warning",
  "code": "RESULTS_STALE",
  "message": "Source file changed since locate operation",
  "digest_mismatch": {
    "expected": "sha256:abc...",
    "actual": "sha256:xyz..."
  },
  "recovery": {
    "suggestion": "Re-run locate to get fresh results",
    "reissue_token": "TOKEN_REISSUE"
  }
}
```

---

## 8. Security Considerations

### 8.1 Token Tampering
- **Mitigation**: HMAC_SHA256 signature prevents modification
- **Validation**: CLI rejects any token with invalid signature

### 8.2 Token Theft
- **Mitigation**: Tokens expire after 1 hour
- **Mitigation**: Tokens are file-safe (can't be used outside their repo/version)
- **Mitigation**: Digest check detects if file was modified after token issued

### 8.3 Replay Attacks
- **Mitigation**: `idempotent` flag indicates if operation is safe to replay
- **Mitigation**: Digest check ensures same input leads to same output
- **Validation**: Request ID in token prevents duplicate processing

### 8.4 Key Management
```bash
# Key stored in env or derived from repo
export AI_NATIVE_CLI_SECRET="base64:abc123xyz..."

# Or auto-derived (repo + version based)
# echo "secret_$(git rev-parse --show-toplevel)" | sha256sum
```

---

## 9. Implementation Checklist

### Phase 1: Foundation
- [ ] Create `TokenCodec` class (encode/decode)
- [ ] Implement HMAC_SHA256 signing
- [ ] Write `--ai-mode` output formatter
- [ ] Write token validation logic

### Phase 2: Integration
- [ ] Add `--continuation` flag to js-scan
- [ ] Add `--continuation` flag to js-edit
- [ ] Map all operations to next_actions
- [ ] Wire continuation handlers

### Phase 3: Testing
- [ ] Unit tests: token lifecycle
- [ ] Unit tests: validation rules
- [ ] Integration tests: end-to-end flow
- [ ] Fuzz tests: malformed tokens

---

## 10. Examples

See **04-EXAMPLES.md** for end-to-end scenarios.
