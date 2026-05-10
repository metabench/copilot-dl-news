#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_PROFILE_DIR = path.join(__dirname, 'profiles');
const RESERVED_COMMANDS = Object.freeze(['help', 'list', 'profile', 'run']);

const TOOL_REGISTRY = Object.freeze({
  remote: {
    script: 'crawl-remote.js',
    description: 'Remote multi-domain crawl orchestration and sync'
  },
  'multi-modal': {
    script: 'crawl-multi-modal.js',
    description: 'Continuous multi-modal crawl with learning loops'
  },
  'place-hubs': {
    script: 'crawl-place-hubs.js',
    description: 'Crawl discovered place hub URLs from the local database'
  },
  intelligent: {
    script: 'intelligent-crawl.js',
    description: 'Intelligent crawl workflow with hub discovery'
  },
  'guess-place-hubs': {
    script: 'guess-place-hubs.js',
    description: 'Infer place hubs from existing crawl data'
  },
  'list-place-hubs': {
    script: 'list-place-hubs.js',
    description: 'List known place hubs from the local database'
  },
  peer: {
    script: 'peer-server.js',
    description: 'Run a P2P NewsCrawler peer node'
  },
  batch: {
    script: 'crawl-batch.js',
    description: 'Batch-launch N crawls against the unified UI v1 API in one command'
  },
  orchestrate: {
    script: 'orchestrate.js',
    description: 'Smart launcher: probe remote, choose remote or local fallback, report Cloud Crawl URL'
  },
  'cloud-e2e': {
    script: 'cloud-crawl-e2e.js',
    description: 'Strict 15-minute cloud crawl e2e validation with DB, ledger, and diagnostics artifacts'
  }
});

function resolveToolSpec(name) {
  if (!name) return null;
  const normalized = String(name).trim().toLowerCase();
  if (!normalized) return null;

  const aliases = {
    multimodal: 'multi-modal',
    multimode: 'multi-modal',
    place: 'place-hubs',
    hubs: 'place-hubs',
    intelligentcrawl: 'intelligent',
    guess: 'guess-place-hubs',
    list: 'list-place-hubs',
    'peer-server': 'peer',
    'crawl-batch': 'batch',
    'batch-crawl': 'batch',
    smart: 'orchestrate',
    auto: 'orchestrate',
    validate: 'cloud-e2e',
    e2e: 'cloud-e2e',
    'cloud-crawl-e2e': 'cloud-e2e',
  };

  const key = TOOL_REGISTRY[normalized] ? normalized : aliases[normalized];
  if (!key || !TOOL_REGISTRY[key]) return null;
  return {
    key,
    ...TOOL_REGISTRY[key],
    scriptPath: path.join(__dirname, TOOL_REGISTRY[key].script)
  };
}

function parseCliArgs(argv) {
  const tokens = Array.isArray(argv) ? argv.slice() : [];
  const passthrough = [];
  const options = {
    dryRun: false,
    profileDir: DEFAULT_PROFILE_DIR
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (token === '--profile-dir' && tokens[index + 1]) {
      options.profileDir = path.resolve(tokens[index + 1]);
      index += 1;
      continue;
    }
    passthrough.push(token);
  }

  return {
    options,
    tokens: passthrough,
    command: passthrough[0] || 'help'
  };
}

function isLikelyPath(value) {
  return typeof value === 'string' && (value.includes('/') || value.includes('\\') || value.endsWith('.json'));
}

function resolveProfilePath(profileNameOrPath, profileDir = DEFAULT_PROFILE_DIR) {
  if (!profileNameOrPath || typeof profileNameOrPath !== 'string') {
    throw new Error('Profile name or path is required.');
  }

  if (isLikelyPath(profileNameOrPath)) {
    return path.resolve(profileNameOrPath);
  }

  return path.resolve(profileDir, `${profileNameOrPath}.json`);
}

function createUnknownTargetError(target, profileDir = DEFAULT_PROFILE_DIR) {
  const lines = [
    `Unknown crawl tool or profile: ${target}`,
    'Run "node tools/crawl/index.js list" to inspect available tools and profiles.',
  ];

  const resolvedProfileDir = path.resolve(profileDir);
  if (resolvedProfileDir !== path.resolve(DEFAULT_PROFILE_DIR)) {
    lines.push(`Current profile directory: ${resolvedProfileDir}`);
  }

  lines.push('Use "profile <path-to-json>" for an explicit JSON file.');
  return new Error(lines.join('\n'));
}

function optionsObjectToArgs(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    return [];
  }

  const args = [];
  for (const [key, rawValue] of Object.entries(options)) {
    if (rawValue === undefined || rawValue === null || rawValue === false) {
      continue;
    }

    const flag = `--${key}`;
    if (rawValue === true) {
      args.push(flag);
      continue;
    }

    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) {
      if (value === true) {
        args.push(flag);
        continue;
      }
      if (value === undefined || value === null || value === false) {
        continue;
      }
      args.push(flag, String(value));
    }
  }

  return args;
}

function loadProfile(profilePath) {
  if (!fs.existsSync(profilePath)) {
    throw new Error(`Profile not found: ${profilePath}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  } catch (error) {
    throw new Error(`Failed to parse profile JSON: ${error.message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Profile JSON must be an object.');
  }
  if (!parsed.tool || typeof parsed.tool !== 'string') {
    throw new Error('Profile must include a string "tool" field.');
  }

  const tool = resolveToolSpec(parsed.tool);
  if (!tool) {
    throw new Error(`Unknown profile tool: ${parsed.tool}`);
  }

  const positionals = Array.isArray(parsed.positionals)
    ? parsed.positionals.map((value) => String(value))
    : [];
  const args = Array.isArray(parsed.args)
    ? parsed.args.map((value) => String(value))
    : [];
  const optionArgs = optionsObjectToArgs(parsed.options);

  return {
    tool,
    profile: parsed,
    args: [...positionals, ...optionArgs, ...args]
  };
}

function buildInvocationFromTool(toolName, toolArgs) {
  const tool = resolveToolSpec(toolName);
  if (!tool) {
    throw new Error(`Unknown crawl tool: ${toolName}`);
  }
  return {
    type: 'tool',
    tool,
    args: Array.isArray(toolArgs) ? toolArgs.map((value) => String(value)) : []
  };
}

function buildInvocationFromProfile(profileNameOrPath, extraArgs, profileDir) {
  const profilePath = resolveProfilePath(profileNameOrPath, profileDir);
  const loaded = loadProfile(profilePath);
  return {
    type: 'profile',
    profilePath,
    profile: loaded.profile,
    tool: loaded.tool,
    args: [...loaded.args, ...(Array.isArray(extraArgs) ? extraArgs.map((value) => String(value)) : [])]
  };
}

function buildInvocationFromCommand(command, commandArgs, profileDir = DEFAULT_PROFILE_DIR) {
  const normalized = typeof command === 'string' ? command.trim() : '';
  if (!normalized) {
    throw new Error('A crawl tool or profile name is required.');
  }

  if (resolveToolSpec(normalized)) {
    return buildInvocationFromTool(normalized, commandArgs);
  }

  const shouldTreatAsProfile = isLikelyPath(normalized)
    || fs.existsSync(resolveProfilePath(normalized, profileDir));

  if (shouldTreatAsProfile) {
    return buildInvocationFromProfile(normalized, commandArgs, profileDir);
  }

  throw createUnknownTargetError(normalized, profileDir);
}

function getListData(profileDir = DEFAULT_PROFILE_DIR) {
  return {
    profileDir: path.resolve(profileDir),
    tools: Object.entries(TOOL_REGISTRY).map(([key, spec]) => ({
      key,
      script: spec.script,
      description: spec.description
    })),
    profiles: listProfiles(profileDir),
    reservedCommands: RESERVED_COMMANDS.slice(),
    notes: {
      bareProfileShortcut: 'Run a profile directly with: npm run crawl -- <profile-name>',
      explicitProfileShortcut: 'Explicit form also works: npm run crawl -- profile <profile-name>',
      toolNamePrecedence: 'If a name matches both a tool and a profile, the tool wins.',
      reservedNameRule: 'Reserved launcher commands require explicit profile invocation or a JSON path.'
    }
  };
}

function parseListArgs(args) {
  const tokens = Array.isArray(args) ? args : [];
  const options = { json: false };
  const unknown = [];

  for (const token of tokens) {
    if (token === '--json') {
      options.json = true;
    } else {
      unknown.push(token);
    }
  }

  if (unknown.length > 0) {
    throw new Error(`list only accepts --json. Received: ${unknown.join(' ')}`);
  }

  return options;
}

function renderHelp() {
  const lines = [
    'Unified Crawl Launcher',
    '',
    'Usage:',
    '  node tools/crawl/index.js list',
    '  node tools/crawl/index.js list --json',
    '  node tools/crawl/index.js <profile-name> [extra args...]',
    '  node tools/crawl/index.js <tool> [tool args...]',
    '  node tools/crawl/index.js run <tool> [tool args...]',
    '  node tools/crawl/index.js profile <name|path> [extra args...]',
    '',
    'Global options:',
    '  --dry-run                 Show delegated script invocation without running it',
    '  --profile-dir <path>      Override profile directory (default: tools/crawl/profiles)',
    '',
    'Tools:'
  ];

  for (const [key, spec] of Object.entries(TOOL_REGISTRY)) {
    lines.push(`  ${key.padEnd(18)} ${spec.description}`);
  }

  lines.push('');
  lines.push('Examples:');
  lines.push('  npm run crawl -- list');
  lines.push('  npm run crawl -- list --json');
  lines.push('  npm run crawl -- news-10x1000                      # non-harnessed operator crawl');
  lines.push('  npm run crawl -- news-10x1000-15m-e2e             # harnessed validation');
  lines.push('  npm run crawl -- remote-bounded-smoke');
  lines.push('  npm run crawl -- remote-bounded-smoke --dry-run');
  lines.push('  npm run crawl -- news-10x1000-15m-e2e --dry-run');
  lines.push('  npm run crawl -- news-10x1000-15m-e2e --preflight-only');
  lines.push('  npm run crawl -- remote bounded --domains bbc.com,reuters.com --max-pages 50');
  lines.push('  npm run crawl -- profile remote-bounded-smoke');
  lines.push('  npm run crawl -- profile remote-bounded-smoke --dry-run');
  return lines.join('\n');
}

function listProfiles(profileDir) {
  if (!fs.existsSync(profileDir)) {
    return [];
  }

  return fs.readdirSync(profileDir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => {
      const fullPath = path.join(profileDir, name);
      try {
        const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        return {
          name: path.basename(name, '.json'),
          tool: parsed.tool || 'unknown',
          description: parsed.description || ''
        };
      } catch (error) {
        return {
          name: path.basename(name, '.json'),
          tool: 'invalid',
          description: `Invalid JSON: ${error.message}`
        };
      }
    });
}

function printList(profileDir, options = {}) {
  const { json = false } = options;
  const data = getListData(profileDir);

  if (json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const tools = data.tools
    .map((tool) => `  ${tool.key.padEnd(18)} ${tool.description}`)
    .join('\n');

  const profiles = data.profiles
    .map((profile) => `  ${profile.name.padEnd(24)} ${profile.tool}${profile.description ? ` — ${profile.description}` : ''}`)
    .join('\n');

  console.log('Crawl tools:\n' + tools);
  console.log('');
  console.log('Crawl profiles:');
  if (profiles) {
    console.log(profiles);
  } else {
    console.log('  (none)');
  }
  console.log('');
  console.log('Run a profile directly: npm run crawl -- <profile-name>');
  console.log('Explicit form also works: npm run crawl -- profile <profile-name>');
  console.log('Reserved launcher commands: ' + RESERVED_COMMANDS.join(', '));
  console.log('If a name matches both a tool and a profile, the tool wins.');
}

function renderInvocation(invocation) {
  const script = path.relative(process.cwd(), invocation.tool.scriptPath).replace(/\\/g, '/');
  const args = invocation.args.map((value) => (/\s/.test(value) ? `"${value}"` : value));
  return ['node', script, ...args].join(' ');
}

function executeInvocation(invocation, dryRun = false) {
  const command = renderInvocation(invocation);
  if (dryRun) {
    console.log(command);
    if (invocation.type === 'profile') {
      console.log(`Profile: ${invocation.profilePath}`);
    }
    return 0;
  }

  const result = spawnSync(process.execPath, [invocation.tool.scriptPath, ...invocation.args], {
    cwd: process.cwd(),
    stdio: 'inherit'
  });

  if (result.error) {
    throw result.error;
  }

  return Number.isInteger(result.status) ? result.status : 0;
}

function runCli(argv) {
  const parsed = parseCliArgs(argv);
  const { command, tokens, options } = parsed;

  if (command === 'help' || command === '--help' || command === '-h') {
    console.log(renderHelp());
    return 0;
  }

  if (command === 'list') {
    const listOptions = parseListArgs(tokens.slice(1));
    printList(options.profileDir, listOptions);
    return 0;
  }

  let invocation;
  if (command === 'profile') {
    const profileNameOrPath = tokens[1];
    if (!profileNameOrPath) {
      throw new Error('profile requires a profile name or JSON path.');
    }
    invocation = buildInvocationFromProfile(profileNameOrPath, tokens.slice(2), options.profileDir);
  } else if (command === 'run') {
    const toolName = tokens[1];
    if (!toolName) {
      throw new Error('run requires a tool name.');
    }
    invocation = buildInvocationFromTool(toolName, tokens.slice(2));
  } else {
    invocation = buildInvocationFromCommand(command, tokens.slice(1), options.profileDir);
  }

  return executeInvocation(invocation, options.dryRun);
}

if (require.main === module) {
  try {
    const exitCode = runCli(process.argv.slice(2));
    if (exitCode !== 0) {
      process.exit(exitCode);
    }
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}

module.exports = {
  DEFAULT_PROFILE_DIR,
  RESERVED_COMMANDS,
  TOOL_REGISTRY,
  createUnknownTargetError,
  buildInvocationFromCommand,
  buildInvocationFromProfile,
  buildInvocationFromTool,
  executeInvocation,
  getListData,
  listProfiles,
  loadProfile,
  optionsObjectToArgs,
  parseListArgs,
  parseCliArgs,
  renderHelp,
  renderInvocation,
  resolveProfilePath,
  resolveToolSpec,
  runCli,
};
