'use strict';
// DB-consolidation slice 0 verification: unifiedApp/server.js now requires
// its cloud-crawl + download-evidence functions from news-crawler-db directly
// instead of via the src/data/db re-export shims. This smoke PROVES the
// repoint is a behavioral no-op by asserting reference identity: the very
// function objects the shims re-exported (what server.js got before) are the
// ones ncdb exports (what server.js gets now). No DB open, no port bind.
const assert = require('assert');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');

const ncdb = require('news-crawler-db');
const cloudShim = require(path.join(ROOT, 'src/data/db/sqlite/v1/queries/ui/cloudCrawl.js'));
const dlShim = require(path.join(ROOT, 'src/data/db/queries/downloadEvidence.js'));

// cloudCrawl trio (shim aliases normalizeCloudCrawlDomains -> normalizeDomains)
assert.strictEqual(cloudShim.DEFAULT_CLOUD_CRAWL_TARGETS, ncdb.DEFAULT_CLOUD_CRAWL_TARGETS, 'targets');
assert.strictEqual(cloudShim.getCloudCrawlStatusSnapshot, ncdb.getCloudCrawlStatusSnapshot, 'snapshot');
assert.strictEqual(cloudShim.normalizeDomains, ncdb.normalizeCloudCrawlDomains, 'normalizeDomains');
console.log('cloudCrawl trio: identical refs');

// downloadEvidence seven (shim aliases getGlobalDownloadStats -> getGlobalStats)
for (const [shimName, ncdbName] of [
  ['getDownloadStats', 'getDownloadStats'],
  ['getDownloadEvidence', 'getDownloadEvidence'],
  ['verifyDownloadClaim', 'verifyDownloadClaim'],
  ['getDownloadTimeline', 'getDownloadTimeline'],
  ['getGlobalStats', 'getGlobalDownloadStats'],
  ['getRecentDownloadVerifications', 'getRecentDownloadVerifications'],
  ['listRecentDownloads', 'listRecentDownloads']
]) {
  assert.strictEqual(typeof ncdb[ncdbName], 'function', `ncdb.${ncdbName} missing`);
  assert.strictEqual(dlShim[shimName], ncdb[ncdbName], `${shimName} !== ncdb.${ncdbName}`);
}
console.log('downloadEvidence seven: identical refs');
console.log('SMOKE PASS: repoint is reference-identical to the shim path');
