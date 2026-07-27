'use strict';

// Relocated (cycle 73, module-ecosystem extraction) from
// tests/deploy/remote-crawler-v2/export-retention.test.js — that file also tested
// pruneExportedPayload (export-retention.js), which moved to
// ../news-crawler-itself/lib/export-retention.js along with the rest of the remote
// crawler engine; those tests moved with it to
// news-crawler-itself/lib/__tests__/export-retention.test.js. This file keeps only
// the copilot-dl-news-side driver config helpers (prune-config.js), which govern
// the LOCAL decision of whether to prune the remote after an ingest — the
// coordinator's own concern, not the engine's.
const {
  validatePruneExportConfig,
  shouldPruneAfterIngest,
} = require('../../tools/crawl/lib/prune-config');

describe('validatePruneExportConfig — partial export refusal', () => {
  test('allows prune when content and links are included', () => {
    expect(() => validatePruneExportConfig({ 'prune-after-ingest': true })).not.toThrow();
    expect(() => validatePruneExportConfig({
      'prune-after-ingest': true,
      'include-content': 'true',
      'include-links': 'true',
    })).not.toThrow();
  });

  test('refuses prune when include-content is false', () => {
    expect(() => validatePruneExportConfig({
      'prune-after-ingest': true,
      'include-content': 'false',
    })).toThrow(/Refusing --prune-after-ingest with a partial export/);
  });

  test('refuses prune when include-links is false', () => {
    expect(() => validatePruneExportConfig({
      'prune-after-ingest': true,
      'include-links': false,
    })).toThrow(/Refusing --prune-after-ingest with a partial export/);
  });

  test('refuses prune when camelCase includeContent is false', () => {
    expect(() => validatePruneExportConfig({
      pruneAfterIngest: true,
      includeContent: 'false',
    })).toThrow(/Refusing --prune-after-ingest/);
  });

  test('no-op when prune is not requested even with partial export', () => {
    expect(() => validatePruneExportConfig({
      'include-content': 'false',
      'include-links': 'false',
    })).not.toThrow();
  });

  test('shouldPruneAfterIngest reads both kebab and camel case', () => {
    expect(shouldPruneAfterIngest({ 'prune-after-ingest': true })).toBe(true);
    expect(shouldPruneAfterIngest({ pruneAfterIngest: 'yes' })).toBe(true);
    expect(shouldPruneAfterIngest({})).toBe(false);
    expect(shouldPruneAfterIngest({ 'prune-after-ingest': 'false' })).toBe(false);
  });
});
