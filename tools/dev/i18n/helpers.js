'use strict';

/**
 * Resolve the active language mode from the formatter and provide
 * convenience booleans for downstream helpers.
 * @param {import('../../src/shared/utils/CliFormatter')} formatter
 * @returns {{ languageMode: string, isChinese: boolean, englishFirst: boolean }}
 */
function resolveLanguageContext(formatter) {
  const mode = formatter && typeof formatter.getLanguageMode === 'function'
    ? formatter.getLanguageMode()
    : 'en';

  return {
    languageMode: mode,
    isChinese: mode === 'zh',
    englishFirst: mode !== 'zh'
  };
}

/**
 * Translate a lexicon key while respecting the active language mode.
 * Falls back to the provided English label when translation hooks are missing.
 * @param {import('../../src/shared/utils/CliFormatter')} fmt
 * @param {{ isChinese: boolean, englishFirst: boolean }} language
 * @param {string} key
 * @param {string} fallback
 * @param {Record<string, unknown>} overrides
 * @returns {string}
 */
function translateLabelWithMode(fmt, language, key, fallback, overrides = {}) {
  if (!fmt || typeof fmt.translateLabel !== 'function') {
    return fallback;
  }

  const baseOptions = language && language.isChinese
    ? { englishFirst: false, chineseOnly: true }
    : { englishFirst: language ? language.englishFirst : true };

  return fmt.translateLabel(key, fallback, { ...baseOptions, ...overrides });
}

/**
 * Join translated labels in the correct presentation order for the active language.
 * @param {import('../../src/shared/utils/CliFormatter')} fmt
 * @param {{ isChinese: boolean, englishFirst: boolean }} language
 * @param {Array<{ key: string, fallback: string, options?: Record<string, unknown> }>} descriptors
 * @returns {string}
 */
function joinTranslatedLabels(fmt, language, descriptors) {
  if (!Array.isArray(descriptors) || descriptors.length === 0) {
    return '';
  }

  const labels = descriptors.map(({ key, fallback, options }) =>
    translateLabelWithMode(fmt, language, key, fallback, options)
  );

  if (language && language.isChinese) {
    return labels.join('');
  }

  return labels.join(' ').replace(/\s+/g, ' ').trim();
}

module.exports = {
  resolveLanguageContext,
  translateLabelWithMode,
  joinTranslatedLabels
};

