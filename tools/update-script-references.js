#!/usr/bin/env node

/**
 * Update Script References Tool
 * Updates documentation references from scripts/ to tools/category/ paths
 */

const fs = require('fs');
const path = require('path');

// Script categorization mapping (same as move-scripts-to-tools.js)
function categorizeScript(filename) {
  const name = filename.toLowerCase();

  // Analysis scripts
  if (name.includes('hub') && (name.includes('discovery') || name.includes('analysis'))) {
    return 'analysis';
  }

  // Correction scripts
  if (name.includes('cleanup') || name.includes('fix-') || name.includes('corrections')) {
    return 'corrections';
  }

  // Debug scripts
  if (name.includes('check-') || name.includes('analyze_') || name.includes('show-') ||
      name.includes('extract') || name.includes('temp_') || name.includes('_duplicates')) {
    return 'debug';
  }

  // Example scripts
  if (name.includes('sample') || name.includes('example')) {
    return 'examples';
  }

  // Maintenance scripts
  if (name.includes('build-') || name.includes('phase-') || name.includes('review-') ||
      name.includes('schema') || name.includes('fk')) {
    return 'maintenance';
  }

  // Migration scripts
  if (name.includes('migrate') || name.includes('seed-') || name.includes('dual-write')) {
    return 'migrations';
  }

  // Default to maintenance for anything else
  return 'maintenance';
}

function findMarkdownFiles(dir, files = []) {
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
      findMarkdownFiles(fullPath, files);
    } else if (stat.isFile() && (item.endsWith('.md') || item.endsWith('.MD'))) {
      files.push(fullPath);
    }
  }

  return files;
}

function updateReferencesInFile(filePath, scriptMappings, isDryRun = true) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changes = 0;

  for (const [oldPath, newPath] of scriptMappings) {
    const regex = new RegExp(`scripts/${oldPath}`, 'g');
    if (regex.test(content)) {
      if (!isDryRun) {
        content = content.replace(regex, newPath);
      }
      changes++;
    }
  }

  if (changes > 0) {
    if (isDryRun) {
      console.log(`📝 ${filePath}: ${changes} reference(s) to update`);
    } else {
      console.log(`✅ Updated ${filePath}: ${changes} reference(s)`);
    }
  }

  return changes;
}

function main() {
  const args = process.argv.slice(2);
  const isDryRun = !args.includes('--fix');
  const isVerbose = args.includes('--verbose');

  console.log('🔧 Update Script References Tool');
  console.log('==================================');
  console.log(`${isDryRun ? '🔍 DRY RUN MODE' : '🔧 EXECUTING UPDATES'}`);
  console.log('');

  // Get all scripts that were moved (from tools/ categorized directories)
  const toolsDir = path.join(__dirname, '..', 'tools');
  let scriptMappings = new Map();

  if (fs.existsSync(toolsDir)) {
    const categories = ['analysis', 'corrections', 'debug', 'examples', 'maintenance', 'migrations'];
    
    for (const category of categories) {
      const categoryDir = path.join(toolsDir, category);
      if (fs.existsSync(categoryDir)) {
        const files = fs.readdirSync(categoryDir)
          .filter(file => file.endsWith('.js'))
          .map(file => file.replace('.js', ''));
        
        for (const script of files) {
          const oldPath = `${script}.js`;
          const newPath = `tools/${category}/${script}.js`;
          scriptMappings.set(oldPath, newPath);
        }
      }
    }
  }

  console.log(`📋 Found ${scriptMappings.size} script mapping(s):`);
  if (isVerbose) {
    for (const [oldPath, newPath] of scriptMappings) {
      console.log(`  ${oldPath} → ${newPath}`);
    }
  }
  console.log('');

  // Find all markdown files
  const markdownFiles = findMarkdownFiles(process.cwd());
  console.log(`📁 Found ${markdownFiles.length} markdown file(s) to check`);
  console.log('');

  let totalChanges = 0;
  let filesChanged = 0;

  for (const file of markdownFiles) {
    const changes = updateReferencesInFile(file, scriptMappings, isDryRun);
    if (changes > 0) {
      totalChanges += changes;
      filesChanged++;
    }
  }

  console.log('');
  console.log('📊 Summary:');
  console.log(`  📝 Files with references: ${filesChanged}`);
  console.log(`  🔄 Total references ${isDryRun ? 'to update' : 'updated'}: ${totalChanges}`);

  if (isDryRun && totalChanges > 0) {
    console.log('');
    console.log('💡 To apply these changes, run:');
    console.log('   node tools/update-script-references.js --fix');
  } else if (totalChanges === 0) {
    console.log('');
    console.log('✅ No references found to update');
  } else {
    console.log('');
    console.log('🎉 Reference updates complete!');
  }
}

if (require.main === module) {
  main();
}

module.exports = { categorizeScript, findMarkdownFiles, updateReferencesInFile };