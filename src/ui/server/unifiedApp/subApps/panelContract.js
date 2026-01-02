'use strict';

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Wrap arbitrary HTML content in a standardized “panel root” container.
 *
 * This is the seam for moving away from iframe embedding:
 * - Server renders HTML (SSR) for a panel
 * - Unified shell injects HTML
 * - Shell runs an activation hook keyed by `data-unified-activate`
 */
function wrapPanelHtml({ appId, activationKey = null, html }) {
  const safeAppId = escapeAttr(appId);
  const activateAttr = activationKey ? ` data-unified-activate="${escapeAttr(activationKey)}"` : '';

  return `<div class="unified-panel-root" data-unified-panel="${safeAppId}"${activateAttr}>${html}</div>`;
}

module.exports = {
  wrapPanelHtml
};
