# AI Integration Guide

**Version:** 1.0 (Design Phase)  
**Date:** November 13, 2025  

---

## 1. Overview for AI Agents

This guide explains how AI agents (like GitHub Copilot, Claude, etc.) should interact with AI-Native CLI tools to perform safe, auditable refactoring workflows.

### Key Differences from Human Usage

| Aspect | Human Usage | AI Agent Usage |
|--------|------------|----------------|
| Workflows | Linear, often single-step | Often multi-step with decision gates |
| Error Recovery | Interactive error correction | Structured error tokens + retry logic |
| Decisions | Based on code review | Based on ripple analysis + risk scores |
| Auditability | Manual documentation | Automatic via token chain |
| Parallelization | N/A | Possible with stateless tokens |

---

## 2. Agent Workflow Patterns

### Pattern 1: Search → Analyze → Decide → Execute

```python
# Step 1: Search for function
result_1 = run_cli("js-scan", {
    "search": "processData",
    "scope": "src/",
    "ai_mode": True
})

# result_1 includes continuation_tokens for next actions
token_analyze = result_1["continuation_tokens"]["analyze:0"]

# Step 2: Analyze first match
result_2 = run_cli("js-scan", {
    "continuation": token_analyze
})

# Step 3: Check ripple analysis results
ripple_token = result_2["continuation_tokens"]["ripple:0"]
result_3 = run_cli("js-scan", {
    "continuation": ripple_token
})

# Step 4: Decide based on risk
risk_level = result_3["risk"]["level"]

if risk_level == "GREEN":
    # Safe to proceed
    extract_token = result_2["continuation_tokens"]["extract"]
    result_4 = run_cli("js-edit", {
        "continuation": extract_token,
        "to_module": "src/services/processor.js",
        "fix": True
    })
else:
    # Need approval or skip
    print(f"Risk too high: {risk_level}")
```

### Pattern 2: Workflow with Checkpoints

```python
# Define workflow
workflow = {
    "name": "safe-extract",
    "steps": [...]
}

# Run with checkpoints
result = run_cli("js-tools", {
    "workflow": "safe-extract.json",
    "checkpoint_after_each_step": True
})

while result["awaiting_input"]:
    # Get next decision
    options = result["options"]
    best_option = analyze_options(options)
    
    # Resume with chosen token
    choice_token = best_option["token"]
    result = run_cli("js-tools", {
        "workflow_resume": choice_token
    })

print(f"Workflow completed: {result['status']}")
```

### Pattern 3: Error Recovery

```python
def execute_with_recovery(command, args, max_retries=3):
    for attempt in range(max_retries):
        result = run_cli(command, args)
        
        if result["status"] == "success":
            return result
        
        elif result["status"] == "error":
            error_code = result["code"]
            
            if error_code == "TOKEN_EXPIRED":
                # Re-issue from recovery token
                recovery_token = result["recovery"]["recovery_token"]
                return execute_with_recovery(
                    command, 
                    {"continuation": recovery_token},
                    max_retries - attempt - 1
                )
            
            elif error_code == "RESULTS_STALE":
                # Re-fetch fresh results
                reissue_token = result["recovery"]["reissue_token"]
                return execute_with_recovery(
                    command,
                    {"continuation": reissue_token},
                    max_retries - attempt - 1
                )
            
            elif error_code == "INVALID_TOKEN":
                # Fatal: token corrupted
                raise Exception("Token corrupted, cannot recover")
            
            else:
                # Unexpected error
                raise Exception(f"Error: {error_code}")
        
        elif result["status"] == "warning":
            # Handle warning, usually stale results
            if "recovery" in result:
                return execute_with_recovery(
                    command,
                    {"continuation": result["recovery"]["recovery_token"]},
                    max_retries - attempt - 1
                )
```

---

## 3. Best Practices for AI Agents

### 3.1 Always Use `--ai-mode`

```python
# ✅ Good: Structured output, tokens included
result = run_cli("js-scan", {
    "search": "myFunc",
    "ai_mode": True  # Include continuation_tokens
})

# ❌ Bad: Human-readable output, hard to parse
result = run_cli("js-scan", {
    "search": "myFunc"
    # Missing ai_mode → output not token-friendly
})
```

### 3.2 Validate Tokens Before Using

```python
def safe_continuation(token):
    """Verify token is valid before using it."""
    try:
        # Token validation happens in CLI, but we can check structure
        if not token or not isinstance(token, str):
            return False
        if len(token) < 100:  # Tokens are long Base64
            return False
        return True
    except:
        return False

# Use safely
if safe_continuation(token):
    result = run_cli("js-scan", {"continuation": token})
else:
    # Re-fetch
    result = run_cli("js-scan", {"search": "myFunc", "ai_mode": True})
```

### 3.3 Log Token Chain for Auditability

```python
import json

class WorkflowLogger:
    def __init__(self, workflow_name):
        self.workflow_name = workflow_name
        self.log = {
            "workflow": workflow_name,
            "steps": [],
            "decisions": []
        }
    
    def log_step(self, step_id, result):
        self.log["steps"].append({
            "id": step_id,
            "status": result["status"],
            "digest": result.get("context", {}).get("results_digest")
        })
    
    def log_decision(self, options, chosen_token, reason):
        self.log["decisions"].append({
            "options": [o["id"] for o in options],
            "chosen": chosen_token,
            "reason": reason,
            "timestamp": datetime.now().isoformat()
        })
    
    def save(self, filepath):
        with open(filepath, "w") as f:
            json.dump(self.log, f, indent=2)

# Usage
logger = WorkflowLogger("extract-service")
logger.log_step("search", search_result)
logger.log_decision(options, chosen_token, "Green risk level")
logger.save("audit_log.json")
```

### 3.4 Always Respect `guard: true` Operations

```python
# Some operations require preview + explicit approval

result = run_cli("js-edit", {
    "file": "src/app.js",
    "locate": "myFunc",
    "ai_mode": True
})

# Check which operations need guarding
safe_ops = result["continuation_tokens"]

# For guarded operations, always:
# 1. Get preview
# 2. Analyze diff
# 3. Use approval token

extract_preview_token = safe_ops["extract"]
preview = run_cli("js-edit", {
    "continuation": extract_preview_token
})

print("Changes preview:")
for change in preview["changes"]:
    print(f"  {change['file']}: {change['operation']}")

# Only then apply
apply_token = preview["continuation_tokens"]["apply"]
result = run_cli("js-edit", {
    "continuation": apply_token,
    "fix": True  # Explicit confirmation
})
```

### 3.5 Implement Idempotency Checks

```python
def idempotent_extract(function_name, target_module):
    """
    Extract function, handling case where it's already been extracted.
    """
    # Step 1: Check if already extracted
    check_result = run_cli("js-scan", {
        "search": function_name,
        "scope": target_module,
        "ai_mode": True
    })
    
    if check_result["match_count"] > 0:
        # Already extracted
        return {
            "status": "already_exists",
            "location": check_result["matches"][0]
        }
    
    # Step 2: Extract
    locate_result = run_cli("js-edit", {
        "locate": function_name,
        "file": "src/main.js",
        "ai_mode": True
    })
    
    extract_token = locate_result["continuation_tokens"]["extract"]
    preview = run_cli("js-edit", {
        "continuation": extract_token,
        "to_module": target_module
    })
    
    apply_token = preview["continuation_tokens"]["apply"]
    result = run_cli("js-edit", {
        "continuation": apply_token,
        "fix": True
    })
    
    return {"status": "extracted", "files": result["files_modified"]}
```

---

## 4. Integrating with Agent Frameworks

### 4.1 Langchain Integration Example

```python
from langchain.agents import Tool, initialize_agent
from typing import Any

def js_scan_search(query: str) -> str:
    """Search JavaScript codebase."""
    result = run_cli("js-scan", {
        "search": query,
        "scope": "src/",
        "ai_mode": True,
        "json": True
    })
    
    # Format for agent
    if result["status"] == "success":
        return json.dumps({
            "matches": [
                {
                    "file": m["file"],
                    "line": m["line"],
                    "name": m["function"]["name"]
                }
                for m in result["matches"]
            ],
            "total": result["stats"]["match_count"],
            "next_action": "You can now use analyze_ripple(match_id) to check safety"
        })
    else:
        return f"Search failed: {result['error']}"

def analyze_ripple(match_id: int) -> str:
    """Analyze ripple effects of modifying a function."""
    # ... similar pattern ...

tools = [
    Tool(
        name="js-search",
        func=js_scan_search,
        description="Search for functions in JavaScript codebase"
    ),
    Tool(
        name="analyze-ripple",
        func=analyze_ripple,
        description="Analyze impact of refactoring a function"
    ),
    # ...
]

agent = initialize_agent(tools, llm, agent="zero-shot-react-description")
```

### 4.2 OpenAI Function Calling

```python
{
    "name": "js_scan_search",
    "description": "Search JavaScript functions by name or pattern",
    "parameters": {
        "type": "object",
        "properties": {
            "search": {
                "type": "string",
                "description": "Function name to search for"
            },
            "scope": {
                "type": "string",
                "description": "Directory scope (e.g., 'src/')"
            }
        },
        "required": ["search"]
    }
}

{
    "name": "js_edit_extract",
    "description": "Extract a function to a new module with continuation token",
    "parameters": {
        "type": "object",
        "properties": {
            "continuation_token": {
                "type": "string",
                "description": "Token from locate operation"
            },
            "to_module": {
                "type": "string",
                "description": "Target module path"
            }
        },
        "required": ["continuation_token", "to_module"]
    }
}
```

---

## 5. Error Handling Patterns

### 5.1 Structured Error Recovery

```python
class AIAgentRefactorer:
    def execute_with_fallback(self, operation, args):
        """Execute operation with structured fallback."""
        try:
            result = run_cli(operation, args)
            
            if result["status"] == "success":
                return result
            
            elif result["status"] == "error":
                return self.handle_error(result)
            
            elif result["status"] == "warning":
                return self.handle_warning(result)
            
        except Exception as e:
            return self.handle_exception(e, operation, args)
    
    def handle_error(self, error_result):
        code = error_result["code"]
        recovery = error_result.get("recovery", {})
        
        if code == "FILE_NOT_FOUND":
            # Try to re-search
            reissue_token = recovery.get("reissue_token")
            if reissue_token:
                return run_cli("js-scan", {
                    "continuation": reissue_token
                })
        
        elif code == "MULTIPLE_MATCHES":
            # Let caller disambiguate
            candidates = error_result.get("candidates", [])
            return {
                "status": "needs_disambiguation",
                "candidates": candidates,
                "instruction": "Pick one match and retry with --select-hash"
            }
        
        # For other errors, escalate
        raise Exception(f"Unrecoverable error: {code}")
```

### 5.2 Timeout Handling

```python
import signal
import time

def run_cli_with_timeout(command, args, timeout_seconds=60):
    """Run CLI with timeout, resumable if interrupted."""
    start_time = time.time()
    
    try:
        result = run_cli(command, args, timeout=timeout_seconds)
        elapsed = time.time() - start_time
        
        if result["status"] == "timeout":
            # Operation took too long
            # Check if it has a checkpoint token we can resume
            if "resume_token" in result:
                print(f"Timeout after {elapsed}s, but checkpoint saved")
                return {
                    "status": "timeout_with_checkpoint",
                    "resume_token": result["resume_token"]
                }
        
        return result
    
    except TimeoutError:
        elapsed = time.time() - start_time
        return {
            "status": "timeout",
            "elapsed": elapsed,
            "message": f"Operation exceeded {timeout_seconds}s timeout"
        }
```

---

## 6. Workflow Examples

See **04-EXAMPLES.md** for complete agent workflows.

---

## 7. Checklist for Agent Implementation

- [ ] Use `--ai-mode` for all queries
- [ ] Validate tokens before using
- [ ] Log token chain for auditability
- [ ] Implement error recovery
- [ ] Respect `guard: true` operations
- [ ] Check idempotency before mutations
- [ ] Handle timeouts gracefully
- [ ] Test with `--dry-run` first
- [ ] Validate ripple analysis before proceeding
- [ ] Document decisions in audit log
