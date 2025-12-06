# Working Notes – Guide: jsgui3 debugging

- 2025-12-03 — Session created via CLI (`node tools/dev/session-init.js --slug jsgui3-debug-guide ...`).
- Authored `docs/guides/JSGUI3_DEBUGGING_GUIDE.md` with server/client activation debugging steps, port handling, control registration, hydration diagnostics, Puppeteer patterns, and common failure modes (EADDRINUSE, missing __ctrl, drag issues, esbuild mismatch, missing Chrome).
- Leveraged recent WYSIWYG fixes (free port selection, server `--check`, bundle rebuild, fallback drag handling) and aligned guidance with AGENTS.md/UI Singularity workflow.
