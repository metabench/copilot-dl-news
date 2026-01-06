# Working Notes – Crawler Diagnostic CLI Tools

- 2026-01-02 — Session created via CLI. Add incremental notes here.

- 2026-01-02 20:36 — 
## Work Completed

Created three new CLI tools in `tools/dev/`:

### 1. `node-procs.js` - Node Process Manager
- Lists all running node processes with categorization
- Categories: Jest Test, Crawler, Dev Server (protected), Electron, Dev Tool, NPM Script, MCP Server, VS Code, Unknown
- Shows PID, runtime, memory usage, command description
- Supports killing by category (`--kill-tests`, `--kill-crawls`) or PID (`--kill <pid>`)
- JSON output for automation

### 2. `crawl-status.js` - Crawl Session Status
- Unified view of active and recent crawls
- Detects active crawl processes by scanning node processes
- Reads evidence files from `testlogs/download-evidence/`
- Shows success/failure indicators, page counts, bytes, exit reasons
- JSON output for automation

### 3. `crawl-log-parse.js` - Deep Crawl Log Analysis
- Parses crawl log files for detailed metrics
- Queue dynamics: enqueued/dequeued/dropped counts, max size, drop reasons
- Page metrics: success/error counts, bytes, duration, HTTP status breakdown
- Milestone timeline reconstruction
- Error detection and categorization
- **Handles UTF-16 LE encoding** (common from PowerShell `Tee-Object`)

## Key Fixes Applied

1. **PowerShell command escaping**: Switched from complex inline PS commands to simpler WMIC approach for command line retrieval
2. **Date parsing**: Added handling for Windows `/Date(timestamp)/` format from PowerShell
3. **Encoding detection**: Auto-detects UTF-16 LE, UTF-16 BE, and UTF-8 BOM in log files

## Validation

All three tools tested and working:
- `node tools/dev/node-procs.js` - Shows 6 processes across categories
- `node tools/dev/crawl-status.js` - Shows 1 evidence file from previous testing
- `node tools/dev/crawl-log-parse.js tmp/simple-guardian-run2.log` - Parsed 206 enqueued URLs, 766 dropped, 9 pages

## Documentation

Added all three tools to `tools/dev/README.md` with usage examples and feature descriptions.
