#!/usr/bin/env node
/**
 * Move Documentation Files Tool
 *
 * Identifies and moves documentation files from root directory to docs/ directory.
 * Follows safety-first patterns with dry-run mode by default.
 *
 * Usage:
 *   node tools/move-docs-to-docs.js [--fix] [--verbose]
 *
 * Options:
 *   --fix      Actually move the files (default: dry-run only)
 *   --verbose  Show detailed output
 */

const fs = require('fs');
const path = require('path');

// Simple arg parser
const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg.startsWith('--')) {
    const key = arg.replace(/^--/, '');
    if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      args[key] = argv[i + 1];
      i++; // skip next element
    } else {
      args[key] = true;
    }
  }
}

const isFix = args.fix === true;
const isVerbose = args.verbose === true;

const repoRoot = path.resolve(__dirname, '..');
const docsDir = path.join(repoRoot, 'docs');

// Files that should stay in root (agents and readme)
const keepInRoot = new Set([
  'AGENTS.md',
  'AGENTS_IMMEDIATE.js',
  'AGENTS_NEW.md',
  'AGENT_IMMEDIATE.js',
  'README.md'
]);

function log(message, force = false) {
  if (force || isVerbose) {
    console.log(message);
  }
}

function findDocsToMove() {
  const entries = fs.readdirSync(repoRoot, { withFileTypes: true });
  const docsToMove = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const fileName = entry.name;
    const ext = path.extname(fileName);

    // Only consider .md files
    if (ext !== '.md') continue;

    // Skip files that should stay in root
    if (keepInRoot.has(fileName)) continue;

    const sourcePath = path.join(repoRoot, fileName);
    const destPath = path.join(docsDir, fileName);

    docsToMove.push({
      fileName,
      sourcePath,
      destPath,
      exists: fs.existsSync(destPath)
    });
  }

  return docsToMove;
}

function moveFile(sourcePath, destPath, fileName) {
  try {
    // Ensure docs directory exists
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
      log(`📁 Created docs/ directory`, true);
    }

    // Move the file
    fs.renameSync(sourcePath, destPath);
    return { success: true, message: `✅ Moved ${fileName} → docs/${fileName}` };
  } catch (error) {
    return { success: false, message: `❌ Failed to move ${fileName}: ${error.message}` };
  }
}

function main() {
  console.log('🔍 Documentation File Organization Tool');
  console.log('=====================================');

  const docsToMove = findDocsToMove();

  if (docsToMove.length === 0) {
    console.log('✅ No documentation files found that need moving.');
    return;
  }

  console.log(`📋 Found ${docsToMove.length} documentation file(s) to move:`);
  docsToMove.forEach(doc => {
    const status = doc.exists ? '⚠️  (file exists in docs/)' : '✅';
    console.log(`  ${status} ${doc.fileName}`);
  });

  console.log('');

  if (!isFix) {
    console.log('🔍 DRY RUN MODE - Use --fix to actually move files');
    console.log('');
    console.log('Summary of actions that would be taken:');
    docsToMove.forEach(doc => {
      if (doc.exists) {
        console.log(`  ⚠️  Would overwrite docs/${doc.fileName}`);
      } else {
        console.log(`  📄 Would move ${doc.fileName} → docs/${doc.fileName}`);
      }
    });
    console.log('');
    console.log('Run with --fix to execute these moves.');
    return;
  }

  // Execute moves
  console.log('🔧 EXECUTING FILE MOVES');
  console.log('');

  const results = [];
  let moved = 0;
  let skipped = 0;
  let errors = 0;

  for (const doc of docsToMove) {
    if (doc.exists) {
      console.log(`⚠️  Skipping ${doc.fileName} (already exists in docs/)`);
      skipped++;
      continue;
    }

    const result = moveFile(doc.sourcePath, doc.destPath, doc.fileName);
    results.push(result);

    if (result.success) {
      console.log(result.message);
      moved++;
    } else {
      console.log(result.message);
      errors++;
    }
  }

  console.log('');
  console.log('📊 Summary:');
  console.log(`  ✅ Moved: ${moved} file(s)`);
  console.log(`  ⚠️  Skipped: ${skipped} file(s) (already exist)`);
  console.log(`  ❌ Errors: ${errors} file(s)`);

  if (errors > 0) {
    console.log('');
    console.log('❌ Some files failed to move. Check error messages above.');
    process.exit(1);
  } else {
    console.log('');
    console.log('🎉 Documentation organization complete!');
  }
}

main();