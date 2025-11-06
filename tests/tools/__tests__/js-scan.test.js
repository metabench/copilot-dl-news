'use strict';

const path = require('path');
const { scanWorkspace } = require('../../../tools/dev/js-scan/shared/scanner');
const { runSearch } = require('../../../tools/dev/js-scan/operations/search');
const { runHashLookup } = require('../../../tools/dev/js-scan/operations/hashLookup');
const { buildIndex } = require('../../../tools/dev/js-scan/operations/indexing');
const { runPatternSearch } = require('../../../tools/dev/js-scan/operations/patterns');
const {
  parseTerseFields,
  formatTerseMatch,
  normalizeViewMode
} = require('../../../tools/dev/js-scan.js');

const fixtureDir = path.resolve(__dirname, '../../fixtures/tools');

let defaultScan;
let includeDeprecatedScan;
let deprecatedOnlyScan;
let dependencyScanNoFollow;
let dependencyScanFollow;
let circularScan;

beforeAll(() => {
  defaultScan = scanWorkspace({
    dir: fixtureDir,
    exclude: []
  });

  includeDeprecatedScan = scanWorkspace({
    dir: fixtureDir,
    exclude: [],
    includeDeprecated: true
  });

  deprecatedOnlyScan = scanWorkspace({
    dir: fixtureDir,
    exclude: [],
    deprecatedOnly: true
  });

  dependencyScanNoFollow = scanWorkspace({
    dir: path.join(fixtureDir, 'dep-root'),
    exclude: []
  });

  dependencyScanFollow = scanWorkspace({
    dir: path.join(fixtureDir, 'dep-root'),
    exclude: [],
    followDependencies: true,
    dependencyDepth: 3
  });

  circularScan = scanWorkspace({
    dir: path.join(fixtureDir, 'dep-circular'),
    exclude: [],
    followDependencies: true,
    dependencyDepth: 5
  });
});

describe('js-scan search', () => {
  test('finds exported functions by term', () => {
    const result = runSearch(defaultScan.files, ['alpha'], { limit: 10 });
    const matchNames = result.matches.map((match) => match.function.name);
    expect(matchNames).toContain('alpha');
  });

  test('respects exported filter', () => {
    const exportedResult = runSearch(defaultScan.files, ['handler'], {
      exportedOnly: true,
      limit: 10
    });
    exportedResult.matches.forEach((match) => {
      expect(match.function.exported).toBe(true);
    });
  });
});

describe('js-scan hash lookup', () => {
  test('resolves function hash', () => {
    const searchResult = runSearch(defaultScan.files, ['alpha'], { limit: 1 });
    expect(searchResult.matches.length).toBeGreaterThan(0);
    const targetHash = searchResult.matches[0].function.hash;
    const lookup = runHashLookup(defaultScan.files, targetHash);
    expect(lookup.found).toBe(true);
    expect(lookup.matches[0].function.hash).toBe(targetHash);
  });
});

describe('js-scan module index', () => {
  test('generates module summary', () => {
    const index = buildIndex(defaultScan.files, { limit: 5 });
    expect(index.entries.length).toBeGreaterThan(0);
    const entry = index.entries.find((item) => item.file.endsWith('js-edit-sample.js'));
    expect(entry).toBeTruthy();
    expect(entry.stats.functions).toBeGreaterThan(0);
  });
});

describe('js-scan pattern search', () => {
  test('matches glob pattern', () => {
    const result = runPatternSearch(defaultScan.files, ['*handler*'], { limit: 10 });
    expect(result.matchCount).toBeGreaterThan(0);
    const names = result.matches.map((item) => item.function.name);
    expect(names.some((name) => name.includes('handler'))).toBe(true);
  });
});

describe('js-scan deprecated filtering', () => {
  test('skips deprecated directories by default', () => {
    const result = runSearch(defaultScan.files, ['carouselDeprecated'], { limit: 5 });
    expect(result.matches.length).toBe(0);
  });

  test('includes deprecated directories when requested', () => {
    const result = runSearch(includeDeprecatedScan.files, ['carouselDeprecated'], { limit: 5 });
    expect(result.matches.length).toBeGreaterThan(0);
    const files = result.matches.map((match) => match.file);
    expect(files.some((file) => file.includes('deprecated-ui-root'))).toBe(true);
  });

  test('restricts results when deprecatedOnly is set', () => {
    const result = runSearch(deprecatedOnlyScan.files, ['carouselDeprecated'], { limit: 5 });
    expect(result.matches.length).toBeGreaterThan(0);
    deprecatedOnlyScan.files.forEach((fileRecord) => {
      expect(fileRecord.relativePath.includes('deprecated-ui-root')).toBe(true);
    });
    const nonDeprecated = runSearch(deprecatedOnlyScan.files, ['alpha'], { limit: 5 });
    expect(nonDeprecated.matches.length).toBe(0);
  });
});

describe('js-scan dependency traversal', () => {
  test('follows relative dependencies outside the initial directory', () => {
    const withoutDeps = runSearch(dependencyScanNoFollow.files, ['helperOne'], { limit: 5 });
    expect(withoutDeps.matches.length).toBe(0);

    const withDeps = runSearch(dependencyScanFollow.files, ['helperOne'], { limit: 5 });
    expect(withDeps.matches.length).toBeGreaterThan(0);
    const files = withDeps.matches.map((match) => match.file);
    expect(files.some((file) => file.includes('dep-linked/helper.js'))).toBe(true);
  });

  test('respects dependency depth limit', () => {
    const depthLimitedScan = scanWorkspace({
      dir: path.join(fixtureDir, 'dep-root'),
      exclude: [],
      followDependencies: true,
      dependencyDepth: 1
    });

    const limitedResult = runSearch(depthLimitedScan.files, ['circleA'], { limit: 5 });
    expect(limitedResult.matches.length).toBe(0);

    const fullResult = runSearch(dependencyScanFollow.files, ['circleA'], { limit: 5 });
    expect(fullResult.matches.some((match) => match.file.includes('dep-circular/a.js'))).toBe(true);
  });

  test('handles circular dependencies without duplication', () => {
    const fileSet = new Set(circularScan.files.map((record) => path.basename(record.filePath)));
    expect(fileSet.has('a.js')).toBe(true);
    expect(fileSet.has('b.js')).toBe(true);
    expect(fileSet.size).toBe(2);
  });
});

describe('js-scan output helpers', () => {
  const stubFormatter = {
    COLORS: {
      cyan: (value) => `cyan(${value})`,
      muted: (value) => `muted(${value})`,
      bold: (value) => `bold(${value})`,
      accent: (value) => `accent(${value})`,
      success: (value) => `success(${value})`
    }
  };

  const sampleMatch = {
    file: 'src/example.js',
    rank: 2,
    score: 0.87,
    function: {
      name: 'alpha',
      canonicalName: 'exports.alpha',
      kind: 'function',
      line: 12,
      column: 3,
      hash: 'abcd1234',
      exported: true,
      isAsync: true,
      isGenerator: false
    },
    context: {
      matchTerms: ['alpha']
    }
  };

  test('normalizeViewMode recognises aliases', () => {
    expect(normalizeViewMode('简')).toBe('terse');
    expect(normalizeViewMode('SUMMARY')).toBe('summary');
    expect(normalizeViewMode(undefined)).toBe('detailed');
  });

  test('parseTerseFields filters unknown entries', () => {
    expect(parseTerseFields('')).toEqual(['location', 'name', 'hash', 'exported']);
    expect(parseTerseFields('loc name hash extra')).toEqual(['location', 'name', 'hash']);
    expect(parseTerseFields('default')).toEqual(['location', 'name', 'hash', 'exported']);
  });

  test('formatTerseMatch renders compact segments', () => {
    const segments = formatTerseMatch(
      sampleMatch,
      ['location', 'name', 'hash', 'exported', 'async', 'terms'],
      { formatter: stubFormatter, isChinese: false }
    );

    expect(segments).toEqual([
      'cyan(src/example.js):muted(12):muted(3)',
      'bold(alpha)',
      'accent(#abcd1234)',
      'success(exp)',
      'cyan(async)',
      'muted(~alpha)'
    ]);
  });

  test('formatTerseMatch respects Chinese markers', () => {
    const segments = formatTerseMatch(
      sampleMatch,
      ['exported', 'async'],
      { formatter: stubFormatter, isChinese: true }
    );
    expect(segments).toEqual(['success(出)', 'cyan(异)']);
  });
});
