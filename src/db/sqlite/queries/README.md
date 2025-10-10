# SQLite Query Modules

**When to Read**: Read this if you are adding or modifying a database query. This document explains the pattern for organizing SQL queries into reusable modules.

This directory hosts query helpers that wrap raw SQL statements for the SQLite adapter. Each module:

- Accepts an active `better-sqlite3` handle.
- Prepares statements once per handle using `getCachedStatements` from `helpers.js`.
- Exposes small, dependency-free functions that return POJOs or primitive values.
- Never imports from UI, crawler, or tooling layers.

Consumers (UI data helpers, services, tools, tests) should call these query helpers instead of embedding SQL strings. This keeps all SQLite-specific knowledge in one place and aligns with the modularisation plan described in `AGENTS.md`.
