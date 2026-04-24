# Developer Tooling Playground

This directory hosts experimental-but-safe developer CLIs that follow shared conventions.

## 📚 Dedicated Tooling Guides

We have split the detailed usage documentation into focused guides:

### [AST, Refactoring & Static Analysis](/docs/tools/AST-TOOLING.md)
Contains documentation for `js-scan`, `js-edit`, `md-scan`, `md-edit`, Ripple Analysis, and recipe systems. Essential for automated code surgery.

### [SVG Validation Tooling](/docs/tools/SVG-TOOLING.md)
Contains documentation for `svg-scan`, `svg-collisions`, `svg-overflow`, and `svg-contrast`.

### [Crawler & Telemetry Tooling](/docs/tools/CRAWL-TOOLING.md)
Contains documentation for background daemons, test crawlers, `db-downloads` syncing, and job management (`task-events`, `crawl-status`, `crawl-log-parse`, etc.).

---

## Workspace & Session Utilities
Below are general utilities that remain in this index.

## `workflows` — List/Search Workflow Docs

Use this when you want to quickly discover what repeatable procedures exist under `docs/workflows/`.

```powershell
# List workflows
node tools/dev/workflows.js --list

# Search workflows
node tools/dev/workflows.js --search crawl diagnostic --json

# Filter by tag
node tools/dev/workflows.js --tag ui --compact
```


Use `--async`, `--generator`, `--kind`, `--include-path`, and `--exclude-path` to refine search results. Text output respects `--max-lines`, `--no-snippets`, and `--hashes-only` for concise listings, while JSON payloads include guidance hints when result sets overflow.

### Ripple Analysis — Dependency Impact Assessment

`--ripple-analysis <file>` performs multi-layer dependency graph analysis to assess refactoring risk before making changes. The analyzer builds a complete import graph, scores risk factors, detects circular dependencies, and provides safety assertions for common refactoring operations.

**Quick Examples:**
```powershell
# Analyze a file's dependency impact (human-readable output)
node tools/dev/js-scan.js --ripple-analysis src/modules/crawler.js

# Get JSON output for automation
node tools/dev/js-scan.js --ripple-analysis src/modules/crawler.js --json

# Analyze before renaming a widely-used module
node tools/dev/js-scan.js --ripple-analysis src/db/adapters/postgres.js
```

**Output Includes:**
- **Dependency Graph**: Multi-layer import chains (direct imports + reverse dependencies)
- **Risk Score**: 0-100 scale with weighted factors (importers 40%, circular deps 30%, public interface 20%, usage patterns 10%)
- **Risk Level**: GREEN (<30), YELLOW (30-70), RED (>70) with actionable recommendations
- **Circular Dependencies**: Complete cycle detection with path traces
- **Safety Assertions**: Boolean checks for `canRename`, `canDelete`, `canModifySignature`, `canExtract`

**Risk Levels Explained:**
- **GREEN (0-29)**: Safe to refactor with minimal impact. Limited importers, no cycles, small public surface.
- **YELLOW (30-69)**: Moderate risk. Review importers carefully, run full test suite after changes.
- **RED (70-100)**: High risk. Break into smaller refactors, resolve circular dependencies first, coordinate with team.

**Human-Readable Output Example:**
```
┌ Ripple Analysis ═══════════════════════════
  Target File          src/modules/crawler.js
  Nodes                14
  Edges                13
  Max Depth            1
  Has Cycles           NO

┌ Risk Assessment ══════════════════════════
  Overall Score        5
  Risk Level           GREEN
  
  Factor Breakdown
    Importers          2.0  (0.8 weight)
    Circular Deps      0.0  (0.3 weight)
    Public Interface   10.0 (0.2 weight)
    Usage Patterns     2.8  (0.1 weight)

┌ Safety Assertions ════════════════════════
  Can Rename           ✓ YES
  Can Delete           ✓ YES
  Can Modify Signature ✓ YES
  Can Extract          ✓ YES

┌ Recommendations ══════════════════════════
  ✓ LOW RISK: Safe to refactor
  ✓ Limited impact on codebase
```

**JSON Output Structure:**
```json
{
  "targetFile": "src/modules/crawler.js",
  "success": true,
  "graph": {
    "nodeCount": 14,
    "edgeCount": 13,
    "depth": 1,
    "hasCycles": false,
    "nodes": [...]
  },
  "risk": {
    "score": 5,
    "level": "GREEN",
    "factors": {
      "importerCount": 2.0,
      "circularDeps": 0.0,
      "publicInterface": 10.0,
      "usagePatterns": 2.8
    },
    "recommendations": [...]
  },
  "cycles": {
    "hasCycles": false,
    "cycleCount": 0,
    "cycles": []
  },
  "safetyAssertions": {
    "canRename": true,
    "canDelete": true,
    "canModifySignature": true,
    "canExtract": true
  },
  "summary": {
    "message": "Ripple analysis for crawler.js: GREEN risk",
    "nodeCount": 14,
    "riskScore": 5,
    "riskLevel": "GREEN",
    "hasCycles": false
  }
}
```

**Integration with Refactoring Workflows:**
1. Run ripple analysis before major refactors to assess impact
2. Check `safetyAssertions` to confirm operation is safe
3. Review `risk.recommendations` for specific guidance
4. If RED level, break refactor into smaller steps or resolve cycles first
5. Use `--json` output to automate safety checks in CI/CD pipelines


## `mcp-check` — MCP Server Health Check

`mcp-check` verifies MCP servers are responsive before agents attempt tool calls. This prevents agents from getting stuck waiting for unresponsive servers.

**Quick Examples:**
```powershell
# Check all configured MCP servers
node tools/dev/mcp-check.js

# Check specific server
node tools/dev/mcp-check.js --server svg-editor

# Quick check (spawn + init only, skip tool listing)
node tools/dev/mcp-check.js --quick

# JSON output for automation
node tools/dev/mcp-check.js --quick --json

# Custom timeout (2 seconds)
node tools/dev/mcp-check.js --timeout 2000

# List available servers without checking
node tools/dev/mcp-check.js --list
```

**Output:**
- **HEALTHY**: Server responded within timeout, tools available
- **TIMEOUT**: Server did not respond within timeout
- **ERROR**: Server failed to spawn or crashed

**Agent Usage Pattern:**
Before making MCP tool calls, agents should run a quick health check:
```powershell
# Fast pre-flight check
node tools/dev/mcp-check.js --quick --json
# If allHealthy: true, proceed with MCP tools
# If allHealthy: false, use CLI fallbacks instead
```

**Exit Codes:**
- `0` — All checked servers healthy
- `1` — One or more servers failed
- `2` — Configuration error


## `tmp-prune` — Scratch Directory Pruning

`tmp-prune` keeps the scratch directory manageable by retaining only the newest entries (default: ten per folder) while respecting sticky sentinels like `.gitkeep`. The CLI defaults to dry-run previews; supply `--fix` when you are ready to delete.

- `node tools/dev/tmp-prune.js` — preview deletions under `./tmp`, summarising which folders would lose older artifacts.
- `node tools/dev/tmp-prune.js --keep 5 --fix` — remove everything beyond the five most recent entries in every directory.
- `node tools/dev/tmp-prune.js --root tmp/js-edit --json` — emit a JSON summary for automation without touching the filesystem.
- `npm run tmp:prune` — run the dry-run preview via the package script for quick housekeeping.

The tool walks each directory breadth-first, skips `.gitkeep`, and reports any Windows locking errors so you can rerun once handles release.


## `dir-sizes` — Directory Size Summary

`dir-sizes` measures directory sizes (bytes + file count) to guide what should be pruned vs archived.

```powershell
# Default set (tmp/tmp/debug/testlogs/screenshots/build/analysis-charts/data)
node tools/dev/dir-sizes.js

# Target a few dirs explicitly
node tools/dev/dir-sizes.js --dir testlogs screenshots tmp --top 15 --json
```


## `artifact-archive` — Artifact Archival (Logs/Screenshots/Charts)

`artifact-archive` buckets older artifacts into ZIP files (default: monthly buckets) and writes a small manifest so archives remain listable/extractable later.

Targets are intended for **ignored** local artifact folders (so the working tree stays lean) while preserving access to older evidence.

```powershell
# Preview archiving test logs older than 28 days
node tools/dev/artifact-archive.js --target testlogs --archive --older-than 28

# Apply (moves files into an archive zip, deletes originals)
node tools/dev/artifact-archive.js --target testlogs --archive --older-than 28 --fix

# List known archive buckets
node tools/dev/artifact-archive.js --target testlogs --list

# Extract a bucket to a safe location (default: <root>/archive/extracted/<bucket>)
node tools/dev/artifact-archive.js --target testlogs --extract 2025-10 --fix

# Search text content inside archives (extract + scan)
node tools/dev/artifact-archive.js --target testlogs --search "EADDRINUSE" --limit 10
```


## `session-archive` — Session Folder Archival & Search

`session-archive` archives old session folders into a ZIP file, reducing docs sprawl while preserving searchable access to historical sessions. The CLI defaults to dry-run previews; supply `--fix` to apply changes.

**Quick Examples:**
```powershell
# Preview sessions older than 30 days that would be archived
node tools/dev/session-archive.js --archive --older-than 30

# Actually archive them (removes originals, adds to ZIP + manifest)
node tools/dev/session-archive.js --archive --older-than 30 --fix

# Create/update the ZIP but keep the original session folders (non-destructive)
node tools/dev/session-archive.js --archive --older-than 30 --fix --keep-original

# List all archived sessions
node tools/dev/session-archive.js --list

# Search archived sessions for content
node tools/dev/session-archive.js --search "jsgui3 activation"

# Read an archived session's summary and plan
node tools/dev/session-archive.js --read 2025-11-14-binding-plugin

# Read multiple sessions at once (single ZIP extraction, more efficient)
node tools/dev/session-archive.js --read 2025-11-14-binding-plugin 2025-11-15-client-activation --json

# Restore a session from archive to docs/sessions/
node tools/dev/session-archive.js --extract 2025-11-14-binding-plugin --fix

# Remove a session from the archive permanently
node tools/dev/session-archive.js --remove 2025-11-14-binding-plugin --fix
```

**Options:**
- `--archive` — Archive sessions older than N days
- `--older-than <days>` — Age threshold for archiving (default: 30)
- `--keep-original` — When used with `--archive --fix`, keep original session folders (do not delete)
- `--list` — List all archived sessions
- `--search <query>` — Full-text search archived session content
- `--read <slug> [<slug2> ...]` — Read one or more archived sessions (single extraction)
- `--extract <slug>` — Restore a session from archive
- `--remove <slug>` — Remove a session from archive
- `--fix` — Apply changes (default is dry-run)
- `--json` — Output as JSON for automation
- `--limit <number>` — Limit results (default: 20)

**Archive Location:** `docs/sessions/archive/sessions-archive.zip` + `archive-manifest.json`


## `node-procs` — Node Process Manager

`node-procs` lists all running node processes with categorization, helping identify crawls, servers, tests, and other processes. Supports killing processes by category or PID.

**Quick Examples:**
```powershell
# List all node processes (grouped by category)
node tools/dev/node-procs.js

# JSON output for automation
node tools/dev/node-procs.js --json

# Kill all test-related processes
node tools/dev/node-procs.js --kill-tests

# Kill all crawl processes
node tools/dev/node-procs.js --kill-crawls

# Kill a specific process by PID
node tools/dev/node-procs.js --kill 12345

# Kill all non-protected processes
node tools/dev/node-procs.js --kill-all

# Include protected processes in listing
node tools/dev/node-procs.js --protected
```

**Categories:**
- 🧪 Jest Test — test processes
- 🕷️ Crawler — crawl-related processes
- 🌐 Dev Server 🛡️ — server processes (protected by default)
- 🖥️ Electron — Electron app processes
- 🔧 Dev Tool — tools/dev/* utilities
- 📦 NPM Script — npm/npx processes
- 🤖 MCP Server — MCP tool servers
- 💻 VS Code — VS Code internals
- ❓ Unknown — unrecognized processes


## `what-next` — Active Session Summary

`what-next` parses the `SESSIONS_HUB.md` to identify active sessions and summarize the current plan, now with a past/present/future view that surfaces related sessions and next actions.

- `node tools/dev/what-next.js` — show active sessions, the primary session summary, and a past/present/future block (objective, next task, next test, follow-ups, related sessions by slug stem).
- `--json` — emit machine-friendly payload (`activeSessions`, `primary`, `plan`, `timeline`, requested `sections`).
- `--session <slug|index>` — pick a specific session (falls back to historical sessions when the slug is not currently active).
- `--sections objective,done,change,risks,tests,followups` — limit which PLAN sections render in human output and are listed in JSON.
- Exit codes: `0` success, `1` no active sessions / no match, `2` error.


## `ui-pick` — Interactive Quick Picker

`ui-pick` launches a lightweight Electron window to present a list of options to the user. It returns the selected option to stdout (plain) or JSON when requested, enabling interactive decision-making within CLI workflows.

- `node tools/dev/ui-pick.js "Option A" "Option B"` — present simple string options (stdout emits the selection, exit 0; cancel exits 1 and prints `Cancelled`).
- `node tools/dev/ui-pick.js --options '[{"label":"A","description":"Desc A","value":"a"}, ...]'` — present rich options with descriptions.
- `--json` — emit `{success, selection, cancelled, raw}` on stdout; exit code remains `0` for selection, `1` for cancel, `2` on argument/parse errors.
- Right-click any item to open a context menu (🔍 Explore, 🧪 Test, 🛠️ Implement, 🛡️ Fix); selections display transient footer hints.
- Options may include `icon`/`emoji` and `phase` fields; structured JSON output echoes the chosen option and phase so agents can auto-advance without re-prompting.
- If no icon is provided, ui-pick falls back to a phase emoji when present (plan/design 🧭, explore 🔍, implement 🛠️, test 🧪, validate ✅, fix 🛡️).


## `git-pr-link` — Git PR Link Helper

`git` can push branches, but creating a Pull Request is a **GitHub API operation**. This helper prints the correct GitHub compare URL with safe defaults so agents never get stuck.

**Quick Examples:**
```powershell
# Print compare URL (base from origin/HEAD, head from current branch)
node tools/dev/git-pr-link.js

# Machine-readable output
node tools/dev/git-pr-link.js --json

# Convenience wrapper
npm run pr:link
```

**What it does:**
- Detects `origin` URL and parses GitHub owner/repo (supports HTTPS + SSH forms)
- Detects base branch from `origin/HEAD` (defaults to `main` if missing)
- Detects current branch as head
- Computes ahead/behind vs base (best-effort using local/remote refs)
- Warns when the worktree is dirty or when the branch has no upstream


## `emoji-encode` — Emoji UTF-8 Encoding Helper

`emoji-encode` prints UTF-8 hex/base64 for emoji text. Prefer `--codepoint` inputs so you don’t need to type literal emoji into a shell.

- `node tools/dev/emoji-encode.js --codepoint U+1F9E0 --json`
- `node tools/dev/emoji-encode.js --codepoint U+2699,U+FE0F --json`


## `agent-files` — Agent File Management (understand/verify/edit)

`agent-files` complements `agent-validate`, `agent-matrix`, and `agent-rename` by providing agent-specific search, optional link checking, and a safe batch-edit wrapper around `md-edit`.

- List agents: `node tools/dev/agent-files.js --list`
- Validate frontmatter + handoffs: `node tools/dev/agent-files.js --validate --check-handoffs`
- Validate + link targets: `node tools/dev/agent-files.js --validate --check-links`
- Search within agents: `node tools/dev/agent-files.js --search Evidence Contract --limit 25`
- Batch replace a section (dry-run): `node tools/dev/agent-files.js --replace-section "Evidence Contract" --with-file replacements/evidence-contract.md`
- Apply the batch replace: `node tools/dev/agent-files.js --replace-section "Evidence Contract" --with-file replacements/evidence-contract.md --fix`


## `agent-matrix` — Agent Capability Matrix

`agent-matrix` scans `.github/agents/*.agent.md` and produces a tools/capabilities inventory that agents can use to decide what to hand off to whom.

- `node tools/dev/agent-matrix.js --json` — emit a JSON manifest (per-agent tools + derived flags).
- `node tools/dev/agent-matrix.js --show-agents` — show a compact per-agent list in text mode.
- `node tools/dev/agent-matrix.js --view matrix` — show an ASCII table of derived capabilities.
- Filters: `--tool docs-memory/*`, `--tool-mode all`, `--has-browser`, `--has-svg`, `--missing-frontmatter`, `--missing-tools`, `--errors-only`.
- `node tools/dev/agent-matrix.js --strict --json` — fail (exit 1) if warnings exist.


## `ui-console-capture` — Puppeteer Log Capture

`ui-console-capture` launches a headless browser against a URL (or a locally spawned server) and captures console logs, errors, and network failures. This is essential for debugging UI applications where logs are trapped in the browser console.

- `node tools/dev/ui-console-capture.js --url="http://localhost:3000"` — capture logs from a running server.
- `node tools/dev/ui-console-capture.js --server="src/ui/server/myServer.js" --url="http://localhost:3000"` — spawn the server, wait for it to start, capture logs, then kill it.
- `node tools/dev/ui-console-capture.js --url="..." --timeout=5000` — wait 5 seconds for logs (default 2s).

**Output:**
JSON array of log entries:
```json
[
  { "type": "log", "text": "App started" },
  { "type": "error", "text": "Failed to load resource: 404" },
  { "type": "network-error", "text": "Status 404 http://localhost:3000/favicon.ico" }
]
```

Additional examples and guardrail details live in `docs/CLI_REFACTORING_QUICK_START.md`.


## `agent-rename` — Safe Agent File Renaming with Emoji Support

`agent-rename` renames `.agent.md` files in `.github/agents/` using Node.js native filesystem APIs to preserve emojis and Unicode characters. **This tool exists specifically because PowerShell's `Rename-Item` and `Move-Item` corrupt emoji filenames**.

### The PowerShell Emoji Problem

```powershell
# ❌ NEVER DO THIS - PowerShell corrupts emojis:
Rename-Item "🧠 Brain.agent.md" "💡 Light.agent.md"
# Result: ð§  Brain.agent.md (mojibake!)

# ✅ ALWAYS USE THIS TOOL:
node tools/dev/agent-rename.js --from "Brain" --to "💡 Light 💡"
```

**Why it happens**: PowerShell 5.1 uses legacy Windows-1252/CP437 encoding for filesystem operations, even when the console is set to UTF-8. Node.js `fs.renameSync()` uses libuv which calls the proper Windows UTF-16 API (`MoveFileExW`).

### Commands

```powershell
# List all agents (grouped by emoji/no-emoji)
node tools/dev/agent-rename.js --list

# Search for agents by partial name
node tools/dev/agent-rename.js --search "Singularity"

# Preview a rename (dry-run)
node tools/dev/agent-rename.js --from "jsgui3 Research" --to "🔬 jsgui3 Deep Research 🔬" --dry-run

# Execute the rename
node tools/dev/agent-rename.js --from "jsgui3 Research" --to "🔬 jsgui3 Deep Research 🔬"

# Force rename when multiple agents match
node tools/dev/agent-rename.js --from "Brain" --to "🧠 Super Brain 🧠" --force

# JSON output for programmatic use
node tools/dev/agent-rename.js --search "CLI" --json
```

### Options

| Flag | Description |
|------|-------------|
| `-l, --list` | List all agent files |
| `-s, --search <pattern>` | Search agents by name (case-insensitive partial match) |
| `-f, --from <name>` | Current agent name to rename (partial match) |
| `-t, --to <name>` | New agent name |
| `-d, --dry-run` | Preview changes without executing |
| `--force` | Force rename when multiple agents match (uses first) |
| `-j, --json` | Include JSON output for automation |

### After Renaming

The tool reminds you to update references in:
- `.github/agents/index.json`
- Other agent files that reference the renamed agent
- `AGENTS.md` if the agent is mentioned

