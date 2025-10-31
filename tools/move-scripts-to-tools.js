#!/usr/bin/env node
/**
 * Move Scripts to Tools Tool
 *
 * Identifies and moves all script files from scripts/ directory to tools/ directory,
 * organizing them into categorized subdirectories.
 * Follows safety-first patterns with dry-run mode by default.
 *
 * Usage:
 *   node tools/move-scripts-to-tools.js [--fix] [--verbose]
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
const scriptsDir = path.join(repoRoot, 'scripts');
const toolsDir = path.join(repoRoot, 'tools');

// Categorization rules based on script names and functionality
function categorizeScript(fileName) {
  const name = fileName.toLowerCase();

  // Build and UI scripts
  if (name.includes('build') || name.includes('ui')) {
    return 'maintenance';
  }

  // Database and schema scripts
  if (name.includes('db') || name.includes('schema') || name.includes('table') ||
      name.includes('fk') || name.includes('foreign')) {
    return 'maintenance';
  }

  // Migration and phase scripts
  if (name.includes('migrate') || name.includes('phase') || name.includes('seed')) {
    return 'migrations';
  }

  // Analysis and debug scripts
  if (name.includes('analyze') || name.includes('check') || name.includes('show') ||
      name.includes('review') || name.includes('extract') || name.includes('temp')) {
    return 'debug';
  }

  // Correction and fix scripts
  if (name.includes('fix') || name.includes('cleanup') || name.includes('correct')) {
    return 'corrections';
  }

  // Crawl and hub discovery scripts
  if (name.includes('crawl') || name.includes('hub') || name.includes('discovery')) {
    return 'analysis';
  }

  // Export and data manipulation scripts
  if (name.includes('export') || name.includes('duplicate') || name.includes('missing')) {
    return 'maintenance';
  }

  // Sample and example scripts
  if (name.includes('sample')) {
    return 'examples';
  }

  // Default to maintenance for anything else
  return 'maintenance';
}

function log(message, force = false) {
  if (force || isVerbose) {
    console.log(message);
  }
}

function findScriptsToMove() {
  if (!fs.existsSync(scriptsDir)) {
    return [];
  }

  const entries = fs.readdirSync(scriptsDir, { withFileTypes: true });
  const scriptsToMove = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const fileName = entry.name;
    const category = categorizeScript(fileName);
    const categoryDir = path.join(toolsDir, category);
    const sourcePath = path.join(scriptsDir, fileName);
    const destPath = path.join(categoryDir, fileName);

    scriptsToMove.push({
      fileName,
      sourcePath,
      destPath,
      category,
      categoryDir,
      exists: fs.existsSync(destPath)
    });
  }

  return scriptsToMove;
}

function moveFile(sourcePath, destPath, categoryDir, fileName) {
  try {
    // Ensure category directory exists
    if (!fs.existsSync(categoryDir)) {
      fs.mkdirSync(categoryDir, { recursive: true });
      log(`📁 Created ${path.relative(repoRoot, categoryDir)}/ directory`, true);
    }

    // Move the file
    fs.renameSync(sourcePath, destPath);
    return { success: true, message: `✅ Moved ${fileName} → ${path.relative(repoRoot, destPath)}` };
  } catch (error) {
    return { success: false, message: `❌ Failed to move ${fileName}: ${error.message}` };
  }
}

function main() {
  console.log('🔧 Scripts to Tools Migration Tool (with categorization)');
  console.log('=======================================================');

  const scriptsToMove = findScriptsToMove();

  if (scriptsToMove.length === 0) {
    console.log('✅ No script files found that need moving.');
    return;
  }

  console.log(`📋 Found ${scriptsToMove.length} script file(s) to move:`);

  // Group by category for display
  const byCategory = scriptsToMove.reduce((acc, script) => {
    if (!acc[script.category]) acc[script.category] = [];
    acc[script.category].push(script);
    return acc;
  }, {});

  Object.keys(byCategory).sort().forEach(category => {
    console.log(`  📁 ${category}/`);
    byCategory[category].forEach(script => {
      const status = script.exists ? '⚠️  (file exists)' : '✅';
      console.log(`    ${status} ${script.fileName}`);
    });
  });

  console.log('');

  if (!isFix) {
    console.log('🔍 DRY RUN MODE - Use --fix to actually move files');
    console.log('');
    console.log('Summary of actions that would be taken:');
    scriptsToMove.forEach(script => {
      if (script.exists) {
        console.log(`  ⚠️  Would overwrite ${path.relative(repoRoot, script.destPath)}`);
      } else {
        console.log(`  📄 Would move ${script.fileName} → ${path.relative(repoRoot, script.destPath)}`);
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

  for (const script of scriptsToMove) {
    if (script.exists) {
      console.log(`⚠️  Skipping ${script.fileName} (already exists in ${script.category}/)`);
      skipped++;
      continue;
    }

    const result = moveFile(script.sourcePath, script.destPath, script.categoryDir, script.fileName);
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
    console.log('🎉 Scripts migration complete!');
    console.log('');
    console.log('📝 Note: You may need to update references in documentation files.');
    console.log('   Run: node tools/update-script-references.js --fix');
  }
}

main();