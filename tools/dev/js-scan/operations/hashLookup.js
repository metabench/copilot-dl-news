'use strict';

const { HASH_LENGTH_BY_ENCODING, HASH_CHARSETS } = require('../../shared/hashConfig');

function detectEncoding(hash) {
  if (typeof hash !== 'string') {
    return 'unknown';
  }
  const trimmed = hash.trim();
  if (trimmed.length === HASH_LENGTH_BY_ENCODING.base64 && HASH_CHARSETS.base64.test(trimmed)) {
    return 'base64';
  }
  if (trimmed.length === HASH_LENGTH_BY_ENCODING.hex && HASH_CHARSETS.hex.test(trimmed)) {
    return 'hex';
  }
  return 'unknown';
}

function runHashLookup(files, hashValue) {
  if (typeof hashValue !== 'string' || hashValue.trim().length === 0) {
    throw new Error('Hash lookup requires a hash value.');
  }

  const target = hashValue.trim();
  const matches = [];

  files.forEach((file) => {
    file.functions.forEach((fn) => {
      if (typeof fn.hash === 'string' && fn.hash === target) {
        matches.push({
          file: file.relativePath,
          function: {
            name: fn.name,
            canonicalName: fn.canonicalName,
            kind: fn.kind,
            exportKind: fn.exportKind,
            hash: fn.hash,
            line: fn.line,
            column: fn.column,
            span: fn.span,
            exported: fn.exported,
            isAsync: fn.isAsync,
            isGenerator: fn.isGenerator
          }
        });
      }
    });
  });

  return {
    operation: 'find-hash',
    hash: target,
    encoding: detectEncoding(target),
    found: matches.length > 0,
    collision: matches.length > 1,
    matchCount: matches.length,
    matches
  };
}

module.exports = {
  runHashLookup
};
