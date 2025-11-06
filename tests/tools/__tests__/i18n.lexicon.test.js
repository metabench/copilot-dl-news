'use strict';

const path = require('path');

const {
  RAW_LEXICON,
  getAliases,
  getPrimaryAlias,
  hasAlias,
  isAlias,
  lookupKeyForAlias,
  containsChineseGlyph,
  shouldUseChinese,
  formatLabel
} = require('../../../tools/dev/i18n/lexicon');

describe('i18n lexicon utilities', () => {
  test('exposes aliases for known keys', () => {
    expect(Array.isArray(getAliases('search'))).toBe(true);
    expect(getAliases('search')).toContain('搜');
  });

  test('reports primary alias for a key', () => {
    expect(getPrimaryAlias('search')).toBe('搜');
    expect(getPrimaryAlias('nonexistent')).toBeNull();
  });

  test('detects aliases and mappings', () => {
    expect(hasAlias('search', '搜')).toBe(true);
    expect(isAlias('搜')).toBe(true);
    expect(isAlias('--搜')).toBe(true);
    expect(lookupKeyForAlias('搜')).toBe('search');
    expect(lookupKeyForAlias('不存在')).toBeNull();
  });

  test('detects chinese glyphs and tokens for auto mode', () => {
    expect(containsChineseGlyph('搜查')).toBe(true);
    expect(containsChineseGlyph('search')).toBe(false);
    expect(shouldUseChinese(['--dir', 'src', '--搜'])).toBe(true);
    expect(shouldUseChinese(['--dir', 'src'])).toBe(false);
  });

  test('formats bilingual labels', () => {
    expect(formatLabel('search', { english: 'Search' })).toBe('Search (搜)');
    expect(formatLabel('search', { english: 'Search', chineseOnly: true })).toBe('搜');
    expect(formatLabel('search', { english: 'Search', englishFirst: false })).toBe('搜 (Search)');
    expect(formatLabel('nonexistent', { english: 'Fallback' })).toBe('Fallback');
  });

  test('raw lexicon contains expected keys', () => {
    expect(RAW_LEXICON).toHaveProperty('search');
    expect(RAW_LEXICON.search).toContain('搜');
    expect(RAW_LEXICON).toHaveProperty('pending');
    expect(RAW_LEXICON.pending).toContain('待');
    expect(getPrimaryAlias('index')).toBe('索');
    expect(getPrimaryAlias('view')).toBe('视');
    expect(getPrimaryAlias('fields')).toBe('域');
    expect(getPrimaryAlias('location')).toBe('址');
    expect(getPrimaryAlias('follow_deps')).toBe('依');
    expect(getPrimaryAlias('dependency_depth')).toBe('层');
    expect(getPrimaryAlias('entry_points')).toBe('入口');
    expect(getPrimaryAlias('priority_files')).toBe('优档');
    expect(getPrimaryAlias('name')).toBe('名');
    expect(getPrimaryAlias('range')).toBe('范围');
    expect(getPrimaryAlias('exported_as')).toBe('出名');
    expect(getPrimaryAlias('initializer')).toBe('初值');
    expect(getPrimaryAlias('source')).toBe('源');
    expect(getPrimaryAlias('original')).toBe('原');
    expect(getPrimaryAlias('updated')).toBe('更');
    expect(getPrimaryAlias('bytes')).toBe('字节');
    expect(getPrimaryAlias('syntax')).toBe('句');
    expect(getPrimaryAlias('check')).toBe('检');
    expect(getPrimaryAlias('details')).toBe('详');
    expect(getPrimaryAlias('actual')).toBe('实');
    expect(getPrimaryAlias('newlines')).toBe('换行');
    expect(getPrimaryAlias('requested')).toBe('求');
    expect(getPrimaryAlias('applied')).toBe('用');
    expect(getPrimaryAlias('padding')).toBe('垫');
    expect(getPrimaryAlias('effective')).toBe('效');
    expect(getPrimaryAlias('window')).toBe('窗');
    expect(getPrimaryAlias('base')).toBe('基');
    expect(getPrimaryAlias('expanded_to')).toBe('扩至');
    expect(getPrimaryAlias('anonymous_class')).toBe('匿名类');
    expect(getPrimaryAlias('status_bypass')).toBe('越');
    expect(getPrimaryAlias('status_mismatch')).toBe('差');
    expect(getPrimaryAlias('status_skipped')).toBe('略');
    expect(getPrimaryAlias('status_converted')).toBe('转');
    expect(getPrimaryAlias('status_none')).toBe('无');
    expect(getPrimaryAlias('status_unknown')).toBe('未');
    expect(getPrimaryAlias('status_changed')).toBe('变');
    expect(getPrimaryAlias('status_unchanged')).toBe('稳');
  });
});
