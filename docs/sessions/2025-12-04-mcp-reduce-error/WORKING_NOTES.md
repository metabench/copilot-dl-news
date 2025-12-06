# Working Notes – Investigate MCP reduce undefined error

- 2025-12-04 — Session created via CLI (`node tools/dev/session-init.js --slug mcp-reduce-error ...`).
- 2025-12-04 — Plan drafted to trace `reduce` undefined MCP error in `tools/mcp/svg-editor/mcp-server.js`.
- 2025-12-04 — Noticed `runStdioServer` uses newline-delimited JSON without `Content-Length` framing (lines ~676-695). MCP stdio clients (incl. Copilot) expect LSP-style framed messages, so they cannot parse responses.
- 2025-12-04 — The readline handler also tries to JSON.parse the `Content-Length` header Copilot sends, yielding parse errors before the real request is read; Copilot then lacks a valid `result` and surfaces `Cannot read properties of undefined (reading 'reduce')`.
- 2025-12-04 — Implemented MCP framing in `runStdioServer` (Content-Length parsing, buffered reads, framed responses via `sendStdioMessage`), removed readline dependency.

- 2025-12-05 — Added LSP-style response headers (Content-Type, precise Content-Length) to both `svg-editor` and `docs-memory` MCP servers and verified they return `initialize` and `tools/list` via framed stdio calls.
- 2025-12-05 — Verified both servers also tolerate headerless JSON initializes for robustness, but framing is now correct for Copilot.
- 2025-12-05 — Next: craft an MCP explainer SVG using the svg-editor toolchain and validate with `tools/dev/svg-collisions.js`.
