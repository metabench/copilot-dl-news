'use strict';

const path = require('path');
const { execFileSync } = require('child_process');
const { scanWorkspace } = require('../../../tools/dev/js-scan/shared/scanner');
const { runSearch } = require('../../../tools/dev/js-scan/operations/search');
const { runHashLookup } = require('../../../tools/dev/js-scan/operations/hashLookup');
const { buildIndex } = require('../../../tools/dev/js-scan/operations/indexing');
const { runPatternSearch } = require('../../../tools/dev/js-scan/operations/patterns');
const { runDependencySummary } = require('../../../tools/dev/js-scan/operations/dependencies');
const {
  parseTerseFields,
  formatTerseMatch,
  normalizeViewMode
} = require('../../../tools/dev/js-scan.js');

const fixtureDir = path.resolve(__dirname, '../../fixtures/tools');
const repoRoot = path.resolve(__dirname, '../../..');
const cliScript = path.resolve(repoRoot, 'tools/dev/js-scan.js');

const ANSI_PATTERN = /\[[0-9;]*m/g;

function stripAnsi(value) {
  return value.replace(ANSI_PATTERN, '');
}

let defaultScan;
let includeDeprecatedScan;
let deprecatedOnlyScan;
let dependencyScanNoFollow;
let dependencyScanFollow;
let circularScan;
let typescriptScan;

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

  typescriptScan = scanWorkspace({
    dir: fixtureDir,
    exclude: [],
    language: 'typescript'
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

describe('js-scan dependency summaries', () => {
  test('summarizes outgoing edges for entry file', () => {
    const summary = runDependencySummary(dependencyScanFollow.files, 'entry.js', {
      rootDir: dependencyScanFollow.rootDir,
      depth: 1,
      limit: 0
    });

    expect(summary.target.file).toBe('entry.js');
    const outgoingFiles = summary.outgoing.map((row) => row.file);
    expect(outgoingFiles).toContain('../dep-linked/helper.js');

    const helperRow = summary.outgoing.find((row) => row.file === '../dep-linked/helper.js');
    expect(helperRow).toBeDefined();
    expect(helperRow.requireCount).toBe(1);
    expect(helperRow.importCount).toBe(0);
    expect(helperRow.hop).toBe(1);
  });

  test('depth expansion surfaces indirect dependents', () => {
    const summary = runDependencySummary(dependencyScanFollow.files, '../dep-circular/a.js', {
      rootDir: dependencyScanFollow.rootDir,
      depth: 2,
      limit: 0
    });

    const incomingFiles = summary.incoming.map((row) => row.file);
    expect(incomingFiles).toContain('../dep-linked/helper.js');
    expect(incomingFiles).toContain('entry.js');

    const entryRow = summary.incoming.find((row) => row.file === 'entry.js');
    expect(entryRow).toBeDefined();
    expect(entryRow.hop).toBe(2);
    expect(entryRow.via).toBe('../dep-linked/helper.js');
  });

  test('allows resolving by function hash', () => {
    const entryRecord = dependencyScanFollow.files.find((record) => record.relativePath === 'entry.js');
    expect(entryRecord).toBeDefined();

    const hashMap = new Map();
    dependencyScanFollow.files.forEach((record) => {
      record.functions.forEach((fn) => {
        if (!fn.hash) {
          return;
        }
        if (!hashMap.has(fn.hash)) {
          hashMap.set(fn.hash, []);
        }
        hashMap.get(fn.hash).push({
          file: record.relativePath,
          fn
        });
      });
    });

    const uniqueEntry = Array.from(hashMap.entries()).find(([, list]) => list.length === 1);

    if (uniqueEntry) {
      const [targetHash, [{ file: targetFile, fn: targetFunction }]] = uniqueEntry;

      const summary = runDependencySummary(dependencyScanFollow.files, targetHash, {
        rootDir: dependencyScanFollow.rootDir,
        depth: 1,
        limit: 0
      });

      expect(summary.target.matchedBy).toBe('function-hash');
      expect(summary.target.file).toBe(targetFile);
      expect(summary.target.function).toBeDefined();
      expect(summary.target.function.hash).toBe(targetFunction.hash);
    } else {
      const [ambiguousHash] = hashMap.keys();
      expect(() => runDependencySummary(dependencyScanFollow.files, ambiguousHash, {
        rootDir: dependencyScanFollow.rootDir,
        depth: 1,
        limit: 0
      })).toThrow(/belongs to multiple files/);
    }
  });
});

describe('js-scan CLI parse error handling', () => {
  test('deps-of text output defers parse error summary', () => {
    const output = execFileSync(process.execPath, [
      cliScript,
      '--deps-of',
      'tests/fixtures/tools/js-scan/sample.js',
      '--dep-depth',
      '1',
      '--limit',
      '5'
    ], {
      cwd: repoRoot,
      encoding: 'utf8'
    });

    const clean = stripAnsi(output);
    const depsIndex = clean.indexOf('Dependencies');
    const summaryIndex = clean.indexOf('files could not be parsed');

    expect(depsIndex).toBeGreaterThan(-1);
    expect(summaryIndex).toBeGreaterThan(-1);
    expect(summaryIndex).toBeGreaterThan(depsIndex);
    expect(clean.includes('Use --deps-parse-errors for details.')).toBe(true);
  });

  test('deps-of text output with --deps-parse-errors prints details after tables', () => {
    const output = execFileSync(process.execPath, [
      cliScript,
      '--deps-of',
      'tests/fixtures/tools/js-scan/sample.js',
      '--dep-depth',
      '1',
      '--limit',
      '5',
      '--deps-parse-errors'
    ], {
      cwd: repoRoot,
      encoding: 'utf8'
    });

    const clean = stripAnsi(output);
    const depsIndex = clean.indexOf('Dependencies');
    const detailIndex = clean.indexOf('hub-analysis-workflow.js');

    expect(depsIndex).toBeGreaterThan(-1);
    expect(detailIndex).toBeGreaterThan(depsIndex);
    expect(clean.includes('Use --deps-parse-errors for details.')).toBe(false);
  });

  test('deps-of text output still honors legacy --show-parse-errors', () => {
    const output = execFileSync(process.execPath, [
      cliScript,
      '--deps-of',
      'tests/fixtures/tools/js-scan/sample.js',
      '--dep-depth',
      '1',
      '--limit',
      '5',
      '--show-parse-errors'
    ], {
      cwd: repoRoot,
      encoding: 'utf8'
    });

    const clean = stripAnsi(output);
    const detailIndex = clean.indexOf('hub-analysis-workflow.js');

    expect(detailIndex).toBeGreaterThan(-1);
    expect(clean.includes('Use --deps-parse-errors for details.')).toBe(false);
  });

  test('deps-of json output embeds parse error counts', () => {
    const output = execFileSync(process.execPath, [
      cliScript,
      '--deps-of',
      'tests/fixtures/tools/js-scan/sample.js',
      '--dep-depth',
      '1',
      '--limit',
      '5',
      '--json'
    ], {
      cwd: repoRoot,
      encoding: 'utf8'
    });

    const parsed = JSON.parse(output);
    expect(parsed.parseErrors).toBeDefined();
    expect(parsed.parseErrors.count).toBeGreaterThan(0);
    expect(parsed.parseErrors.samples).toBeUndefined();
  });

  test('deps-of json output includes samples when requested', () => {
    const output = execFileSync(process.execPath, [
      cliScript,
      '--deps-of',
      'tests/fixtures/tools/js-scan/sample.js',
      '--dep-depth',
      '1',
      '--limit',
      '5',
      '--json',
      '--show-parse-errors'
    ], {
      cwd: repoRoot,
      encoding: 'utf8'
    });

    const parsed = JSON.parse(output);
    expect(parsed.parseErrors).toBeDefined();
    expect(parsed.parseErrors.count).toBeGreaterThan(0);
    expect(Array.isArray(parsed.parseErrors.samples)).toBe(true);
    expect(parsed.parseErrors.samples.length).toBeGreaterThan(0);
    expect(parsed.parseErrors.samples[0]).toHaveProperty('file');
    expect(parsed.parseErrors.samples[0]).toHaveProperty('message');
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
    const withoutDepsPaths = dependencyScanNoFollow.files.map((record) => record.relativePath);
    expect(withoutDepsPaths.some((file) => file.includes('dep-linked/helper.js'))).toBe(false);

    const withDepsPaths = dependencyScanFollow.files.map((record) => record.relativePath);
    expect(withDepsPaths.some((file) => file.includes('dep-linked/helper.js'))).toBe(true);

    const withDeps = runSearch(dependencyScanFollow.files, ['helperOne'], { limit: 5 });
    expect(withDeps.matches.some((match) => match.function.name === 'helperOne')).toBe(true);
  });

  test('respects dependency depth limit', () => {
    const depthLimitedScan = scanWorkspace({
      dir: path.join(fixtureDir, 'dep-root'),
      exclude: [],
      followDependencies: true,
      dependencyDepth: 1
    });

    const limitedPaths = depthLimitedScan.files.map((record) => record.relativePath);
    expect(limitedPaths.some((file) => file.includes('dep-circular/a.js'))).toBe(false);

    const fullPaths = dependencyScanFollow.files.map((record) => record.relativePath);
    expect(fullPaths.some((file) => file.includes('dep-circular/a.js'))).toBe(true);
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
    expect(parseTerseFields('selector')).toEqual(['selector']);
  });

  test('formatTerseMatch renders compact segments', () => {
    const segments = formatTerseMatch(
      sampleMatch,
      ['location', 'name', 'hash', 'exported', 'async', 'terms'],
      { isChinese: false },
      stubFormatter
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
      { isChinese: true },
      stubFormatter
    );
    expect(segments).toEqual([
      'cyan(src/example.js):muted(12):muted(3)',
      'success(出)',
      'cyan(异)',
      'accent(#abcd1234)'
    ]);
  });

  test('formatTerseMatch renders selector field', () => {
    const segments = formatTerseMatch(
      sampleMatch,
      ['selector', 'terms'],
      { isChinese: false },
      stubFormatter
    );
    expect(segments).toEqual([
      'cyan(src/example.js):muted(12):muted(3)',
      'muted(exports.alpha)',
      'muted(~alpha)',
      'accent(#abcd1234)'
    ]);
  });
});

describe('js-scan source language handling', () => {
  test('parses TypeScript fixtures when language is typescript', () => {
    const tsRecord = typescriptScan.files.find((file) => file.relativePath.endsWith('language-sample.ts'));
    expect(tsRecord).toBeDefined();
    expect(tsRecord.functions.length).toBeGreaterThan(0);
    const fn = tsRecord.functions[0];
    expect(fn.snippet && fn.snippet.length).toBeGreaterThan(0);
    expect(fn.name).toBe('lookupLanguageUser');
  });
});
