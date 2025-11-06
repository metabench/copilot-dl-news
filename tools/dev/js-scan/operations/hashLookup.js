'use strict';

function detectEncoding(hash) {
  if (/^[A-Za-z0-9+/=]{8,}$/.test(hash)) {
    return 'base64';
  }
  if (/^[0-9a-f]+$/i.test(hash)) {
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
