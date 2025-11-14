#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { Command } = require('commander');

const TEMPLATE_FILES = [
  'INDEX.md',
  'PLAN.md',
  'WORKING_NOTES.md',
  'SESSION_SUMMARY.md',
  'DECISIONS.md',
  'FOLLOW_UPS.md'
];

const DEFAULT_TYPE = 'General';

function todayISO() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function sanitizeSlug(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('A session slug is required.');
  }
  const slug = input.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!slug) {
    throw new Error('Slug must include at least one alphanumeric character.');
  }
  return slug;
}

function toTitle(slugOrTitle) {
  if (!slugOrTitle) {
    return 'Untitled Session';
  }
  const words = slugOrTitle
    .replace(/[-_]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return words.length ? words.join(' ') : 'Untitled Session';
}

async function pathExists(targetPath) {
  try {
    await fs.promises.access(targetPath, fs.constants.F_OK);
    return true;
  } catch (_) {
    return false;
  }
}

async function ensureDirectory(dirPath) {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

async function loadTemplate(templateDir, fileName) {
  const templatePath = path.join(templateDir, fileName);
  const content = await fs.promises.readFile(templatePath, 'utf8');
  return content;
}

function renderTemplate(content, context) {
  return content.replace(/{{(\w+)}}/g, (_, key) => context[key] ?? '');
}

async function writeTemplateFile({ targetPath, content, force }) {
  if (!force && await pathExists(targetPath)) {
    return false;
  }
  await fs.promises.writeFile(targetPath, content, 'utf8');
  return true;
}

function buildHubBlock({ date, title, sessionId, type, objective }) {
  const focusLine = objective ? `- ${objective}` : '- TBD';
  return [
    `### Session ${date}: ${title}`,
    '',
    '**Duration**: Active',
    `**Type**: ${type || DEFAULT_TYPE}`,
    '**Completion**: 🔄 In progress',
    '',
    '**Focus**:',
    focusLine,
    '',
    `**Location**: \`docs/sessions/${sessionId}/\``,
    '',
    '**Quick Links**:',
    `- 🧭 [Session Index](./${sessionId}/INDEX.md)`,
    `- 🗺️ [Plan](./${sessionId}/PLAN.md)`,
    `- 📝 [Working Notes](./${sessionId}/WORKING_NOTES.md)`,
    `- 📘 [Session Summary](./${sessionId}/SESSION_SUMMARY.md)`,
    `- ✅ [Follow Ups](./${sessionId}/FOLLOW_UPS.md)`
  ].join('\n');
}

function insertIntoHub(current, block) {
  if (!current.includes('## Current Session')) {
    return `${current.trim()}\n\n${block}\n`;
  }
  const firstSessionIndex = current.indexOf('### Session');
  if (firstSessionIndex === -1) {
    const markerIndex = current.indexOf('## How Agents Should Use Session Documentation');
    if (markerIndex === -1) {
      return `${current.trim()}\n\n${block}\n`;
    }
    return `${current.slice(0, markerIndex).trim()}\n\n${block}\n\n${current.slice(markerIndex)}`;
  }
  const before = current.slice(0, firstSessionIndex);
  const after = current.slice(firstSessionIndex);
  return `${before}${block}\n\n${after}`;
}

async function updateSessionsHub({ hubPath, block, heading }) {
  const hubContent = await fs.promises.readFile(hubPath, 'utf8');
  if (hubContent.includes(heading)) {
    return { updated: false, reason: 'exists' };
  }
  const nextContent = insertIntoHub(hubContent, `${block}\n`);
  await fs.promises.writeFile(hubPath, nextContent, 'utf8');
  return { updated: true };
}

async function createSessionResources({
  date = todayISO(),
  slug,
  title,
  type = DEFAULT_TYPE,
  objective = 'TBD',
  sessionsRoot,
  templatesDir,
  hubPath,
  reuseExisting = false,
  force = false
}) {
  const normalizedDate = date || todayISO();
  const normalizedSlug = sanitizeSlug(slug);
  const resolvedTitle = title?.trim() || toTitle(normalizedSlug);
  const sessionId = `${normalizedDate}-${normalizedSlug}`;
  const sessionDir = path.join(sessionsRoot, sessionId);

  const dirExists = await pathExists(sessionDir);
  if (dirExists && !reuseExisting) {
    throw new Error(`Session directory already exists: ${sessionDir}`);
  }

  await ensureDirectory(sessionDir);

  const context = {
    DATE: normalizedDate,
    TITLE: resolvedTitle,
    OBJECTIVE: objective || 'TBD',
    SESSION_ID: sessionId,
    SLUG: normalizedSlug
  };

  const created = [];
  for (const fileName of TEMPLATE_FILES) {
    const templateContent = await loadTemplate(templatesDir, fileName);
    const rendered = renderTemplate(templateContent, context);
    const targetPath = path.join(sessionDir, fileName);
    const fileCreated = await writeTemplateFile({ targetPath, content: rendered, force });
    if (fileCreated) {
      created.push(targetPath);
    }
  }

  const heading = `### Session ${normalizedDate}: ${resolvedTitle}`;
  let hubResult = { updated: false, reason: 'missing-hub-path' };
  if (hubPath) {
    hubResult = await updateSessionsHub({
      hubPath,
      block: buildHubBlock({ date: normalizedDate, title: resolvedTitle, sessionId, type, objective }),
      heading
    });
  }

  return {
    sessionId,
    sessionDir,
    createdFiles: created,
    hubUpdated: hubResult.updated,
    hubResult
  };
}

async function runCLI(argv) {
  const program = new Command();
  program
    .requiredOption('--slug <slug>', 'Session slug (kebab-case).')
    .option('--title <title>', 'Session title (defaults to slug title case).')
    .option('--objective <objective>', 'Session objective text.', 'TBD')
    .option('--type <type>', 'Session type label.', DEFAULT_TYPE)
    .option('--date <yyyy-mm-dd>', 'Session date (defaults to today).')
    .option('--dir <path>', 'Custom sessions root directory.')
    .option('--templates <path>', 'Template directory override.')
    .option('--hub <path>', 'Sessions hub markdown path override.')
    .option('--reuse', 'Reuse existing session directory if present.', false)
    .option('--force', 'Overwrite files when reusing an existing session.', false)
    .parse(argv);

  const opts = program.opts();
  const repoRoot = path.resolve(__dirname, '..', '..');
  const defaultSessionsRoot = path.join(repoRoot, 'docs', 'sessions');
  const defaultTemplates = path.join(__dirname, 'session-templates');
  const defaultHubPath = path.join(repoRoot, 'docs', 'sessions', 'SESSIONS_HUB.md');

  const result = await createSessionResources({
    date: opts.date || todayISO(),
    slug: opts.slug,
    title: opts.title,
    type: opts.type,
    objective: opts.objective,
    sessionsRoot: opts.dir ? path.resolve(opts.dir) : defaultSessionsRoot,
    templatesDir: opts.templates ? path.resolve(opts.templates) : defaultTemplates,
    hubPath: opts.hub ? path.resolve(opts.hub) : defaultHubPath,
    reuseExisting: Boolean(opts.reuse),
    force: Boolean(opts.force)
  });

  console.log(`Session ready: ${result.sessionId}`);
  console.log(`Directory: ${result.sessionDir}`);
  console.log(result.hubUpdated ? 'Sessions hub updated.' : 'Sessions hub already had an entry.');
}

if (require.main === module) {
  runCLI(process.argv).catch((error) => {
    console.error('[session-init] Failed:', error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  createSessionResources,
  updateSessionsHub,
  buildHubBlock,
  renderTemplate,
  sanitizeSlug,
  toTitle,
  todayISO
};
