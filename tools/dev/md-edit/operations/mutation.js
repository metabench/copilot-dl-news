'use strict';

const fs = require('fs');
const { findSections, removeSection, replaceSection } = require('../../lib/markdownAst');
const { writeOutputFile, outputJson, readSource } = require('../shared/io');
const { resolveLanguageContext, translateLabelWithMode } = require('../../i18n/helpers');

/**
 * Remove a section from the document
 */
async function removeSectionOperation(source, sections, inputFile, options, fmt) {
  const language = resolveLanguageContext(fmt);
  const { isChinese } = language;
  const selector = options.removeSection;
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
    fmt.info(isChinese ? '未改写。使用 --改 应用。' : 'No changes made. Use --fix to apply changes.');
    return;
  }

  // Apply replacements (sort descending to avoid line number shifts)
  sectionsToReplace.sort((a, b) => b.startLine - a.startLine);

  let result = source;
  sectionsToReplace.forEach(section => {
    result = replaceSection(result, section, newContent);
  });

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

module.exports = {
  removeSection: removeSectionOperation,
  extractSection: extractSectionOperation,
  replaceSection: replaceSectionOperation
};
