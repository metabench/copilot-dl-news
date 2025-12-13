#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const { setupPowerShellEncoding } = require('./shared/powershellEncoding');
setupPowerShellEncoding();

const { CliArgumentParser } = require('../../src/utils/CliArgumentParser');
const { CliFormatter } = require('../../src/utils/CliFormatter');
const { validateAgents } = require('./agent-validate');

const fmt = new CliFormatter();

const DEFAULT_AGENT_DIR = path.join('.github', 'agents');
const DEFAULT_LIMIT = 50;

function listAgentFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return fs
    .readdirSync(dirPath)
    .filter((name) => name.toLowerCase().endsWith('.agent.md'))
    .map((name) => path.join(dirPath, name));
}

function getAgentNameFromFile(filePath) {
  return path.basename(filePath).replace(/\.agent\.md$/i, '');
}

function stripFrontmatter(source) {
  const text = String(source || '').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/);

  const firstNonEmptyIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstNonEmptyIndex === -1) return { stripped: text, frontmatterEndLine: 0 };

  if (lines[firstNonEmptyIndex].trim() !== '---') {
    return { stripped: text, frontmatterEndLine: 0 };
  }

  const endIndexRelative = lines
    .slice(firstNonEmptyIndex + 1)
    .findIndex((line) => line.trim() === '---');

  if (endIndexRelative === -1) {
    return { stripped: text, frontmatterEndLine: 0 };
  }

  const endIndex = firstNonEmptyIndex + 1 + endIndexRelative;
  const remainingLines = lines.slice(endIndex + 1);

  return {
    stripped: remainingLines.join('\n'),
    frontmatterEndLine: endIndex + 1
  };
}

function* iterMarkdownLinesSkippingCodeFences(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      inFence = !inFence;
      continue;
    }

    if (inFence) continue;
    yield { lineNumber: i + 1, line };
  }
}

function extractMarkdownLinks(line) {
  // Basic markdown links: [text](target)
  // Ignores images: ![alt](target)
  const results = [];
  const regex = /(^|[^!])\[[^\]]*\]\(([^)\s]+)\)/g;

  let match;
  while ((match = regex.exec(line)) !== null) {
    const fullMatch = match[0];
    const target = match[2];

    // Compute start index of the captured target for column display.
    const beforeTarget = fullMatch.slice(0, fullMatch.lastIndexOf('(') + 1);
    const targetStartColumn = match.index + beforeTarget.length;

    results.push({
      target,
      column: targetStartColumn + 1
    });
  }

  return results;
}

function normalizeLinkTarget(rawTarget) {
  const target = String(rawTarget || '').trim().replace(/^<|>$/g, '');
  if (!target) return null;

  if (target.startsWith('#')) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(target)) return null; // http:, https:, mailto:, etc.

  const withoutAnchor = target.split('#')[0].trim();
  if (!withoutAnchor) return null;

  return withoutAnchor;
}

function resolveLinkPath({ agentFilePath, linkTarget }) {
  if (linkTarget.startsWith('/')) {
    return path.resolve(process.cwd(), linkTarget.slice(1));
  }

  return path.resolve(path.dirname(agentFilePath), linkTarget);
}

function checkLinksInAgentMarkdown({ source, agentFilePath, relativePath, options }) {
  const { stripped, frontmatterEndLine } = stripFrontmatter(source);

  const warnings = [];

  for (const { lineNumber, line } of iterMarkdownLinesSkippingCodeFences(stripped)) {
    const links = extractMarkdownLinks(line);
    if (links.length === 0) continue;

    for (const link of links) {
      const normalized = normalizeLinkTarget(link.target);
      if (!normalized) continue;

      const resolved = resolveLinkPath({ agentFilePath, linkTarget: normalized });
      if (!fs.existsSync(resolved)) {
        warnings.push({
          level: 'warning',
          code: 'broken_link',
          message: `Broken markdown link target: "${normalized}"`,
          details: {
            target: normalized,
            resolvedPath: path.relative(process.cwd(), resolved)
          },
          location: {
            file: relativePath,
            line: frontmatterEndLine + lineNumber,
            column: link.column
          }
        });
      }
    }
  }

  if (options?.includeTextLinks) {
    // Optional: bare URLs are intentionally not validated (agents may paste references).
  }

  return warnings;
}

function searchAgentFiles({ agentDir, terms, options }) {
  const files = listAgentFiles(agentDir);
  const normalizedTerms = (Array.isArray(terms) ? terms : [])
    .map((term) => String(term || '').trim())
    .filter(Boolean);

  const limit = Number(options.limit || DEFAULT_LIMIT);
  const caseSensitive = options.caseSensitive === true;
  const requireAll = options.matchAll === true;

  const matches = [];
  let filesMatched = 0;

  for (const filePath of files) {
    const source = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(process.cwd(), filePath);
    const agentName = getAgentNameFromFile(filePath);

    const haystack = caseSensitive ? source : source.toLowerCase();
    const needles = caseSensitive ? normalizedTerms : normalizedTerms.map((t) => t.toLowerCase());

    if (needles.length === 0) continue;

    if (requireAll) {
      const hasAll = needles.every((needle) => haystack.includes(needle));
      if (!hasAll) continue;
    } else {
      const hasAny = needles.some((needle) => haystack.includes(needle));
      if (!hasAny) continue;
    }

    filesMatched += 1;

    const lines = source.split(/\r?\n/);

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const lineHaystack = caseSensitive ? line : line.toLowerCase();

      for (let t = 0; t < needles.length; t++) {
        const needle = needles[t];
        const originalTerm = normalizedTerms[t];
        const column = lineHaystack.indexOf(needle);
        if (column === -1) continue;

        matches.push({
          agentName,
          relativePath,
          term: originalTerm,
          location: {
            line: lineIndex + 1,
            column: column + 1
          },
          preview: line.trim()
        });

        if (matches.length >= limit) {
          return {
            success: true,
            agentDir,
            summary: {
              filesScanned: files.length,
              filesMatched,
              matchCount: matches.length,
              limit
            },
            matches
          };
        }
      }
    }
  }

  return {
    success: true,
    agentDir,
    summary: {
      filesScanned: files.length,
      filesMatched,
      matchCount: matches.length,
      limit
    },
    matches
  };
}

function runMdEditReplaceSection({ agentDir, replaceSection, withFile, includePath, excludePath, json, fix }) {
  const args = [
    path.join('tools', 'dev', 'md-edit.js'),
    '--dir',
    agentDir,
    '--include-path',
    includePath || '.agent.md',
    '--replace-section',
    replaceSection,
    '--with-file',
    withFile,
    '--allow-missing',
    '--emit-diff'
  ];

  if (excludePath) {
    args.push('--exclude-path', excludePath);
  }

  if (json) {
    args.push('--json');
  }

  if (fix) {
    args.push('--fix');
  }

  const result = childProcess.spawnSync(process.execPath, args, {
    stdio: 'inherit'
  });

  return {
    ok: result.status === 0,
    status: result.status ?? 2
  };
}

function printHelp(parser) {
  const program = parser.getProgram();
  if (program && typeof program.helpInformation === 'function') {
    console.log(program.helpInformation());
  }
}

function createCliParser() {
  const parser = new CliArgumentParser(
    'agent-files',
    'Understand, validate, search, and safely edit .github/agents/*.agent.md'
  );

  const program = parser.getProgram();
  if (program && typeof program.helpOption === 'function') {
    program.helpOption(false);
  }
  if (program && typeof program.addHelpCommand === 'function') {
    program.addHelpCommand(false);
  }

  parser
    .add('--help', 'Show this help message', false, 'boolean')
    .add('--dir <path>', 'Agents directory', DEFAULT_AGENT_DIR)
    .add('--json', 'Output as JSON', false, 'boolean')
    .add('--verbose', 'Verbose output', false, 'boolean')

    // Operations
    .add('--list', 'List agent files', false, 'boolean')
    .add('--validate', 'Validate agent YAML frontmatter', false, 'boolean')
    .add('--check-handoffs', 'Validate that handoff agent targets exist', false, 'boolean')
    .add('--check-links', 'Check markdown link targets for local file existence', false, 'boolean')
    .add('--strict', 'Treat warnings as failures (exit code 1)', false, 'boolean')

    .add('--search <terms...>', 'Search agent files for terms (OR by default)')
    .add('--match-all', 'Search: require all terms to match per file', false, 'boolean')
    .add('--case-sensitive', 'Search: case sensitive', false, 'boolean')
    .add('--limit <n>', 'Search: maximum results', DEFAULT_LIMIT, 'number')

    // Safe edit wrapper (proxy to md-edit)
    .add('--replace-section <selector>', 'Batch: replace a markdown section via md-edit')
    .add('--with-file <path>', 'Batch: replacement content file (for --replace-section)')
    .add('--include-path <pattern>', 'Batch: include only files whose relative path contains this substring (comma-separated)')
    .add('--exclude-path <pattern>', 'Batch: exclude files whose relative path contains this substring (comma-separated)')
    .add('--fix', 'Write changes to files (default is dry-run preview)', false, 'boolean');

  return parser;
}

function validateOptions(options) {
  const errors = [];

  const opSearch = Array.isArray(options.search) && options.search.length > 0;
  const opReplace = Boolean(options.replaceSection);
  const opList = options.list === true;
  const opValidate = options.validate === true;

  const opCount = [opSearch, opReplace, opList, opValidate].filter(Boolean).length;
  if (opCount === 0 && !options.help) {
    errors.push('Select an operation: --list, --validate, --search, or --replace-section');
  }

  if (opCount > 1) {
    errors.push('Cannot combine multiple operations');
  }

  if (opReplace && !options.withFile) {
    errors.push('--replace-section requires --with-file');
  }

  if (options.fix && !opReplace) {
    errors.push('--fix is only supported with --replace-section (via md-edit)');
  }

  if (options.checkLinks && !opValidate) {
    errors.push('--check-links is only supported with --validate');
  }

  if (options.checkHandoffs && !opValidate) {
    errors.push('--check-handoffs is only supported with --validate');
  }

  if (options.strict && !opValidate) {
    errors.push('--strict is only supported with --validate');
  }

  return errors;
}

async function runCli() {
  const parser = createCliParser();
  const options = parser.parse(process.argv);

  if (options.help) {
    printHelp(parser);
    process.exit(0);
  }

  const agentDir = path.resolve(options.dir || DEFAULT_AGENT_DIR);

  const errors = validateOptions(options);
  if (errors.length > 0) {
    if (options.json) {
      console.log(
        JSON.stringify(
          {
            success: false,
            error: {
              message: 'Invalid options',
              details: errors
            },
            meta: {
              tool: 'agent-files',
              version: '1.0.0',
              timestamp: new Date().toISOString()
            }
          },
          null,
          2
        )
      );
    } else {
      fmt.header('agent-files');
      fmt.error('Invalid options');
      errors.forEach((error) => fmt.error(`- ${error}`));
      fmt.blank();
      fmt.info('Run with --help for usage.');
    }
    process.exit(2);
  }

  if (options.list) {
    const files = listAgentFiles(agentDir);
    const agents = files
      .map((filePath) => ({
        agentName: getAgentNameFromFile(filePath),
        relativePath: path.relative(process.cwd(), filePath)
      }))
      .sort((a, b) => a.agentName.localeCompare(b.agentName));

    const result = {
      success: true,
      agentDir,
      summary: {
        agentCount: agents.length
      },
      agents,
      meta: {
        tool: 'agent-files',
        version: '1.0.0',
        timestamp: new Date().toISOString()
      }
    };

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    fmt.header('Agent Files');
    fmt.keyValue('Directory', path.relative(process.cwd(), agentDir));
    fmt.keyValue('Agents', String(agents.length));
    fmt.blank();
    agents.forEach((agent) => {
      console.log(`${fmt.COLORS.cyan(agent.agentName)}  ${fmt.COLORS.muted(agent.relativePath)}`);
    });

    return;
  }

  if (Array.isArray(options.search) && options.search.length > 0) {
    const result = searchAgentFiles({
      agentDir,
      terms: options.search,
      options: {
        limit: options.limit,
        caseSensitive: options.caseSensitive,
        matchAll: options.matchAll
      }
    });

    result.meta = {
      tool: 'agent-files',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    };

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    fmt.header('Agent Search');
    fmt.keyValue('Directory', path.relative(process.cwd(), agentDir));
    fmt.keyValue('Terms', options.search.join(', '));
    fmt.keyValue('Files matched', String(result.summary.filesMatched));
    fmt.keyValue('Matches', String(result.summary.matchCount));
    fmt.blank();

    for (const match of result.matches) {
      console.log(
        `${fmt.COLORS.cyan(match.agentName)} ${fmt.COLORS.muted(match.relativePath)}:${match.location.line}:${match.location.column} ${fmt.COLORS.accent(match.term)} ${fmt.COLORS.muted(match.preview)}`
      );
    }

    return;
  }

  if (options.replaceSection) {
    const proxy = runMdEditReplaceSection({
      agentDir,
      replaceSection: options.replaceSection,
      withFile: options.withFile,
      includePath: options.includePath,
      excludePath: options.excludePath,
      json: options.json,
      fix: options.fix
    });

    process.exitCode = proxy.status;
    return;
  }

  if (options.validate) {
    const validateResult = validateAgents({
      agentDir,
      options: { checkHandoffAgents: options.checkHandoffs === true }
    });

    const enrichedFiles = validateResult.files.map((file) => {
      const absFile = path.resolve(process.cwd(), file.relativePath);
      const source = fs.readFileSync(absFile, 'utf8');

      const linkWarnings = options.checkLinks
        ? checkLinksInAgentMarkdown({
          source,
          agentFilePath: absFile,
          relativePath: file.relativePath,
          options
        })
        : [];

      return {
        ...file,
        warnings: [...(file.warnings || []), ...linkWarnings]
      };
    });

    const warningCount = enrichedFiles.reduce((sum, file) => sum + (file.warnings || []).length, 0);
    const errorCount = enrichedFiles.reduce((sum, file) => sum + (file.issues || []).length, 0);

    const result = {
      success: errorCount === 0 && (!options.strict || warningCount === 0),
      agentDir: validateResult.agentDir,
      filesScanned: validateResult.filesScanned,
      errorCount,
      warningCount,
      files: enrichedFiles,
      meta: {
        tool: 'agent-files',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        flags: {
          checkHandoffs: options.checkHandoffs === true,
          checkLinks: options.checkLinks === true,
          strict: options.strict === true
        }
      }
    };

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      fmt.header('Agent Validation');
      fmt.keyValue('Directory', path.relative(process.cwd(), agentDir));
      fmt.keyValue('Files scanned', String(validateResult.filesScanned));
      fmt.keyValue('Errors', String(errorCount));
      fmt.keyValue('Warnings', String(warningCount));

      const filesWithErrors = enrichedFiles.filter((f) => (f.issues || []).length > 0);
      const filesWithWarnings = enrichedFiles.filter((f) => (f.warnings || []).length > 0);

      if (filesWithErrors.length > 0) {
        fmt.section('Errors');
        for (const file of filesWithErrors) {
          fmt.error(`${file.relativePath}`);
          for (const issue of file.issues) {
            fmt.error(`- ${issue.code}: ${issue.message}`);
          }
        }
      }

      if (filesWithWarnings.length > 0) {
        fmt.section('Warnings');
        for (const file of filesWithWarnings) {
          fmt.warn(`${file.relativePath}`);
          for (const warning of file.warnings) {
            fmt.warn(`- ${warning.code}: ${warning.message}`);
          }
        }
      }

      if (result.success) {
        fmt.success('Agent validation passed.');
      } else {
        fmt.error('Agent validation failed.');
        if (options.strict && warningCount > 0 && errorCount === 0) {
          fmt.warn('Strict mode is enabled: warnings are treated as failures.');
        }
      }
    }

    if (!result.success) {
      process.exitCode = 1;
    }

    return;
  }
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}

module.exports = {
  listAgentFiles,
  getAgentNameFromFile,
  stripFrontmatter,
  extractMarkdownLinks,
  normalizeLinkTarget,
  checkLinksInAgentMarkdown,
  searchAgentFiles,
  resolveLinkPath
};
