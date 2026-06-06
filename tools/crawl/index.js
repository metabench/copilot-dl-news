#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  renderDeployPreflightCommand,
  runRemoteDeployPreflight,
  shouldPreflightRemoteArgs,
} = require('./lib/remote-deploy-preflight');
const {
  buildGraphFeedbackArtifactExplanationForHosts,
  renderGraphFeedbackSummary,
} = require('./lib/graph-feedback-artifact-explain');
const {
  appendGraphFeedbackSeedArgs,
  buildGraphFeedbackLiveSeedPlan,
  readLiveSeedPreviewEvidenceSync,
  renderGraphFeedbackLiveSeedSummary,
  verifyLiveSeedPreviewEvidence,
  writeLiveSeedApprovalChecklistSync,
  writeLiveSeedApprovalReadinessSync,
  writeLiveSeedPreviewEvidenceSync,
  writePostSeedVerificationChecklistSync,
  writeSeedAttemptLogSync,
} = require('./lib/graph-feedback-live-seeds');

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
  'graph-feedback': {
    script: 'graph-feedback.js',
    description: 'Read-only graph feedback dry run using news-db-analysis and news-crawler-db'
  },
  orchestrate: {
    script: 'orchestrate.js',
    description: 'Smart launcher: probe remote, choose remote or local fallback, report Cloud Crawl URL'
  },
  'cloud-e2e': {
    script: 'cloud-crawl-e2e.js',
    description: 'Strict 15-minute cloud crawl e2e validation with DB, ledger, and diagnostics artifacts'
  },
  'remote-deploy': {
    script: 'deploy-remote-server.js',
    description: 'Build and deploy the remote crawler v2 server with busy-server protection'
  },
  'monitored-small-crawl': {
    script: 'monitored-small-crawl.js',
    description: 'Bounded small-crawl DB evidence, recent overview, baseline, and verification'
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
    graph: 'graph-feedback',
    'feedback': 'graph-feedback',
    'graph-feedback-dry-run': 'graph-feedback',
    smart: 'orchestrate',
    auto: 'orchestrate',
    validate: 'cloud-e2e',
    e2e: 'cloud-e2e',
    'cloud-crawl-e2e': 'cloud-e2e',
    deploy: 'remote-deploy',
    'deploy-remote': 'remote-deploy',
    'remote-server-deploy': 'remote-deploy',
    monitored: 'monitored-small-crawl',
    'small-crawl': 'monitored-small-crawl',
    'small-crawl-monitor': 'monitored-small-crawl',
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
    profileDir: DEFAULT_PROFILE_DIR,
    remoteDeploy: 'auto',
    remoteDeployForce: false,
    remoteDeploySshHost: undefined,
    remoteDeploySshUser: undefined,
    remoteDeploySshPort: undefined,
    remoteDeploySshKey: undefined,
    remoteDeployStatusHost: undefined,
    remoteDeployStatusPort: undefined,
    remoteDeployStatusUrl: undefined,
    remoteDeployRemoteDir: undefined,
    remoteDeployService: undefined,
    remoteDeploySkipBusyCheck: false,
    remoteDeploySkipDbBuild: false,
    remoteDeploySkipHealthCheck: false,
    graphFeedbackArtifactPath: undefined,
    graphFeedbackApprovalChecklistPath: undefined,
    graphFeedbackApprovalReadinessPath: undefined,
    graphFeedbackPostSeedChecklistPath: undefined,
    graphFeedbackPreviewEvidencePath: undefined,
    seedAttemptLogPath: undefined,
    useGraphFeedbackSeeds: false
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (token === '--remote-deploy' && tokens[index + 1]) {
      options.remoteDeploy = String(tokens[index + 1]).toLowerCase();
      index += 1;
      continue;
    }
    if (token === '--no-remote-deploy') {
      options.remoteDeploy = 'never';
      continue;
    }
    if (token === '--remote-deploy-force') {
      options.remoteDeployForce = true;
      continue;
    }
    if (token === '--remote-deploy-ssh-host' && tokens[index + 1]) {
      options.remoteDeploySshHost = tokens[index + 1];
      index += 1;
      continue;
    }
    if (token === '--remote-deploy-ssh-user' && tokens[index + 1]) {
      options.remoteDeploySshUser = tokens[index + 1];
      index += 1;
      continue;
    }
    if (token === '--remote-deploy-ssh-port' && tokens[index + 1]) {
      options.remoteDeploySshPort = tokens[index + 1];
      index += 1;
      continue;
    }
    if (token === '--remote-deploy-ssh-key' && tokens[index + 1]) {
      options.remoteDeploySshKey = tokens[index + 1];
      index += 1;
      continue;
    }
    if (token === '--remote-deploy-status-url' && tokens[index + 1]) {
      options.remoteDeployStatusUrl = tokens[index + 1];
      index += 1;
      continue;
    }
    if (token === '--remote-deploy-status-host' && tokens[index + 1]) {
      options.remoteDeployStatusHost = tokens[index + 1];
      index += 1;
      continue;
    }
    if (token === '--remote-deploy-status-port' && tokens[index + 1]) {
      options.remoteDeployStatusPort = tokens[index + 1];
      index += 1;
      continue;
    }
    if (token === '--remote-deploy-remote-dir' && tokens[index + 1]) {
      options.remoteDeployRemoteDir = tokens[index + 1];
      index += 1;
      continue;
    }
    if (token === '--remote-deploy-service' && tokens[index + 1]) {
      options.remoteDeployService = tokens[index + 1];
      index += 1;
      continue;
    }
    if (token === '--remote-deploy-skip-busy-check') {
      options.remoteDeploySkipBusyCheck = true;
      continue;
    }
    if (token === '--remote-deploy-skip-db-build') {
      options.remoteDeploySkipDbBuild = true;
      continue;
    }
    if (token === '--remote-deploy-skip-health-check') {
      options.remoteDeploySkipHealthCheck = true;
      continue;
    }
    if (token === '--use-graph-feedback-seeds') {
      options.useGraphFeedbackSeeds = true;
      continue;
    }
    if (token === '--no-graph-feedback-seeds') {
      options.useGraphFeedbackSeeds = false;
      continue;
    }
    if (token === '--graph-feedback-approval-checklist') {
      const checklistPath = tokens[index + 1];
      if (!checklistPath || String(checklistPath).startsWith('--')) {
        throw new Error('--graph-feedback-approval-checklist requires a path');
      }
      options.graphFeedbackApprovalChecklistPath = checklistPath;
      index += 1;
      continue;
    }
    if (typeof token === 'string' && token.startsWith('--graph-feedback-approval-checklist=')) {
      const checklistPath = token.slice('--graph-feedback-approval-checklist='.length).trim();
      if (!checklistPath) {
        throw new Error('--graph-feedback-approval-checklist requires a path');
      }
      options.graphFeedbackApprovalChecklistPath = checklistPath;
      continue;
    }
    if (token === '--graph-feedback-approval-readiness') {
      const readinessPath = tokens[index + 1];
      if (!readinessPath || String(readinessPath).startsWith('--')) {
        throw new Error('--graph-feedback-approval-readiness requires a path');
      }
      options.graphFeedbackApprovalReadinessPath = readinessPath;
      index += 1;
      continue;
    }
    if (typeof token === 'string' && token.startsWith('--graph-feedback-approval-readiness=')) {
      const readinessPath = token.slice('--graph-feedback-approval-readiness='.length).trim();
      if (!readinessPath) {
        throw new Error('--graph-feedback-approval-readiness requires a path');
      }
      options.graphFeedbackApprovalReadinessPath = readinessPath;
      continue;
    }
    if (token === '--graph-feedback-post-seed-checklist') {
      const checklistPath = tokens[index + 1];
      if (!checklistPath || String(checklistPath).startsWith('--')) {
        throw new Error('--graph-feedback-post-seed-checklist requires a path');
      }
      options.graphFeedbackPostSeedChecklistPath = checklistPath;
      index += 1;
      continue;
    }
    if (typeof token === 'string' && token.startsWith('--graph-feedback-post-seed-checklist=')) {
      const checklistPath = token.slice('--graph-feedback-post-seed-checklist='.length).trim();
      if (!checklistPath) {
        throw new Error('--graph-feedback-post-seed-checklist requires a path');
      }
      options.graphFeedbackPostSeedChecklistPath = checklistPath;
      continue;
    }
    if (token === '--graph-feedback-preview-evidence') {
      const evidencePath = tokens[index + 1];
      if (!evidencePath || String(evidencePath).startsWith('--')) {
        throw new Error('--graph-feedback-preview-evidence requires a path');
      }
      options.graphFeedbackPreviewEvidencePath = evidencePath;
      index += 1;
      continue;
    }
    if (typeof token === 'string' && token.startsWith('--graph-feedback-preview-evidence=')) {
      const evidencePath = token.slice('--graph-feedback-preview-evidence='.length).trim();
      if (!evidencePath) {
        throw new Error('--graph-feedback-preview-evidence requires a path');
      }
      options.graphFeedbackPreviewEvidencePath = evidencePath;
      continue;
    }
    if (token === '--seed-attempt-log') {
      const logPath = tokens[index + 1];
      if (!logPath || String(logPath).startsWith('--')) {
        throw new Error('--seed-attempt-log requires a path');
      }
      options.seedAttemptLogPath = logPath;
      index += 1;
      continue;
    }
    if (typeof token === 'string' && token.startsWith('--seed-attempt-log=')) {
      const logPath = token.slice('--seed-attempt-log='.length).trim();
      if (!logPath) {
        throw new Error('--seed-attempt-log requires a path');
      }
      options.seedAttemptLogPath = logPath;
      continue;
    }
    if (token === '--graph-feedback-artifact') {
      const artifactPath = tokens[index + 1];
      if (!artifactPath || String(artifactPath).startsWith('--')) {
        throw new Error('--graph-feedback-artifact requires a path');
      }
      options.graphFeedbackArtifactPath = artifactPath;
      index += 1;
      continue;
    }
    if (typeof token === 'string' && token.startsWith('--graph-feedback-artifact=')) {
      const artifactPath = token.slice('--graph-feedback-artifact='.length).trim();
      if (!artifactPath) {
        throw new Error('--graph-feedback-artifact requires a path');
      }
      options.graphFeedbackArtifactPath = artifactPath;
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
    '  --remote-deploy <mode>    auto (default), never, always before start-like remote commands',
    '  --no-remote-deploy        Disable automatic remote deploy freshness check',
    '  --remote-deploy-force     Allow auto-deploy to interrupt a busy remote server',
    '  --remote-deploy-ssh-host <host>  SSH target for deploy, e.g. ubuntu@141.144.193.218',
    '  --remote-deploy-status-host <host>  Status host for deploy preflight',
    '  --remote-deploy-status-port <n>  Status port for deploy preflight',
    '  --remote-deploy-remote-dir <path>  Remote app dir for deploy preflight',
    '  --remote-deploy-service <name>  PM2 service name for deploy preflight',
    '  --remote-deploy-skip-busy-check  Skip deploy preflight busy check after explicit recovery decision',
    '  --remote-deploy-skip-health-check  Skip post-deploy health check after explicit recovery decision',
    '  --graph-feedback-artifact <path>  With --dry-run remote invocations: validate saved graph-feedback JSON and show seed consideration',
    '  --use-graph-feedback-seeds  With --graph-feedback-artifact on explicit remote start/launch/bounded/run: seed validated candidates',
    '  --graph-feedback-preview-evidence <path>  Write dry-run seed fingerprint or verify it before live seeding',
    '  --graph-feedback-approval-checklist <path>  Write dry-run-only real-remote seed approval checklist JSON',
    '  --graph-feedback-approval-readiness <path>  Write dry-run-only approval readiness JSON after checklist/preview validation',
    '  --graph-feedback-post-seed-checklist <path>  Write dry-run-only post-seed proof checklist JSON',
    '  --seed-attempt-log <path>  Append compact JSONL evidence before explicit live graph-feedback seed delegation',
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
  const quote = (value) => {
    const text = String(value);
    if (/^[A-Za-z0-9_./:=,@%+-]+$/.test(text)) return text;
    return `'${text.replace(/'/g, `'\\''`)}'`;
  };
  return ['node', script, ...invocation.args].map(quote).join(' ');
}

function extractRemoteDryRunHosts(args) {
  const tokens = Array.isArray(args) ? args : [];
  const hosts = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '--domain' && tokens[index + 1]) {
      hosts.push(tokens[index + 1]);
      index += 1;
      continue;
    }
    if (token === '--domains' && tokens[index + 1]) {
      hosts.push(...String(tokens[index + 1]).split(','));
      index += 1;
      continue;
    }
    if (typeof token === 'string' && token.startsWith('--domain=')) {
      hosts.push(token.slice('--domain='.length));
      continue;
    }
    if (typeof token === 'string' && token.startsWith('--domains=')) {
      hosts.push(...token.slice('--domains='.length).split(','));
    }
  }

  const seen = new Set();
  return hosts
    .map(value => String(value || '').trim().toLowerCase())
    .filter(value => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

function buildRemoteDryRunGraphFeedback(invocation, options = {}) {
  if (!invocation || !invocation.tool || invocation.tool.key !== 'remote') {
    throw new Error('--graph-feedback-artifact is only supported for remote dry-run invocations');
  }

  const plannedHosts = extractRemoteDryRunHosts(invocation.args);
  if (!plannedHosts.length) {
    throw new Error('--graph-feedback-artifact requires remote --domain or --domains in the dry-run invocation');
  }

  return buildGraphFeedbackArtifactExplanationForHosts(plannedHosts, options.graphFeedbackArtifactPath, options);
}

function remoteCommandName(args = []) {
  return (Array.isArray(args) ? args : [])
    .find(arg => typeof arg === 'string' && !arg.startsWith('--')) || '';
}

function prepareGraphFeedbackLiveSeedInvocation(invocation, options = {}) {
  if (!options.useGraphFeedbackSeeds) {
    return { invocation, liveSeedPlan: null };
  }
  if (!options.graphFeedbackArtifactPath) {
    throw new Error('--use-graph-feedback-seeds requires --graph-feedback-artifact <path>');
  }
  if (!invocation || !invocation.tool || invocation.tool.key !== 'remote') {
    throw new Error('--use-graph-feedback-seeds is only supported for remote invocations');
  }

  const command = remoteCommandName(invocation.args);
  const supportedCommands = new Set(['start', 'launch', 'bounded', 'run']);
  if (!supportedCommands.has(command)) {
    throw new Error('--use-graph-feedback-seeds is only supported for explicit remote start, launch, bounded, or run commands');
  }

  const plannedHosts = extractRemoteDryRunHosts(invocation.args);
  if (!plannedHosts.length) {
    throw new Error('--use-graph-feedback-seeds requires remote --domain or --domains in the invocation');
  }

  const liveSeedPlan = buildGraphFeedbackLiveSeedPlan(plannedHosts, options.graphFeedbackArtifactPath, options);
  return {
    invocation: {
      ...invocation,
      args: appendGraphFeedbackSeedArgs(invocation.args, liveSeedPlan),
    },
    liveSeedPlan,
  };
}

function maybeRunRemoteDeployPreflight(invocation, options = {}) {
  if (!invocation || !invocation.tool || invocation.tool.key !== 'remote') return 0;
  if (!shouldPreflightRemoteArgs(invocation.args)) return 0;
  if (options.dryRun) return 0;

  const result = runRemoteDeployPreflight({
    mode: options.remoteDeploy,
    force: options.remoteDeployForce,
    sshHost: options.remoteDeploySshHost,
    sshUser: options.remoteDeploySshUser,
    sshPort: options.remoteDeploySshPort,
    sshKey: options.remoteDeploySshKey,
    statusHost: options.remoteDeployStatusHost,
    statusPort: options.remoteDeployStatusPort,
    statusUrl: options.remoteDeployStatusUrl,
    remoteDir: options.remoteDeployRemoteDir,
    service: options.remoteDeployService,
    skipBusyCheck: options.remoteDeploySkipBusyCheck,
    skipDbBuild: options.remoteDeploySkipDbBuild,
    skipHealthCheck: options.remoteDeploySkipHealthCheck,
    json: false,
    out: process.stderr,
    err: process.stderr,
  });
  return result.status || 0;
}

function remoteDeployPreflightOptionsFromLauncher(options = {}) {
  return {
    mode: options.remoteDeploy,
    force: options.remoteDeployForce,
    sshHost: options.remoteDeploySshHost,
    sshUser: options.remoteDeploySshUser,
    sshPort: options.remoteDeploySshPort,
    sshKey: options.remoteDeploySshKey,
    statusHost: options.remoteDeployStatusHost,
    statusPort: options.remoteDeployStatusPort,
    statusUrl: options.remoteDeployStatusUrl,
    remoteDir: options.remoteDeployRemoteDir,
    service: options.remoteDeployService,
    skipBusyCheck: options.remoteDeploySkipBusyCheck,
    skipDbBuild: options.remoteDeploySkipDbBuild,
    skipHealthCheck: options.remoteDeploySkipHealthCheck,
  };
}

function buildRemoteDeployPreflightDryRunCommand(invocation, options = {}) {
  if (!invocation || !invocation.tool || invocation.tool.key !== 'remote') return null;
  if (!shouldPreflightRemoteArgs(invocation.args)) return null;
  return renderDeployPreflightCommand(remoteDeployPreflightOptionsFromLauncher(options));
}

function executeInvocation(invocation, dryRun = false, options = {}) {
  const prepared = prepareGraphFeedbackLiveSeedInvocation(invocation, options);
  const effectiveInvocation = prepared.invocation;
  const liveSeedPlan = prepared.liveSeedPlan;
  const command = renderInvocation(effectiveInvocation);
  if (dryRun) {
    const graphFeedback = options.graphFeedbackArtifactPath
      ? buildRemoteDryRunGraphFeedback(invocation, options)
      : null;
    const deployPreflightCommand = buildRemoteDeployPreflightDryRunCommand(effectiveInvocation, options);
    console.log(command);
    if (deployPreflightCommand) {
      console.log(`Remote deploy preflight: ${deployPreflightCommand}`);
    }
    if (invocation.type === 'profile') {
      console.log(`Profile: ${invocation.profilePath}`);
    }
    if (graphFeedback) {
      console.log(renderGraphFeedbackSummary(graphFeedback));
    }
    if (liveSeedPlan) {
      let previewEvidenceRecord = null;
      let approvalChecklistRecord = null;
      if (options.graphFeedbackPreviewEvidencePath) {
        previewEvidenceRecord = writeLiveSeedPreviewEvidenceSync(options.graphFeedbackPreviewEvidencePath, liveSeedPlan, options);
      }
      if (options.graphFeedbackApprovalChecklistPath) {
        approvalChecklistRecord = writeLiveSeedApprovalChecklistSync(options.graphFeedbackApprovalChecklistPath, liveSeedPlan, {
          ...options,
          dryRunCommand: command,
          previewEvidencePath: options.graphFeedbackPreviewEvidencePath,
        });
      }
      if (options.graphFeedbackApprovalReadinessPath) {
        writeLiveSeedApprovalReadinessSync(options.graphFeedbackApprovalReadinessPath, {
          ...options,
          approvalChecklist: approvalChecklistRecord,
          approvalChecklistPath: options.graphFeedbackApprovalChecklistPath,
          previewEvidence: previewEvidenceRecord,
          previewEvidencePath: options.graphFeedbackPreviewEvidencePath,
        });
      }
      if (options.graphFeedbackPostSeedChecklistPath) {
        writePostSeedVerificationChecklistSync(options.graphFeedbackPostSeedChecklistPath, liveSeedPlan, {
          ...options,
          approvalChecklistPath: options.graphFeedbackApprovalChecklistPath,
        });
      }
      console.log(renderGraphFeedbackLiveSeedSummary(liveSeedPlan, { dryRun: true }));
    }
    return 0;
  }

  if (liveSeedPlan && !options.graphFeedbackPreviewEvidencePath) {
    throw new Error('--use-graph-feedback-seeds live mode requires --graph-feedback-preview-evidence <path> from a matching dry-run preview.');
  }
  if (liveSeedPlan && options.graphFeedbackPreviewEvidencePath) {
    const previewEvidence = readLiveSeedPreviewEvidenceSync(options.graphFeedbackPreviewEvidencePath, options);
    verifyLiveSeedPreviewEvidence(liveSeedPlan, previewEvidence);
  }

  const deployExit = maybeRunRemoteDeployPreflight(effectiveInvocation, { ...options, dryRun });
  if (deployExit !== 0) return deployExit;

  if (liveSeedPlan) {
    if (options.seedAttemptLogPath) {
      writeSeedAttemptLogSync(options.seedAttemptLogPath, liveSeedPlan, {
        ...options,
        delegatedCommand: command,
      });
    }
    (options.err || process.stderr).write(renderGraphFeedbackLiveSeedSummary(liveSeedPlan, { dryRun: false }));
  }

  const spawn = options.spawnSync || spawnSync;
  const result = spawn(process.execPath, [effectiveInvocation.tool.scriptPath, ...effectiveInvocation.args], {
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

  if (options.graphFeedbackArtifactPath && !options.dryRun && !options.useGraphFeedbackSeeds) {
    throw new Error('--graph-feedback-artifact is dry-run only unless --use-graph-feedback-seeds is explicitly supplied.');
  }
  if (options.useGraphFeedbackSeeds && !options.graphFeedbackArtifactPath) {
    throw new Error('--use-graph-feedback-seeds requires --graph-feedback-artifact <path>');
  }
  if (options.graphFeedbackPreviewEvidencePath && !options.useGraphFeedbackSeeds) {
    throw new Error('--graph-feedback-preview-evidence is only supported with --use-graph-feedback-seeds.');
  }
  if (options.graphFeedbackApprovalChecklistPath && !options.useGraphFeedbackSeeds) {
    throw new Error('--graph-feedback-approval-checklist is only supported with --use-graph-feedback-seeds.');
  }
  if (options.graphFeedbackApprovalReadinessPath && !options.useGraphFeedbackSeeds) {
    throw new Error('--graph-feedback-approval-readiness is only supported with --use-graph-feedback-seeds.');
  }
  if (options.graphFeedbackPostSeedChecklistPath && !options.useGraphFeedbackSeeds) {
    throw new Error('--graph-feedback-post-seed-checklist is only supported with --use-graph-feedback-seeds.');
  }
  if (options.graphFeedbackApprovalChecklistPath && !options.dryRun) {
    throw new Error('--graph-feedback-approval-checklist is dry-run only and never authorizes a real seed.');
  }
  if (options.graphFeedbackApprovalReadinessPath && !options.dryRun) {
    throw new Error('--graph-feedback-approval-readiness is dry-run only and never authorizes a real seed.');
  }
  if (options.graphFeedbackPostSeedChecklistPath && !options.dryRun) {
    throw new Error('--graph-feedback-post-seed-checklist is dry-run only and never runs post-seed checks.');
  }
  if (options.graphFeedbackApprovalChecklistPath && !options.graphFeedbackPreviewEvidencePath) {
    throw new Error('--graph-feedback-approval-checklist requires --graph-feedback-preview-evidence <path>.');
  }
  if (options.graphFeedbackApprovalReadinessPath && !options.graphFeedbackApprovalChecklistPath) {
    throw new Error('--graph-feedback-approval-readiness requires --graph-feedback-approval-checklist <path>.');
  }
  if (options.graphFeedbackApprovalReadinessPath && !options.graphFeedbackPreviewEvidencePath) {
    throw new Error('--graph-feedback-approval-readiness requires --graph-feedback-preview-evidence <path>.');
  }
  if (options.graphFeedbackPostSeedChecklistPath && !options.graphFeedbackPreviewEvidencePath) {
    throw new Error('--graph-feedback-post-seed-checklist requires --graph-feedback-preview-evidence <path>.');
  }
  if (options.seedAttemptLogPath && !options.useGraphFeedbackSeeds) {
    throw new Error('--seed-attempt-log is only supported with --use-graph-feedback-seeds.');
  }
  if (options.seedAttemptLogPath && options.dryRun) {
    throw new Error('--seed-attempt-log records live delegation only; use --graph-feedback-preview-evidence for dry-run proof.');
  }

  return executeInvocation(invocation, options.dryRun, options);
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
  extractRemoteDryRunHosts,
  buildRemoteDryRunGraphFeedback,
  buildRemoteDeployPreflightDryRunCommand,
  prepareGraphFeedbackLiveSeedInvocation,
  maybeRunRemoteDeployPreflight,
  remoteDeployPreflightOptionsFromLauncher,
  remoteCommandName,
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
