'use strict';

function extractLangOption(tokens) {
  const entries = Array.isArray(tokens) ? tokens : [];
  for (let i = 0; i < entries.length; i += 1) {
    const token = entries[i];
    if (typeof token !== 'string') {
      continue;
    }
    if (token.startsWith('--lang=')) {
      return token.slice('--lang='.length);
    }
    if (token === '--lang') {
      const next = entries[i + 1];
      if (typeof next === 'string' && !next.startsWith('-')) {
        return next;
      }
      return 'auto';
    }
  }
  return null;
}

function deriveLanguageModeHint(langOverride, translationMeta) {
  const normalized = typeof langOverride === 'string' ? langOverride.trim().toLowerCase() : null;
  if (normalized === 'zh' || normalized === 'cn') {
    return 'zh';
  }
  if (normalized === 'en') {
    return 'en';
  }
  if (normalized === 'bilingual' || normalized === 'en-zh' || normalized === 'zh-en' || normalized === 'bi') {
    return 'bilingual';
  }
  if (normalized && normalized !== 'auto') {
    return 'en';
  }
  if (translationMeta && (translationMeta.aliasUsed || translationMeta.glyphDetected)) {
    return 'zh';
  }
  return 'en';
}

module.exports = {
  extractLangOption,
  deriveLanguageModeHint
};
