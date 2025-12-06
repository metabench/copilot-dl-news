#!/usr/bin/env node
'use strict';

/**
 * Agent Rename CLI Tool
 * 
 * Renames agent files safely, preserving emojis and Unicode characters.
 * 
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * CRITICAL: PowerShell Emoji Anti-Pattern
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 
 * ❌ NEVER use PowerShell's Rename-Item, Move-Item, or mv for emoji filenames:
 * 
 *    Move-Item "🧠 Brain.md" "💡 Light.md"  # MANGLES to: ð§  Brain.md
 *    Rename-Item "🧠 Brain.md" "💡 Light.md"  # Same issue
 * 
 * This happens because PowerShell 5.1 defaults to legacy Windows-1252/CP437 
 * encoding for file system operations, even when the console is set to UTF-8.
 * 
 * ✅ This tool uses Node.js fs.renameSync() which:
 *    - Operates at the OS level using proper UTF-16 API calls
 *    - Correctly handles emojis, CJK characters, and all Unicode
 *    - Works regardless of PowerShell encoding settings
 * 
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 
 * @example
 * # Rename by old name (partial match supported)
 * node tools/dev/agent-rename.js --from "🧠 jsgui3 Research" --to "🔬 jsgui3 Deep Research 🔬"
 * 
 * @example
 * # List all agents
 * node tools/dev/agent-rename.js --list
 * 
 * @example
 * # Dry run (preview changes)
 * node tools/dev/agent-rename.js --from "Brain" --to "🧠 Super Brain 🧠" --dry-run
 * 
 * @example
 * # Search for agents by pattern
 * node tools/dev/agent-rename.js --search "Singularity"
 */

const fs = require('fs');
const path = require('path');
const { Command } = require('commander');
const { setupPowerShellEncoding } = require('./shared/powershellEncoding');

// Ensure proper UTF-8 output for console messages
setupPowerShellEncoding();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Configuration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const AGENTS_DIR = path.resolve(__dirname, '../../.github/agents');
const AGENT_EXTENSION = '.agent.md';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Utility Functions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Check if a filename contains emoji characters.
 * Uses Unicode properties to detect Extended_Pictographic range.
 * 
 * @param {string} name - Filename to check
 * @returns {boolean} True if contains emojis
 */
function containsEmoji(name) {
  // Unicode property escapes for emoji detection (ES2018+)
  const emojiPattern = /\p{Extended_Pictographic}/u;
  return emojiPattern.test(name);
}

/**
 * Get all agent files from the agents directory.
 * 
 * @returns {Array<{name: string, path: string, hasEmoji: boolean}>} Agent file info
 */
function getAgentFiles() {
  if (!fs.existsSync(AGENTS_DIR)) {
    console.error(`❌ Agents directory not found: ${AGENTS_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(AGENTS_DIR, { encoding: 'utf8' });
  
  return files
    .filter(f => f.endsWith(AGENT_EXTENSION))
    .map(f => ({
      name: f.replace(AGENT_EXTENSION, ''),
      fileName: f,
      path: path.join(AGENTS_DIR, f),
      hasEmoji: containsEmoji(f)
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Find agent by partial name match.
 * 
 * @param {string} searchTerm - Partial name to search for
 * @returns {Array<Object>} Matching agents
 */
function findAgentsByName(searchTerm) {
  const agents = getAgentFiles();
  const lowerSearch = searchTerm.toLowerCase();
  
  return agents.filter(agent => 
    agent.name.toLowerCase().includes(lowerSearch)
  );
}

/**
 * Format agent name for display with emoji indicator.
 * 
 * @param {Object} agent - Agent object
 * @returns {string} Formatted display string
 */
function formatAgentDisplay(agent) {
  const emojiIndicator = agent.hasEmoji ? '🎨' : '📄';
  return `${emojiIndicator} ${agent.name}`;
}

/**
 * Validate new agent name.
 * 
 * @param {string} name - Proposed agent name
 * @returns {{valid: boolean, error?: string}} Validation result
 */
function validateAgentName(name) {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Agent name must be a non-empty string' };
  }

  const trimmed = name.trim();
  
  if (trimmed.length === 0) {
    return { valid: false, error: 'Agent name cannot be empty or whitespace only' };
  }

  if (trimmed.length > 100) {
    return { valid: false, error: 'Agent name too long (max 100 characters)' };
  }

  // Check for invalid filesystem characters (Windows)
  const invalidChars = /[<>:"/\\|?*\x00-\x1f]/;
  if (invalidChars.test(trimmed)) {
    return { valid: false, error: 'Agent name contains invalid filesystem characters' };
  }

  return { valid: true };
}

/**
 * Perform the actual file rename using Node.js fs (not PowerShell).
 * 
 * WHY THIS WORKS:
 * - Node.js fs.renameSync() uses libuv which calls OS-level APIs
 * - On Windows: Uses MoveFileExW (UTF-16 wide char API) 
 * - Bypasses PowerShell's encoding layer entirely
 * - Correctly handles emojis, CJK, and all Unicode
 * 
 * @param {string} oldPath - Current file path
 * @param {string} newPath - New file path
 * @param {boolean} dryRun - If true, only simulate the rename
 * @returns {boolean} True if successful (or would be successful in dry run)
 */
function renameAgentFile(oldPath, newPath, dryRun = false) {
  // Verify source exists
  if (!fs.existsSync(oldPath)) {
    console.error(`❌ Source file not found: ${oldPath}`);
    return false;
  }

  // Check target doesn't already exist
  if (fs.existsSync(newPath)) {
    console.error(`❌ Target file already exists: ${newPath}`);
    return false;
  }

  if (dryRun) {
    console.log('🔍 DRY RUN - Would rename:');
    console.log(`   From: ${path.basename(oldPath)}`);
    console.log(`   To:   ${path.basename(newPath)}`);
    return true;
  }

  try {
    // The magic: Node.js rename uses proper UTF-16 OS APIs
    fs.renameSync(oldPath, newPath);
    return true;
  } catch (error) {
    console.error(`❌ Rename failed: ${error.message}`);
    return false;
  }
}

/**
 * Update internal references in the renamed agent file.
 * Updates the agent name in frontmatter if present.
 * 
 * @param {string} filePath - Path to the agent file
 * @param {string} newName - New agent name (without extension)
 */
function updateAgentInternals(filePath, newName) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Check for frontmatter with name field
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      // Update name field if present (simplified - could use yaml parser for complex cases)
      if (frontmatter.includes('name:')) {
        const updatedContent = content.replace(
          /^(---\n[\s\S]*?name:\s*).+?([\s\S]*?\n---)/,
          `$1"${newName}"$2`
        );
        fs.writeFileSync(filePath, updatedContent, 'utf8');
        console.log('📝 Updated internal name reference in frontmatter');
      }
    }
  } catch (error) {
    // Non-fatal: file was renamed successfully, just couldn't update internals
    console.warn(`⚠️ Could not update internal references: ${error.message}`);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CLI Commands
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * List all agent files.
 * 
 * @param {Object} options - CLI options
 */
function listAgents(options) {
  const agents = getAgentFiles();
  
  if (agents.length === 0) {
    console.log('No agent files found.');
    return;
  }

  console.log(`\n📁 Agent Files (${agents.length} total)\n`);
  console.log('━'.repeat(60));
  
  // Group by emoji vs non-emoji
  const withEmoji = agents.filter(a => a.hasEmoji);
  const withoutEmoji = agents.filter(a => !a.hasEmoji);

  if (withEmoji.length > 0) {
    console.log(`\n🎨 With Emoji (${withEmoji.length}):\n`);
    withEmoji.forEach(agent => {
      console.log(`   ${agent.name}`);
    });
  }

  if (withoutEmoji.length > 0) {
    console.log(`\n📄 Without Emoji (${withoutEmoji.length}):\n`);
    withoutEmoji.forEach(agent => {
      console.log(`   ${agent.name}`);
    });
  }

  console.log('\n' + '━'.repeat(60));
  
  if (options.json) {
    console.log('\nJSON Output:');
    console.log(JSON.stringify(agents, null, 2));
  }
}

/**
 * Search for agents by pattern.
 * 
 * @param {string} pattern - Search pattern
 * @param {Object} options - CLI options
 */
function searchAgents(pattern, options) {
  const matches = findAgentsByName(pattern);
  
  if (matches.length === 0) {
    console.log(`\n❌ No agents found matching: "${pattern}"\n`);
    return;
  }

  console.log(`\n🔍 Found ${matches.length} agent(s) matching "${pattern}":\n`);
  
  matches.forEach((agent, index) => {
    console.log(`${index + 1}. ${formatAgentDisplay(agent)}`);
    console.log(`   File: ${agent.fileName}`);
    console.log('');
  });

  if (options.json) {
    console.log('JSON Output:');
    console.log(JSON.stringify(matches, null, 2));
  }
}

/**
 * Rename an agent.
 * 
 * @param {Object} options - CLI options with from and to names
 */
function renameAgent(options) {
  const { from, to, dryRun = false, force = false } = options;

  if (!from) {
    console.error('❌ --from is required. Use --list to see available agents.');
    process.exit(1);
  }

  if (!to) {
    console.error('❌ --to is required. Provide the new agent name.');
    process.exit(1);
  }

  // Validate new name
  const validation = validateAgentName(to);
  if (!validation.valid) {
    console.error(`❌ Invalid new name: ${validation.error}`);
    process.exit(1);
  }

  // Find matching agents
  const matches = findAgentsByName(from);

  if (matches.length === 0) {
    console.error(`\n❌ No agent found matching: "${from}"`);
    console.log('\nUse --list to see available agents.');
    process.exit(1);
  }

  if (matches.length > 1 && !force) {
    console.log(`\n⚠️ Multiple agents match "${from}":\n`);
    matches.forEach((agent, index) => {
      console.log(`${index + 1}. ${formatAgentDisplay(agent)}`);
    });
    console.log('\nBe more specific, or use --force to rename the first match.');
    process.exit(1);
  }

  const agent = matches[0];
  const newFileName = `${to.trim()}${AGENT_EXTENSION}`;
  const newPath = path.join(AGENTS_DIR, newFileName);

  console.log('\n📝 Agent Rename Operation');
  console.log('━'.repeat(50));
  console.log(`From: ${agent.name}`);
  console.log(`To:   ${to.trim()}`);
  console.log('━'.repeat(50));

  // Check for emoji changes
  const fromHasEmoji = agent.hasEmoji;
  const toHasEmoji = containsEmoji(to);

  if (fromHasEmoji !== toHasEmoji) {
    if (toHasEmoji) {
      console.log('🎨 Adding emoji to agent name');
    } else {
      console.log('📄 Removing emoji from agent name');
    }
  }

  if (containsEmoji(to)) {
    console.log(`\n✨ Detected emojis in new name - using safe rename method`);
  }

  // Perform rename
  const success = renameAgentFile(agent.path, newPath, dryRun);

  if (success) {
    if (!dryRun) {
      console.log(`\n✅ Successfully renamed agent!`);
      
      // Update internal references
      updateAgentInternals(newPath, to.trim());
      
      // Verify the rename worked
      if (fs.existsSync(newPath)) {
        console.log(`📂 New file: ${newFileName}`);
      }

      console.log(`\n💡 Tip: You may need to update any references to this agent in:`);
      console.log(`   - .github/agents/index.json`);
      console.log(`   - Any agent files that reference this agent`);
      console.log(`   - AGENTS.md if this agent is mentioned`);
    }
  } else {
    process.exit(1);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CLI Setup
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const program = new Command();

program
  .name('agent-rename')
  .description(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 Agent Rename Tool - Safe Unicode/Emoji File Renaming
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Renames agent files (.agent.md) in .github/agents/ directory.

CRITICAL: This tool exists because PowerShell's Rename-Item and
Move-Item CORRUPT emoji filenames! They convert:

  🧠 Brain.md → ð§  Brain.md

This tool uses Node.js fs.renameSync() which calls the proper
Windows UTF-16 API (MoveFileExW), preserving all Unicode.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Examples:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  # List all agents
  node tools/dev/agent-rename.js --list

  # Search for agents
  node tools/dev/agent-rename.js --search "Singularity"

  # Rename an agent (preview first!)
  node tools/dev/agent-rename.js --from "jsgui3 Research" --to "🔬 jsgui3 Deep Research 🔬" --dry-run

  # Execute the rename
  node tools/dev/agent-rename.js --from "jsgui3 Research" --to "🔬 jsgui3 Deep Research 🔬"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`)
  .version('1.0.0');

program
  .option('-l, --list', 'List all agent files')
  .option('-s, --search <pattern>', 'Search for agents by name')
  .option('-f, --from <name>', 'Current agent name (partial match supported)')
  .option('-t, --to <name>', 'New agent name')
  .option('-d, --dry-run', 'Preview changes without executing')
  .option('--force', 'Force rename even if multiple matches (uses first)')
  .option('-j, --json', 'Include JSON output for programmatic use');

program.parse(process.argv);

const options = program.opts();

// Route to appropriate command
if (options.list) {
  listAgents(options);
} else if (options.search) {
  searchAgents(options.search, options);
} else if (options.from || options.to) {
  renameAgent(options);
} else {
  program.help();
}
