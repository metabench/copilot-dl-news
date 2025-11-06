'use strict';

function computeNewlineStats(content) {
  if (typeof content !== 'string' || content.length === 0) {
    return {
      style: 'none',
      total: 0,
      counts: { lf: 0, crlf: 0, cr: 0 },
      mixed: false,
      uniqueStyles: 0
    };
  }

  let lf = 0;
  let crlf = 0;
  let cr = 0;
  for (let index = 0; index < content.length; index += 1) {
    const code = content.charCodeAt(index);
    if (code === 13) {
      if (content.charCodeAt(index + 1) === 10) {
        crlf += 1;
        index += 1;
      } else {
        cr += 1;
      }
    } else if (code === 10) {
      lf += 1;
    }
  }

  const counts = { lf, crlf, cr };
  const total = lf + crlf + cr;
  if (total === 0) {
    return {
      style: 'none',
      total: 0,
      counts,
      mixed: false,
      uniqueStyles: 0
    };
  }

  const uniqueStyles = Number(lf > 0) + Number(crlf > 0) + Number(cr > 0);
  let style = 'lf';
  if (crlf >= lf && crlf >= cr && crlf > 0) {
    style = 'crlf';
  } else if (cr > lf && cr > crlf) {
    style = 'cr';
  }

  return {
    style,
    total,
    counts,
    mixed: uniqueStyles > 1,
    uniqueStyles
  };
}

function summarizeNewlineStats(stats, bytes) {
  if (!stats) {
    return null;
  }

  return {
    style: stats.style,
    mixed: Boolean(stats.mixed),
    total: stats.total,
    counts: stats.counts || { lf: 0, crlf: 0, cr: 0 },
    uniqueStyles: stats.uniqueStyles || 0,
    bytes
  };
}

function resolveTargetNewlineStyle(style) {
  if (style === 'crlf' || style === 'lf' || style === 'cr') {
    return style;
  }
  return 'lf';
}

function newlineTokenForStyle(style) {
  switch (style) {
    case 'crlf':
      return '\r\n';
    case 'cr':
      return '\r';
    default:
      return '\n';
  }
}

function prepareNormalizedSnippet(snippet, targetStyle, options = {}) {
  const ensureTrailingNewline = options.ensureTrailingNewline === true;
  const resolvedTarget = resolveTargetNewlineStyle(targetStyle);
  const originalStats = computeNewlineStats(snippet);
  const originalBytes = Buffer.byteLength(snippet, 'utf8');

  let normalized = snippet;
  let converted = false;

  if (originalStats.total > 0) {
    const collapsed = snippet.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (collapsed !== snippet) {
      converted = true;
    }

    if (resolvedTarget === 'crlf') {
      normalized = collapsed.replace(/\n/g, '\r\n');
    } else if (resolvedTarget === 'cr') {
      normalized = collapsed.replace(/\n/g, '\r');
    } else {
      normalized = collapsed;
    }

    if (normalized !== snippet) {
      converted = true;
    }
  }

  const newlineToken = newlineTokenForStyle(resolvedTarget);
  let trailingAdded = false;

  if (ensureTrailingNewline) {
    if (!normalized.endsWith('\n') && !normalized.endsWith('\r')) {
      normalized += newlineToken;
      trailingAdded = true;
    } else if (!normalized.endsWith(newlineToken)) {
      const trimmed = normalized.replace(/(?:\r\n|\r|\n)$/, '');
      normalized = `${trimmed}${newlineToken}`;
      converted = true;
    }
  }

  const resultStats = computeNewlineStats(normalized);
  const normalizedBytes = Buffer.byteLength(normalized, 'utf8');

  return {
    text: normalized,
    original: originalStats,
    result: resultStats,
    targetStyle: resolvedTarget,
    converted: converted || trailingAdded,
    trailingAdded,
    originalBytes,
    normalizedBytes,
    byteDelta: normalizedBytes - originalBytes
  };
}

function createNewlineGuard(fileStats, snippetBefore, snippetAfter, replacementMeta) {
  const resolvedFileStats = fileStats || computeNewlineStats(snippetBefore);
  const beforeStats = computeNewlineStats(snippetBefore);
  const afterStats = computeNewlineStats(snippetAfter);
  const beforeBytes = Buffer.byteLength(snippetBefore, 'utf8');
  const afterBytes = Buffer.byteLength(snippetAfter, 'utf8');
  const byteDelta = afterBytes - beforeBytes;

  const conversionApplied = Boolean(
    replacementMeta && (replacementMeta.converted || replacementMeta.trailingAdded)
  );

  const status = resolvedFileStats.total === 0 && beforeStats.total === 0 && afterStats.total === 0
    ? 'none'
    : conversionApplied
      ? 'converted'
      : 'ok';

  return {
    status,
    file: summarizeNewlineStats(resolvedFileStats, null),
    original: summarizeNewlineStats(beforeStats, beforeBytes),
    result: summarizeNewlineStats(afterStats, afterBytes),
    byteDelta,
    replacement: replacementMeta
      ? {
          style: replacementMeta.original.style,
          mixed: replacementMeta.original.mixed,
          total: replacementMeta.original.total,
          counts: replacementMeta.original.counts,
          bytes: replacementMeta.originalBytes,
          normalizedStyle: replacementMeta.result.style,
          normalizedMixed: replacementMeta.result.mixed,
          normalizedTotal: replacementMeta.result.total,
          normalizedCounts: replacementMeta.result.counts,
          normalizedBytes: replacementMeta.normalizedBytes,
          converted: replacementMeta.converted,
          trailingNewlineAdded: replacementMeta.trailingAdded,
          byteDelta: replacementMeta.byteDelta,
          targetStyle: replacementMeta.targetStyle
        }
      : null
  };
}

module.exports = {
  computeNewlineStats,
  summarizeNewlineStats,
  resolveTargetNewlineStyle,
  newlineTokenForStyle,
  prepareNormalizedSnippet,
  createNewlineGuard
};
