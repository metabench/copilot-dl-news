/**
 * OpenAI Work CLI
 * 
 * A CLI tool for using OpenAI to perform real work on this codebase.
 * Designed to be used when GitHub Copilot is rate-limited or for
 * background/parallel AI work.
 * 
 * This tool gives OpenAI access to the same context and tools that
 * Copilot agents use, enabling it to:
 * - Analyze code using js-scan
 * - Search documentation using md-scan
 * - Generate content based on actual codebase state
 * - Verify and correct existing documentation
 * 
 * Usage:
 *   node tools/ai/openai-work.js <command> [options]
 * 
 * Prerequisites:
 *   npm install openai
 *   $env:OPENAI_API_KEY = "sk-..."
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

// ============================================================================
// TOOL EXECUTION
// ============================================================================

function runTool(tool, args) {
  const tools = {
    'js-scan': 'node tools/dev/js-scan.js',
    'md-scan': 'node tools/dev/md-scan.js',
  };
  
  const cmd = tools[tool];
  if (!cmd) {
    return { error: `Unknown tool: ${tool}` };
  }
  
  try {
    const fullCmd = `${cmd} ${args.join(' ')}`;
    console.log(`  Running: ${fullCmd}`);
    
    const result = execSync(fullCmd, {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 60000,
    });
    
    return { success: true, output: result };
  } catch (error) {
    return { error: error.message };
  }
}

function readFile(filePath) {
  const fullPath = path.isAbsolute(filePath) 
    ? filePath 
    : path.join(PROJECT_ROOT, filePath);
  
  try {
    return fs.readFileSync(fullPath, 'utf8');
  } catch (e) {
    return null;
  }
}

// ============================================================================
// OPENAI INTEGRATION (when package is available)
// ============================================================================

async function callOpenAI(messages, options = {}) {
  let OpenAI;
  try {
    OpenAI = require('openai');
  } catch (e) {
    console.error('OpenAI package not installed. Run: npm install openai');
    process.exit(1);
  }
  
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY not set. Run: $env:OPENAI_API_KEY = "sk-..."');
    process.exit(1);
  }
  
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  const response = await client.chat.completions.create({
    model: options.model || 'gpt-4o',
    messages,
    max_tokens: options.maxTokens || 4096,
    temperature: options.temperature || 0.3,
  });
  
  return response.choices[0].message.content;
}

// ============================================================================
// COMMANDS
// ============================================================================

const commands = {
  /**
   * Analyze a goal and generate a detail page
   */
  async 'generate-goal'(args) {
    const goalId = args[0];
    if (!goalId) {
      console.error('Usage: generate-goal <goal-id>');
      console.error('Example: generate-goal crawler-0');
      return;
    }
    
    // Load goals data
    const goalsPath = path.join(PROJECT_ROOT, 'data/goals/goals.json');
    if (!fs.existsSync(goalsPath)) {
      console.error('Goals data not found. Run: node tmp/generate-goals-svg.js');
      return;
    }
    
    const goalsData = JSON.parse(fs.readFileSync(goalsPath, 'utf8'));
    
    // Find the goal
    let goal = null;
    let category = null;
    for (const cat of goalsData.categories) {
      const found = cat.goals.find(g => g.id === goalId);
      if (found) {
        goal = found;
        category = cat;
        break;
      }
    }
    
    if (!goal) {
      console.error(`Goal not found: ${goalId}`);
      console.error('\nAvailable goals:');
      for (const cat of goalsData.categories) {
        console.error(`  ${cat.emoji} ${cat.title}:`);
        for (const g of cat.goals) {
          console.error(`    - ${g.id}: ${g.title}`);
        }
      }
      return;
    }
    
    console.log(`\n📋 Generating detail page for: ${goal.title}`);
    console.log(`   Category: ${category.title}`);
    console.log(`   Status: ${goal.status} (${goal.progress}%)`);
    console.log('');
    
    // Step 1: Search for related code
    console.log('🔍 Step 1: Searching codebase...');
    const searchTerms = goal.title.toLowerCase().split(' ')
      .filter(w => w.length > 3)
      .slice(0, 3);
    
    let codeContext = '';
    for (const term of searchTerms) {
      const result = runTool('js-scan', ['--search', term, '--limit', '5', '--json']);
      if (result.success) {
        codeContext += `\nSearch "${term}":\n${result.output}\n`;
      }
    }
    
    // Step 2: Search for related sessions
    console.log('📚 Step 2: Searching sessions...');
    const sessionResult = runTool('md-scan', [
      '--dir', 'docs/sessions',
      '--search', goal.title.split(' ')[0],
      '--json'
    ]);
    
    let sessionContext = '';
    if (sessionResult.success) {
      sessionContext = sessionResult.output;
    }
    
    // Step 3: Call OpenAI
    console.log('🤖 Step 3: Generating with OpenAI...');
    
    const systemPrompt = `You are an AI agent generating documentation for the copilot-dl-news project.
This is a news crawler and data pipeline project using:
- jsgui3 for UI (server-side rendering with client hydration)
- SQLite for data storage
- Industrial Luxury Obsidian theme
- Extensive AI agent tooling

Generate detailed, accurate documentation based on the context provided.
Use markdown formatting with clear sections.`;

    const userPrompt = `Generate a comprehensive detail page for this project goal:

## Goal Information
- **Title**: ${goal.title}
- **Category**: ${category.title}
- **Status**: ${goal.status}
- **Progress**: ${goal.progress}%
- **Description**:
${goal.lines.map(l => `  - ${l}`).join('\n')}

## Code Context (from js-scan)
${codeContext || 'No relevant code found.'}

## Session Context (from md-scan)
${sessionContext || 'No relevant sessions found.'}

---

Generate a markdown document with these sections:
1. **Overview** - What this goal is about
2. **Current Status** - What's been done, what remains
3. **Key Components** - Files, classes, functions involved
4. **Technical Details** - How it works or will work
5. **Related Sessions** - Link to relevant session docs
6. **Next Steps** - What needs to happen next
7. **Blockers & Risks** - Any obstacles

Be specific and reference actual files/code when possible.`;

    try {
      const content = await callOpenAI([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ]);
      
      // Save the result
      const detailsDir = path.join(PROJECT_ROOT, 'data/goals/details');
      if (!fs.existsSync(detailsDir)) {
        fs.mkdirSync(detailsDir, { recursive: true });
      }
      
      const outputPath = path.join(detailsDir, `${goalId}.md`);
      fs.writeFileSync(outputPath, content);
      
      console.log(`\n✅ Generated: ${outputPath}`);
      console.log('\n--- Preview ---');
      console.log(content.substring(0, 500) + '...');
      
    } catch (error) {
      console.error('OpenAI error:', error.message);
    }
  },
  
  /**
   * Analyze a file with AI assistance
   */
  async 'analyze'(args) {
    const filePath = args[0];
    if (!filePath) {
      console.error('Usage: analyze <file-path>');
      return;
    }
    
    const content = readFile(filePath);
    if (!content) {
      console.error(`File not found: ${filePath}`);
      return;
    }
    
    console.log(`\n🔍 Analyzing: ${filePath}`);
    
    // Get dependencies
    console.log('📊 Getting dependency info...');
    const depsResult = runTool('js-scan', ['--what-imports', filePath, '--json']);
    
    const systemPrompt = `You are a code analysis expert for the copilot-dl-news project.
Analyze code for: purpose, patterns, potential issues, and improvements.
Be concise and actionable.`;

    const userPrompt = `Analyze this file:

**File**: ${filePath}

**Content**:
\`\`\`javascript
${content.substring(0, 8000)}
${content.length > 8000 ? '\n... (truncated)' : ''}
\`\`\`

**Dependency Info**:
${depsResult.success ? depsResult.output : 'Not available'}

Provide:
1. **Purpose** - What does this file do?
2. **Key Functions** - Most important functions/classes
3. **Dependencies** - What it depends on, what depends on it
4. **Code Quality** - Issues, improvements
5. **Test Suggestions** - What should be tested`;

    try {
      const analysis = await callOpenAI([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ]);
      
      console.log('\n' + analysis);
      
    } catch (error) {
      console.error('OpenAI error:', error.message);
    }
  },
  
  /**
   * Run a custom task
   */
  async 'task'(args) {
    const task = args.join(' ');
    if (!task) {
      console.error('Usage: task "<description>"');
      console.error('Example: task "Find all TODO comments and prioritize them"');
      return;
    }
    
    console.log(`\n🎯 Task: ${task}`);
    
    const systemPrompt = `You are an AI agent working on the copilot-dl-news codebase.

You can request tool execution by outputting:
\`\`\`tool
{"tool": "js-scan", "args": ["--search", "pattern"]}
\`\`\`

Available tools:
- js-scan: Code search (--search, --what-imports, --what-calls)
- md-scan: Doc search (--dir, --search)

I will execute the tool and provide the output. Continue your analysis after receiving results.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: task },
    ];
    
    let iterations = 0;
    const maxIterations = 5;
    
    while (iterations < maxIterations) {
      iterations++;
      console.log(`\n--- Iteration ${iterations} ---`);
      
      const response = await callOpenAI(messages);
      
      // Check for tool requests
      const toolMatch = response.match(/```tool\n([\s\S]*?)```/);
      
      if (!toolMatch) {
        // No tool request, we're done
        console.log('\n' + response);
        break;
      }
      
      // Execute the tool
      try {
        const toolReq = JSON.parse(toolMatch[1]);
        console.log(`🔧 Running: ${toolReq.tool} ${toolReq.args.join(' ')}`);
        
        const result = runTool(toolReq.tool, toolReq.args);
        
        messages.push({ role: 'assistant', content: response });
        messages.push({ 
          role: 'user', 
          content: `Tool result:\n\`\`\`\n${result.success ? result.output : result.error}\n\`\`\`\n\nContinue your analysis.`
        });
        
      } catch (e) {
        console.error('Tool parse error:', e.message);
        break;
      }
    }
  },
  
  /**
   * List available goals
   */
  'list-goals'() {
    const goalsPath = path.join(PROJECT_ROOT, 'data/goals/goals.json');
    if (!fs.existsSync(goalsPath)) {
      console.error('Goals data not found. Run: node tmp/generate-goals-svg.js');
      return;
    }
    
    const goalsData = JSON.parse(fs.readFileSync(goalsPath, 'utf8'));
    
    console.log('\n📋 Project Goals\n');
    console.log(`Total: ${goalsData.totalGoals} goals across ${goalsData.categories.length} categories`);
    console.log(`Active: ${goalsData.stats.active} | Planned: ${goalsData.stats.planned} | Research: ${goalsData.stats.research}`);
    console.log('');
    
    for (const cat of goalsData.categories) {
      console.log(`${cat.emoji} ${cat.title}`);
      for (const goal of cat.goals) {
        const status = goal.status === 'active' ? '🟢' : goal.status === 'planned' ? '🔵' : '🟣';
        const bar = '█'.repeat(Math.floor(goal.progress / 10)) + '░'.repeat(10 - Math.floor(goal.progress / 10));
        console.log(`  ${status} ${goal.id.padEnd(20)} ${bar} ${goal.progress}%  ${goal.title}`);
      }
      console.log('');
    }
  },
};

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║                     OpenAI Work CLI                               ║
║     Use OpenAI for real work when Copilot is rate-limited        ║
╚═══════════════════════════════════════════════════════════════════╝

Usage:
  node tools/ai/openai-work.js <command> [options]

Commands:
  list-goals              List all project goals
  generate-goal <id>      Generate detail page for a goal
  analyze <file>          Analyze a code file
  task "<description>"    Run a custom AI task

Setup:
  npm install openai
  $env:OPENAI_API_KEY = "sk-..."

Examples:
  node tools/ai/openai-work.js list-goals
  node tools/ai/openai-work.js generate-goal crawler-0
  node tools/ai/openai-work.js analyze src/crawl.js
  node tools/ai/openai-work.js task "Find unused exports in src/utils"
`);
    return;
  }
  
  const command = args[0];
  const commandArgs = args.slice(1);
  
  if (commands[command]) {
    await commands[command](commandArgs);
  } else {
    console.error(`Unknown command: ${command}`);
    console.error('Run with --help to see available commands');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
