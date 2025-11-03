const path = require('path');
const { spawnSync } = require('child_process');

const jsEditPath = path.join(__dirname, '../../../tools/dev/js-edit.js');
const fixturePath = path.join(__dirname, '../../fixtures/tools/js-edit-sample.js');

const runJsEdit = (args, options = {}) => {
  return spawnSync(process.execPath, [jsEditPath, ...args], {
    encoding: 'utf8',
    ...options
  });
};

describe('js-edit discovery helpers', () => {
  test('preview emits concise function snippets with guard metadata', () => {
    const result = runJsEdit([
      '--file',
      fixturePath,
      '--preview',
      'exports.alpha',
      '--json'
    ]);

    if (result.status !== 0) {
      throw new Error(`preview command failed: ${result.stderr || result.stdout}`);
    }

    const payload = JSON.parse(result.stdout);
    expect(payload.entity).toBe('function');
    expect(payload.function).toEqual(expect.objectContaining({
      canonicalName: 'exports.alpha',
      hash: expect.any(String)
    }));
    expect(payload.preview).toEqual(expect.objectContaining({
      text: expect.stringContaining('function alpha'),
      truncated: false,
      limit: expect.any(Number)
    }));
    expect(payload.preview.totalChars).toBeGreaterThan(0);
  });

  test('preview-variable defaults to declarator span and reports metadata', () => {
    const result = runJsEdit([
      '--file',
      fixturePath,
      '--preview-variable',
      'ren',
      '--json'
    ]);

    if (result.status !== 0) {
      throw new Error(`preview-variable command failed: ${result.stderr || result.stdout}`);
    }

    const payload = JSON.parse(result.stdout);
    expect(payload.entity).toBe('variable');
    expect(payload.variable).toEqual(expect.objectContaining({
      name: 'ren',
      targetMode: 'declarator',
      hash: expect.any(String)
    }));
    expect(payload.preview.text).toContain('ren');
    expect(payload.preview.truncated).toBe(false);
    expect(payload.preview.limit).toBeGreaterThan(0);
  });

  test('search-text surfaces surrounding context and guard hashes', () => {
    const result = runJsEdit([
      '--file',
      fixturePath,
      '--search-text',
      'worker',
      '--json'
    ]);

    if (result.status !== 0) {
      throw new Error(`search-text command failed: ${result.stderr || result.stdout}`);
    }

    const payload = JSON.parse(result.stdout);
    expect(payload.query).toBe('worker');
    expect(payload.limit).toBe(20);
    expect(payload.contextChars).toBe(60);
    expect(payload.matchCount).toBeGreaterThan(0);
    expect(payload.truncated).toBe(false);

    const workerMatch = payload.matches.find((match) => match.guard.function && match.guard.function.canonicalName === 'exports.worker');
    expect(workerMatch).toBeDefined();
    expect(workerMatch.guard.function.hash).toHaveLength(8);
    expect(workerMatch.snippet.highlighted).toContain('<<<');
    expect(workerMatch.snippet.highlighted).toContain('>>>');
    expect(Array.isArray(workerMatch.suggestions)).toBe(true);
    expect(workerMatch.suggestions.length).toBeGreaterThan(0);
    const locateSuggestion = workerMatch.suggestions.find((command) => command.includes('--locate') && command.includes(`hash:${workerMatch.guard.function.hash}`));
    expect(locateSuggestion).toBeDefined();
  });
});
