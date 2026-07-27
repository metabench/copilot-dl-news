'use strict';

/**
 * Pure crash-loop guard for the bridge's self-respawn (extracted so it is
 * unit-testable WITHOUT loading dev-bridge.js, which acquires a single-
 * instance lock and enters an infinite poll loop on require).
 *
 * A crash respawn should recover a transient fault but must NOT peg the CPU
 * on a persistent one: allow a respawn only if fewer than `maxInWindow` have
 * happened within the trailing `windowMs`.
 */
function shouldRespawn(timestamps, now, opts = {}) {
  const windowMs = opts.windowMs || 60000;
  const maxInWindow = opts.maxInWindow || 3;
  const recent = (Array.isArray(timestamps) ? timestamps : []).filter((t) => now - t < windowMs);
  return { allow: recent.length < maxInWindow, recent };
}

module.exports = { shouldRespawn };
