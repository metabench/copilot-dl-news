'use strict';

const { loadReplacementSource } = require('./io');
const {
  unescapeCodeString,
  validateCodeSyntax
} = require('../../lib/codeEscaper');

function getReplacementSource(options) {
  if (options.replacementCode) {
    let code = unescapeCodeString(options.replacementCode);
    const validation = validateCodeSyntax(code, '<inline>');
    if (!validation.valid) {
      throw new Error(`Replacement produced invalid JavaScript: ${validation.error}`);
    }
    return code;
  }

  if (options.replacementPath) {
    return loadReplacementSource(options.replacementPath);
  }

  throw new Error('No replacement source provided.');
}

module.exports = {
  getReplacementSource
};
