'use strict';

/**
 * Pure orchestrator decision policy.
 *
 * Given the result of a remote health probe and the available local
 * fallback profile, decide which crawl tool to launch.
 *
 * No side-effects — used both by tools/crawl/orchestrate.js (live)
 * and by unit tests.
 */

function decideOrchestration(input = {}) {
  const remoteAvailable = input.remoteAvailable === true;
  const remoteHealthError = input.remoteHealthError || null;
  const localFallback = input.localFallback || 'local-news-10x1000';
  const remoteProfile = input.remoteProfile || 'remote-news-10x1000';
  const allowFallback = input.allowFallback !== false;

  if (remoteAvailable) {
    return {
      mode: 'remote',
      profile: remoteProfile,
      message: `Remote crawler healthy at ${input.remoteHost || 'configured host'} — using ${remoteProfile}.`,
      uiHint: input.uiUrl || null,
    };
  }

  if (!allowFallback) {
    return {
      mode: 'fail',
      profile: null,
      message: `Remote crawler unavailable (${remoteHealthError || 'unknown error'}) and fallback disabled.`,
      uiHint: null,
    };
  }

  return {
    mode: 'local',
    profile: localFallback,
    message: `Remote crawler unavailable (${remoteHealthError || 'unknown error'}) — falling back to local profile ${localFallback}.`,
    uiHint: input.uiUrl || null,
  };
}

module.exports = { decideOrchestration };
