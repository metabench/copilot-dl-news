const fs = require('fs');
const { ensureDatabase } = require('..');
const { createTempDb } = require('../test-utils');
const { createLayoutMasksQueries } = require('../queries/layoutMasks');
const { createLayoutTemplatesQueries } = require('../queries/layoutTemplates');

describe('layout_* tables', () => {
  let dbPath;

  afterEach(() => {
    if (dbPath && fs.existsSync(dbPath)) {
      try {
        fs.unlinkSync(dbPath);
      } catch (_) {}
    }
    dbPath = null;
  });

  test('ensureDatabase creates layout_masks + layout_templates and queries work', () => {
    dbPath = createTempDb('layout-tables');
    const db = ensureDatabase(dbPath, { verbose: false });

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('layout_signatures','layout_masks','layout_templates') ORDER BY name")
      .all()
      .map((row) => row.name);

    expect(tables).toEqual(['layout_masks', 'layout_signatures', 'layout_templates']);

    const signature_hash = 'sig_test_123';
    db.prepare(`
      INSERT INTO layout_signatures (signature_hash, level, signature, first_seen_url)
      VALUES (?, 2, 'example-signature', 'https://example.com/a')
    `).run(signature_hash);

    const masks = createLayoutMasksQueries(db);
    masks.upsert({
      signature_hash,
      mask_json: JSON.stringify({ dynamicPaths: ['/html/body/div[1]'] }),
      sample_count: 3,
      dynamic_nodes_count: 1
    });

    const storedMask = masks.get(signature_hash);
    expect(storedMask).toBeTruthy();
    expect(storedMask.signature_hash).toBe(signature_hash);
    expect(storedMask.sample_count).toBe(3);
    expect(storedMask.dynamic_nodes_count).toBe(1);

    const templates = createLayoutTemplatesQueries(db);
    templates.upsert({
      signature_hash,
      producer: 'static-skeletonhash-v1',
      host: 'example.com',
      label: 'Example Template',
      notes: 'Test notes',
      example_url: 'https://example.com/a',
      extraction_config_json: JSON.stringify({ titleSelector: 'h1' })
    });

    const storedTemplate = templates.get({ producer: 'static-skeletonhash-v1', signature_hash });
    expect(storedTemplate).toBeTruthy();
    expect(storedTemplate.signature_hash).toBe(signature_hash);
    expect(storedTemplate.host).toBe('example.com');
    expect(storedTemplate.label).toBe('Example Template');

    const byHost = templates.listByHost('example.com');
    expect(byHost.length).toBeGreaterThanOrEqual(1);

    db.close();
  });
});
