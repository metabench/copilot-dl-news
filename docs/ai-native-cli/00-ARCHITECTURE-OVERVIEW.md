# AI-Native CLI Architecture — Overview

**Version:** 1.0 (Design Phase)  
**Date:** November 13, 2025  
**Status:** Pre-Implementation Design  
**Scope:** js-scan, js-edit, and workflow orchestration  

---

## Executive Summary

Transform CLI tools from **one-shot imperative commands** into **resumable state machines** optimized for AI agent workflows. This enables:

- ✅ **Stateless continuations**: Every result includes tokens for next actions
- ✅ **Structured menus**: AI picks from explicit options, not guessing output format
- ✅ **Checkpoint workflows**: Complex refactors broken into reviewable steps
- ✅ **Audit trail**: Every decision encoded in token for reproducibility
- ✅ **Parallel-safe**: No session locks; tokens are immutable records

---

## The Problem

### Current State (Imperative, Single-Shot)

```bash
# AI must orchestrate externally
$ js-scan --search "fetchData"
# Parse output (JSON/text) → Infer next action

$ js-edit --locate "fetchData" --file src/api.js
# Parse output → Infer which operation is safe

$ js-edit --replace "fetchData" --with-code "newImpl()"
# Hope nothing changed between runs
```

**Challenges:**
- Output parsing is fragile (format changes break automation)
- State not preserved between commands (re-parsing, risk of inconsistency)
- No explicit menu of "what can I do next?" (AI must guess)
- Decision logic lives outside CLI (hard to audit, hard to replay)
- Session interruption = lost context

---

## The Solution: Continuation Tokens + Structured Workflows

### Core Principles

1. **Stateless**: All context encoded in tokens; CLI is immutable
2. **Explicit**: Every result includes a menu of next actions
3. **Auditable**: Token signature proves authenticity; can replay any decision
4. **AI-First**: Output designed for programmatic consumption, not human eyes
5. **Backwards Compatible**: Existing flags unchanged; new features opt-in via `--ai-mode`

### Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Discovery & Navigation (js-scan)                  │
│ - Stateless continuation tokens                             │
│ - Menu-driven exploration                                   │
│ - No state persistence needed                               │
└─────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: Mutation & Planning (js-edit)                      │
│ - Continuation tokens for guarded operations                │
│ - Preview + decision checkpoints                            │
│ - Rollback-safe (all ops dry-run first)                     │
└─────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: Orchestration (Recipe Engine)                      │
│ - Workflow definitions with checkpoints                     │
│ - Data flow between steps                                   │
│ - Multi-step decision trees                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Layer 1: Discovery & Navigation (js-scan)

### Use Case: Search → Analyze → Decide

```bash
# Initial search
$ js-scan --search "processData" --ai-mode --json

# Returns:
{
  "matches": [
    { "file": "src/api.js", "line": 42, "name": "processData" },
    { "file": "src/utils.js", "line": 156, "name": "processDataLegacy" }
  ],
  "continuation_tokens": {
    "analyze:0": "token_analyze_match_0_xyz...",
    "analyze:1": "token_analyze_match_1_xyz...",
    "trace:0": "token_trace_match_0_xyz...",
    "ripple:0": "token_ripple_match_0_xyz..."
  }
}

# AI picks: analyze first match
$ js-scan --continuation "token_analyze_match_0_xyz..." --json

# Returns more detailed info + new menu of next actions
{
  "context": {...},
  "next_tokens": {
    "view_callers": "token_callers_xyz...",
    "check_ripple": "token_ripple_xyz...",
    "back": "token_search_results_xyz..."
  }
}
```

**Benefits:**
- Explicit token for each action (no guessing)
- Results remain immutable (token encodes what was decided)
- Can be retried, replayed, audited

---

## Layer 2: Mutation & Planning (js-edit)

### Use Case: Locate → Preview → Confirm → Execute

```bash
# Locate function
$ js-edit --file src/app.js --locate "fetchData" --ai-mode --json

# Returns:
{
  "location": {...},
  "preview": "function fetchData(...) { ... }",
  "safe_operations": {
    "extract": "token_extract_xyz...",
    "rename": "token_rename_xyz...",
    "replace": "token_replace_xyz...",
    "move": "token_move_xyz..."
  }
}

# AI picks: extract
$ js-edit --continuation "token_extract_xyz..." --to-module "src/api.js" --json

# Returns preview of change
{
  "status": "preview_ready",
  "changes": [
    {
      "file": "src/app.js",
      "operation": "remove",
      "preview": "- function fetchData(...) { ... }"
    },
    {
      "file": "src/api.js",
      "operation": "add",
      "preview": "+ export function fetchData(...) { ... }"
    }
  ],
  "next_tokens": {
    "confirm_and_apply": "token_apply_xyz...",
    "view_diff": "token_diff_xyz...",
    "cancel": "token_cancel_xyz..."
  }
}

# AI confirms
$ js-edit --continuation "token_apply_xyz..." --fix --json

# Returns result
{
  "status": "success",
  "files_modified": ["src/app.js", "src/api.js"],
  "manifest": {...}
}
```

**Benefits:**
- Multi-step decision process (preview before applying)
- Token encodes what operation + parameters were chosen
- Can safely interrupt and resume

---

## Layer 3: Orchestration (Recipe Engine)

### Use Case: Complex Multi-Step Refactor

```json
{
  "name": "extract-and-consolidate",
  "steps": [
    {
      "id": "search",
      "op": "js-scan",
      "args": { "search": "processData", "scope": "src/" }
    },
    {
      "id": "analyze",
      "op": "js-scan",
      "args": { "ripple-analysis": "${search.matches[0].file}" }
    },
    {
      "id": "decide",
      "type": "checkpoint",
      "message": "Risk level: ${analyze.risk.level}. Proceed with extraction?",
      "options": [
        { "choice": "yes", "next": "extract" },
        { "choice": "no", "next": "abort" }
      ]
    },
    {
      "id": "extract",
      "op": "js-edit",
      "args": {
        "locate": "processData",
        "file": "${search.matches[0].file}",
        "extract-to-module": "src/services/processor.js"
      }
    }
  ]
}
```

**Run with Checkpoints:**

```bash
$ js-tools --workflow extract-and-consolidate.json --checkpoint-after-each-step --json

# Output after each step
{
  "workflow_id": "wf_abc123",
  "current_step": "decide",
  "results_so_far": {...},
  "checkpoint_token": "wf_abc123:decide:pending",
  "awaiting_input": true,
  "message": "Risk level: YELLOW. Proceed?",
  "options": [
    { "choice": "yes", "token": "wf_abc123:choose_yes" },
    { "choice": "no", "token": "wf_abc123:choose_no" }
  ]
}

# AI decides
$ js-tools --workflow-resume "wf_abc123:choose_yes" --json

# Continues to next step...
```

---

## Token Design (Stateless)

### Structure

```
Token = Base64(
  {
    "version": 1,
    "command": "js-scan|js-edit|workflow",
    "action": "analyze|extract|rename|...",
    "context": {
      "original_search": "processData",
      "original_file": "src/api.js",
      "match_index": 0,
      "results_digest": "sha256:abc..."  // Ensures reproducibility
    },
    "parameters": { ... },
    "available_next_actions": ["view_details", "trace_callers", ...],
    "expires": 1700000000,  // Unix timestamp
    "signature": "hmac_sha256:..."
  }
)
```

### Validation

1. **Signature check**: Verify token wasn't tampered with
2. **Expiration check**: Reject if older than 1 hour
3. **Digest check** (optional): Verify file/results haven't changed since token issued
4. **Action whitelist**: Ensure action is in available_next_actions

---

## Implementation Roadmap

### Phase 1: Continuation Tokens (Weeks 1-2)
- [ ] Create token codec (encode/decode/validate)
- [ ] Add `--ai-mode` flag to js-scan and js-edit
- [ ] Implement continuation handlers in both CLIs
- [ ] Write unit tests for token lifecycle

### Phase 2: Workflow Engine (Weeks 3-4)
- [ ] Extend RecipeEngine with checkpoint support
- [ ] Implement `--workflow` + `--workflow-resume` flags
- [ ] Variable interpolation from previous steps
- [ ] Write integration tests

### Phase 3: Documentation & Integration (Week 5)
- [ ] Document token format and usage
- [ ] Provide example workflows
- [ ] Add agent integration guide
- [ ] Update .github/agents/ with AI-native patterns

---

## Design Principles (Constraints & Trade-offs)

### ✅ What We Gain
- **Auditability**: Token encodes every decision
- **Reproducibility**: Can replay any workflow
- **Safety**: Multiple checkpoints before applying changes
- **Parallelizability**: No shared state, no lock contention
- **AI-Friendly**: Explicit menus, structured output

### ⚠️ Trade-offs
- **Token size**: Complex operations → longer tokens (mitigate with compression)
- **Forward-only**: Can't undo once applied (mitigate with dry-run + preview)
- **Expiration**: Tokens expire after 1 hour (mitigate with re-issue capability)
- **Breaking changes**: If token format changes, old tokens invalid (version field handles this)

### 🚫 What We Intentionally Don't Do
- **Server-side state**: No session database (stateless)
- **Shared sessions**: No lock files (parallel-safe)
- **Implicit menus**: Every token explicitly lists next_actions
- **Magic inference**: AI must pick from menu, not guess

---

## Backwards Compatibility

### Existing Flags Unchanged
```bash
# All current commands work as-is
js-scan --search "foo" --json
js-edit --file src/app.js --list-functions

# New functionality is opt-in
js-scan --search "foo" --ai-mode --json  # Adds continuation_tokens
```

### Gradual Rollout
1. Phase 1 ships as experimental feature (`--ai-mode`)
2. Once stable, becomes standard (`--json` output always includes tokens)
3. Old tooling unaffected (just ignores token fields)

---

## Success Criteria

### Functional
- [ ] Tokens encode and decode without data loss
- [ ] Signature validation prevents tampering
- [ ] All continuation tokens are actionable
- [ ] Workflow checkpoints work end-to-end

### Non-Functional
- [ ] Token generation < 50ms per operation
- [ ] Token size < 2KB (including signature)
- [ ] Signature validation < 10ms
- [ ] No breaking changes to existing CLI

### Usability
- [ ] AI agent can follow token flow without external logic
- [ ] Error messages suggest which token to use next
- [ ] Workflow definitions are human-readable

---

## Next: Detailed Specifications

See:
1. **01-CONTINUATION-TOKEN-SPEC.md** — Token encoding, validation, lifecycle
2. **02-WORKFLOW-ENGINE-SPEC.md** — Checkpoint system, variable interpolation
3. **03-INTEGRATION-GUIDE.md** — How agents use this
4. **04-EXAMPLES.md** — Real-world scenarios end-to-end
