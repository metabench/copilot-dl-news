const path = require('path');
const { spawnSync } = require('child_process');

const jsEditPath = path.join(__dirname, '../../../tools/dev/js-edit.js');
const fixturePath = path.join(__dirname, '../../fixtures/tools/js-edit-types-sample.ts');

const runJsEdit = (args, options = {}) => {
  return spawnSync(process.execPath, [jsEditPath, ...args], {
    encoding: 'utf8',
    ...options
  });
};

describe('js-edit type commands', () => {
  test('list-types inventories interfaces, type aliases, and enums', () => {
    const result = runJsEdit([
      '--file',
      fixturePath,
      '--list-types',
      '--json'
    ]);

    if (result.status !== 0) {
      throw new Error(`list-types command failed: ${result.stderr || result.stdout}`);
    }

    const payload = JSON.parse(result.stdout);
    expect(payload.totalTypes).toBe(4);
    expect(payload.matchedTypes).toBe(4);

    const byName = new Map(payload.types.map((record) => [record.name, record]));
    expect(byName.get('ArticleRecord')).toEqual(expect.objectContaining({
      canonicalName: 'exports.ArticleRecord',
      kind: 'interface',
      hash: expect.any(String)
    }));
    expect(byName.get('FetchOutcome')).toEqual(expect.objectContaining({
      kind: 'type-alias'
    }));
    expect(byName.get('CrawlPhase')).toEqual(expect.objectContaining({
      kind: 'enum'
    }));
    payload.types.forEach((record) => {
      expect(record.byteLength).toBeGreaterThan(0);
      expect(record.line).toBeGreaterThan(0);
    });
  });

  test('locate-type reports span and guard metadata for a type match', () => {
    const result = runJsEdit([
      '--file',
      fixturePath,
      '--locate-type',
      'HubSummary',
      '--json'
    ]);

    if (result.status !== 0) {
      throw new Error(`locate-type command failed: ${result.stderr || result.stdout}`);
    }

    const payload = JSON.parse(result.stdout);
    expect(payload.selector).toBe('HubSummary');
    expect(payload.summary.matchCount).toBe(1);

    const [match] = payload.matches;
    expect(match).toEqual(expect.objectContaining({
      canonicalName: 'exports.HubSummary',
      kind: 'type-alias',
      hash: expect.any(String),
      pathSignature: expect.stringContaining('TsTypeAliasDeclaration')
    }));
    expect(match.span.start).toBeGreaterThanOrEqual(0);
    expect(match.span.end).toBeGreaterThan(match.span.start);
  });

  test('extract-type prints the type declaration source', () => {
    const result = runJsEdit([
      '--file',
      fixturePath,
      '--extract-type',
      'CrawlPhase',
      '--json'
    ]);

    if (result.status !== 0) {
      throw new Error(`extract-type command failed: ${result.stderr || result.stdout}`);
    }

    const payload = JSON.parse(result.stdout);
    expect(payload.typeDeclaration).toEqual(expect.objectContaining({
      name: 'CrawlPhase',
      canonicalName: 'exports.CrawlPhase',
      kind: 'enum',
      hash: expect.any(String)
    }));
    expect(payload.code).toContain('enum CrawlPhase');
    expect(payload.code).toContain("Discovery = 'discovery'");
  });
});
