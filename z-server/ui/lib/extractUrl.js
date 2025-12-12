"use strict";

/**
 * Extract a likely local dev-server URL from a log line.
 * Returns the first match or null.
 * @param {string} text
 * @returns {string|null}
 */
function extractUrl(text) {
  if (!text || typeof text !== "string") return null;

  const urlPatterns = [
    /https?:\/\/localhost:\d+[^\s]*/i,
    /https?:\/\/127\.0\.0\.1:\d+[^\s]*/i,
    /https?:\/\/0\.0\.0\.0:\d+[^\s]*/i,
    /Server (?:running|listening|started) (?:on|at) (https?:\/\/[^\s]+)/i,
    /listening on (https?:\/\/[^\s]+)/i,
    /available at (https?:\/\/[^\s]+)/i
  ];

  for (const pattern of urlPatterns) {
    const match = pattern.exec(text);
    if (match) {
      return match[1] || match[0];
    }
  }

  return null;
}

module.exports = { extractUrl };
