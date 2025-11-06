'use strict';

const { findSections } = require('../../lib/markdownAst');
const { writeOutputFile, outputJson } = require('../shared/io');
const { resolveLanguageContext, translateLabelWithMode, joinTranslatedLabels } = require('../../i18n/helpers');

/**
 * Show a specific section with optional context
 */
function showSection(source, sections, options, fmt) {
  const language = resolveLanguageContext(fmt);
  const { isChinese } = language;
  const selector = options.showSection;
  const matches = findSections(sections, selector);

  if (matches.length === 0) {
    const message = isChinese
      ? `${translateLabelWithMode(fmt, language, 'section', 'Section')} 未匹配 "${selector}"`
      : `No section found matching "${selector}"`;
    fmt.error(message);
    process.exitCode = 1;
    return;
  }

  if (matches.length > 1 && !options.allowMultiple) {
    const errorMessage = isChinese
      ? `${translateLabelWithMode(fmt, language, 'section', 'Section')} 多匹 (${matches.length})`
      : `Multiple sections match "${selector}" (${matches.length} found)`;
    fmt.error(errorMessage);
    fmt.info(isChinese ? '用 --许多 展示全部，或缩小范围' : 'Use --allow-multiple to show all, or be more specific');
    matches.forEach(m => {
      const lineLabel = isChinese ? `${translateLabelWithMode(fmt, language, 'lines', 'lines')}:${m.startLine}` : `L${m.startLine}`;
      fmt.info(`  - ${m.heading} (${lineLabel}, hash: ${m.hash})`);
    });
    process.exitCode = 1;
    return;
  }

  const sectionsToShow = options.allowMultiple ? matches : [matches[0]];

  if (options.json) {
    outputJson({ sections: sectionsToShow });
    return;
  }

  sectionsToShow.forEach((section, idx) => {
    if (idx > 0) console.log('\n' + '='.repeat(60) + '\n');

    const headerLabel = joinTranslatedLabels(fmt, language, [
      { key: 'section', fallback: 'Section' },
      { key: 'context', fallback: 'Context' }
    ]);
    fmt.header(`${headerLabel}: ${section.heading}`);
    const lineLabel = translateLabelWithMode(fmt, language, 'lines', 'Lines');
    fmt.info(`Level: H${section.level}, ${lineLabel}: ${section.startLine}-${section.endLine}, Hash: ${section.hash}`);
    console.log();

    // Show with neighbors if requested
    if (options.withNeighbors) {
      showSectionWithNeighbors(source, sections, section, fmt, language);
    } else {
      showSectionContent(source, section, options, fmt, language);
    }
  });
}

/**
 * Show section content with optional context lines
 */
function showSectionContent(source, section, options, fmt, language = resolveLanguageContext(fmt)) {
  const lines = source.split('\n');
  const contextLines = options.contextLines || 0;

  const startIdx = Math.max(0, section.startLine - contextLines);
  const endIdx = Math.min(lines.length, section.endLine + contextLines);

  for (let i = startIdx; i < endIdx; i++) {
    const lineNum = i + 1;
    const inSection = i >= section.startLine && i < section.endLine;
    const prefix = inSection ? '│ ' : '┊ ';
    const lineNumStr = String(lineNum).padStart(4, ' ');
    
    console.log(`${prefix}${lineNumStr} ${lines[i]}`);
  }
}

/**
 * Show section with previous and next sibling sections
 */
function showSectionWithNeighbors(source, sections, targetSection, fmt, language = resolveLanguageContext(fmt)) {
  const { isChinese } = language;
  const idx = sections.findIndex(s => s.hash === targetSection.hash);
  
  const prevSection = idx > 0 ? sections[idx - 1] : null;
  const nextSection = idx < sections.length - 1 ? sections[idx + 1] : null;

  if (prevSection) {
    console.log(isChinese ? '┌─ 上节 ─────────────────────' : '┌─ Previous section ─────────────────────');
    console.log(`│  ${prevSection.heading}`);
    console.log('└────────────────────────────────────────');
    console.log();
  }

  console.log(isChinese ? '┌─ 当前节 ───────────────────────' : '┌─ Target section ───────────────────────');
  console.log(`│  ${targetSection.heading}`);
  console.log('├────────────────────────────────────────');
  const lines = source.split('\n').slice(targetSection.startLine, targetSection.endLine);
  lines.forEach((line, i) => {
    const lineNum = targetSection.startLine + i + 1;
    console.log(`│ ${String(lineNum).padStart(4, ' ')} ${line}`);
  });
  console.log('└────────────────────────────────────────');
  console.log();

  if (nextSection) {
    console.log(isChinese ? '┌─ 下节 ─────────────────────────' : '┌─ Next section ─────────────────────────');
    console.log(`│  ${nextSection.heading}`);
    console.log('└────────────────────────────────────────');
  }
}

/**
 * Emit a plan file with section metadata
 */
function emitPlan(sections, options, fmt) {
  const language = resolveLanguageContext(fmt);
  const { isChinese } = language;
  const planPath = options.emitPlan;

  const plan = {
    metadata: {
      timestamp: new Date().toISOString(),
      totalSections: sections.length
    },
    sections: sections.map(s => ({
      heading: s.heading,
      level: s.level,
      slug: s.slug,
      hash: s.hash,
      startLine: s.startLine,
      endLine: s.endLine,
      lineCount: s.lineCount
    }))
  };

  try {
    writeOutputFile(planPath, JSON.stringify(plan, null, 2));
    fmt.success(isChinese ? `已写 ${planPath}` : `Plan emitted to ${planPath}`);
  } catch (error) {
    const message = isChinese ? `写入失败: ${error.message}` : `Failed to write plan: ${error.message}`;
    fmt.error(message);
    process.exitCode = 1;
  }
}

module.exports = {
  showSection,
  showSectionWithNeighbors,
  showSectionContent,
  emitPlan
};
