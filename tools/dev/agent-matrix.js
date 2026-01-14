#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const { CliArgumentParser } = require('../../src/shared/utils/CliArgumentParser');
const { CliFormatter } = require('../../src/shared/utils/CliFormatter');
const { findFrontmatter } = require('./agent-validate');

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

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function splitCsv(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function includesAll(haystack, needles) {
  if (!needles || needles.length === 0) return true;
  const set = new Set(Array.isArray(haystack) ? haystack : []);
  return needles.every((n) => set.has(n));
}

function includesAny(haystack, needles) {
  if (!needles || needles.length === 0) return true;
  const set = new Set(Array.isArray(haystack) ? haystack : []);
  return needles.some((n) => set.has(n));
}

function parseAgentFrontmatter(source) {
  const frontmatter = findFrontmatter(source);
  if (!frontmatter) {
    return {
      ok: true,
      hasFrontmatter: false,
      frontmatter: null,
      parsed: null,
      errors: [],
      warnings: [{ code: 'missing_frontmatter', message: 'No YAML frontmatter found (--- ... ---).' }]
    };
  }

  try {
    const parsed = yaml.load(frontmatter.frontmatter) || {};

    const warnings = [];
    if (typeof parsed.description !== 'string' || parsed.description.trim().length === 0) {
      warnings.push({ code: 'missing_description', message: 'Frontmatter is missing a non-empty description.' });
    }

    if (parsed.tools === undefined) {
      warnings.push({ code: 'missing_tools', message: 'Frontmatter is missing "tools".' });
    } else if (!Array.isArray(parsed.tools) || parsed.tools.some((t) => typeof t !== 'string')) {
      warnings.push({ code: 'invalid_tools', message: 'Frontmatter "tools" should be an array of strings.' });
    }

    return {
      ok: true,
      hasFrontmatter: true,
      frontmatter,
      parsed,
      errors: [],
      warnings
    };
  } catch (error) {
    return {
      ok: false,
      hasFrontmatter: true,
      frontmatter,
      parsed: null,
      errors: [{ code: 'yaml_parse_error', message: `YAML parse error: ${error.message}` }],
      warnings: []
    };
  }
}

function deriveCapabilities(parsedFrontmatter) {
  const tools = safeArray(parsedFrontmatter?.tools);
  const toolsSet = new Set(tools);

  const hasDocsMemory = tools.some((t) => t === 'docs-memory/*' || t === 'docs-memory');
  const hasSvgEditor = tools.some((t) => t.startsWith('svg') || t.includes('svg-editor'));
  const hasBrowser = tools.some((t) => t.includes('browser'));

  return {
    tools,
    toolCount: tools.length,
    hasDocsMemory,
    hasSvgEditor,
    hasBrowser,
    hasHandoffs: Array.isArray(parsedFrontmatter?.handoffs) && parsedFrontmatter.handoffs.length > 0,
    hasDescription: typeof parsedFrontmatter?.description === 'string' && parsedFrontmatter.description.trim().length > 0,
    toolsSet: Array.from(toolsSet)
  };
}

function buildAgentMatrix({ agentDir }) {
  const absoluteDir = path.resolve(agentDir);
  const files = listAgentFiles(absoluteDir);

  const agents = [];
  const toolUsage = new Map();

  let errorCount = 0;
  let warningCount = 0;

  for (const filePath of files) {
    const agentName = getAgentNameFromFile(filePath);
    const source = fs.readFileSync(filePath, 'utf8');
    const parsed = parseAgentFrontmatter(source);

    errorCount += parsed.errors.length;
    warningCount += parsed.warnings.length;

    const capabilities = deriveCapabilities(parsed.parsed);

    for (const tool of capabilities.tools) {
      toolUsage.set(tool, (toolUsage.get(tool) || 0) + 1);
    }

    agents.push({
      agentName,
      relativePath: path.relative(process.cwd(), filePath),
      hasFrontmatter: parsed.hasFrontmatter,
      frontmatterStartLine: parsed.frontmatter?.startLine ?? null,
      frontmatterEndLine: parsed.frontmatter?.endLine ?? null,
      errors: parsed.errors,
      warnings: parsed.warnings,
      frontmatter: parsed.parsed,
      capabilities: {
        tools: capabilities.tools,
        toolCount: capabilities.toolCount,
        hasDocsMemory: capabilities.hasDocsMemory,
        hasSvgEditor: capabilities.hasSvgEditor,
        hasBrowser: capabilities.hasBrowser,
        hasHandoffs: capabilities.hasHandoffs,
        hasDescription: capabilities.hasDescription
      }
    });
  }

  const tools = Array.from(toolUsage.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([tool, count]) => ({ tool, count }));

  return {
    success: true,
    agentDir: absoluteDir,
    summary: {
      filesScanned: files.length,
      agentCount: agents.length,
      toolUniqueCount: tools.length,
      errorCount,
      warningCount
    },
    tools,
    agents,
    meta: {
      tool: 'agent-matrix',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    }
  };
}

function filterAgentMatrix(results, options = {}) {
  const filters = {
    nameIncludes: typeof options.name === 'string' ? options.name.trim() : '',
    pathIncludes: typeof options.path === 'string' ? options.path.trim() : '',
    tools: splitCsv(options.tools || options.tool),
    toolMode: (options.toolMode || 'any').toString().toLowerCase() === 'all' ? 'all' : 'any',
    missingFrontmatter: options.missingFrontmatter === true,
    missingTools: options.missingTools === true,
    missingDescription: options.missingDescription === true,
    errorsOnly: options.errorsOnly === true,
    warningsOnly: options.warningsOnly === true,
    hasDocsMemory: options.hasDocsMemory === true,
    hasSvg: options.hasSvg === true,
    hasBrowser: options.hasBrowser === true
  };

  const filteredAgents = results.agents.filter((agent) => {
    if (filters.nameIncludes) {
      const name = String(agent.agentName || '');
      if (!name.toLowerCase().includes(filters.nameIncludes.toLowerCase())) return false;
    }

    if (filters.pathIncludes) {
      const rel = String(agent.relativePath || '');
      if (!rel.toLowerCase().includes(filters.pathIncludes.toLowerCase())) return false;
    }

    if (filters.missingFrontmatter && agent.hasFrontmatter) return false;

    if (filters.missingTools) {
      const hasMissingToolsWarning = (agent.warnings || []).some((w) => w && w.code === 'missing_tools');
      const hasInvalidToolsWarning = (agent.warnings || []).some((w) => w && w.code === 'invalid_tools');
      if (!hasMissingToolsWarning && !hasInvalidToolsWarning) return false;
    }

    if (filters.missingDescription) {
      const hasMissingDescriptionWarning = (agent.warnings || []).some((w) => w && w.code === 'missing_description');
      if (!hasMissingDescriptionWarning) return false;
    }

    if (filters.errorsOnly && (agent.errors || []).length === 0) return false;
    if (filters.warningsOnly && (agent.warnings || []).length === 0) return false;

    if (filters.hasDocsMemory && agent.capabilities?.hasDocsMemory !== true) return false;
    if (filters.hasSvg && agent.capabilities?.hasSvgEditor !== true) return false;
    if (filters.hasBrowser && agent.capabilities?.hasBrowser !== true) return false;

    if (filters.tools.length > 0) {
      const agentTools = agent.capabilities?.tools || [];
      const ok = filters.toolMode === 'all'
        ? includesAll(agentTools, filters.tools)
        : includesAny(agentTools, filters.tools);
      if (!ok) return false;
    }

    return true;
  });

  const toolUsage = new Map();
  let errorCount = 0;
  let warningCount = 0;

  for (const agent of filteredAgents) {
    errorCount += (agent.errors || []).length;
    warningCount += (agent.warnings || []).length;
    for (const tool of safeArray(agent.capabilities?.tools)) {
      toolUsage.set(tool, (toolUsage.get(tool) || 0) + 1);
    }
  }

  const tools = Array.from(toolUsage.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([tool, count]) => ({ tool, count }));

  return {
    ...results,
    filters,
    agents: filteredAgents,
    tools,
    summary: {
      ...results.summary,
      agentCount: filteredAgents.length,
      toolUniqueCount: tools.length,
      errorCount,
      warningCount,
      sourceAgentCount: results.summary.agentCount,
      sourceToolUniqueCount: results.summary.toolUniqueCount
    }
  };
}

function renderHuman(results, options, formatter) {
  formatter.header('agent matrix');
  formatter.stat('Agent directory', results.agentDir);
  formatter.stat('Agents', results.summary.agentCount, 'number');
  formatter.stat('Unique tools', results.summary.toolUniqueCount, 'number');
  formatter.stat('Errors', results.summary.errorCount, 'number');
  formatter.stat('Warnings', results.summary.warningCount, 'number');

  if (Number.isFinite(results.summary.sourceAgentCount) && results.summary.sourceAgentCount !== results.summary.agentCount) {
    formatter.stat('Source agents', results.summary.sourceAgentCount, 'number');
  }

  const topTools = results.tools.slice(0, Number.isFinite(options.topTools) ? options.topTools : 12);
  if (topTools.length > 0) {
    formatter.section('Top tools');
    for (const item of topTools) {
      formatter.info(`${item.tool} (${item.count})`);
    }
  }

  const view = (options.view || '').toString().toLowerCase();
  const wantsAgents = options.showAgents || view === 'agents';
  const wantsMatrix = view === 'matrix';

  if (wantsMatrix) {
    formatter.section('Capability matrix');

    const yes = formatter.COLORS.success('✓');
    const no = formatter.COLORS.muted('');

    const rows = results.agents.map((agent) => {
      const caps = agent.capabilities || {};
      return {
        agent: agent.agentName,
        tools: caps.toolCount || 0,
        docs: caps.hasDocsMemory ? yes : no,
        svg: caps.hasSvgEditor ? yes : no,
        browser: caps.hasBrowser ? yes : no,
        desc: caps.hasDescription ? yes : no,
        fm: agent.hasFrontmatter ? yes : formatter.COLORS.warning('!'),
        errors: (agent.errors || []).length,
        warnings: (agent.warnings || []).length
      };
    });

    formatter.table(rows, {
      columns: ['agent', 'tools', 'docs', 'svg', 'browser', 'desc', 'fm', 'errors', 'warnings']
    });
    return;
  }

  if (wantsAgents) {
    formatter.section('Agents');
    for (const agent of results.agents) {
      const caps = agent.capabilities;
      const flags = [
        caps.hasDocsMemory ? 'docs-memory' : null,
        caps.hasSvgEditor ? 'svg' : null,
        caps.hasBrowser ? 'browser' : null,
        !agent.hasFrontmatter ? 'NO_FM' : null,
        agent.errors.length ? 'ERRORS' : null,
        agent.warnings.length ? 'WARN' : null
      ].filter(Boolean);

      formatter.info(`${agent.agentName}  (${caps.toolCount} tools)${flags.length ? ` [${flags.join(', ')}]` : ''}`);
    }
  }
}

async function runCli() {
  const parser = new CliArgumentParser(
    'agent-matrix',
    'Scan .github/agents/*.agent.md and emit a capability matrix (tools + derived features)',
    '1.0.0'
  );

  parser
    .add('--dir <path>', 'Agents directory to scan', path.join(process.cwd(), '.github', 'agents'))
    .add('--json', 'Emit JSON output', false, 'boolean')
    .add('--quiet', 'Suppress formatted output', false, 'boolean')
    .add('--view <mode>', 'Formatted output view (summary|agents|matrix)', 'summary')
    .add('--show-agents', 'Include per-agent lines in formatted output', false, 'boolean')
    .add('--top-tools <n>', 'How many tools to show in formatted output', 12, 'number')
    .add('--name <substring>', 'Filter: include only agents whose name contains this substring')
    .add('--path <substring>', 'Filter: include only agents whose path contains this substring')
    .add('--tool <list>', 'Filter: include only agents that declare any of these tools (comma-separated)')
    .add('--tools <list>', 'Alias of --tool')
    .add('--tool-mode <mode>', 'Tool filter mode (any|all)', 'any')
    .add('--missing-frontmatter', 'Filter: only agents missing YAML frontmatter', false, 'boolean')
    .add('--missing-tools', 'Filter: only agents with missing/invalid tools frontmatter', false, 'boolean')
    .add('--missing-description', 'Filter: only agents with missing description frontmatter', false, 'boolean')
    .add('--errors-only', 'Filter: only agents with errors', false, 'boolean')
    .add('--warnings-only', 'Filter: only agents with warnings', false, 'boolean')
    .add('--has-docs-memory', 'Filter: only agents that declare docs-memory tooling', false, 'boolean')
    .add('--has-svg', 'Filter: only agents that declare SVG tooling', false, 'boolean')
    .add('--has-browser', 'Filter: only agents that declare browser tooling', false, 'boolean')
    .add('--strict', 'Exit non-zero if errors or warnings exist', false, 'boolean')
    .add('--lang <code>', 'Output language (en|zh|bilingual)', 'en');

  const args = parser.parse(process.argv);
  const formatter = new CliFormatter({ languageMode: args.lang });

  const results = filterAgentMatrix(buildAgentMatrix({ agentDir: args.dir }), {
    view: args.view,
    showAgents: args.showAgents,
    topTools: args.topTools,
    name: args.name,
    path: args.path,
    tool: args.tool,
    tools: args.tools,
    toolMode: args.toolMode,
    missingFrontmatter: args.missingFrontmatter,
    missingTools: args.missingTools,
    missingDescription: args.missingDescription,
    errorsOnly: args.errorsOnly,
    warningsOnly: args.warningsOnly,
    hasDocsMemory: args.hasDocsMemory,
    hasSvg: args.hasSvg,
    hasBrowser: args.hasBrowser
  });

  const strict = args.strict === true;
  const exitWithFailure = results.summary.errorCount > 0 || (strict && results.summary.warningCount > 0);

  if (args.json) {
    console.log(JSON.stringify({ ...results, strict, ok: !exitWithFailure }, null, 2));
    if (exitWithFailure) {
      process.exitCode = 1;
    }
    return;
  }

  if (args.quiet !== true) {
    renderHuman(results, args, formatter);
    if (!exitWithFailure) {
      formatter.success('Agent matrix generated.');
    } else {
      formatter.error('Agent matrix generated with blocking issues.');
      if (strict && results.summary.warningCount > 0 && results.summary.errorCount === 0) {
        formatter.warn('Strict mode is enabled: warnings are treated as failures.');
      }
    }
  }

  if (exitWithFailure) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  buildAgentMatrix,
  filterAgentMatrix,
  parseAgentFrontmatter,
  deriveCapabilities
};

