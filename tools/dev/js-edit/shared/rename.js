'use strict';

function applyRenameToSnippet(snippet, record, newName) {
  if (!record.identifierSpan) {
    throw new Error('Renaming requires the target function to have a named identifier.');
  }

  const relativeStart = record.identifierSpan.start - record.span.start;
  const relativeEnd = record.identifierSpan.end - record.span.start;

  if (relativeStart < 0 || relativeEnd > snippet.length) {
    throw new Error('Unable to map identifier span while renaming. The function structure may have changed.');
  }

  const slice = snippet.slice(relativeStart, relativeEnd);
  const identifierMatch = /[A-Za-z_$][A-Za-z0-9_$]*/.exec(slice);

  if (!identifierMatch) {
    throw new Error('Unable to locate identifier token while renaming.');
  }

  const tokenStart = relativeStart + identifierMatch.index;
  const tokenEnd = tokenStart + identifierMatch[0].length;

  return `${snippet.slice(0, tokenStart)}${newName}${snippet.slice(tokenEnd)}`;
}

module.exports = {
  applyRenameToSnippet
};
