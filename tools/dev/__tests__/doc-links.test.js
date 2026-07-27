'use strict';

const { extractLinks, auditDir, LIVING_DIR } = require('../checks/doc-links.check');

describe('doc-links', () => {
  describe('extractLinks', () => {
    it('extracts local markdown link targets', () => {
      expect(extractLinks('see [BOOT](BOOT.md) and [tool](../../tools/agi/)'))
        .toEqual(['BOOT.md', '../../tools/agi/']);
    });

    it('ignores external and mailto links', () => {
      expect(extractLinks('[x](https://example.com/a.md) [y](mailto:a@b.c)')).toEqual([]);
    });

    it('strips anchors, and drops pure-anchor links', () => {
      expect(extractLinks('[a](WORKFLOWS.md#step-2)')).toEqual(['WORKFLOWS.md']);
      expect(extractLinks('[a](#local-heading)')).toEqual([]);
    });

    it('does NOT treat a backticked filename in prose as a link — the 98.7% false-positive trap', () => {
      // cycle 134: counting backticked tokens reported 982 "broken references"; a bare
      // `cycle-metrics.js` is a mention, and sibling-repo paths never resolve here.
      expect(extractLinks('run `cycle-metrics.js`, see `legacy-newsHostPolicy.ts` in ncdb')).toEqual([]);
    });
  });

  describe('auditDir over the real living corpus', () => {
    const r = auditDir(LIVING_DIR);

    it('finds the corpus', () => {
      expect(r.docs).toBeGreaterThanOrEqual(15);
      expect(r.links).toBeGreaterThan(20);
    });

    it('has zero broken links (the claim this check re-verifies)', () => {
      expect(r.broken).toEqual([]);
    });
  });
});
