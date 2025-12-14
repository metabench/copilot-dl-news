const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../../..');
const TOOL = path.join(ROOT, 'tools', 'dev', 'emoji-encode.js');

function runToolJson(args) {
  const stdout = execFileSync('node', [TOOL, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' }
  });
  return JSON.parse(stdout);
}

describe('emoji-encode', () => {
  test('encodes a single codepoint to utf8 hex/base64', () => {
    const out = runToolJson(['--codepoint', 'U+1F9E0', '--json']);
    expect(out.tool).toBe('emoji-encode');
    expect(out.count).toBe(1);
    expect(out.entries[0].utf8Hex).toBe('f09fa7a0');
    expect(out.entries[0].utf8Base64).toBe('8J+noA==');
  });

  test('encodes a multi-codepoint sequence (e.g., ⚙️)', () => {
    const out = runToolJson(['--codepoint', 'U+2699,U+FE0F', '--json']);
    expect(out.count).toBe(1);
    expect(out.entries[0].utf8Hex).toBe('e29a99efb88f');
    expect(out.entries[0].utf8Base64).toBe('4pqZ77iP');
  });

  test('decodes from utf8 hex back to text and round-trips', () => {
    const out = runToolJson(['--utf8-hex', 'f09fa7a0', '--json']);
    expect(out.count).toBe(1);
    expect(out.entries[0].utf8Hex).toBe('f09fa7a0');
  });

  test('decodes from utf8 base64 back to text and round-trips', () => {
    const out = runToolJson(['--utf8-base64', '8J+noA==', '--json']);
    expect(out.count).toBe(1);
    expect(out.entries[0].utf8Base64).toBe('8J+noA==');
  });
});
