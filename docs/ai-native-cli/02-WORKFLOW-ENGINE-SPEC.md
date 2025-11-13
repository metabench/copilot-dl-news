# Workflow Engine Specification

**Version:** 1.0 (Design Phase)  
**Date:** November 13, 2025  

---

## 1. Overview

The **Workflow Engine** extends the Recipe system to support:
- **Checkpoints**: Pause before destructive operations for human/AI review
- **Decision trees**: Branch based on ripple analysis, risk levels, etc.
- **Data flow**: Pass results between steps (e.g., search → extract from first match)
- **Continuations**: Resume interrupted workflows via tokens

```
Workflow Definition (JSON/YAML)
  ↓
Parse + Validate
  ↓
Execute Step 1 → (if checkpoint) pause + emit token
  ↓
AI decides via token
  ↓
Resume from checkpoint → Execute Step 2
  ↓
...
```

---

## 2. Workflow Definition Format

### 2.1 Basic Structure

```json
{
  "name": "safe-refactor-workflow",
  "version": "1.0",
  "description": "Extract function with ripple analysis and approval gate",
  
  "steps": [
    {
      "id": "search_function",
      "type": "operation",
      "operation": "js-scan",
      "args": {
        "search": "processData",
        "scope": "src/"
      }
    },
    {
      "id": "analyze_ripple",
      "type": "operation",
      "operation": "js-scan",
      "args": {
        "ripple-analysis": "${search_function.matches[0].file}",
        "file": "${search_function.matches[0].name}"
      }
    },
    {
      "id": "approval_gate",
      "type": "checkpoint",
      "message": "Risk Level: ${analyze_ripple.risk.level} (Score: ${analyze_ripple.risk.score}/100)",
      "conditions": [
        {
          "if": "${analyze_ripple.risk.level} == 'GREEN'",
          "approve_label": "Safe to proceed",
          "auto_approve": true
        },
        {
          "if": "${analyze_ripple.risk.level} == 'YELLOW'",
          "approve_label": "Proceed with caution",
          "require_human_approval": true
        },
        {
          "if": "${analyze_ripple.risk.level} == 'RED'",
          "approve_label": "Not recommended",
          "block": true
        }
      ]
    },
    {
      "id": "extract",
      "type": "operation",
      "operation": "js-edit",
      "args": {
        "file": "${search_function.matches[0].file}",
        "extract": "${search_function.matches[0].name}",
        "to-module": "src/services/${search_function.matches[0].name}.js"
      },
      "depends_on": ["approval_gate"]
    },
    {
      "id": "consolidate",
      "type": "operation",
      "operation": "js-edit",
      "args": {
        "consolidate-imports": "${search_function.matches[0].name}",
        "scope": "src/"
      },
      "depends_on": ["extract"]
    }
  ]
}
```

### 2.2 Step Types

#### Type: `operation`

Executes a CLI command.

```json
{
  "id": "my_operation",
  "type": "operation",
  "operation": "js-scan|js-edit|workflow",
  "args": {
    "flag_name": "value",
    "another_flag": "${variable_reference}"
  },
  "checkpoint": false,  // Optional: pause before execution
  "timeout": 30,        // Optional: timeout in seconds
  "on_error": "abort|continue|retry"
}
```

**Variables in args:**
```
${step_id.field.subfield}    - Access result from another step
${env.VAR_NAME}              - Environment variables
${now}                        - Current timestamp
${workflow_id}               - Current workflow ID
```

#### Type: `checkpoint`

Pause and wait for human/AI decision.

```json
{
  "id": "my_checkpoint",
  "type": "checkpoint",
  "message": "Continue with extraction?",
  "options": [
    {
      "choice": "yes",
      "label": "Extract and consolidate",
      "next": "extract_step"
    },
    {
      "choice": "no",
      "label": "Cancel workflow",
      "next": "abort"
    },
    {
      "choice": "preview",
      "label": "Show detailed changes first",
      "next": "show_diff"
    }
  ]
}
```

#### Type: `conditional`

Branch based on expression.

```json
{
  "id": "check_risk",
  "type": "conditional",
  "expression": "${analyze_ripple.risk.level}",
  "branches": {
    "GREEN": { "next": "extract" },
    "YELLOW": { "next": "approval_gate" },
    "RED": { "next": "abort", "reason": "Too risky" }
  }
}
```

#### Type: `loop`

Iterate over array.

```json
{
  "id": "update_all",
  "type": "loop",
  "items": "${search_results.matches}",
  "variable": "match",
  "steps": [
    {
      "operation": "js-edit",
      "args": {
        "file": "${match.file}",
        "replace": "${match.name}",
        "with-code": "/* updated */"
      }
    }
  ]
}
```

---

## 3. Checkpoints

### 3.1 Checkpoint Lifecycle

```
Workflow running
  ↓
Hit checkpoint
  ↓
Emit checkpoint token with menu of choices
  ↓
Workflow state saved to tmp/
  ↓
Wait for AI decision via --workflow-resume TOKEN
  ↓
Restore state from tmp/
  ↓
Execute chosen branch
  ↓
Continue with next steps
```

### 3.2 Auto-Approval Rules

```json
{
  "id": "auto_gate",
  "type": "checkpoint",
  "message": "Ready to extract ${function_name}",
  "options": [
    {
      "choice": "yes",
      "auto_approve": true,  // Skip checkpoint, proceed automatically
      "if": "${ripple_analysis.risk.level} == 'GREEN'",
      "reason": "Low risk, auto-approved"
    }
  ]
}
```

### 3.3 Checkpoint Tokens

```bash
# When workflow hits checkpoint:
{
  "workflow_id": "wf_abc123xyz",
  "checkpoint_id": "approval_gate",
  "current_step": 2,
  "message": "Risk Level: YELLOW (Score: 45/100)",
  
  "options": [
    {
      "choice": "yes",
      "label": "Proceed with caution",
      "token": "wf_abc123xyz:choice_yes"
    },
    {
      "choice": "no",
      "label": "Cancel workflow",
      "token": "wf_abc123xyz:choice_no"
    }
  ],
  
  "context": {
    "previous_steps": ["search_function", "analyze_ripple"],
    "previous_results": {...}
  }
}
```

### 3.4 Resume Checkpoint

```bash
$ js-tools --workflow-resume "wf_abc123xyz:choice_yes" --json

Response:
{
  "workflow_id": "wf_abc123xyz",
  "checkpoint_id": "approval_gate",
  "choice": "yes",
  "status": "continuing",
  "next_step": "extract"
}
```

---

## 4. Variable Interpolation

### 4.1 Available Variables

#### Step Results
```
${step_id}                    # Full result object
${step_id.matches}            # Array of matches
${step_id.matches[0]}         # First match
${step_id.matches[0].name}    # Field access
${step_id.results.count}      # Nested fields
```

#### Built-ins
```
${now}                        # ISO8601 timestamp
${workflow_id}               # Workflow ID
${env.HOME}                  # Environment variable
${current_step}              # Current step ID
${previous_step}             # Previous step ID
```

#### Expressions
```
${ripple.risk.level == 'GREEN' ? 'safe' : 'risky'}
${matches | length}          # Filter (length)
${matches | first}           # Filter (first item)
${matches | map(.name)}      # Filter (map)
```

### 4.2 Type Coercion

```json
// In args:
{
  "file": "${matches[0].file}",        // string ← object.file
  "limit": "${search_limit}",          // number ← auto-coerce
  "export": "${should_export}",        // boolean ← true/false/0/1
  "files": "${matches | map(.file)}"   // array ← computed
}
```

---

## 5. Error Handling

### 5.1 On-Error Strategies

```json
{
  "id": "extract",
  "operation": "js-edit",
  "args": {...},
  "on_error": "abort|continue|retry|checkpoint"
}
```

| Strategy | Behavior |
|----------|----------|
| `abort` | Stop workflow, emit error token |
| `continue` | Log warning, skip to next step |
| `retry` | Retry up to 3 times, then abort |
| `checkpoint` | Pause, ask AI whether to continue |

### 5.2 Error Token

```bash
{
  "status": "error",
  "workflow_id": "wf_abc123",
  "step_id": "extract",
  "error": "File not found: src/api.js",
  "on_error_strategy": "checkpoint",
  
  "options": [
    {
      "choice": "retry",
      "label": "Retry this step",
      "token": "wf_abc123:error_retry"
    },
    {
      "choice": "skip",
      "label": "Skip and continue",
      "token": "wf_abc123:error_skip"
    },
    {
      "choice": "abort",
      "label": "Abort entire workflow",
      "token": "wf_abc123:error_abort"
    }
  ]
}
```

---

## 6. Workflow State & Resumability

### 6.1 State Persistence

```
tmp/.workflows/
  wf_abc123xyz/
    manifest.json              # Workflow definition + current state
    checkpoint_001.json        # Checkpoint at step 1
    results/
      step_1_search.json       # Results from step 1
      step_2_ripple.json       # Results from step 2
    resume_tokens.json         # Available tokens to resume
```

### 6.2 Manifest Structure

```json
{
  "workflow_id": "wf_abc123xyz",
  "name": "safe-refactor",
  "created_at": "2025-11-13T10:30:00Z",
  "expires_at": "2025-11-13T14:30:00Z",
  
  "current_state": {
    "step_index": 2,
    "step_id": "approval_gate",
    "status": "checkpoint_pending"
  },
  
  "steps_completed": [
    { "id": "search_function", "status": "success", "duration_ms": 150 },
    { "id": "analyze_ripple", "status": "success", "duration_ms": 280 }
  ],
  
  "context": {
    // All variables available at this point
    "search_results": {...},
    "ripple_analysis": {...}
  }
}
```

### 6.3 Resumption After Interruption

```bash
# List active workflows
$ js-tools --list-workflows --json
[
  {
    "workflow_id": "wf_abc123xyz",
    "name": "safe-refactor",
    "created_at": "2025-11-13T10:30:00Z",
    "current_step": "approval_gate",
    "status": "checkpoint_pending",
    "resume_token": "wf_abc123xyz:resume"
  }
]

# Resume
$ js-tools --workflow-resume "wf_abc123xyz:resume" --json
```

---

## 7. Workflow Execution Modes

### 7.1 Interactive Mode (`--checkpoint-after-each-step`)

Pause after every step for review.

```bash
$ js-tools --workflow extract.json --checkpoint-after-each-step --json

# After step 1:
{
  "current_step": "search_function",
  "results": {...},
  "next_actions": [
    { "choice": "continue", "token": "..." },
    { "choice": "review_details", "token": "..." },
    { "choice": "abort", "token": "..." }
  ]
}
```

### 7.2 Dry-Run Mode (`--dry-run`)

Execute all steps but don't apply mutations.

```bash
$ js-tools --workflow extract.json --dry-run --json

# All preview tokens, no --fix flags
```

### 7.3 Automatic Mode (default)

Execute all steps, pause only at explicit checkpoints.

```bash
$ js-tools --workflow extract.json --json

# Runs through auto-approved steps, pauses only at checkpoints
```

---

## 8. Workflow Templating

### 8.1 Template Parameters

```json
{
  "name": "extract-function",
  "parameters": {
    "function_name": {
      "type": "string",
      "required": true,
      "description": "Function to extract"
    },
    "target_module": {
      "type": "string",
      "required": true,
      "description": "Where to extract to (e.g., src/services/)"
    }
  },
  "steps": [...]
}
```

### 8.2 Template Instantiation

```bash
# Via command line
$ js-tools --workflow extract-function.json \
  --param function_name=processData \
  --param target_module=src/services/ \
  --json

# Via JSON file
$ cat > params.json << 'EOF'
{
  "function_name": "processData",
  "target_module": "src/services/"
}
EOF

$ js-tools --workflow extract-function.json --params params.json --json
```

---

## 9. Workflow Composition

### 9.1 Nested Workflows

```json
{
  "steps": [
    {
      "id": "phase_1",
      "type": "workflow",
      "workflow": "extract-service.json",
      "params": {
        "function": "processData"
      }
    },
    {
      "id": "phase_2",
      "type": "operation",
      "operation": "js-edit",
      "args": {
        "consolidate-imports": "processData",
        "scope": "src/"
      }
    }
  ]
}
```

### 9.2 Reusable Workflow Library

```
workflows/
  extract-service.json
  rename-global.json
  consolidate-imports.json
  move-and-update.json
```

---

## 10. Implementation Checklist

### Phase 1: Core Engine
- [ ] Extend RecipeEngine with checkpoint support
- [ ] Implement variable interpolation
- [ ] Add state persistence to tmp/.workflows/
- [ ] Implement resume logic

### Phase 2: Checkpoint System
- [ ] Generate checkpoint tokens
- [ ] Validate checkpoint choices
- [ ] Handle auto-approval rules
- [ ] Error handling at checkpoints

### Phase 3: CLI Integration
- [ ] Add `--workflow` flag to js-tools
- [ ] Add `--workflow-resume` flag
- [ ] Add `--list-workflows` flag
- [ ] Add `--checkpoint-after-each-step` mode

### Phase 4: Testing
- [ ] Unit tests: variable interpolation
- [ ] Unit tests: checkpoint lifecycle
- [ ] Integration tests: end-to-end workflow
- [ ] Error recovery tests

---

## 11. Examples

See **04-EXAMPLES.md** for complete workflow scenarios.
