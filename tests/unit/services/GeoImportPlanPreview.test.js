'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { GeoImportStateManager } = require('../../../src/services/GeoImportStateManager');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'geo-import-plan-preview-'));
}

describe('GeoImportStateManager.getPlan', () => {
  it('returns a plan preview when cities15000.txt is missing', async () => {
    const tmpDir = createTempDir();
    const manager = new GeoImportStateManager({ db: {}, dataDir: tmpDir });

    const plan = await manager.getPlan({ source: 'geonames', detail: 'fast' });

    expect(plan.source).toBe('geonames');
    expect(plan.detail).toBe('fast');
    expect(plan.prerequisite && plan.prerequisite.ready).toBe(false);
    expect(plan.expected && plan.expected.networkRequests).toBeGreaterThanOrEqual(1);
    expect(plan.expected && plan.expected.downloads && plan.expected.downloads.length).toBeGreaterThanOrEqual(1);
    expect(plan.expected && plan.expected.file && plan.expected.file.exists).toBe(false);
    expect(plan.expected.file.lineCount).toBe(null);
  });

  it('counts lines in full detail mode when cities15000.txt exists', async () => {
    const tmpDir = createTempDir();

    // Create a GeoNames-like file > 1000 bytes (3 lines)
    const long = 'x'.repeat(450);
    fs.writeFileSync(path.join(tmpDir, 'cities15000.txt'), `${long}\n${long}\n${long}\n`, 'utf8');

    const manager = new GeoImportStateManager({ db: {}, dataDir: tmpDir });
    const plan = await manager.getPlan({ source: 'geonames', detail: 'full' });

    expect(plan.prerequisite && plan.prerequisite.ready).toBe(true);
    expect(plan.expected && plan.expected.networkRequests).toBe(0);
    expect(plan.expected && plan.expected.file && plan.expected.file.exists).toBe(true);
    expect(plan.expected.file.lineCount).toBe(3);
    expect(Array.isArray(plan.algorithm && plan.algorithm.stages)).toBe(true);
    expect(plan.algorithm.stages.length).toBeGreaterThan(3);
  });

  it('returns a plan preview for wikidata without executing ingestion', async () => {
    const tmpDir = createTempDir();
    const manager = new GeoImportStateManager({ db: {}, dataDir: tmpDir });

    const plan = await manager.getPlan({ source: 'wikidata', detail: 'fast' });

    expect(plan.source).toBe('wikidata');
    expect(plan.detail).toBe('fast');
    expect(plan.prerequisite && plan.prerequisite.ready).toBe(true);
    expect(plan.expected && plan.expected.networkRequestsEstimate).toBeTruthy();
    expect(plan.expected.networkRequestsEstimate.min).toBe(1);
    expect(Array.isArray(plan.expected.endpoints)).toBe(true);
    expect(plan.expected.endpoints.join(' ')).toContain('wikidata');
    expect(Array.isArray(plan.algorithm && plan.algorithm.stages)).toBe(true);
    expect(plan.algorithm.stages.length).toBeGreaterThanOrEqual(2);
  });

  it('returns a plan preview for osm without executing ingestion', async () => {
    const tmpDir = createTempDir();
    const manager = new GeoImportStateManager({ db: {}, dataDir: tmpDir });

    const plan = await manager.getPlan({ source: 'osm', detail: 'fast' });

    expect(plan.source).toBe('osm');
    expect(plan.detail).toBe('fast');
    expect(plan.prerequisite && plan.prerequisite.ready).toBe(true);
    expect(plan.expected && plan.expected.networkRequestsEstimate).toBeTruthy();
    expect(plan.expected.networkRequestsEstimate.min).toBe(0);
    expect(Array.isArray(plan.expected.endpoints)).toBe(true);
    expect(plan.expected.endpoints.join(' ')).toContain('overpass');
    expect(Array.isArray(plan.algorithm && plan.algorithm.stages)).toBe(true);
    expect(plan.algorithm.stages.length).toBeGreaterThanOrEqual(2);
  });
});
