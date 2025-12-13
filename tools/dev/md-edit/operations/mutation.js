'use strict';

const fs = require('fs');
const path = require('path');
const { findSections, removeSection, replaceSection, parseMarkdown, collectSections } = require('../../lib/markdownAst');
const { writeOutputFile, outputJson, readSource } = require('../shared/io');
const { resolveLanguageContext, translateLabelWithMode } = require('../../i18n/helpers');
const { generateUnifiedDiff } = require('../../shared/unifiedDiff');

function toPosixPath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function makeBatchManifestBase(operation, options) {
  const dirRoot = options?._batch?.dirRoot ? path.resolve(options._batch.dirRoot) : null;
  return {
    success: true,
    operation,
    selector: operation === 'replace-section' ? options.replaceSection : options.removeSection,
    dirRoot,
    mode: options.fix ? 'write' : 'dry-run',
    files: [],
    summary: {
      filesProcessed: 0,
      filesChanged: 0,
      filesWithErrors: 0,
      totalMatches: 0
    },
    meta: {
      tool: 'md-edit',
      version: 1,
      timestamp: new Date().toISOString()
    }
  };
}

function readAndParseMarkdown(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const ast = parseMarkdown(source);
  const sections = collectSections(ast, source);
  return { source, sections };
}

function buildDiffIfRequested(beforeText, afterText, options, label) {
  if (!options.emitDiff) {
    return null;
  }
  const diff = generateUnifiedDiff(beforeText, afterText, {
    contextLines: Number.isFinite(options.diffContext) ? options.diffContext : 3,
    label
  });

  const maxLines = Number.isFinite(options.diffMaxLines) ? options.diffMaxLines : 500;
  const maxChars = Number.isFinite(options.diffMaxChars) ? options.diffMaxChars : 20000;

  return truncateDiff(diff, { maxLines, maxChars });
}

function truncateDiff(diffText, { maxLines, maxChars }) {
  const source = String(diffText || '');
  if (!source) return '';

  const lines = source.split('\n');
  const lineLimited = lines.length > maxLines;
  const linesSlice = lineLimited ? lines.slice(0, maxLines) : lines;

  let candidate = linesSlice.join('\n');
  let charLimited = false;

  if (candidate.length > maxChars) {
    candidate = candidate.slice(0, maxChars);
    charLimited = true;
  }

  if (!lineLimited && !charLimited) {
    return candidate;
  }

  const omittedLines = lineLimited ? (lines.length - maxLines) : 0;
  const noteParts = [];
  if (omittedLines > 0) noteParts.push(`${omittedLines} lines`);
  if (charLimited) noteParts.push('chars');
  const note = `... (diff truncated: omitted ${noteParts.join(', ')})`;

  // Ensure final output ends cleanly.
  if (!candidate.endsWith('\n')) {
    candidate += '\n';
  }
  return `${candidate}${note}`;
}

function computeRemoveResult(source, sections, options, language, fmt) {
  const selector = options.removeSection;
  const matches = findSections(sections, selector);

  if (matches.length === 0) {
    if (options.allowMissing) {
      return {
        ok: true,
        skipped: true,
        skipReason: 'no_match',
        matches: [],
        sectionsToRemove: [],
        afterText: source
      };
    }

    return {
      ok: false,
      code: 'no_match',
      message: language.isChinese
        ? `${translateLabelWithMode(fmt, language, 'section', 'Section')} 未匹配 "${selector}"`
        : `No section found matching "${selector}"`,
      matches: []
    };
  }

  if (matches.length > 1 && !options.allowMultiple) {
    return {
      ok: false,
      code: 'multiple_matches',
      message: language.isChinese
        ? `${translateLabelWithMode(fmt, language, 'section', 'Section')} 多匹 (${matches.length})`
        : `Multiple sections match "${selector}" (${matches.length} found)`,
      matches
    };
  }

  if (options.expectHash) {
    const hashMatch = matches.every((m) => m.hash === options.expectHash);
    if (!hashMatch) {
      return {
        ok: false,
        code: 'hash_mismatch',
        message: language.isChinese ? '哈值不符: 预期与实际不同' : 'Hash mismatch: expected hash does not match section(s)',
        matches
      };
    }
  }

  const sectionsToRemove = options.allowMultiple ? matches.slice() : [matches[0]];
  sectionsToRemove.sort((a, b) => b.startLine - a.startLine);

  let afterText = source;
  sectionsToRemove.forEach((section) => {
    afterText = removeSection(afterText, section);
  });

  return {
    ok: true,
    matches,
    sectionsToRemove,
    afterText
  };
}

function computeReplaceResult(source, sections, options, language, fmt, newContent) {
  const selector = options.replaceSection;
  const matches = findSections(sections, selector);

  if (matches.length === 0) {
    if (options.allowMissing) {
      return {
        ok: true,
        skipped: true,
        skipReason: 'no_match',
        matches: [],
        sectionsToReplace: [],
        afterText: source
      };
    }

    return {
      ok: false,
      code: 'no_match',
      message: language.isChinese
        ? `${translateLabelWithMode(fmt, language, 'section', 'Section')} 未匹配 "${selector}"`
        : `No section found matching "${selector}"`,
      matches: []
    };
  }

  if (matches.length > 1 && !options.allowMultiple) {
    return {
      ok: false,
      code: 'multiple_matches',
      message: language.isChinese
        ? `${translateLabelWithMode(fmt, language, 'section', 'Section')} 多匹 (${matches.length})`
        : `Multiple sections match "${selector}" (${matches.length} found)`,
      matches
    };
  }

  if (options.expectHash) {
    const hashMatch = matches.every((m) => m.hash === options.expectHash);
    if (!hashMatch) {
      return {
        ok: false,
        code: 'hash_mismatch',
        message: language.isChinese ? '哈值不符: 预期与实际不同' : 'Hash mismatch: expected hash does not match section(s)',
        matches
      };
    }
  }

  const sectionsToReplace = options.allowMultiple ? matches.slice() : [matches[0]];
  sectionsToReplace.sort((a, b) => b.startLine - a.startLine);

  let afterText = source;
  sectionsToReplace.forEach((section) => {
    afterText = replaceSection(afterText, section, newContent);
  });

  return {
    ok: true,
    matches,
    sectionsToReplace,
    afterText
  };
}

/**
 * Remove a section from the document
 */
async function removeSectionOperation(source, sections, inputFile, options, fmt) {
  const language = resolveLanguageContext(fmt);
  const { isChinese } = language;
  const selector = options.removeSection;
  const matches = findSections(sections, selector);

  if (matches.length === 0) {
    if (options.allowMissing) {
      fmt.warn(isChinese
        ? `${translateLabelWithMode(fmt, language, 'section', 'Section')} 未匹配 "${selector}" (跳过)`
        : `No section found matching "${selector}" (skipped)`);
      return;
    }

    fmt.error(isChinese
      ? `${translateLabelWithMode(fmt, language, 'section', 'Section')} 未匹配 "${selector}"`
      : `No section found matching "${selector}"`);
    process.exitCode = 1;
    return;
  }

  if (matches.length > 1 && !options.allowMultiple) {
    fmt.error(isChinese
      ? `${translateLabelWithMode(fmt, language, 'section', 'Section')} 多匹 (${matches.length})`
      : `Multiple sections match "${selector}" (${matches.length} found)`);
    fmt.info(isChinese ? '用 --许多 批量移除或更精确' : 'Use --allow-multiple to remove all, or be more specific');
    matches.forEach(m => {
      fmt.info(`  - ${m.heading} (L${m.startLine}, hash: ${m.hash})`);
    });
    process.exitCode = 1;
    return;
  }

  // Hash guard
  if (options.expectHash) {
    const hashMatch = matches.every(m => m.hash === options.expectHash);
    if (!hashMatch) {
      fmt.error(isChinese ? '哈值不符: 预期与实际不同' : 'Hash mismatch: expected hash does not match section(s)');
      process.exitCode = 1;
      return;
    }
  }

  const sectionsToRemove = options.allowMultiple ? matches : [matches[0]];

  // Sort by line number descending to remove from end first
  sectionsToRemove.sort((a, b) => b.startLine - a.startLine);

  let result = source;
  sectionsToRemove.forEach(section => {
    result = removeSection(result, section);
  });

  // Preview or apply
  if (!options.fix) {
    fmt.header(isChinese ? '预览: 待删节' : 'Preview: Section(s) to be removed');
    sectionsToRemove.forEach(section => {
      fmt.warn(`  - ${section.heading} (L${section.startLine}-${section.endLine})`);
    });
    console.log();

    if (options.emitDiff) {
      const diff = buildDiffIfRequested(source, result, options, inputFile);
      if (diff) {
        fmt.section(isChinese ? '差异' : 'Diff');
        console.log(diff);
        console.log();
      }
    }

    fmt.info(isChinese ? '未改写。使用 --改 应用。' : 'No changes made. Use --fix to apply changes.');
    return;
  }

  // Write the result
  try {
    fs.writeFileSync(inputFile, result, 'utf8');
    fmt.success(isChinese
      ? `已删 ${sectionsToRemove.length} 节 自 ${inputFile}`
      : `Removed ${sectionsToRemove.length} section(s) from ${inputFile}`);
    sectionsToRemove.forEach(section => {
      fmt.info(`  ✓ ${section.heading}`);
    });
  } catch (error) {
    fmt.error(isChinese ? `写入失败 ${inputFile}: ${error.message}` : `Failed to write ${inputFile}: ${error.message}`);
    process.exitCode = 1;
  }
}

/**
 * Extract a section to stdout or file
 */
async function extractSectionOperation(source, sections, options, fmt) {
  const language = resolveLanguageContext(fmt);
  const { isChinese } = language;
  const selector = options.extractSection;
  const matches = findSections(sections, selector);

  if (matches.length === 0) {
    fmt.error(isChinese
      ? `${translateLabelWithMode(fmt, language, 'section', 'Section')} 未匹配 "${selector}"`
      : `No section found matching "${selector}"`);
    process.exitCode = 1;
    return;
  }

  if (matches.length > 1 && !options.allowMultiple) {
    fmt.error(isChinese
      ? `${translateLabelWithMode(fmt, language, 'section', 'Section')} 多匹 (${matches.length})`
      : `Multiple sections match "${selector}" (${matches.length} found)`);
    fmt.info(isChinese ? '更精确选择或用 --许多' : 'Specify a unique selector or use --allow-multiple');
    matches.forEach(m => {
      fmt.info(`  - ${m.heading} (L${m.startLine}, hash: ${m.hash})`);
    });
    process.exitCode = 1;
    return;
  }

  const section = matches[0];

  if (options.json) {
    outputJson(section);
    return;
  }

  const content = section.content;

  if (options.output) {
    try {
      writeOutputFile(options.output, content);
      fmt.success(isChinese ? `已写出到 ${options.output}` : `Extracted section to ${options.output}`);
    } catch (error) {
      fmt.error(isChinese ? `写入失败 ${options.output}: ${error.message}` : `Failed to write ${options.output}: ${error.message}`);
      process.exitCode = 1;
    }
  } else {
    console.log(content);
  }
}

/**
 * Replace a section's content
 */
async function replaceSectionOperation(source, sections, inputFile, options, fmt) {
  const language = resolveLanguageContext(fmt);
  const { isChinese } = language;
  const selector = options.replaceSection;
  const matches = findSections(sections, selector);

  if (matches.length === 0) {
    if (options.allowMissing) {
      fmt.warn(isChinese
        ? `${translateLabelWithMode(fmt, language, 'section', 'Section')} 未匹配 "${selector}" (跳过)`
        : `No section found matching "${selector}" (skipped)`);
      return;
    }

    fmt.error(isChinese
      ? `${translateLabelWithMode(fmt, language, 'section', 'Section')} 未匹配 "${selector}"`
      : `No section found matching "${selector}"`);
    process.exitCode = 1;
    return;
  }

  if (matches.length > 1 && !options.allowMultiple) {
    fmt.error(isChinese
      ? `${translateLabelWithMode(fmt, language, 'section', 'Section')} 多匹 (${matches.length})`
      : `Multiple sections match "${selector}" (${matches.length} found)`);
    fmt.info(isChinese ? '用 --许多 全替或更精确' : 'Use --allow-multiple to replace all, or be more specific');
    matches.forEach(m => {
      fmt.info(`  - ${m.heading} (L${m.startLine}, hash: ${m.hash})`);
    });
    process.exitCode = 1;
    return;
  }

  // Hash guard
  if (options.expectHash) {
    const hashMatch = matches.every(m => m.hash === options.expectHash);
    if (!hashMatch) {
      fmt.error(isChinese ? '哈值不符: 预期与实际不同' : 'Hash mismatch: expected hash does not match section(s)');
      process.exitCode = 1;
      return;
    }
  }

  // Get replacement content
  let newContent;
  if (options.withFile) {
    try {
      newContent = readSource(options.withFile);
    } catch (error) {
      fmt.error(isChinese ? `读取失败 ${options.withFile}: ${error.message}` : `Failed to read ${options.withFile}: ${error.message}`);
      process.exitCode = 1;
      return;
    }
  } else {
    newContent = options.with || '';
  }

  const sectionsToReplace = options.allowMultiple ? matches : [matches[0]];

  // Compute candidate result once so we can show diffs in dry-run.
  const sortedToReplace = sectionsToReplace.slice().sort((a, b) => b.startLine - a.startLine);
  let candidateResult = source;
  sortedToReplace.forEach((section) => {
    candidateResult = replaceSection(candidateResult, section, newContent);
  });

  // Preview or apply
  if (!options.fix) {
    fmt.header(isChinese ? '预览: 待替节' : 'Preview: Section(s) to be replaced');
    sectionsToReplace.forEach(section => {
      fmt.warn(`  - ${section.heading} (L${section.startLine}-${section.endLine})`);
      const lineLabel = translateLabelWithMode(fmt, language, 'lines', 'lines');
      fmt.info(`    ${isChinese ? '旧' : 'Old'} ${lineLabel}: ${section.lineCount}`);
      fmt.info(`    ${isChinese ? '新' : 'New'} ${lineLabel}: ${newContent.split('\n').length}`);
    });
    console.log();

    if (options.emitDiff) {
      const diff = buildDiffIfRequested(source, candidateResult, options, inputFile);
      if (diff) {
        fmt.section(isChinese ? '差异' : 'Diff');
        console.log(diff);
        console.log();
      }
    }

    fmt.info(isChinese ? '未改写。使用 --改 应用。' : 'No changes made. Use --fix to apply changes.');
    return;
  }

  const result = candidateResult;

  // Write the result
  try {
    fs.writeFileSync(inputFile, result, 'utf8');
    fmt.success(isChinese
      ? `已替 ${sectionsToReplace.length} 节 于 ${inputFile}`
      : `Replaced ${sectionsToReplace.length} section(s) in ${inputFile}`);
    sectionsToReplace.forEach(section => {
      fmt.info(`  ✓ ${section.heading}`);
    });
  } catch (error) {
    fmt.error(isChinese ? `写入失败 ${inputFile}: ${error.message}` : `Failed to write ${inputFile}: ${error.message}`);
    process.exitCode = 1;
  }
}

async function removeSectionBatchOperation(filePaths, options, fmt) {
  const language = resolveLanguageContext(fmt);
  const manifest = makeBatchManifestBase('remove-section', { ...options, _batch: options._batch });

  const maxDiffsToPrint = Number.isFinite(options.maxDiffs) ? options.maxDiffs : 10;
  let diffsPrinted = 0;

  for (const filePath of filePaths) {
    const absolutePath = path.resolve(filePath);
    const relToRoot = manifest.dirRoot ? toPosixPath(path.relative(manifest.dirRoot, absolutePath)) : toPosixPath(path.relative(process.cwd(), absolutePath));

    manifest.summary.filesProcessed += 1;

    let source;
    let sections;
    try {
      ({ source, sections } = readAndParseMarkdown(absolutePath));
    } catch (error) {
      manifest.summary.filesWithErrors += 1;
      manifest.files.push({
        file: toPosixPath(path.relative(process.cwd(), absolutePath)),
        relativeToRoot: relToRoot,
        ok: false,
        changed: false,
        error: { code: 'parse_error', message: error.message || String(error) }
      });
      continue;
    }

    const computed = computeRemoveResult(source, sections, options, language, fmt);
    manifest.summary.totalMatches += computed.matches ? computed.matches.length : 0;

    if (!computed.ok) {
      manifest.summary.filesWithErrors += 1;
      manifest.files.push({
        file: toPosixPath(path.relative(process.cwd(), absolutePath)),
        relativeToRoot: relToRoot,
        ok: false,
        changed: false,
        error: { code: computed.code, message: computed.message },
        matches: (computed.matches || []).map((m) => ({ heading: m.heading, startLine: m.startLine, endLine: m.endLine, hash: m.hash }))
      });
      continue;
    }

    const diff = buildDiffIfRequested(source, computed.afterText, options, toPosixPath(path.relative(process.cwd(), absolutePath)));
    const changed = computed.afterText !== source;
    if (changed) {
      manifest.summary.filesChanged += 1;
    }

    if (options.fix) {
      try {
        fs.writeFileSync(absolutePath, computed.afterText, 'utf8');
      } catch (error) {
        manifest.summary.filesWithErrors += 1;
        manifest.files.push({
          file: toPosixPath(path.relative(process.cwd(), absolutePath)),
          relativeToRoot: relToRoot,
          ok: false,
          changed: false,
          error: { code: 'write_error', message: error.message || String(error) }
        });
        continue;
      }
    }

    manifest.files.push({
      file: toPosixPath(path.relative(process.cwd(), absolutePath)),
      relativeToRoot: relToRoot,
      ok: true,
      changed,
      skipped: computed.skipped === true,
      skipReason: computed.skipReason || null,
      removedCount: computed.sectionsToRemove.length,
      matches: computed.sectionsToRemove.map((m) => ({ heading: m.heading, startLine: m.startLine, endLine: m.endLine, hash: m.hash })),
      diff
    });
  }

  if (options.emitManifest) {
    writeOutputFile(options.emitManifest, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  if (options.json) {
    outputJson(manifest);
  } else {
    fmt.header(options.fix ? 'Batch remove (applied)' : 'Batch remove (preview)');
    fmt.stat('Files', manifest.summary.filesProcessed, 'number');
    fmt.stat('Changed', manifest.summary.filesChanged, 'number');
    fmt.stat('Errors', manifest.summary.filesWithErrors, 'number');
    fmt.section('Results');
    for (const item of manifest.files) {
      if (item.ok) {
        fmt.success(`${item.file}${item.changed ? '' : ' (no-op)'}`);
      } else {
        fmt.error(`${item.file}: ${item.error?.code || 'error'} ${item.error?.message || ''}`.trim());
      }
      if (
        item.diff &&
        options.emitDiff &&
        (options.verbose || filePaths.length <= 3) &&
        diffsPrinted < maxDiffsToPrint
      ) {
        console.log(item.diff);
        console.log();
        diffsPrinted += 1;
      }
    }

    const diffCandidates = manifest.files.filter((item) => item && item.diff).length;
    const omitted = Math.max(0, diffCandidates - diffsPrinted);
    if (options.emitDiff && omitted > 0) {
      fmt.info(`Diff output capped by --max-diffs: omitted ${omitted} diff(s)`);
    }
  }

  if (manifest.summary.filesWithErrors > 0) {
    process.exitCode = 1;
  }
}

async function replaceSectionBatchOperation(filePaths, options, fmt) {
  const language = resolveLanguageContext(fmt);
  const manifest = makeBatchManifestBase('replace-section', { ...options, _batch: options._batch });

  const maxDiffsToPrint = Number.isFinite(options.maxDiffs) ? options.maxDiffs : 10;
  let diffsPrinted = 0;

  let newContent;
  if (options.withFile) {
    try {
      newContent = readSource(options.withFile);
    } catch (error) {
      fmt.error(`Failed to read ${options.withFile}: ${error.message}`);
      process.exitCode = 1;
      return;
    }
  } else {
    newContent = options.with || '';
  }

  for (const filePath of filePaths) {
    const absolutePath = path.resolve(filePath);
    const relToRoot = manifest.dirRoot ? toPosixPath(path.relative(manifest.dirRoot, absolutePath)) : toPosixPath(path.relative(process.cwd(), absolutePath));

    manifest.summary.filesProcessed += 1;

    let source;
    let sections;
    try {
      ({ source, sections } = readAndParseMarkdown(absolutePath));
    } catch (error) {
      manifest.summary.filesWithErrors += 1;
      manifest.files.push({
        file: toPosixPath(path.relative(process.cwd(), absolutePath)),
        relativeToRoot: relToRoot,
        ok: false,
        changed: false,
        error: { code: 'parse_error', message: error.message || String(error) }
      });
      continue;
    }

    const computed = computeReplaceResult(source, sections, options, language, fmt, newContent);
    manifest.summary.totalMatches += computed.matches ? computed.matches.length : 0;

    if (!computed.ok) {
      manifest.summary.filesWithErrors += 1;
      manifest.files.push({
        file: toPosixPath(path.relative(process.cwd(), absolutePath)),
        relativeToRoot: relToRoot,
        ok: false,
        changed: false,
        error: { code: computed.code, message: computed.message },
        matches: (computed.matches || []).map((m) => ({ heading: m.heading, startLine: m.startLine, endLine: m.endLine, hash: m.hash }))
      });
      continue;
    }

    const diff = buildDiffIfRequested(source, computed.afterText, options, toPosixPath(path.relative(process.cwd(), absolutePath)));
    const changed = computed.afterText !== source;
    if (changed) {
      manifest.summary.filesChanged += 1;
    }

    if (options.fix) {
      try {
        fs.writeFileSync(absolutePath, computed.afterText, 'utf8');
      } catch (error) {
        manifest.summary.filesWithErrors += 1;
        manifest.files.push({
          file: toPosixPath(path.relative(process.cwd(), absolutePath)),
          relativeToRoot: relToRoot,
          ok: false,
          changed: false,
          error: { code: 'write_error', message: error.message || String(error) }
        });
        continue;
      }
    }

    manifest.files.push({
      file: toPosixPath(path.relative(process.cwd(), absolutePath)),
      relativeToRoot: relToRoot,
      ok: true,
      changed,
      skipped: computed.skipped === true,
      skipReason: computed.skipReason || null,
      replacedCount: computed.sectionsToReplace.length,
      matches: computed.sectionsToReplace.map((m) => ({ heading: m.heading, startLine: m.startLine, endLine: m.endLine, hash: m.hash })),
      diff
    });
  }

  if (options.emitManifest) {
    writeOutputFile(options.emitManifest, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  if (options.json) {
    outputJson(manifest);
  } else {
    fmt.header(options.fix ? 'Batch replace (applied)' : 'Batch replace (preview)');
    fmt.stat('Files', manifest.summary.filesProcessed, 'number');
    fmt.stat('Changed', manifest.summary.filesChanged, 'number');
    fmt.stat('Errors', manifest.summary.filesWithErrors, 'number');
    fmt.section('Results');
    for (const item of manifest.files) {
      if (item.ok) {
        fmt.success(`${item.file}${item.changed ? '' : ' (no-op)'}`);
      } else {
        fmt.error(`${item.file}: ${item.error?.code || 'error'} ${item.error?.message || ''}`.trim());
      }
      if (
        item.diff &&
        options.emitDiff &&
        (options.verbose || filePaths.length <= 3) &&
        diffsPrinted < maxDiffsToPrint
      ) {
        console.log(item.diff);
        console.log();
        diffsPrinted += 1;
      }
    }

    const diffCandidates = manifest.files.filter((item) => item && item.diff).length;
    const omitted = Math.max(0, diffCandidates - diffsPrinted);
    if (options.emitDiff && omitted > 0) {
      fmt.info(`Diff output capped by --max-diffs: omitted ${omitted} diff(s)`);
    }
  }

  if (manifest.summary.filesWithErrors > 0) {
    process.exitCode = 1;
  }
}

module.exports = {
  removeSection: removeSectionOperation,
  extractSection: extractSectionOperation,
  replaceSection: replaceSectionOperation,
  removeSectionBatch: removeSectionBatchOperation,
  replaceSectionBatch: replaceSectionBatchOperation
};
