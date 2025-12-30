'use strict';

const fs = require('fs');
const { ensureDatabase } = require('../../src/db/sqlite/v1');
const { createTempDb } = require('../../src/db/sqlite/v1/test-utils');
const { createLayoutAdapter } = require('../../src/db/sqlite/v1/queries/layoutAdapter');
const { createLayoutSignaturesQueries } = require('../../src/db/sqlite/v1/queries/layoutSignatures');

describe('layoutAdapter', () => {
  let dbPath;
  let db;
  let adapter;

  beforeEach(() => {
    dbPath = createTempDb('layout-adapter-test');
    db = ensureDatabase(dbPath, { verbose: false });
    adapter = createLayoutAdapter(db);
  });

  afterEach(() => {
    if (db) {
      try { db.close(); } catch (_) {}
    }
    if (dbPath && fs.existsSync(dbPath)) {
      try { fs.unlinkSync(dbPath); } catch (_) {}
    }
    dbPath = null;
    db = null;
    adapter = null;
  });

  describe('saveSignatures', () => {
    test('saves L1 and L2 signatures', () => {
      const result = adapter.saveSignatures({
        url: 'https://example.com/page1',
        l1: { hash: 'abc123def456', signature: 'html(head)(body)' },
        l2: { hash: 'xyz789uvw012', signature: 'html(head)(body)' }
      });

      expect(result.l1.changes).toBe(1);
      expect(result.l2.changes).toBe(1);

      // Verify they're in the database
      const l1 = adapter.signatures.get('abc123def456');
      expect(l1).toBeTruthy();
      expect(l1.level).toBe(1);
      expect(l1.first_seen_url).toBe('https://example.com/page1');

      const l2 = adapter.signatures.get('xyz789uvw012');
      expect(l2).toBeTruthy();
      expect(l2.level).toBe(2);
    });

    test('skips invalid hashes', () => {
      const result = adapter.saveSignatures({
        url: 'https://example.com/empty',
        l1: { hash: '0', signature: '' },
        l2: null
      });

      expect(result.l1).toBeNull();
      expect(result.l2).toBeNull();
    });

    test('increments seen_count on duplicate', () => {
      adapter.saveSignatures({
        url: 'https://example.com/page1',
        l1: { hash: 'repeat_hash', signature: 'html(body)' },
        l2: { hash: 'repeat_l2', signature: 'html(body)' }
      });

      adapter.saveSignatures({
        url: 'https://example.com/page2',
        l1: { hash: 'repeat_hash', signature: 'html(body)' },
        l2: { hash: 'repeat_l2', signature: 'html(body)' }
      });

      const sig = adapter.signatures.get('repeat_hash');
      expect(sig.seen_count).toBe(2);
      // first_seen_url should still be the original
      expect(sig.first_seen_url).toBe('https://example.com/page1');
    });
  });

  describe('saveTemplate and getTemplate', () => {
    test('saves and retrieves template', () => {
      // First save a signature (FK constraint)
      adapter.saveSignatures({
        url: 'https://news.example.com/article',
        l1: { hash: 'l1hash', signature: 'html' },
        l2: { hash: 'template_sig', signature: 'html(body)' }
      });

      adapter.saveTemplate({
        signatureHash: 'template_sig',
        host: 'news.example.com',
        label: 'Article Template v1',
        extractionConfig: { titleSelector: 'h1', contentSelector: 'article' },
        exampleUrl: 'https://news.example.com/article',
        notes: 'Test template'
      });

      const template = adapter.getTemplate('template_sig');
      expect(template).toBeTruthy();
      expect(template.host).toBe('news.example.com');
      expect(template.label).toBe('Article Template v1');
      expect(template.extraction_config_json).toContain('titleSelector');
    });

    test('getTemplatesByHost returns templates for domain', () => {
      // Save signature first
      adapter.saveSignatures({
        url: 'https://blog.example.com/post',
        l1: { hash: 'l1h', signature: 'html' },
        l2: { hash: 'blog_sig', signature: 'html(body)' }
      });

      adapter.saveTemplate({
        signatureHash: 'blog_sig',
        host: 'blog.example.com',
        label: 'Blog Post',
        extractionConfig: {}
      });

      const templates = adapter.getTemplatesByHost('blog.example.com');
      expect(templates.length).toBeGreaterThanOrEqual(1);
      expect(templates[0].host).toBe('blog.example.com');
    });
  });

  describe('saveMask and getMask', () => {
    test('saves and retrieves mask with parsed JSON', () => {
      // Save signature first
      adapter.saveSignatures({
        url: 'https://example.com/masked',
        l1: { hash: 'l1m', signature: 'html' },
        l2: { hash: 'mask_sig', signature: 'html(body)' }
      });

      adapter.saveMask({
        signatureHash: 'mask_sig',
        mask: { 
          dynamicPaths: ['/html/body/div[1]', '/html/body/div[2]'],
          staticPaths: ['/html/head']
        },
        sampleCount: 5
      });

      const mask = adapter.getMask('mask_sig');
      expect(mask).toBeTruthy();
      expect(mask.sample_count).toBe(5);
      expect(mask.dynamic_nodes_count).toBe(2);
      expect(mask.mask).toBeTruthy();
      expect(mask.mask.dynamicPaths).toContain('/html/body/div[1]');
    });
  });

  describe('getStats', () => {
    test('returns aggregate statistics', () => {
      // Add some data
      adapter.saveSignatures({
        url: 'https://example.com/1',
        l1: { hash: 'stat_l1_1', signature: 's' },
        l2: { hash: 'stat_l2_1', signature: 's' }
      });
      adapter.saveSignatures({
        url: 'https://example.com/2',
        l1: { hash: 'stat_l1_2', signature: 's2' },
        l2: { hash: 'stat_l2_1', signature: 's' } // Same L2 = cluster
      });

      const stats = adapter.getStats();
      expect(stats.l1_count).toBeGreaterThanOrEqual(2);
      expect(stats.l2_count).toBeGreaterThanOrEqual(1);
      expect(stats.total_pages_analyzed).toBeGreaterThanOrEqual(3);
    });
  });

  describe('batchSaveSignatures', () => {
    test('processes multiple pages in transaction', () => {
      const pages = [
        { url: 'https://example.com/a', l1: { hash: 'batch_l1_a', signature: 'a' }, l2: { hash: 'batch_l2_a', signature: 'a' } },
        { url: 'https://example.com/b', l1: { hash: 'batch_l1_b', signature: 'b' }, l2: { hash: 'batch_l2_b', signature: 'b' } },
        { url: 'https://example.com/c', l1: { hash: 'batch_l1_c', signature: 'c' }, l2: { hash: 'batch_l2_a', signature: 'a' } } // Same L2 as first
      ];

      const result = adapter.batchSaveSignatures(pages);

      expect(result.l1Stats.inserted).toBe(3);
      expect(result.l2Stats.inserted).toBe(2); // 2 unique L2 hashes
      expect(result.l2Stats.updated).toBe(1); // 1 duplicate L2
    });
  });

  describe('getSignatureWithTemplate', () => {
    test('returns signature with joined template data', () => {
      adapter.saveSignatures({
        url: 'https://joined.example.com/page',
        l1: { hash: 'join_l1', signature: 'html' },
        l2: { hash: 'join_l2', signature: 'html(body)' }
      });

      adapter.saveTemplate({
        signatureHash: 'join_l2',
        host: 'joined.example.com',
        label: 'Joined Template'
      });

      const result = adapter.getSignatureWithTemplate('join_l2');
      expect(result).toBeTruthy();
      expect(result.signature_hash).toBe('join_l2');
      expect(result.host).toBe('joined.example.com');
      expect(result.label).toBe('Joined Template');
    });
  });
});

describe('layoutSignaturesQueries', () => {
  let dbPath;
  let db;
  let signatures;

  beforeEach(() => {
    dbPath = createTempDb('layout-sig-test');
    db = ensureDatabase(dbPath, { verbose: false });
    signatures = createLayoutSignaturesQueries(db);
  });

  afterEach(() => {
    if (db) {
      try { db.close(); } catch (_) {}
    }
    if (dbPath && fs.existsSync(dbPath)) {
      try { fs.unlinkSync(dbPath); } catch (_) {}
    }
  });

  test('upsert and get', () => {
    signatures.upsert({
      signature_hash: 'test_hash_1',
      level: 2,
      signature: 'html(body(div))',
      first_seen_url: 'https://test.com/page'
    });

    const result = signatures.get('test_hash_1');
    expect(result).toBeTruthy();
    expect(result.level).toBe(2);
    expect(result.signature).toBe('html(body(div))');
    expect(result.seen_count).toBe(1);
  });

  test('getByLevel returns signatures for level', () => {
    signatures.upsert({ signature_hash: 'level_l1', level: 1, signature: 's1', first_seen_url: 'u1' });
    signatures.upsert({ signature_hash: 'level_l2', level: 2, signature: 's2', first_seen_url: 'u2' });

    const l1Results = signatures.getByLevel(1);
    const l2Results = signatures.getByLevel(2);

    expect(l1Results.some(r => r.signature_hash === 'level_l1')).toBe(true);
    expect(l2Results.some(r => r.signature_hash === 'level_l2')).toBe(true);
  });

  test('getTopClusters returns sorted by seen_count', () => {
    // Insert with different seen counts
    signatures.upsert({ signature_hash: 'top_a', level: 2, signature: 'a' });
    signatures.upsert({ signature_hash: 'top_a', level: 2, signature: 'a' }); // seen_count = 2
    signatures.upsert({ signature_hash: 'top_b', level: 2, signature: 'b' });
    signatures.upsert({ signature_hash: 'top_b', level: 2, signature: 'b' });
    signatures.upsert({ signature_hash: 'top_b', level: 2, signature: 'b' }); // seen_count = 3
    signatures.upsert({ signature_hash: 'top_c', level: 2, signature: 'c' }); // seen_count = 1

    const top = signatures.getTopClusters(3);
    expect(top.length).toBe(3);
    expect(top[0].signature_hash).toBe('top_b'); // Highest count first
    expect(top[0].seen_count).toBe(3);
  });

  test('getCounts returns grouped statistics', () => {
    signatures.upsert({ signature_hash: 'count_l1_a', level: 1, signature: 'a' });
    signatures.upsert({ signature_hash: 'count_l1_b', level: 1, signature: 'b' });
    signatures.upsert({ signature_hash: 'count_l2_a', level: 2, signature: 'a' });

    const counts = signatures.getCounts();
    expect(counts.length).toBe(2);

    const l1 = counts.find(c => c.level === 1);
    const l2 = counts.find(c => c.level === 2);
    expect(l1.count).toBe(2);
    expect(l2.count).toBe(1);
  });

  test('delete removes signature', () => {
    signatures.upsert({ signature_hash: 'delete_me', level: 2, signature: 'x' });
    expect(signatures.get('delete_me')).toBeTruthy();

    const result = signatures.delete('delete_me');
    expect(result.changes).toBe(1);
    expect(signatures.get('delete_me')).toBeNull();
  });
});
