'use strict';

const { findSections } = require('../../lib/markdownAst');
const { writeOutputFile, outputJson } = require('../shared/io');

/**
 * Show a specific section with optional context
 */
function showSection(source, sections, options, fmt) {
  const selector = options.showSection;
  const matches = findSections(sections, selector);

  if (matches.length === 0) {
    fmt.error(`No section found matching "${selector}"`);
    process.exitCode = 1;
    return;
  }

  if (matches.length > 1 && !options.allowMultiple) {
    fmt.error(`Multiple sections match "${selector}" (${matches.length} found)`);
    fmt.info('Use --allow-multiple to show all, or be more specific');
    matches.forEach(m => {
      fmt.info(`  - ${m.heading} (L${m.startLine}, hash: ${m.hash})`);
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

    fmt.header(`Section: ${section.heading}`);
    fmt.info(`Level: H${section.level}, Lines: ${section.startLine}-${section.endLine}, Hash: ${section.hash}`);
    console.log();

    // Show with neighbors if requested
    if (options.withNeighbors) {
      showSectionWithNeighbors(source, sections, section, fmt);
    } else {
      showSectionContent(source, section, options, fmt);
    }
  });
}

/**
 * Show section content with optional context lines
 */
function showSectionContent(source, section, options, fmt) {
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
function showSectionWithNeighbors(source, sections, targetSection, fmt) {
  const idx = sections.findIndex(s => s.hash === targetSection.hash);
  
  const prevSection = idx > 0 ? sections[idx - 1] : null;
  const nextSection = idx < sections.length - 1 ? sections[idx + 1] : null;

  if (prevSection) {
    console.log('┌─ Previous section ─────────────────────');
    console.log(`│  ${prevSection.heading}`);
    console.log('└────────────────────────────────────────');
    console.log();
  }

  console.log('┌─ Target section ───────────────────────');
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
    console.log('┌─ Next section ─────────────────────────');
    console.log(`│  ${nextSection.heading}`);
    console.log('└────────────────────────────────────────');
  }
}

/**
 * Emit a plan file with section metadata
 */
function emitPlan(sections, options, fmt) {
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
    fmt.success(`Plan emitted to ${planPath}`);
  } catch (error) {
    fmt.error(`Failed to write plan: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  showSection,
  showSectionWithNeighbors,
  showSectionContent,
  emitPlan
};
