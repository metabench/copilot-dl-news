#!/usr/bin/env node

// Thin compatibility wrapper: delegate to the modular server under src/ui/express/server.js
// This keeps legacy entry points working while avoiding duplicate logic.

try {
  const { createApp, startServer } = require('../src/deprecated-ui/express/server.js');
  if (require.main === module) {
    // Optional deprecation hint to steer developers to the new entry point
    if (!process.env.UI_SILENCE_WRAPPER) {
      try { console.warn('[ui/server.js] Deprecated entry point — delegating to src/ui/express/server.js'); } catch (_) {}
    }
    startServer();
  }
  module.exports = { createApp, startServer };
} catch (e) {
  // If delegation fails, surface a helpful error
  console.error('[ui/server.js] Failed to load src/ui/express/server.js:', e && e.message ? e.message : e);
  process.exitCode = 1;
  throw e;
}
