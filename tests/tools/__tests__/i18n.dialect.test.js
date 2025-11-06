'use strict';

const { translateCliArgs } = require('../../../tools/dev/i18n/dialect');

describe('i18n dialect translator', () => {
  test('translates js-scan alias to canonical option', () => {
    const result = translateCliArgs('js-scan', ['--搜', 'planner']);
    expect(result.argv[0]).toBe('--search');
    expect(result.aliasUsed).toBe(true);
    expect(result.argv[1]).toBe('planner');
  });

  test('handles equals-style alias tokens', () => {
    const result = translateCliArgs('js-scan', ['--搜=planner']);
    expect(result.argv[0]).toBe('--search=planner');
    expect(result.aliasUsed).toBe(true);
  });

  test('translates limit alias and records lex keys', () => {
    const result = translateCliArgs('js-scan', ['--限', '10']);
    expect(result.argv[0]).toBe('--limit');
    expect(result.aliasUsed).toBe(true);
    expect(result.lexKeys).toContain('search_limit');
  });

  test('detects chinese glyphs when no aliases used', () => {
    const result = translateCliArgs('js-scan', ['--search', '旧模块']);
    expect(result.aliasUsed).toBe(false);
    expect(result.glyphDetected).toBe(true);
  });

  test('leaves unmatched tokens intact', () => {
    const result = translateCliArgs('js-scan', ['--dir', 'src']);
    expect(result.argv).toEqual(['--dir', 'src']);
    expect(result.aliasUsed).toBe(false);
    expect(result.glyphDetected).toBe(false);
  });

  test('translates view alias to canonical option', () => {
    const result = translateCliArgs('js-scan', ['--视', '简']);
    expect(result.argv[0]).toBe('--view');
    expect(result.aliasUsed).toBe(true);
    expect(result.lexKeys).toContain('view');
  });

  test('translates fields alias to canonical option', () => {
    const result = translateCliArgs('js-scan', ['--域', 'location,name']);
    expect(result.argv[0]).toBe('--fields');
    expect(result.aliasUsed).toBe(true);
    expect(result.lexKeys).toContain('fields');
  });

  test('translates dependency traversal aliases', () => {
    const result = translateCliArgs('js-scan', ['--依', '--层', '2']);
    expect(result.argv[0]).toBe('--follow-deps');
    expect(result.argv[1]).toBe('--dep-depth');
    expect(result.aliasUsed).toBe(true);
    expect(result.lexKeys).toEqual(expect.arrayContaining(['follow_deps', 'dependency_depth']));
  });

  test('translates js-edit aliases', () => {
    const result = translateCliArgs('js-edit', ['--函列', '--文', 'src/app.js']);
    expect(result.argv[0]).toBe('--list-functions');
    expect(result.argv[1]).toBe('--file');
    expect(result.aliasUsed).toBe(true);
    expect(result.lexKeys).toEqual(expect.arrayContaining(['list_functions', 'file']));
  });

  test('translates md-scan aliases', () => {
    const result = translateCliArgs('md-scan', ['--搜', 'planner']);
    expect(result.argv[0]).toBe('--search');
    expect(result.aliasUsed).toBe(true);
    expect(result.lexKeys).toContain('search');
  });

  test('translates md-edit aliases', () => {
    const result = translateCliArgs('md-edit', ['--节列']);
    expect(result.argv[0]).toBe('--list-sections');
    expect(result.aliasUsed).toBe(true);
    expect(result.lexKeys).toContain('list_sections');
  });
});
