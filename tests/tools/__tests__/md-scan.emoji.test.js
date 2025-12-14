const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../../..');
const MD_SCAN = path.join(ROOT, 'tools', 'dev', 'md-scan.js');
const FIXTURES_DIR = path.join(ROOT, 'tests', 'fixtures', 'tools', 'md');

function runMdScanJson(args) {
  const stdout = execFileSync('node', [MD_SCAN, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' }
  });
  return JSON.parse(stdout);
}

describe('md-scan encoded emoji search + inventory', () => {
  test('decodes b16: hex search term (UTF-8) and finds matches', () => {
    // 🧠 => utf8 hex f09fa7a0
    const results = runMdScanJson([
      '--dir', FIXTURES_DIR,
      '--search', 'b16:f09fa7a0',
      '--json'
    ]);

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);

    const first = results[0];
    expect(first).toHaveProperty('termMatches');

    const keys = Object.keys(first.termMatches);
    expect(keys.length).toBeGreaterThan(0);
    const keyHex = Buffer.from(keys[0], 'utf8').toString('hex');
    expect(keyHex).toBe('f09fa7a0');

    const rel = String(first.relativePath || '');
    expect(rel.replace(/\\/g, '/')).toContain('tests/fixtures/tools/md/emoji-fixture.md');
  });

  test('decodes b64: base64 search term (UTF-8) and finds matches', () => {
    // ⚙️ => utf8 base64 4pqZ77iP
    const results = runMdScanJson([
      '--dir', FIXTURES_DIR,
      '--search', 'b64:4pqZ77iP',
      '--json'
    ]);

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);

    const first = results[0];
    const keys = Object.keys(first.termMatches);
    expect(keys.length).toBeGreaterThan(0);
    const keyHex = Buffer.from(keys[0], 'utf8').toString('hex');
    expect(keyHex).toBe('e29a99efb88f');
  });

  test('rejects invalid b16: payloads with a clear error', () => {
    try {
      execFileSync('node', [
        MD_SCAN,
        '--dir', FIXTURES_DIR,
        '--search', 'b16:xyz',
        '--json'
      ], {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, FORCE_COLOR: '0' }
      });
      throw new Error('Expected md-scan to fail for invalid b16 payload');
    } catch (error) {
      const stderr = error && error.stderr ? String(error.stderr) : '';
      const stdout = error && error.stdout ? String(error.stdout) : '';
      const combined = `${stderr}\n${stdout}\n${error && error.message ? String(error.message) : ''}`;
      expect(combined).toMatch(/Invalid b16/i);
    }
  });

  test('--find-emojis emits inventory JSON including utf8Hex for expected emojis', () => {
    const inventory = runMdScanJson([
      '--dir', FIXTURES_DIR,
      '--find-emojis',
      '--emoji-occurrence-limit', '2',
      '--json'
    ]);

    expect(inventory).toHaveProperty('operation', 'find-emojis');
    expect(inventory).toHaveProperty('scannedFiles');
    expect(inventory).toHaveProperty('uniqueEmojis');
    expect(inventory).toHaveProperty('emojis');
    expect(Array.isArray(inventory.emojis)).toBe(true);

    const hexes = new Set(inventory.emojis.map((e) => e.utf8Hex));
    expect(hexes.has('f09fa7a0')).toBe(true); // 🧠
    expect(hexes.has('e29a99efb88f')).toBe(true); // ⚙️
  });
});
