# AI-Native CLI Examples

**Version:** 1.0 (Design Phase)  
**Date:** November 13, 2025  

---

## 1. Complete End-to-End Scenarios

These examples demonstrate real-world agent workflows using the AI-Native CLI system.

---

## 2. Example 1: Safe Function Extraction (Basic Flow)

**Goal:** Extract `calculateTax()` from `src/utils/billing.js` to `src/services/tax-calculator.js` safely  
**Constraints:** Must check dependencies first, validate no breaking changes  

### Workflow Steps

```
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: Search for function                                 │
└─────────────────────────────────────────────────────────────┘
  Input: search "calculateTax" in src/
  Output: Continuation tokens for {analyze, ripple, extract}

┌─────────────────────────────────────────────────────────────┐
│ STEP 2: Analyze ripple effects                              │
└─────────────────────────────────────────────────────────────┘
  Input: ripple token from Step 1
  Output: Risk score, dependency graph, call sites

┌─────────────────────────────────────────────────────────────┐
│ STEP 3: Decide based on risk                                │
└─────────────────────────────────────────────────────────────┘
  Decision: If risk GREEN, proceed; else abort

┌─────────────────────────────────────────────────────────────┐
│ STEP 4: Preview extraction                                  │
└─────────────────────────────────────────────────────────────┘
  Input: extract token, target module
  Output: Diff preview, new file structure

┌─────────────────────────────────────────────────────────────┐
│ STEP 5: Apply (with approval)                               │
└─────────────────────────────────────────────────────────────┘
  Input: apply token + --fix
  Output: Modified files, removed imports, new imports added
```

### Implementation (Python)

```python
import json
import time
from datetime import datetime

class SafeExtractor:
    def __init__(self, cli_runner):
        self.cli = cli_runner
        self.audit_log = []
    
    def extract_function(self, function_name, from_file, to_module, dry_run=False):
        """
        Extract a function safely with checkpoints.
        
        Returns:
            {
                "status": "success" | "aborted" | "error",
                "files_modified": [...],
                "decisions": [...],
                "audit_log": [...]
            }
        """
        
        try:
            # STEP 1: Search
            self.audit_log.append({
                "step": 1,
                "action": "search",
                "timestamp": datetime.now().isoformat(),
                "input": function_name
            })
            
            search_result = self.cli.run("js-scan", {
                "search": function_name,
                "scope": "src/",
                "ai_mode": True,
                "json": True
            })
            
            if search_result["status"] != "success":
                return self._error("search_failed", search_result)
            
            if search_result["stats"]["match_count"] == 0:
                return self._error("function_not_found", search_result)
            
            if search_result["stats"]["match_count"] > 1:
                return self._error("ambiguous_match", search_result)
            
            match = search_result["matches"][0]
            self.audit_log[-1]["output"] = {
                "match": match["file"] + ":" + str(match["line"]),
                "continuation_token": search_result["continuation_tokens"]["analyze:0"][:50] + "..."
            }
            
            # STEP 2: Analyze ripple
            analyze_token = search_result["continuation_tokens"]["analyze:0"]
            
            self.audit_log.append({
                "step": 2,
                "action": "ripple_analysis",
                "timestamp": datetime.now().isoformat()
            })
            
            ripple_result = self.cli.run("js-scan", {
                "continuation": analyze_token,
                "ai_mode": True,
                "json": True
            })
            
            if ripple_result["status"] != "success":
                return self._error("ripple_analysis_failed", ripple_result)
            
            risk_level = ripple_result.get("risk", {}).get("level")
            num_dependents = len(ripple_result.get("dependents", []))
            
            self.audit_log[-1]["output"] = {
                "risk_level": risk_level,
                "dependents": num_dependents,
                "critical_dependents": len([d for d in ripple_result.get("dependents", []) if d.get("critical")])
            }
            
            # STEP 3: Decide
            self.audit_log.append({
                "step": 3,
                "action": "risk_decision",
                "timestamp": datetime.now().isoformat(),
                "decision_input": {
                    "risk_level": risk_level,
                    "dependents": num_dependents
                }
            })
            
            if risk_level == "RED":
                self.audit_log[-1]["decision"] = "ABORT (risk too high)"
                return self._abort(f"Risk too high: {risk_level}", ripple_result)
            
            if risk_level == "YELLOW" and num_dependents > 10:
                self.audit_log[-1]["decision"] = "ABORT (too many dependents)"
                return self._abort(f"Too many dependents ({num_dependents}) with YELLOW risk", ripple_result)
            
            self.audit_log[-1]["decision"] = "PROCEED"
            
            # STEP 4: Preview extraction
            self.audit_log.append({
                "step": 4,
                "action": "preview_extraction",
                "timestamp": datetime.now().isoformat(),
                "input": {"to_module": to_module}
            })
            
            # Use locate to get the extract token
            locate_result = self.cli.run("js-edit", {
                "locate": function_name,
                "file": from_file,
                "ai_mode": True,
                "json": True
            })
            
            if locate_result["status"] != "success":
                return self._error("locate_failed", locate_result)
            
            extract_token = locate_result["continuation_tokens"]["extract"]
            
            # Preview
            preview_result = self.cli.run("js-edit", {
                "continuation": extract_token,
                "to_module": to_module,
                "preview": True,
                "ai_mode": True,
                "json": True
            })
            
            if preview_result["status"] != "success":
                return self._error("preview_failed", preview_result)
            
            changes = preview_result.get("changes", [])
            self.audit_log[-1]["output"] = {
                "files_affected": len(changes),
                "changes": [
                    {
                        "file": c["file"],
                        "type": c["type"],
                        "lines": c.get("lines_changed", 0)
                    }
                    for c in changes
                ]
            }
            
            # Print preview for decision
            print("\n" + "="*60)
            print("PREVIEW OF CHANGES:")
            print("="*60)
            for change in changes:
                print(f"\n{change['file']}")
                print(f"  Type: {change['type']}")
                print(f"  Lines: {change.get('lines_changed', '?')}")
                if "diff_preview" in change:
                    print(f"  Preview:\n{change['diff_preview']}")
            
            if dry_run:
                self.audit_log[-1]["dry_run"] = True
                return {
                    "status": "dry_run_complete",
                    "changes": changes,
                    "audit_log": self.audit_log
                }
            
            # STEP 5: Apply
            self.audit_log.append({
                "step": 5,
                "action": "apply_extraction",
                "timestamp": datetime.now().isoformat()
            })
            
            apply_token = preview_result["continuation_tokens"]["apply"]
            
            apply_result = self.cli.run("js-edit", {
                "continuation": apply_token,
                "fix": True,
                "ai_mode": True,
                "json": True
            })
            
            if apply_result["status"] != "success":
                return self._error("apply_failed", apply_result)
            
            self.audit_log[-1]["output"] = {
                "files_modified": apply_result.get("files_modified", []),
                "status": "applied"
            }
            
            return {
                "status": "success",
                "files_modified": apply_result.get("files_modified", []),
                "audit_log": self.audit_log
            }
        
        except Exception as e:
            return self._error("exception", {"exception": str(e)})
    
    def _error(self, error_code, details):
        return {
            "status": "error",
            "code": error_code,
            "details": details,
            "audit_log": self.audit_log
        }
    
    def _abort(self, reason, details):
        return {
            "status": "aborted",
            "reason": reason,
            "details": details,
            "audit_log": self.audit_log
        }

# Usage
cli = CLIRunner()
extractor = SafeExtractor(cli)

result = extractor.extract_function(
    function_name="calculateTax",
    from_file="src/utils/billing.js",
    to_module="src/services/tax-calculator.js",
    dry_run=False
)

print(f"\n{'='*60}")
print(f"RESULT: {result['status']}")
print(f"{'='*60}")
if result['status'] == 'success':
    print(f"Modified files: {result['files_modified']}")
    print(f"\nAudit log (5 steps):")
    for entry in result['audit_log']:
        print(f"  Step {entry['step']}: {entry['action']}")
        if 'decision' in entry:
            print(f"    → {entry['decision']}")
```

### Expected Output

```
============================================================
PREVIEW OF CHANGES:
============================================================

src/utils/billing.js
  Type: modified
  Lines: -12 (removed calculateTax)
  Preview:
    - function calculateTax(amount, rate) {
    -   return amount * (rate / 100);
    - }

src/services/tax-calculator.js
  Type: created
  Lines: +15 (new file)
  Preview:
    + import { validate } from '../utils/validation.js';
    + 
    + export function calculateTax(amount, rate) {
    +   validate(amount, 'number');
    +   validate(rate, 'number');
    +   return amount * (rate / 100);
    + }

src/api/routes.js
  Type: modified
  Lines: +1 (import added), -1 (old import removed)
  Preview:
    - import { calculateTax } from '../utils/billing.js';
    + import { calculateTax } from '../services/tax-calculator.js';

============================================================
RESULT: success
============================================================
Modified files: ["src/utils/billing.js", "src/services/tax-calculator.js", "src/api/routes.js"]

Audit log (5 steps):
  Step 1: search
    → Match found at src/utils/billing.js:42
  Step 2: ripple_analysis
    → Risk: GREEN, 3 dependents
  Step 3: risk_decision
    → PROCEED
  Step 4: preview_extraction
    → 3 files affected
  Step 5: apply_extraction
    → Applied
```

---

## 3. Example 2: Multi-Step Refactoring with Checkpoints

**Goal:** Refactor authentication module: extract guard logic → create middleware factory → update routes  
**Constraints:** Each step requires checkpoint approval before proceeding  

### Workflow Definition

```yaml
# workflows/refactor-auth.yml
name: "Refactor Authentication Module"
description: "Extract guard logic and create reusable middleware"
checkpoints: true

steps:
  # Phase 1: Preparation
  - id: "phase1_search"
    type: "operation"
    operation: "js-scan"
    args:
      search: "checkAuth"
      scope: "src/"
      ai_mode: true
    outputs: 
      - "matches"
      - "continuation_tokens"
    next: "phase1_analyze"

  - id: "phase1_analyze"
    type: "operation"
    operation: "js-scan"
    args:
      continuation: "${phase1_search.continuation_tokens.analyze}"
    outputs:
      - "dependents"
      - "risk"
    next: "checkpoint_phase1"

  - id: "checkpoint_phase1"
    type: "checkpoint"
    title: "Phase 1 Analysis Complete"
    description: "Analyze found ${phase1_search.stats.match_count} matches"
    options:
      - label: "Proceed to extraction"
        token_field: "apply_token"
        next: "phase2_preview"
      - label: "Re-search with different query"
        next: "phase1_search"
      - label: "Cancel"
        action: "abort"
    condition: "${phase1_analyze.risk.level} == 'GREEN'"
    auto_approve_if: "${phase1_analyze.risk.level} == 'GREEN'"

  # Phase 2: Extraction
  - id: "phase2_preview"
    type: "operation"
    operation: "js-edit"
    args:
      locate: "checkAuth"
      file: "${phase1_search.matches[0].file}"
      ai_mode: true
    next: "phase2_extract_preview"

  - id: "phase2_extract_preview"
    type: "operation"
    operation: "js-edit"
    args:
      continuation: "${phase2_preview.continuation_tokens.extract}"
      to_module: "src/middleware/auth-guards.js"
      preview: true
    outputs:
      - "changes"
    next: "checkpoint_phase2"

  - id: "checkpoint_phase2"
    type: "checkpoint"
    title: "Preview Extraction"
    description: "Extract ${phase1_search.matches[0].function.name}() to new module"
    options:
      - label: "Apply changes"
        next: "phase2_apply"
      - label: "Preview diff only"
        action: "noop"
      - label: "Cancel extraction"
        action: "abort"
    guard: true  # Requires human/AI review

  - id: "phase2_apply"
    type: "operation"
    operation: "js-edit"
    args:
      continuation: "${phase2_extract_preview.continuation_tokens.apply}"
      fix: true
    outputs:
      - "files_modified"
    next: "phase3_prep"

  # Phase 3: Update dependents
  - id: "phase3_prep"
    type: "operation"
    operation: "js-scan"
    args:
      search: "checkAuth"
      scope: "src/"
      ai_mode: true
    outputs:
      - "matches"
    next: "checkpoint_phase3"

  - id: "checkpoint_phase3"
    type: "checkpoint"
    title: "Update All References"
    description: |
      Found ${phase3_prep.stats.match_count} references to update.
      Files to modify: ${phase3_prep.matches.*.file | unique | join(", ")}
    options:
      - label: "Update all references (auto)"
        next: "phase3_update_all"
        auto: true
      - label: "Update interactively"
        next: "phase3_update_interactive"
      - label: "Finish - manual updates required"
        action: "complete"
    auto_approve_if: "${phase3_prep.stats.match_count} <= 5"

  - id: "phase3_update_all"
    type: "loop"
    over: "${phase3_prep.matches}"
    step:
      type: "operation"
      operation: "js-edit"
      args:
        file: "${item.file}"
        replace: "import.*checkAuth.*from.*"
        with: "import { checkAuth } from '../../middleware/auth-guards.js'"
        expect_hash: "${item.hash}"
    next: "final_checkpoint"

  - id: "final_checkpoint"
    type: "checkpoint"
    title: "Refactoring Complete"
    description: |
      All changes applied successfully.
      Files modified: ${phase2_apply.files_modified | join(", ")}
      References updated: ${phase3_prep.stats.match_count}
    options:
      - label: "Commit workflow"
        action: "complete"
      - label: "Undo all changes"
        action: "rollback"
```

### Implementation (JavaScript)

```javascript
// agent-workflows.js

const WorkflowEngine = require('./WorkflowEngine');
const fs = require('fs');
const path = require('path');

class AuthRefactoringAgent {
  constructor(cliRunner) {
    this.cli = cliRunner;
    this.engine = new WorkflowEngine(cliRunner);
  }

  async runRefactoring() {
    const workflowPath = 'workflows/refactor-auth.yml';
    const workflowDef = this.engine.loadWorkflow(workflowPath);
    
    console.log(`\n${'='*70}`);
    console.log(`Starting: ${workflowDef.name}`);
    console.log(`${'='*70}\n`);

    const result = await this.engine.execute(workflowDef, {
      onCheckpoint: async (checkpoint, state) => {
        // Let the agent decide
        return this.decideCheckpoint(checkpoint, state);
      },
      onProgress: (step, output) => {
        console.log(`✓ ${step.id}: ${step.title || step.operation}`);
      },
      onError: (step, error) => {
        console.error(`✗ ${step.id}: ${error.message}`);
      }
    });

    console.log(`\n${'='*70}`);
    console.log(`Result: ${result.status}`);
    console.log(`${'='*70}\n`);
    
    // Save audit trail
    this.saveAuditTrail(result);
    
    return result;
  }

  async decideCheckpoint(checkpoint, state) {
    console.log(`\n📋 ${checkpoint.title}`);
    console.log(`   ${checkpoint.description}`);
    console.log(`\n   Options:`);
    
    checkpoint.options.forEach((opt, idx) => {
      console.log(`   ${idx + 1}. ${opt.label}`);
    });
    
    // Auto-approve if conditions met
    if (checkpoint.condition) {
      const canAutoApprove = this.engine.evaluateCondition(
        checkpoint.condition,
        state
      );
      if (canAutoApprove) {
        console.log(`\n   → Auto-approved (condition met)`);
        return checkpoint.options[0]; // Pick first option
      }
    }

    // For now, agent picks option 0 (first)
    // In real scenario, this would be AI decision logic
    return checkpoint.options[0];
  }

  saveAuditTrail(result) {
    const trail = {
      workflow: result.workflow_name,
      status: result.status,
      timestamp: new Date().toISOString(),
      steps: result.step_results.map(step => ({
        id: step.id,
        status: step.status,
        duration_ms: step.duration_ms,
        checkpoint_decision: step.checkpoint_decision
      }))
    };

    const auditFile = `audit-logs/refactor-auth-${Date.now()}.json`;
    fs.writeFileSync(auditFile, JSON.stringify(trail, null, 2));
    console.log(`\nAudit trail saved: ${auditFile}`);
  }
}

// Usage
const agent = new AuthRefactoringAgent(cliRunner);
agent.runRefactoring().then(result => {
  if (result.status === 'success') {
    console.log('✓ Refactoring completed successfully');
    process.exit(0);
  } else {
    console.log('✗ Refactoring failed or cancelled');
    process.exit(1);
  }
});
```

### Expected Behavior

```
======================================================================
Starting: Refactor Authentication Module
======================================================================

✓ phase1_search: Found 3 matches in src/
✓ phase1_analyze: Risk = GREEN, 5 dependents

📋 Phase 1 Analysis Complete
   Analyze found 3 matches
   
   Options:
   1. Proceed to extraction
   2. Re-search with different query
   3. Cancel

   → Auto-approved (condition met)

✓ phase2_preview: Located checkAuth in src/auth.js
✓ phase2_extract_preview: Generated preview with 4 file changes

📋 Preview Extraction
   Extract checkAuth() to new module
   
   Options:
   1. Apply changes
   2. Preview diff only
   3. Cancel extraction

   (Waiting for human review...)
   [User reviews diff, approves]
   → Selected: Apply changes

✓ phase2_apply: Applied extraction to 4 files
✓ phase3_prep: Found 5 references to update

📋 Update All References
   Found 5 references to update.
   Files to modify: src/routes.js, src/api.js, src/handlers.js
   
   → Auto-approved (count <= 5)

✓ phase3_update_all[1/5]: Updated src/routes.js
✓ phase3_update_all[2/5]: Updated src/api.js
✓ phase3_update_all[3/5]: Updated src/handlers.js
✓ phase3_update_all[4/5]: Updated src/middleware.js
✓ phase3_update_all[5/5]: Updated src/tests/auth.test.js

📋 Refactoring Complete
   All changes applied successfully.
   Files modified: src/auth.js, src/middleware/auth-guards.js, src/routes.js, src/api.js, src/handlers.js, src/middleware.js, src/tests/auth.test.js
   References updated: 5
   
   Options:
   1. Commit workflow
   2. Undo all changes

   → Selected: Commit workflow

======================================================================
Result: success
======================================================================

Audit trail saved: audit-logs/refactor-auth-1731487234567.json
✓ Refactoring completed successfully
```

---

## 4. Example 3: Error Recovery and Idempotency

**Goal:** Demonstrate resilience when operations fail midway  
**Scenario:** Extract function, apply fails, resume from checkpoint  

### Workflow Code

```python
class ResilientRefactorer:
    def extract_with_recovery(self, function_name, target_module):
        """
        Extract with checkpoint-based recovery.
        If apply fails, can resume from preview state.
        """
        max_retries = 3
        
        for attempt in range(max_retries):
            result = self.execute_extraction_phase(function_name, target_module)
            
            if result["status"] == "success":
                return result
            
            if result["status"] == "error":
                error_code = result.get("code")
                
                if error_code == "ALREADY_EXTRACTED":
                    # Idempotency: verify it's already done
                    verify = self.verify_extraction(function_name, target_module)
                    if verify:
                        return {"status": "already_done", "location": verify}
                
                elif error_code == "FILE_LOCKED":
                    # Retry with backoff
                    print(f"  Attempt {attempt + 1}/{max_retries}: File locked, retrying...")
                    time.sleep(2 ** attempt)
                    continue
                
                elif error_code == "APPLY_FAILED":
                    # Try to recover from checkpoint
                    checkpoint_token = result.get("recovery", {}).get("checkpoint_token")
                    if checkpoint_token:
                        print(f"  Resuming from checkpoint...")
                        resume = self.resume_from_checkpoint(checkpoint_token)
                        return resume
                
                # Fatal error
                return result
        
        return {"status": "error", "code": "MAX_RETRIES_EXCEEDED"}

    def execute_extraction_phase(self, function_name, target_module):
        """Execute extraction with explicit checkpoint."""
        # Phase 1: Search & analyze
        search_result = self.cli.run("js-scan", {
            "search": function_name,
            "ai_mode": True
        })
        
        # Phase 2: Locate & preview
        locate_result = self.cli.run("js-edit", {
            "locate": function_name,
            "ai_mode": True
        })
        
        extract_token = locate_result["continuation_tokens"]["extract"]
        
        preview_result = self.cli.run("js-edit", {
            "continuation": extract_token,
            "to_module": target_module,
            "preview": True
        })
        
        # Create checkpoint BEFORE applying
        checkpoint = {
            "type": "pre_apply",
            "timestamp": datetime.now().isoformat(),
            "extract_token": extract_token,
            "to_module": target_module,
            "preview": preview_result
        }
        
        checkpoint_file = f"tmp/.checkpoints/extract_{function_name}_{int(time.time())}.json"
        os.makedirs("tmp/.checkpoints", exist_ok=True)
        with open(checkpoint_file, "w") as f:
            json.dump(checkpoint, f)
        
        # Phase 3: Apply (with potential for recovery)
        apply_token = preview_result["continuation_tokens"]["apply"]
        
        try:
            apply_result = self.cli.run("js-edit", {
                "continuation": apply_token,
                "fix": True
            }, timeout=30)
            
            if apply_result["status"] == "success":
                # Clean up checkpoint
                os.remove(checkpoint_file)
                return apply_result
            
            else:
                # Keep checkpoint for recovery
                return {
                    "status": "error",
                    "code": "APPLY_FAILED",
                    "recovery": {
                        "checkpoint_token": base64_encode(json.dumps(checkpoint)),
                        "checkpoint_file": checkpoint_file
                    }
                }
        
        except TimeoutError:
            # Assume apply may have partially succeeded
            # Verify state before declaring failure
            verify = self.verify_extraction(function_name, target_module)
            if verify:
                # It actually succeeded
                os.remove(checkpoint_file)
                return {"status": "success", "recovered_from_timeout": True}
            else:
                # Still failed
                return {
                    "status": "error",
                    "code": "APPLY_FAILED",
                    "recovery": {
                        "checkpoint_file": checkpoint_file
                    }
                }

    def resume_from_checkpoint(self, checkpoint_token):
        """Resume extraction from checkpoint."""
        checkpoint = json.loads(base64_decode(checkpoint_token))
        
        apply_token = checkpoint["preview"]["continuation_tokens"]["apply"]
        to_module = checkpoint["to_module"]
        
        # Re-attempt apply
        apply_result = self.cli.run("js-edit", {
            "continuation": apply_token,
            "fix": True
        })
        
        return apply_result

    def verify_extraction(self, function_name, target_module):
        """Verify function is in target module."""
        result = self.cli.run("js-scan", {
            "search": function_name,
            "scope": target_module,
            "ai_mode": True
        })
        
        if result["stats"]["match_count"] > 0:
            return result["matches"][0]
        return None

# Usage
refactorer = ResilientRefactorer(cli)
result = refactorer.extract_with_recovery("calculateTax", "src/services/tax.js")
```

---

## 5. Example 4: Batch Refactoring with Parallelization

**Goal:** Refactor 10 functions in parallel using continuation tokens (stateless, no conflicts)

```javascript
class BatchRefactorer {
  async refactorMultipleFunctions(functions, targetModules) {
    """
    Extract multiple functions to target modules in parallel.
    Uses continuation tokens (stateless) to avoid contention.
    """
    
    const batches = functions.map((fn, idx) => ({
      function_name: fn,
      target_module: targetModules[idx]
    }));

    // Phase 1: Search all functions in parallel (reads only)
    const searchPhase = await Promise.all(
      batches.map(batch =>
        this.cli.run("js-scan", {
          search: batch.function_name,
          ai_mode: true
        }).then(result => ({
          ...batch,
          search_result: result,
          continuation_tokens: result.continuation_tokens
        }))
      )
    );

    console.log(`✓ Phase 1: Searched ${searchPhase.length} functions`);

    // Phase 2: Analyze ripple for all (reads only)
    const ripplePhase = await Promise.all(
      searchPhase.map(item =>
        this.cli.run("js-scan", {
          continuation: item.continuation_tokens.analyze
        }).then(result => ({
          ...item,
          ripple_result: result,
          risk_level: result.risk.level
        }))
      )
    );

    console.log(`✓ Phase 2: Analyzed ripple for ${ripplePhase.length} functions`);

    // Filter out high-risk extractions
    const safeToExtract = ripplePhase.filter(item => item.risk_level === "GREEN");
    console.log(`✓ Safe to extract: ${safeToExtract.length}/${ripplePhase.length}`);

    // Phase 3: Preview all extractions in parallel (reads only)
    const previewPhase = await Promise.all(
      safeToExtract.map(item =>
        this.cli.run("js-edit", {
          locate: item.function_name,
          ai_mode: true
        }).then(locateResult => ({
          ...item,
          extract_token: locateResult.continuation_tokens.extract
        }))
      )
    );

    // Phase 3b: Get previews
    const previews = await Promise.all(
      previewPhase.map(item =>
        this.cli.run("js-edit", {
          continuation: item.extract_token,
          to_module: item.target_module,
          preview: true,
          ai_mode: true
        }).then(result => ({
          ...item,
          preview_result: result
        }))
      )
    );

    console.log(`✓ Phase 3: Generated previews for ${previews.length} extractions`);

    // Review all previews before proceeding (checkpoint)
    const approvedPreviews = previews.filter(item => {
      const changeCount = item.preview_result.changes.length;
      return changeCount <= 10; // Only approve small changes
    });

    console.log(`✓ Approved: ${approvedPreviews.length} extractions (others too risky)`);

    // Phase 4: Apply all approved extractions in SEQUENCE (writes only)
    // Note: We apply sequentially to avoid import conflicts
    const applyPhase = [];
    for (const item of approvedPreviews) {
      const applyResult = await this.cli.run("js-edit", {
        continuation: item.preview_result.continuation_tokens.apply,
        fix: true
      });

      applyPhase.push({
        ...item,
        apply_result: applyResult
      });

      console.log(`✓ Applied extraction: ${item.function_name}`);
    }

    console.log(`✓ Phase 4: Applied ${applyPhase.length} extractions`);

    // Summary
    return {
      total_functions: functions.length,
      searched: searchPhase.length,
      analyzed: ripplePhase.length,
      safe_to_extract: safeToExtract.length,
      previewed: previews.length,
      approved: approvedPreviews.length,
      applied: applyPhase.length,
      files_modified: applyPhase
        .flatMap(item => item.apply_result.files_modified || [])
        .filter((v, i, a) => a.indexOf(v) === i) // unique
    };
  }
}

// Usage
const refactorer = new BatchRefactorer(cli);
const result = await refactorer.refactorMultipleFunctions(
  ["func1", "func2", "func3", "func4", "func5"],
  [
    "src/services/svc1.js",
    "src/services/svc2.js",
    "src/utils/util1.js",
    "src/lib/lib1.js",
    "src/helpers/help1.js"
  ]
);

console.log(`\nSummary:`);
console.log(`  Applied: ${result.applied}/${result.total_functions}`);
console.log(`  Files modified: ${result.files_modified.length}`);
```

---

## 6. Error Recovery Catalog

### Recovery Pattern: TOKEN_EXPIRED

```python
def handle_token_expired(expired_token, original_args):
    """Re-fetch when token expires."""
    # Extract search/locate params from original args
    search_term = original_args.get("search")
    file = original_args.get("file")
    
    # Re-search
    new_result = cli.run("js-scan", {
        "search": search_term,
        "ai_mode": True
    })
    
    # Continue with new tokens
    return new_result
```

### Recovery Pattern: RESULTS_STALE

```python
def handle_results_stale(stale_token):
    """File changed since token issued, refresh."""
    recovery_token = stale_token.get("recovery", {}).get("reissue_token")
    
    if recovery_token:
        # Use reissue token to get fresh results
        return cli.run("js-scan", {
            "continuation": recovery_token,
            "ai_mode": True
        })
```

### Recovery Pattern: AMBIGUOUS_MATCH

```python
def handle_ambiguous_match(result):
    """Multiple matches, ask for clarification."""
    candidates = result["candidates"]
    
    # Pick by hash or ask
    selected = candidates[0]  # or let agent choose
    
    return cli.run("js-scan", {
        "search": original_search,
        "select_hash": selected["hash"],
        "ai_mode": True
    })
```

---

## 7. Checklist: Example Validation

- [ ] Example 1 (basic extraction) is clear and executable
- [ ] Example 2 (workflow with checkpoints) shows decision gates
- [ ] Example 3 (error recovery) demonstrates resilience
- [ ] Example 4 (batch parallelization) shows efficiency
- [ ] All code examples are syntactically valid
- [ ] Audit logs are comprehensive
- [ ] Error codes are consistent with spec
- [ ] Token usage patterns match 01-CONTINUATION-TOKEN-SPEC.md
