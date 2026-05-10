'use strict';

/**
 * Pure helpers for validating remote prune CLI configuration.
 *
 * Extracted from crawl-remote.js so that exact-prune safety invariants
 * can be unit tested without spinning up the CLI.
 */

function isFalseValue(value) {
  return value === false || ['false', '0', 'no', 'off'].includes(String(value).toLowerCase());
}

function isTrueValue(value) {
  return value === true || ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
}

function shouldPruneAfterIngest(args = {}) {
  return isTrueValue(args['prune-after-ingest']) || isTrueValue(args.pruneAfterIngest);
}

/**
 * Throws if --prune-after-ingest is enabled together with a partial export
 * (includeContent=false or includeLinks=false). Returns silently otherwise.
 *
 * Rationale: we promised exact-prune of the payload that was confirmed
 * locally. If the export omits content or links, the local DB cannot
 * confirm those rows, so removing them remotely would silently lose data.
 */
function validatePruneExportConfig(args = {}) {
  if (!shouldPruneAfterIngest(args)) return { ok: true };
  const partial =
    isFalseValue(args['include-content']) ||
    isFalseValue(args.includeContent) ||
    isFalseValue(args['include-links']) ||
    isFalseValue(args.includeLinks);
  if (partial) {
    throw new Error(
      'Refusing --prune-after-ingest with a partial export. Prune requires includeContent=true and includeLinks=true so local DB confirmation covers the payload being removed.'
    );
  }
  return { ok: true };
}

module.exports = {
  shouldPruneAfterIngest,
  validatePruneExportConfig,
  isFalseValue,
  isTrueValue,
};
