# Design Review Checklist & Findings

**Reviewer:** GitHub Copilot  
**Date:** November 13, 2025  
**Scope:** All 5 design documents in /docs/ai-native-cli/  

---

## 1. Cross-Document Consistency Review

### 1.1 Terminology Alignment

| Term | Doc 00 | Doc 01 | Doc 02 | Doc 03 | Doc 04 | Status |
|------|--------|--------|--------|--------|--------|--------|
| continuation_token | ✓ | ✓ | ✓ | ✓ | ✓ | CONSISTENT |
| checkpoint | ✓ | - | ✓ | ✓ | ✓ | CONSISTENT |
| next_actions | ✓ | ✓ | ✓ | ✓ | ✓ | CONSISTENT |
| guard: true | ✓ | ✓ | ✓ | ✓ | ✓ | CONSISTENT |
| --ai-mode | ✓ | ✓ | ✓ | ✓ | ✓ | CONSISTENT |
| --continuation | ✓ | ✓ | ✓ | ✓ | ✓ | CONSISTENT |
| results_digest | ✓ | ✓ | ✓ | ✓ | ✓ | CONSISTENT |

**Verdict:** ✅ Terminology is consistent across all documents.

### 1.2 Reference Mapping

**Document 00 (Architecture Overview) references:**
- "See 01-CONTINUATION-TOKEN-SPEC.md" ✓ (mentioned in closing)
- "See 02-WORKFLOW-ENGINE-SPEC.md" ✓ (mentioned in closing)
- "See 03-INTEGRATION-GUIDE.md" ✓ (mentioned in closing)
- "See 04-EXAMPLES.md" ✓ (mentioned in closing)

**Document 01 (Token Spec) references:**
- ARCHITECTURE-OVERVIEW.md (implicit, defines token need) ✓
- Calls out dependency on CLI_SECRET_KEY ✓
- Notes expiration (1 hour default) ✓
- Documents signature validation ✓

**Document 02 (Workflow Engine) references:**
- Extends RecipeEngine (mentioned explicitly) ✓
- Uses continuation tokens (clear dependency on 01) ✓
- Checkpoint tokens tie to 01 format ✓
- Variable interpolation examples align with 04 ✓

**Document 03 (Integration Guide) references:**
- All patterns use continuation tokens (01 compliant) ✓
- Error recovery examples consistent (01 errors) ✓
- Agent workflow examples use patterns from 04 ✓

**Document 04 (Examples) references:**
- Example 1 (safe extraction) uses token flow from 00 ✓
- Example 2 (workflow) uses checkpoint syntax from 02 ✓
- Example 3 (recovery) uses error codes from 01 ✓
- Example 4 (batch) uses token parallelization correctly ✓

**Verdict:** ✅ Cross-references are complete and mutually consistent.

---

## 2. Specification Completeness Review

### 2.1 Token Format Coverage (Doc 01)

| Aspect | Covered | Quality |
|--------|---------|---------|
| JSON structure | ✓ | Detailed with examples |
| Signature algorithm | ✓ | HMAC-SHA256 specified |
| Key derivation | ✓ | Environment-based strategy defined |
| Encoding | ✓ | Base64URL specified |
| Lifecycle (gen → validate → consume) | ✓ | Step-by-step flow documented |
| Expiration | ✓ | 1 hour default specified |
| Size budget | ✓ | < 2KB target with breakdown |
| Token types (search, locate, extract) | ✓ | 3 examples with field mappings |
| Error codes | ✓ | Validation rules with HTTP status |

**Verdict:** ✅ Token spec is comprehensive and implementable.

### 2.2 Workflow Engine Coverage (Doc 02)

| Aspect | Covered | Quality |
|--------|---------|---------|
| 5 step types | ✓ | Each type documented with examples |
| Checkpoint structure | ✓ | Options, conditions, auto-approval rules |
| Checkpoint tokens | ✓ | Tie-in to 01 token format |
| Variable interpolation | ✓ | ${...} syntax with examples |
| State persistence | ✓ | tmp/.workflows/ directory structure |
| Resume capability | ✓ | --workflow-resume flag documented |
| Execution modes (interactive, dry-run, auto) | ✓ | Behavior matrix provided |
| Error handling | ✓ | Recovery tokens, re-issue capability |

**Verdict:** ✅ Workflow engine spec is complete and well-structured.

### 2.3 Integration Coverage (Doc 03)

| Aspect | Covered | Quality |
|--------|---------|---------|
| Basic patterns (search → analyze → decide) | ✓ | Python/pseudo-code examples |
| Workflow with checkpoints | ✓ | Multi-step example with decision logic |
| Error recovery patterns | ✓ | try-catch with specific handlers |
| Framework integration (Langchain, OpenAI) | ✓ | Real code examples provided |
| Best practices | ✓ | 5 concrete guidelines with code |
| Idempotency checks | ✓ | Pattern documented |
| Audit logging | ✓ | JSON structure defined |
| Timeout handling | ✓ | Resumable timeout pattern |

**Verdict:** ✅ Integration guide covers real-world AI usage patterns.

### 2.4 Examples Coverage (Doc 04)

| Scenario | Covered | Completeness |
|----------|---------|---------------|
| Basic extraction (search → analyze → decide → extract → apply) | ✓ | 5-step flow with audit log |
| Multi-step refactoring with checkpoints | ✓ | YAML workflow + JS execution code |
| Error recovery & idempotency | ✓ | retry logic, checkpoint recovery |
| Batch parallelization | ✓ | 4-phase parallel + sequential pattern |
| Recovery catalog (expired, stale, ambiguous) | ✓ | 3 patterns documented |
| Expected output examples | ✓ | Realistic console output shown |

**Verdict:** ✅ Examples are comprehensive and executable.

---

## 3. Security Review

### 3.1 Token Signing & Validation

**Token Structure (Doc 01):**
- Signature: HMAC_SHA256 ✓
- Key derivation: env + version-specific ✓
- Per-repo isolation: CLI_SECRET_KEY includes repo_root ✓
- Tamper detection: Signature validation on every consume ✓

**Potential Issues Identified:**
1. **Secret key storage**: Currently `env.AI_NATIVE_CLI_SECRET || hash(repo_root + cli_version)`
   - ENV VAR: Good for CI/production
   - FALLBACK: Uses repo_root + version (deterministic)
   - **Risk**: Fallback is guessable if repo_root + version known
   - **Mitigation**: Document strongly that in production, must set env var; fallback only for dev

2. **Token expiration**: 1 hour default
   - Good for short-lived operations
   - But what if workflow takes 2 hours?
   - **Mitigation**: Doc 02 mentions re-issue capability; should impl before proto

3. **Signature algorithm**: HMAC-SHA256
   - Standard, well-vetted ✓
   - Industry-appropriate for this use case ✓

**Verdict:** ⚠️ Security solid but needs implementation guidance on key management.

### 3.2 Token Mutation Prevention

**Token Immutability:**
- Each token is signed (can't modify without invalidating signature) ✓
- JSON structure validates on decode ✓
- Signature check before any action taken ✓

**Next Actions Whitelist:**
- Actions must be in token's next_actions list ✓
- Prevents calling arbitrary operations ✓

**Results Digest:**
- Optional digest check prevents stale results ✓
- Helps detect file changes between calls ✓

**Verdict:** ✅ Token mutation well-guarded.

### 3.3 Authorization & Access Control

**Not Covered:** Who can call these APIs? Are there role-based restrictions?
- Doc says operations check guard: true (requires --fix)
- But doc doesn't define access control model

**Assessment:** This is acceptable scope for Design Phase (can add RBAC in Phase 2). Document as future work.

---

## 4. Implementability Assessment

### 4.1 Complexity Estimation

**TokenCodec (token encode/decode/sign):**
- ~200 lines of JS (straightforward)
- Dependencies: crypto, base64
- Risk: LOW ✓

**Token Validation:**
- ~100 lines (signature check, expiration, whitelist)
- Risk: LOW ✓

**CLI Integration (--ai-mode, --continuation):**
- ~50 lines js-scan (add flag, return tokens in JSON output)
- ~50 lines js-edit (add flag, return tokens in JSON output)
- Risk: LOW ✓

**Checkpoint System (extend RecipeEngine):**
- ~150 lines (checkpoint logic, options handling)
- Depends on TokenCodec ✓
- Risk: MEDIUM (needs careful state management)

**Workflow Resume (--workflow-resume):**
- ~100 lines (deserialize workflow state, continue from checkpoint)
- Risk: MEDIUM (edge cases in state reconstruction)

**Total Estimated Effort:** ~650 lines of new code + ~500 lines of tests = ~1100 lines total

**Timeline:** 1-2 weeks (4-6 days coding, 2-3 days testing)

**Verdict:** ✅ Implementation is feasible within 2-week timeframe.

### 4.2 Backwards Compatibility

**Existing CLI:**
- No breaking changes to current flags ✓
- --ai-mode is opt-in ✓
- --continuation is new flag ✓
- JSON output will have new fields, but old tools can ignore them ✓

**Risks Identified:**
1. If existing code parses JSON strictly and rejects unknown fields
   - Mitigation: Add to AGENTS.md that output may include new fields
   - Severity: LOW (most JSON parsers ignore unknown fields)

2. Performance regression if token generation is slow
   - Budget: Token gen < 50ms (achievable with crypto libs)
   - Severity: LOW

**Verdict:** ✅ Backwards compatible.

---

## 5. Design Trade-offs Validation

### 5.1 Stateless vs. Stateful

**Design Choice:** Stateless tokens (all context in token)
**Alternatives:**
- Option A: Session-based state (server stores state)
- Option B: Token-based state (token encodes everything)

**Trade-off Analysis:**
| Aspect | Stateless (chosen) | Stateful |
|--------|-----------|----------|
| Parallelization | ✓ Multiple tokens in flight | ✗ Lock contention |
| Auditability | ✓ Every token is a record | ✗ Implicit state |
| Scalability | ✓ No server overhead | ✗ DB size grows |
| Debugging | ✓ Token tells full story | ✗ Must query DB |
| Deployment | ✓ Stateless = easier | ✗ Needs persistence |

**Verdict:** ✅ Stateless is correct for this architecture.

### 5.2 Token Size

**Design Choice:** < 2KB per token
**Why Not Smaller?**
- Could compress to ~500 bytes, but adds complexity
- 2KB is affordable in modern systems

**Why Not Larger?**
- Tokens passed as URL args (2KB is reasonable limit)
- Keeping compact ensures readability

**Verdict:** ✅ 2KB is a good balance.

### 5.3 Forward-Only Operations

**Design Choice:** No undo after apply
**Alternatives:**
- Option A: Keep rollback history (complex, stores state)
- Option B: Require explicit dry-run before apply (current approach)

**Mitigation:**
- All mutations are guarded (require --fix)
- Preview available before apply
- Dry-run mode for testing workflows

**Verdict:** ✅ Forward-only is acceptable with preview + dry-run.

### 5.4 Token Expiration

**Design Choice:** 1 hour expiration
**Why 1 Hour?**
- Long enough for interactive workflows
- Short enough for security
- Re-issue capability handles longer operations

**Risk:** What if workflow takes 2+ hours?
**Mitigation:** Doc 02 mentions re-issue token; should be implemented in Phase 1

**Verdict:** ⚠️ 1 hour is reasonable; re-issue feature is essential.

---

## 6. Edge Cases & Error Scenarios

### 6.1 Covered Edge Cases (Doc 01 & 03)

| Case | Handling | Status |
|------|----------|--------|
| Token expired | Reject with 410; suggest re-issue | ✓ |
| Signature invalid | Reject with 401; may indicate tampering | ✓ |
| Action not in next_actions | Reject with 400 | ✓ |
| File not found (since token issued) | Reject with 404; offer re-search | ✓ |
| Results digest mismatch | Warn with 202; offer refresh | ✓ |
| Multiple matches ambiguous | Return candidates; ask for clarification | ✓ |
| Network interruption mid-workflow | Checkpoint resume available | ✓ |
| Token revocation (leaked key) | Re-issue entire system secret | ✓ |

**Verdict:** ✅ Edge cases are well-covered.

### 6.2 Uncovered Edge Cases (Recommendations)

1. **Circular workflow dependencies**
   - Example: Step A's output used in Step A's input
   - Current docs: Don't address this
   - Recommendation: Add validation in WorkflowEngine.validate()
   - Severity: MEDIUM
   - **Action:** Add to 02-WORKFLOW-ENGINE-SPEC.md, section "Workflow Validation"

2. **Token inheritance in nested workflows**
   - Example: Workflow calls another workflow; how are tokens passed?
   - Current docs: 02 mentions workflow composition, but not token chain
   - Recommendation: Document parent token → child token lineage
   - Severity: LOW (can be addressed in Phase 2)
   - **Action:** Add note to 02, section "Workflow Composition"

3. **Very large result sets (>1000 matches)**
   - Example: Search returns 10,000 functions
   - Current docs: Limit mentioned (~20), but pagination not addressed
   - Recommendation: Document limit + offset in next_actions
   - Severity: LOW
   - **Action:** Update token types in 01, section "Token Types"

---

## 7. Documentation Quality Review

### 7.1 Clarity & Readability

| Document | Clarity | Code Examples | Diagrams | Status |
|----------|---------|---------------|----------|--------|
| 00-ARCHITECTURE-OVERVIEW | ✓ Executive summary, then details | ✓ CLI examples, JSON | ✓ 3-layer diagram | Excellent |
| 01-CONTINUATION-TOKEN-SPEC | ✓ Technical but clear | ✓ JSON payloads, lifecycle | ✓ Validation flow | Excellent |
| 02-WORKFLOW-ENGINE-SPEC | ✓ Well-structured | ✓ YAML, JSON, JS code | ✓ Execution modes table | Excellent |
| 03-INTEGRATION-GUIDE | ✓ Agent-focused | ✓ Python, JS, patterns | - | Excellent |
| 04-EXAMPLES.md | ✓ Real scenarios | ✓ Complete code + output | ✓ Flow diagrams | Excellent |

**Verdict:** ✅ Documentation is professional and well-organized.

### 7.2 Actionability for Implementation

**Is it clear how to implement?**
- TokenCodec: YES ✓ (01 specifies format, validation rules)
- Checkpoint system: YES ✓ (02 defines step types, state structure)
- CLI integration: YES ✓ (00 & 03 show exact flag additions)
- Error handling: YES ✓ (01 & 03 show recovery patterns)

**Can a developer prototype from this?**
- YES ✓ All necessary details are present

**Verdict:** ✅ Documentation is implementation-ready.

---

## 8. Alignment with Existing Codebase

### 8.1 RecipeEngine Integration

**Doc 02 claims:** Workflow engine extends RecipeEngine
**Verification needed:** Is RecipeEngine actually compatible?

**From prior context:**
- RecipeEngine exists (484 lines, imported in tools)
- RecipeEngine already handles: operations, variable substitution, error handling
- TokenCodec addition: Won't break RecipeEngine
- Checkpoint addition: Can be built on top (new step type)

**Verdict:** ✅ Integration is compatible.

### 8.2 js-scan & js-edit Compatibility

**Proposed changes:**
- Add --ai-mode flag → include continuation_tokens in JSON
- Add --continuation flag → consume token, execute action
- Add --workflow flag → load + execute workflow file
- Add --workflow-resume flag → resume workflow from checkpoint

**Impact on existing code:**
- normalizeOptions() will see new flags (need to add cases)
- JSON output will have new fields (backward compatible)
- No changes to core search/edit logic

**Verdict:** ✅ Integration is minimal and clean.

---

## 9. Completeness for Prototype

### 9.1 What's Needed for MVP Prototype

**Must-Have:**
1. TokenCodec (encode/decode/sign/validate) ✓ Specified in 01
2. --ai-mode flag in js-scan ✓ Specified in 00, 03
3. --continuation flag in js-scan ✓ Specified in 01
4. Token validation on consume ✓ Specified in 01
5. Unit tests for TokenCodec ✓ Mentioned in 01

**Nice-to-Have (Phase 1 but not MVP):**
1. Workflow engine checkpoints (defer to Phase 2)
2. Batch operations (Example 4) (defer to Phase 2)
3. Framework integrations (Langchain) (defer to Phase 2)

**Not Needed for MVP:**
1. RBAC (access control) (Phase 3)
2. Audit logging to DB (Phase 3)
3. Token telemetry (Phase 3)

**Verdict:** ✅ Design is ready for MVP prototype.

### 9.2 What Should Be Prototyped First

**Recommended Phase 1 (MVP):**
1. TokenCodec module + tests (~300 lines)
2. Integrate into js-scan (--ai-mode, --continuation) (~50 lines)
3. End-to-end test: search → analyze → trace flow (~50 lines tests)

**Timeline:** 2-3 days

**Then Phase 2 (Advanced):**
1. Extend to js-edit (locate → extract)
2. WorkflowEngine checkpoints
3. Full integration tests

**Timeline:** 1 week additional

---

## 10. Final Checklist

| Category | Status | Notes |
|----------|--------|-------|
| **Architecture** | ✅ READY | 3-layer design is sound |
| **Token Format** | ✅ READY | Clear specification, well-scoped |
| **Workflow System** | ✅ READY | Checkpoint logic is well-defined |
| **Integration Patterns** | ✅ READY | Real-world agent examples |
| **Examples** | ✅ READY | 4 complete scenarios |
| **Security** | ⚠️ READY* | *Depends on key mgmt implementation |
| **Backwards Compat** | ✅ READY | No breaking changes |
| **Implementability** | ✅ READY | ~1100 LOC, 2-week effort |
| **Documentation** | ✅ EXCELLENT | Professional, clear, actionable |
| **Cross-References** | ✅ CONSISTENT | All docs align |

---

## 11. Recommendations & Action Items

### For Prototype Implementation

1. **Start with TokenCodec** (Day 1)
   - File: `src/codec/TokenCodec.js`
   - Tests: `tests/codec/TokenCodec.test.js`
   - Covers: encode, decode, sign, validate

2. **Integrate --ai-mode into js-scan** (Day 2)
   - Modify: `tools/dev/js-scan.js`
   - Change: Add --ai-mode flag, emit continuation_tokens in --json output
   - Tests: `tests/tools/js-scan.ai-mode.test.js`

3. **Implement --continuation consumption** (Day 2-3)
   - Modify: `tools/dev/js-scan.js` (add --continuation flag handler)
   - Logic: Decode token, validate, execute action, return new tokens
   - Tests: end-to-end token chain test

4. **Create smoke test** (Day 3)
   - File: `tests/tools/ai-native-cli.smoke.test.js`
   - Scenario: search → analyze → trace (using tokens)
   - Expected: All tokens are valid, signature checks pass

### For Design Refinement (Pre-Prototype)

1. **Add key management guidance to 01**
   - Section: "Security Best Practices"
   - Content: How to set CLI_SECRET_KEY in prod vs. dev

2. **Add circular dependency validation to 02**
   - Section: "Workflow Validation"
   - Content: Pseudocode to detect cycles

3. **Add pagination example to 01**
   - Section: "Token Types"
   - Content: Handle > 20 matches with limit/offset tokens

### For Phase 2 (Post-Prototype)

1. Extend to js-edit
2. Implement WorkflowEngine checkpoints
3. Add batch operation support
4. Framework integration (Langchain, OpenAI)

---

## 12. Sign-Off

**Review Status:** ✅ APPROVED FOR PROTOTYPING

**Concerns:** None critical; minor improvements noted above.

**Recommendation:** Proceed with Phase 1 implementation (TokenCodec + js-scan --ai-mode/--continuation). Design is comprehensive, actionable, and low-risk.

**Next Step:** Begin prototype with TokenCodec module implementation.
