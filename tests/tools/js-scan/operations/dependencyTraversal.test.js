'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { scanWorkspace } = require('../../../../tools/dev/js-scan/shared/scanner');
const { runDependencySummary } = require('../../../../tools/dev/js-scan/operations/dependencies');

function createTempDir(prefix = 'js-scan-deps') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  return dir;
}

function writeFileSync(targetPath, content) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, 'utf8');
}

describe('js-scan dependency traversal (Gap 5)', () => {
  let testDir;

  beforeEach(() => {
    testDir = createTempDir();

    writeFileSync(path.join(testDir, 'lib', 'util.js'), `
      export function util() { return 'util'; }
    `);

    writeFileSync(path.join(testDir, 'services', 'service.js'), `
      import { util } from '../lib/util.js';
      export function service() { return util(); }
    `);

    writeFileSync(path.join(testDir, 'app', 'main.js'), `
      import { service } from '../services/service.js';
      export function bootstrap() { return service(); }
    `);

    writeFileSync(path.join(testDir, 'app', 'secondary.js'), `
      import { util } from '../lib/util.js';
      export function secondary() { return util(); }
    `);

    writeFileSync(path.join(testDir, 'consumer.js'), `
      import { bootstrap } from './app/main.js';
      export function run() { return bootstrap(); }
    `);

    writeFileSync(path.join(testDir, 'multiConsumer.js'), `
      import { bootstrap } from './app/main.js';
      import { secondary } from './app/secondary.js';
      export function runBoth() { return bootstrap() + secondary(); }
    `);
  });

  afterEach(() => {
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  function summarize(target, options = {}) {
    const scan = scanWorkspace({ dir: testDir });
    return runDependencySummary(scan.files, target, { rootDir: scan.rootDir, ...options });
  }

  test('captures direct dependencies for outgoing traversal', () => {
    const summary = summarize('app/main.js');
    const files = summary.outgoing.map((entry) => entry.file);
    expect(files).toContain('services/service.js');
  });

  test('includes second-level dependencies with path metadata', () => {
    const summary = summarize('app/main.js');
    const utilEntry = summary.outgoing.find((entry) => entry.file.endsWith('lib/util.js'));
    expect(utilEntry).toBeDefined();
    expect(utilEntry.path).toEqual(['app/main.js', 'services/service.js', 'lib/util.js']);
    expect(utilEntry.hop).toBeGreaterThan(1);
  });

  test('records via hop field for transitive nodes', () => {
    const summary = summarize('app/main.js');
    const utilEntry = summary.outgoing.find((entry) => entry.file.endsWith('lib/util.js'));
    expect(utilEntry.via).toBe('services/service.js');
  });

  test('respects depth limit when provided', () => {
    const summary = summarize('app/main.js', { depth: 1 });
    const files = summary.outgoing.map((entry) => entry.file);
    expect(files).not.toContain('lib/util.js');
  });

  test('respects limit option to truncate results', () => {
    const summary = summarize('app/main.js', { limit: 1 });
    expect(summary.outgoing.length).toBeLessThanOrEqual(1);
  });

  test('captures incoming dependents for impacts traversal', () => {
    const summary = summarize('app/main.js');
    const dependents = summary.incoming.map((entry) => entry.file);
    expect(dependents).toEqual(expect.arrayContaining(['consumer.js', 'multiConsumer.js']));
  });

  test('incoming traversal annotates path to dependents', () => {
    const summary = summarize('lib/util.js');
    const dependent = summary.incoming.find((entry) => entry.file.endsWith('app/main.js'));
    expect(dependent.path).toEqual(['lib/util.js', 'services/service.js', 'app/main.js']);
  });

  test('throws helpful error when target does not exist', () => {
    expect(() => summarize('missing.js')).toThrow(/Could not find a file/);
  });

  test('cli --depends-on returns structured json payload', () => {
    const output = execFileSync(process.execPath, [
      path.join(__dirname, '../../../../tools/dev/js-scan.js'),
      '--depends-on', 'app/main.js',
      '--dir', testDir,
      '--json'
    ], { encoding: 'utf8' });
    const payload = JSON.parse(output);
    expect(payload.operation).toBe('depends-on');
    expect(payload.dependencies.length).toBeGreaterThan(0);
  });

  test('cli --depends-on respects --dep-depth', () => {
    const output = execFileSync(process.execPath, [
      path.join(__dirname, '../../../../tools/dev/js-scan.js'),
      '--depends-on', 'app/main.js',
      '--dir', testDir,
      '--dep-depth', '1',
      '--json'
    ], { encoding: 'utf8' });
    const payload = JSON.parse(output);
    const files = payload.dependencies.map((entry) => entry.file);
    expect(files).not.toContain('lib/util.js');
  });

  test('cli --impacts returns dependents list', () => {
    const output = execFileSync(process.execPath, [
      path.join(__dirname, '../../../../tools/dev/js-scan.js'),
      '--impacts', 'app/main.js',
      '--dir', testDir,
      '--json'
    ], { encoding: 'utf8' });
    const payload = JSON.parse(output);
    const dependents = payload.dependencies.map((entry) => entry.file);
    expect(dependents).toEqual(expect.arrayContaining(['consumer.js']));
  });

  test('cli --impacts includes path metadata', () => {
    const output = execFileSync(process.execPath, [
      path.join(__dirname, '../../../../tools/dev/js-scan.js'),
      '--impacts', 'lib/util.js',
      '--dir', testDir,
      '--json'
    ], { encoding: 'utf8' });
    const payload = JSON.parse(output);
    const mainEntry = payload.dependencies.find((entry) => entry.file.endsWith('app/main.js'));
    expect(mainEntry.path).toEqual(['lib/util.js', 'services/service.js', 'app/main.js']);
  });

  test('cli emits parseErrors metadata when parse issues exist', () => {
    // Introduce malformed file to trigger parse error
    fs.writeFileSync(path.join(testDir, 'broken.js'), 'function broken( {');
    const output = execFileSync(process.execPath, [
      path.join(__dirname, '../../../../tools/dev/js-scan.js'),
      '--depends-on', 'app/main.js',
      '--dir', testDir,
      '--json'
    ], { encoding: 'utf8' });
    const payload = JSON.parse(output);
    expect(payload.parseErrors.count).toBeGreaterThanOrEqual(1);
  });

  test('dependency summary includes fan-in and fan-out stats', () => {
    const summary = summarize('app/main.js');
    expect(summary.stats.fanOut).toBeGreaterThan(0);
    expect(summary.stats.fanIn).toBeGreaterThanOrEqual(0);
  });

  test('path metadata preserves start file as first element', () => {
    const summary = summarize('app/main.js');
    summary.outgoing.forEach((entry) => {
      expect(entry.path[0]).toBe('app/main.js');
    });
  });

  test('path metadata for incoming begins with target file', () => {
    const summary = summarize('lib/util.js');
    summary.incoming.forEach((entry) => {
      expect(entry.path[0]).toBe('lib/util.js');
    });
  });
});
