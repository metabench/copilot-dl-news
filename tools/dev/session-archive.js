#!/usr/bin/env node
'use strict';

/**
 * session-archive — CLI tool for archiving, extracting, and searching session folders.
 * 
 * Commands:
 *   --archive          Archive sessions older than N days into a ZIP file
 *   --extract <slug>   Extract a specific session from the archive
 *   --list             List all archived sessions
 *   --search <query>   Search archived sessions for content
 *   --read <slug>      Read and display an archived session's summary
 * 
 * @example
 *   node tools/dev/session-archive.js --archive --older-than 30 --fix
 *   node tools/dev/session-archive.js --list
 *   node tools/dev/session-archive.js --search "jsgui3 activation"
 *   node tools/dev/session-archive.js --read 2025-11-14-binding-plugin
 *   node tools/dev/session-archive.js --extract 2025-11-14-binding-plugin --fix
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { CliArgumentParser } = require('../../src/shared/utils/CliArgumentParser');
const { CliFormatter } = require('../../src/shared/utils/CliFormatter');

const SESSIONS_DIR = path.resolve(process.cwd(), 'docs', 'sessions');
const ARCHIVE_DIR = path.resolve(process.cwd(), 'docs', 'sessions', 'archive');
const ARCHIVE_FILE = path.join(ARCHIVE_DIR, 'sessions-archive.zip');
const MANIFEST_FILE = path.join(ARCHIVE_DIR, 'archive-manifest.json');

const SESSION_FILES = ['PLAN.md', 'SESSION_SUMMARY.md', 'WORKING_NOTES.md', 'FOLLOW_UPS.md', 'INDEX.md', 'DECISIONS.md'];

function writeJsonOutput({ payload, outputPath }) {
  const text = JSON.stringify(payload, null, 2);
  if (!outputPath) {
    console.log(text);
    return;
  }

  const abs = path.isAbsolute(outputPath) ? outputPath : path.resolve(process.cwd(), outputPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text, 'utf8');
  console.log(text);
}

async function copyDirectoryRecursive(srcDir, destDir) {
  const entries = await fs.promises.readdir(srcDir, { withFileTypes: true });
  await fs.promises.mkdir(destDir, { recursive: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirectoryRecursive(srcPath, destPath);
      continue;
    }

    if (entry.isFile()) {
      await fs.promises.copyFile(srcPath, destPath);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

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

function parseSessionDate(slug) {
  const match = slug.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) {
    const date = new Date(match[1]);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  return null;
}

function daysBetween(date1, date2) {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.floor(Math.abs((date2 - date1) / oneDay));
}

async function getSessionFolders() {
  const entries = await fs.promises.readdir(SESSIONS_DIR, { withFileTypes: true });
  const folders = [];
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== 'archive' && entry.name.match(/^\d{4}-\d{2}-\d{2}/)) {
      const sessionPath = path.join(SESSIONS_DIR, entry.name);
      const stats = await fs.promises.stat(sessionPath);
      folders.push({
        slug: entry.name,
        path: sessionPath,
        date: parseSessionDate(entry.name),
        mtime: stats.mtime
      });
    }
  }
  return folders.sort((a, b) => (a.date || new Date(0)) - (b.date || new Date(0)));
}

async function readManifest() {
  if (await pathExists(MANIFEST_FILE)) {
    try {
      const content = await fs.promises.readFile(MANIFEST_FILE, 'utf8');
      return JSON.parse(content);
    } catch (_) {
      return { sessions: [], lastUpdated: null };
    }
  }
  return { sessions: [], lastUpdated: null };
}

async function writeManifest(manifest) {
  manifest.lastUpdated = new Date().toISOString();
  await ensureDirectory(ARCHIVE_DIR);
  await fs.promises.writeFile(MANIFEST_FILE, JSON.stringify(manifest, null, 2), 'utf8');
}

async function readSessionSummary(sessionPath) {
  const summaryPath = path.join(sessionPath, 'SESSION_SUMMARY.md');
  const planPath = path.join(sessionPath, 'PLAN.md');
  
  let summary = null;
  let plan = null;
  
  if (await pathExists(summaryPath)) {
    summary = await fs.promises.readFile(summaryPath, 'utf8');
  }
  if (await pathExists(planPath)) {
    plan = await fs.promises.readFile(planPath, 'utf8');
  }
  
  // Extract objective from PLAN.md
  let objective = '';
  if (plan) {
    const objMatch = plan.match(/Objective:\s*(.+)/i);
    if (objMatch) {
      objective = objMatch[1].trim();
    }
  }
  
  // Extract outcome from SESSION_SUMMARY.md
  let outcome = '';
  if (summary) {
    const outcomeMatch = summary.match(/##\s*Outcome\s*\n([\s\S]*?)(?=\n##|$)/i);
    if (outcomeMatch) {
      outcome = outcomeMatch[1].trim().split('\n')[0];
    }
  }
  
  return { objective, outcome, hasSummary: !!summary, hasPlan: !!plan };
}

// ─────────────────────────────────────────────────────────────────────────────
// Archive Operations (using PowerShell Compress-Archive)
// ─────────────────────────────────────────────────────────────────────────────

async function addToArchive(sessionPath, slug, dryRun) {
  if (dryRun) {
    return { success: true, dryRun: true };
  }
  
  await ensureDirectory(ARCHIVE_DIR);
  
  // Create a temp folder for the session
  const tempDir = path.join(ARCHIVE_DIR, 'temp-archive-staging');
  const tempSessionDir = path.join(tempDir, slug);
  
  try {
    // Copy entire session tree to temp (sessions may contain nested folders like snippets/)
    await copyDirectoryRecursive(sessionPath, tempSessionDir);
    
    // Add to ZIP using PowerShell
    const archiveExists = await pathExists(ARCHIVE_FILE);
    if (archiveExists) {
      // Update existing archive
      execSync(`powershell -Command "Compress-Archive -Path '${tempSessionDir}' -Update -DestinationPath '${ARCHIVE_FILE}'"`, { stdio: 'pipe' });
    } else {
      // Create new archive
      execSync(`powershell -Command "Compress-Archive -Path '${tempSessionDir}' -DestinationPath '${ARCHIVE_FILE}'"`, { stdio: 'pipe' });
    }
    
    return { success: true };
  } finally {
    // Clean up temp
    if (await pathExists(tempDir)) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  }
}

async function extractFromArchive(slug, dryRun) {
  if (!await pathExists(ARCHIVE_FILE)) {
    return { success: false, error: 'Archive file does not exist' };
  }
  
  const targetPath = path.join(SESSIONS_DIR, slug);
  if (await pathExists(targetPath)) {
    return { success: false, error: `Session folder already exists: ${slug}` };
  }
  
  if (dryRun) {
    return { success: true, dryRun: true, targetPath };
  }
  
  // Extract using PowerShell
  const tempDir = path.join(ARCHIVE_DIR, 'temp-extract');
  try {
    await ensureDirectory(tempDir);
    execSync(`powershell -Command "Expand-Archive -Path '${ARCHIVE_FILE}' -DestinationPath '${tempDir}' -Force"`, { stdio: 'pipe' });
    
    const extractedPath = path.join(tempDir, slug);
    if (!await pathExists(extractedPath)) {
      return { success: false, error: `Session not found in archive: ${slug}` };
    }
    
    // Move to sessions dir
    await fs.promises.rename(extractedPath, targetPath);
    return { success: true, targetPath };
  } finally {
    if (await pathExists(tempDir)) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  }
}

async function removeFromArchive(slug, dryRun) {
  if (!await pathExists(ARCHIVE_FILE)) {
    return { success: false, error: 'Archive file does not exist' };
  }
  
  if (dryRun) {
    return { success: true, dryRun: true };
  }
  
  // PowerShell doesn't have a direct "remove from zip" command
  // We need to extract all, remove the folder, and recompress
  const tempDir = path.join(ARCHIVE_DIR, 'temp-remove');
  try {
    await ensureDirectory(tempDir);
    execSync(`powershell -Command "Expand-Archive -Path '${ARCHIVE_FILE}' -DestinationPath '${tempDir}' -Force"`, { stdio: 'pipe' });
    
    const targetPath = path.join(tempDir, slug);
    if (!await pathExists(targetPath)) {
      return { success: false, error: `Session not found in archive: ${slug}` };
    }
    
    await fs.promises.rm(targetPath, { recursive: true, force: true });
    
    // Check if any sessions remain
    const remaining = await fs.promises.readdir(tempDir);
    if (remaining.length === 0) {
      await fs.promises.rm(ARCHIVE_FILE);
      return { success: true, archiveDeleted: true };
    }
    
    // Recompress
    await fs.promises.rm(ARCHIVE_FILE);
    execSync(`powershell -Command "Compress-Archive -Path '${path.join(tempDir, '*')}' -DestinationPath '${ARCHIVE_FILE}'"`, { stdio: 'pipe' });
    
    return { success: true };
  } finally {
    if (await pathExists(tempDir)) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  }
}

async function listArchivedSessions() {
  const manifest = await readManifest();
  
  // Also check the ZIP directly if manifest is empty
  if (manifest.sessions.length === 0 && await pathExists(ARCHIVE_FILE)) {
    const tempDir = path.join(ARCHIVE_DIR, 'temp-list');
    try {
      await ensureDirectory(tempDir);
      execSync(`powershell -Command "Expand-Archive -Path '${ARCHIVE_FILE}' -DestinationPath '${tempDir}' -Force"`, { stdio: 'pipe' });
      
      const entries = await fs.promises.readdir(tempDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          manifest.sessions.push({
            slug: entry.name,
            archivedAt: null,
            objective: '',
            outcome: ''
          });
        }
      }
    } finally {
      if (await pathExists(tempDir)) {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      }
    }
  }
  
  return manifest.sessions;
}

async function searchArchive(query, maxResults = 20) {
  if (!await pathExists(ARCHIVE_FILE)) {
    return { matches: [], error: null };
  }
  
  const tempDir = path.join(ARCHIVE_DIR, 'temp-search');
  const matches = [];
  const queryLower = query.toLowerCase();
  
  try {
    await ensureDirectory(tempDir);
    execSync(`powershell -Command "Expand-Archive -Path '${ARCHIVE_FILE}' -DestinationPath '${tempDir}' -Force"`, { stdio: 'pipe' });
    
    const sessions = await fs.promises.readdir(tempDir, { withFileTypes: true });
    
    for (const session of sessions) {
      if (!session.isDirectory()) continue;
      
      const sessionPath = path.join(tempDir, session.name);
      const files = await fs.promises.readdir(sessionPath);
      
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        
        const filePath = path.join(sessionPath, file);
        const content = await fs.promises.readFile(filePath, 'utf8');
        const contentLower = content.toLowerCase();
        
        if (contentLower.includes(queryLower)) {
          // Find matching lines
          const lines = content.split('\n');
          const matchingLines = [];
          for (let i = 0; i < lines.length && matchingLines.length < 3; i++) {
            if (lines[i].toLowerCase().includes(queryLower)) {
              matchingLines.push({
                lineNumber: i + 1,
                text: lines[i].substring(0, 120)
              });
            }
          }
          
          matches.push({
            session: session.name,
            file: file,
            matchCount: (contentLower.match(new RegExp(queryLower, 'g')) || []).length,
            lines: matchingLines
          });
          
          if (matches.length >= maxResults) {
            return { matches, truncated: true };
          }
        }
      }
    }
    
    return { matches, truncated: false };
  } finally {
    if (await pathExists(tempDir)) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  }
}

async function readArchivedSession(slug) {
  if (!await pathExists(ARCHIVE_FILE)) {
    return { success: false, error: 'Archive file does not exist' };
  }
  
  const tempDir = path.join(ARCHIVE_DIR, 'temp-read');
  try {
    await ensureDirectory(tempDir);
    execSync(`powershell -Command "Expand-Archive -Path '${ARCHIVE_FILE}' -DestinationPath '${tempDir}' -Force"`, { stdio: 'pipe' });
    
    const sessionPath = path.join(tempDir, slug);
    if (!await pathExists(sessionPath)) {
      return { success: false, error: `Session not found in archive: ${slug}` };
    }
    
    const files = {};
    const entries = await fs.promises.readdir(sessionPath);
    for (const entry of entries) {
      if (entry.endsWith('.md')) {
        files[entry] = await fs.promises.readFile(path.join(sessionPath, entry), 'utf8');
      }
    }
    
    return { success: true, slug, files };
  } finally {
    if (await pathExists(tempDir)) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  }
}

/**
 * Read multiple archived sessions in a single extraction operation.
 * More efficient than calling readArchivedSession multiple times.
 * 
 * @param {string[]} slugs - Array of session slugs to read
 * @returns {Promise<{success: boolean, sessions: Object[], errors: Object[]}>}
 */
async function readArchivedSessions(slugs) {
  if (!await pathExists(ARCHIVE_FILE)) {
    return { success: false, sessions: [], errors: [{ slug: '*', error: 'Archive file does not exist' }] };
  }
  
  if (!Array.isArray(slugs) || slugs.length === 0) {
    return { success: false, sessions: [], errors: [{ slug: '*', error: 'No slugs provided' }] };
  }
  
  const tempDir = path.join(ARCHIVE_DIR, 'temp-read-multi');
  const sessions = [];
  const errors = [];
  
  try {
    await ensureDirectory(tempDir);
    execSync(`powershell -Command "Expand-Archive -Path '${ARCHIVE_FILE}' -DestinationPath '${tempDir}' -Force"`, { stdio: 'pipe' });
    
    for (const slug of slugs) {
      const sessionPath = path.join(tempDir, slug);
      if (!await pathExists(sessionPath)) {
        errors.push({ slug, error: `Session not found in archive: ${slug}` });
        continue;
      }
      
      const files = {};
      const entries = await fs.promises.readdir(sessionPath);
      for (const entry of entries) {
        if (entry.endsWith('.md')) {
          files[entry] = await fs.promises.readFile(path.join(sessionPath, entry), 'utf8');
        }
      }
      
      sessions.push({ slug, files });
    }
    
    return { 
      success: errors.length === 0, 
      sessions, 
      errors,
      stats: {
        requested: slugs.length,
        found: sessions.length,
        notFound: errors.length
      }
    };
  } finally {
    if (await pathExists(tempDir)) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main CLI
// ─────────────────────────────────────────────────────────────────────────────

async function runCli() {
  const parser = new CliArgumentParser(
    'session-archive',
    'Archive, extract, and search session folders',
    '1.0.0'
  );
  
  parser
    .add('--archive', 'Archive sessions older than N days', false, 'boolean')
    .add('--older-than <days>', 'Days threshold for archiving (default: 30)', 30, 'number')
    .add('--extract <slug>', 'Extract a session from archive')
    .add('--remove <slug>', 'Remove a session from archive')
    .add('--list', 'List all archived sessions', false, 'boolean')
    .add('--search <query>', 'Search archived sessions for content')
    .add('--read <slugs...>', 'Read one or more archived sessions (space-separated)')
    .add('--keep-original', 'When used with --archive --fix, keep original session folders (do not delete)', false, 'boolean')
    .add('--fix', 'Apply changes (default is dry-run)', false, 'boolean')
    .add('--json', 'Output as JSON', false, 'boolean')
    .add('--output <file>', 'When used with --json, also write JSON to a file (UTF-8, no BOM)')
    .add('--quiet', 'Suppress formatted output', false, 'boolean')
    .add('--limit <number>', 'Limit results', 20, 'number');
  
  const args = parser.parse(process.argv);
  const dryRun = args.fix !== true;
  const formatter = new CliFormatter();
  
  // ─────────────────────────────────────────────────────────────────────────
  // Command: --archive
  // ─────────────────────────────────────────────────────────────────────────
  if (args.archive) {
    const olderThan = Number.isFinite(args.olderThan) ? args.olderThan : 30;
    const now = new Date();
    const sessions = await getSessionFolders();
    const manifest = await readManifest();
    const keepOriginal = args.keepOriginal === true;
    
    const toArchive = sessions.filter(s => {
      if (!s.date) return false;
      const age = daysBetween(s.date, now);
      return age > olderThan;
    });
    
    if (args.json) {
      const result = {
        dryRun,
        olderThan,
        totalSessions: sessions.length,
        toArchive: toArchive.map(s => ({ slug: s.slug, date: s.date?.toISOString().split('T')[0], ageDays: daysBetween(s.date, now) })),
        archived: [],
        errors: []
      };
      
      if (!dryRun) {
        for (const session of toArchive) {
          const summary = await readSessionSummary(session.path);
          const archiveResult = await addToArchive(session.path, session.slug, false);
          
          if (archiveResult.success) {
            if (!keepOriginal) {
              // Remove original folder
              await fs.promises.rm(session.path, { recursive: true, force: true });
            }
            
            // Update manifest
            manifest.sessions.push({
              slug: session.slug,
              archivedAt: new Date().toISOString(),
              objective: summary.objective,
              outcome: summary.outcome
            });
            
            result.archived.push(session.slug);
          } else {
            result.errors.push({ slug: session.slug, error: archiveResult.error });
          }
        }
        await writeManifest(manifest);
      }
      
      writeJsonOutput({ payload: result, outputPath: args.output });
      return;
    }
    
    if (!args.quiet) {
      formatter.header('Session Archive');
      formatter.stat('Mode', dryRun ? 'preview (dry-run)' : 'archive (--fix)');
      formatter.stat('Keep original', keepOriginal ? 'YES' : 'NO');
      formatter.stat('Threshold', `${olderThan} days`);
      formatter.stat('Total sessions', sessions.length, 'number');
      formatter.stat('Sessions to archive', toArchive.length, 'number');
      
      if (toArchive.length > 0) {
        formatter.section('Sessions to Archive');
        const rows = toArchive.slice(0, 15).map(s => ({
          slug: s.slug,
          date: s.date?.toISOString().split('T')[0] || '?',
          age: `${daysBetween(s.date, now)} days`
        }));
        formatter.table(rows, { columns: ['slug', 'date', 'age'] });
        
        if (toArchive.length > 15) {
          formatter.info(`... and ${toArchive.length - 15} more`);
        }
      }
      
      if (!dryRun && toArchive.length > 0) {
        formatter.section('Archiving');
        for (const session of toArchive) {
          const summary = await readSessionSummary(session.path);
          const archiveResult = await addToArchive(session.path, session.slug, false);
          
          if (archiveResult.success) {
            if (!keepOriginal) {
              await fs.promises.rm(session.path, { recursive: true, force: true });
            }
            
            manifest.sessions.push({
              slug: session.slug,
              archivedAt: new Date().toISOString(),
              objective: summary.objective,
              outcome: summary.outcome
            });
            
            formatter.success(`Archived: ${session.slug}`);
          } else {
            formatter.error(`Failed: ${session.slug} - ${archiveResult.error}`);
          }
        }
        await writeManifest(manifest);
      } else if (dryRun && toArchive.length > 0) {
        formatter.info('Run with --fix to apply archiving');
      }
    }
    return;
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Command: --list
  // ─────────────────────────────────────────────────────────────────────────
  if (args.list) {
    const sessions = await listArchivedSessions();
    
    if (args.json) {
      writeJsonOutput({ payload: { sessions, count: sessions.length }, outputPath: args.output });
      return;
    }
    
    if (!args.quiet) {
      formatter.header('Archived Sessions');
      formatter.stat('Total archived', sessions.length, 'number');
      
      if (sessions.length > 0) {
        const rows = sessions.slice(0, args.limit).map(s => ({
          slug: s.slug,
          archived: s.archivedAt ? s.archivedAt.split('T')[0] : '?',
          objective: (s.objective || '').substring(0, 60)
        }));
        formatter.table(rows, { columns: ['slug', 'archived', 'objective'] });
        
        if (sessions.length > args.limit) {
          formatter.info(`... and ${sessions.length - args.limit} more (use --limit to see more)`);
        }
      } else {
        formatter.info('No archived sessions found');
      }
    }
    return;
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Command: --search
  // ─────────────────────────────────────────────────────────────────────────
  if (args.search) {
    const result = await searchArchive(args.search, args.limit);
    
    if (args.json) {
      writeJsonOutput({ payload: result, outputPath: args.output });
      return;
    }
    
    if (!args.quiet) {
      formatter.header('Archive Search');
      formatter.stat('Query', args.search);
      formatter.stat('Matches', result.matches.length, 'number');
      
      if (result.matches.length > 0) {
        formatter.section('Results');
        for (const match of result.matches) {
          console.log(`\n  📁 ${match.session} / ${match.file} (${match.matchCount} matches)`);
          for (const line of match.lines) {
            console.log(`     L${line.lineNumber}: ${line.text}`);
          }
        }
      } else {
        formatter.info('No matches found in archived sessions');
      }
      
      if (result.truncated) {
        formatter.info(`Results truncated. Use --limit to see more.`);
      }
    }
    return;
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Command: --read (supports multiple sessions)
  // ─────────────────────────────────────────────────────────────────────────
  if (args.read) {
    // Normalize to array (commander may return string or array depending on input)
    const slugs = Array.isArray(args.read) ? args.read : [args.read];
    
    // Use multi-read function for efficiency (single extraction)
    const result = await readArchivedSessions(slugs);
    
    if (args.json) {
      writeJsonOutput({ payload: result, outputPath: args.output });
      return;
    }
    
    if (result.errors.length > 0 && result.sessions.length === 0) {
      for (const err of result.errors) {
        formatter.error(err.error);
      }
      process.exitCode = 1;
      return;
    }
    
    if (!args.quiet) {
      // Show stats if multiple sessions requested
      if (slugs.length > 1) {
        formatter.header('Archived Sessions');
        formatter.stat('Requested', result.stats.requested, 'number');
        formatter.stat('Found', result.stats.found, 'number');
        if (result.stats.notFound > 0) {
          formatter.stat('Not found', result.stats.notFound, 'number');
        }
      }
      
      for (const session of result.sessions) {
        formatter.header(`Session: ${session.slug}`);
        
        // Show SESSION_SUMMARY first if it exists
        if (session.files['SESSION_SUMMARY.md']) {
          formatter.section('SESSION_SUMMARY.md');
          console.log(session.files['SESSION_SUMMARY.md']);
        }
        
        // Show PLAN.md
        if (session.files['PLAN.md']) {
          formatter.section('PLAN.md (excerpt)');
          const planLines = session.files['PLAN.md'].split('\n').slice(0, 30);
          console.log(planLines.join('\n'));
          if (session.files['PLAN.md'].split('\n').length > 30) {
            formatter.info('... (truncated, use --json for full content)');
          }
        }
        
        formatter.section('Available Files');
        for (const file of Object.keys(session.files)) {
          console.log(`  - ${file}`);
        }
      }
      
      // Show errors at the end
      if (result.errors.length > 0) {
        formatter.section('Errors');
        for (const err of result.errors) {
          formatter.error(`${err.slug}: ${err.error}`);
        }
      }
    }
    return;
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Command: --extract
  // ─────────────────────────────────────────────────────────────────────────
  if (args.extract) {
    const result = await extractFromArchive(args.extract, dryRun);
    
    if (args.json) {
      writeJsonOutput({ payload: result, outputPath: args.output });
      return;
    }
    
    if (!result.success) {
      formatter.error(result.error);
      process.exitCode = 1;
      return;
    }
    
    if (!args.quiet) {
      if (dryRun) {
        formatter.info(`Would extract: ${args.extract}`);
        formatter.info(`To: ${result.targetPath}`);
        formatter.info('Run with --fix to apply');
      } else {
        formatter.success(`Extracted: ${args.extract}`);
        formatter.stat('Location', result.targetPath);
      }
    }
    return;
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Command: --remove
  // ─────────────────────────────────────────────────────────────────────────
  if (args.remove) {
    const result = await removeFromArchive(args.remove, dryRun);
    
    if (args.json) {
      writeJsonOutput({ payload: result, outputPath: args.output });
      return;
    }
    
    if (!result.success) {
      formatter.error(result.error);
      process.exitCode = 1;
      return;
    }
    
    if (!args.quiet) {
      if (dryRun) {
        formatter.info(`Would remove from archive: ${args.remove}`);
        formatter.info('Run with --fix to apply');
      } else {
        formatter.success(`Removed from archive: ${args.remove}`);
        if (result.archiveDeleted) {
          formatter.info('Archive file deleted (was empty)');
        }
        
        // Update manifest
        const manifest = await readManifest();
        manifest.sessions = manifest.sessions.filter(s => s.slug !== args.remove);
        await writeManifest(manifest);
      }
    }
    return;
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // No command specified - show help
  // ─────────────────────────────────────────────────────────────────────────
  if (!args.quiet) {
    formatter.header('session-archive');
    console.log(`
  Usage:
    session-archive --archive [--older-than <days>] [--fix]   Archive old sessions
    session-archive --list                                    List archived sessions
    session-archive --search <query>                          Search archives
    session-archive --read <slug> [<slug2> ...]               Read one or more sessions
    session-archive --extract <slug> [--fix]                  Restore from archive
    session-archive --remove <slug> [--fix]                   Remove from archive

  Options:
    --older-than <days>   Age threshold for archiving (default: 30)
    --fix                 Apply changes (default is dry-run)
    --json                Output as JSON
    --limit <number>      Limit results (default: 20)
    --quiet               Suppress formatted output

  Examples:
    node tools/dev/session-archive.js --archive --older-than 45
    node tools/dev/session-archive.js --archive --older-than 30 --fix
    node tools/dev/session-archive.js --list
    node tools/dev/session-archive.js --search "jsgui3 activation"
    node tools/dev/session-archive.js --read 2025-11-14-binding-plugin
    node tools/dev/session-archive.js --read 2025-11-14-binding-plugin 2025-11-15-client-activation --json
    node tools/dev/session-archive.js --extract 2025-11-14-binding-plugin --fix
`);
  }
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  getSessionFolders,
  listArchivedSessions,
  searchArchive,
  readArchivedSession,
  readArchivedSessions,
  addToArchive,
  extractFromArchive,
  removeFromArchive
};

