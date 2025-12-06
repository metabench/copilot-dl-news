/**
 * OpenAI Agent Bridge
 * 
 * Enables OpenAI API to perform real work in this codebase using patterns
 * established by GitHub Copilot agents. This bridges the gap when Copilot
 * is rate-limited or when you want parallel/background AI work.
 * 
 * Key Concepts:
 * 1. CONTEXT INJECTION - Feed OpenAI the same context Copilot sees
 * 2. TOOL EMULATION - Give OpenAI access to our CLI tools (js-scan, md-scan)
 * 3. OUTPUT VERIFICATION - Validate AI outputs before applying
 * 4. SESSION INTEGRATION - Log all work to session system
 * 
 * Usage:
 *   const agent = require('./openai-agent-bridge');
 *   const result = await agent.execute({
 *     task: 'Analyze the crawler architecture and identify refactoring opportunities',
 *     tools: ['js-scan', 'read-file'],
 *     outputFormat: 'markdown'
 *   });
 */

const OpenAI = require('openai');
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  model: 'gpt-4o',  // or 'gpt-4-turbo-preview' for longer context
  maxTokens: 4096,
  temperature: 0.3,  // Lower = more deterministic for code work
  
  // Project context
  projectRoot: path.resolve(__dirname, '../../..'),
  
  // Tool paths
  tools: {
    'js-scan': 'node tools/dev/js-scan.js',
    'js-edit': 'node tools/dev/js-edit.js',
    'md-scan': 'node tools/dev/md-scan.js',
  },
  
  // Cache settings
  cacheDir: 'data/openai-cache',
  
  // Rate limiting
  requestsPerMinute: 20,
  retryDelay: 5000,
};

// ============================================================================
// SYSTEM PROMPTS - Teach OpenAI our patterns
// ============================================================================

const SYSTEM_PROMPTS = {
  default: `You are an AI agent working on the copilot-dl-news codebase.

PROJECT CONTEXT:
- News crawler and data pipeline project
- Uses jsgui3 for UI (server-side rendering with client hydration)
- SQLite database for URL storage and classification
- Extensive AI agent tooling (js-scan, js-edit, md-scan)
- Industrial Luxury Obsidian theme for UI
- 100+ documented development sessions in docs/sessions/

CODING STANDARDS:
- Modern JavaScript (ES2020+), no TypeScript
- Small functions, single responsibility, early returns
- JSDoc for public APIs
- Test scripts in checks/ folders for UI controls

TOOLS AVAILABLE:
You can request tool execution by outputting JSON blocks like:
\`\`\`tool
{"tool": "js-scan", "args": ["--search", "CrawlerFactory", "--json"]}
\`\`\`

Available tools:
- js-scan: Code search and dependency analysis
- js-edit: Safe code modifications
- md-scan: Documentation search
- read-file: Read file contents
- list-dir: List directory contents

After tool output is provided, continue your analysis.`,

  codeReview: `You are a code review agent. Analyze code for:
1. Bugs and potential issues
2. Performance problems (N+1 queries, unnecessary loops)
3. Adherence to project patterns
4. Missing error handling
5. Documentation gaps

Output format:
- 🔴 Critical issues (must fix)
- 🟡 Warnings (should fix)
- 🟢 Suggestions (nice to have)
- 📝 Documentation notes`,

  contentGenerator: `You are a documentation generator for the copilot-dl-news project.
Generate clear, accurate documentation based on actual code analysis.
Always verify claims by requesting tool execution to check the codebase.
Use the Industrial Luxury Obsidian theme terminology where appropriate.`,

  refactorPlanner: `You are a refactoring planner. Given a refactoring goal:
1. Use js-scan to discover all affected files
2. Identify the order of changes (dependencies first)
3. Create a step-by-step plan with verification steps
4. Estimate risk level for each change

Output a structured plan that could be executed by js-edit or manually.`,
};

// ============================================================================
// OPENAI CLIENT
// ============================================================================

class OpenAIAgentBridge {
  constructor(apiKey = process.env.OPENAI_API_KEY) {
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable not set');
    }
    
    this.client = new OpenAI({ apiKey });
    this.conversationHistory = [];
    this.toolResults = new Map();
  }
  
  /**
   * Execute a task with optional tool access
   */
  async execute(options) {
    const {
      task,
      tools = [],
      systemPrompt = 'default',
      outputFormat = 'text',
      maxIterations = 5,
      context = {},
    } = options;
    
    // Build initial messages
    const messages = [
      { role: 'system', content: SYSTEM_PROMPTS[systemPrompt] || SYSTEM_PROMPTS.default },
    ];
    
    // Add context if provided
    if (context.files) {
      for (const filePath of context.files) {
        const content = this._readFile(filePath);
        if (content) {
          messages.push({
            role: 'user',
            content: `File: ${filePath}\n\`\`\`\n${content}\n\`\`\``
          });
        }
      }
    }
    
    if (context.sessions) {
      const sessionContext = this._gatherSessionContext(context.sessions);
      if (sessionContext) {
        messages.push({
          role: 'user',
          content: `Relevant session context:\n${sessionContext}`
        });
      }
    }
    
    // Add the task
    messages.push({ role: 'user', content: task });
    
    // Iterative execution with tool use
    let iterations = 0;
    let finalResponse = null;
    
    while (iterations < maxIterations) {
      iterations++;
      
      const response = await this._chat(messages);
      const content = response.choices[0].message.content;
      
      // Check for tool requests
      const toolRequests = this._extractToolRequests(content);
      
      if (toolRequests.length === 0) {
        // No more tool requests, we're done
        finalResponse = content;
        break;
      }
      
      // Execute tools and add results
      messages.push({ role: 'assistant', content });
      
      let toolOutput = 'Tool execution results:\n\n';
      for (const req of toolRequests) {
        if (tools.includes(req.tool) || tools.includes('*')) {
          const result = await this._executeTool(req.tool, req.args);
          toolOutput += `### ${req.tool} ${req.args.join(' ')}\n\`\`\`\n${result}\n\`\`\`\n\n`;
        } else {
          toolOutput += `### ${req.tool}\nTool not authorized for this task.\n\n`;
        }
      }
      
      messages.push({ role: 'user', content: toolOutput });
    }
    
    // Format output
    if (outputFormat === 'json') {
      return this._extractJson(finalResponse);
    }
    
    return {
      success: true,
      iterations,
      response: finalResponse,
      toolsUsed: Array.from(this.toolResults.keys()),
    };
  }
  
  /**
   * Generate a goal detail page
   */
  async generateGoalDetail(goalId, goalData) {
    const task = `Generate a comprehensive detail page for this project goal:

Goal ID: ${goalId}
Title: ${goalData.title}
Status: ${goalData.status}
Progress: ${goalData.progress}%
Description: ${goalData.lines.join('. ')}

Instructions:
1. Use js-scan to find relevant code files
2. Use md-scan to find related session documentation
3. Generate a detailed markdown page with:
   - Overview and objectives
   - Current implementation status
   - Key files and components involved
   - Related sessions and decisions
   - Next steps and blockers
   - Code examples if relevant

Be specific and reference actual files/sessions from the codebase.`;

    return this.execute({
      task,
      tools: ['js-scan', 'md-scan', 'read-file'],
      systemPrompt: 'contentGenerator',
      outputFormat: 'text',
      context: {
        sessions: [goalData.relatedSessions || []].flat(),
      }
    });
  }
  
  /**
   * Verify and correct a detail page
   */
  async verifyDetailPage(goalId, content) {
    const task = `Verify this goal detail page for accuracy:

${content}

Instructions:
1. Check that all referenced files exist using js-scan
2. Verify session references are accurate
3. Check that code examples are current
4. Identify any outdated or incorrect information
5. Output corrections in a structured format

Output format:
{
  "verified": true/false,
  "issues": [{"line": N, "issue": "...", "correction": "..."}],
  "suggestions": ["..."]
}`;

    return this.execute({
      task,
      tools: ['js-scan', 'md-scan', 'read-file', 'list-dir'],
      systemPrompt: 'codeReview',
      outputFormat: 'json',
    });
  }
  
  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================
  
  async _chat(messages) {
    try {
      return await this.client.chat.completions.create({
        model: CONFIG.model,
        messages,
        max_tokens: CONFIG.maxTokens,
        temperature: CONFIG.temperature,
      });
    } catch (error) {
      if (error.status === 429) {
        // Rate limited, wait and retry
        console.log(`Rate limited, waiting ${CONFIG.retryDelay}ms...`);
        await this._sleep(CONFIG.retryDelay);
        return this._chat(messages);
      }
      throw error;
    }
  }
  
  _extractToolRequests(content) {
    const requests = [];
    const regex = /```tool\n([\s\S]*?)```/g;
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        requests.push(parsed);
      } catch (e) {
        console.warn('Failed to parse tool request:', match[1]);
      }
    }
    
    return requests;
  }
  
  async _executeTool(tool, args) {
    const toolCmd = CONFIG.tools[tool];
    if (!toolCmd) {
      // Handle built-in tools
      switch (tool) {
        case 'read-file':
          return this._readFile(args[0]) || `File not found: ${args[0]}`;
        case 'list-dir':
          return this._listDir(args[0]);
        default:
          return `Unknown tool: ${tool}`;
      }
    }
    
    try {
      const cmd = `${toolCmd} ${args.map(a => `"${a}"`).join(' ')}`;
      const result = execSync(cmd, {
        cwd: CONFIG.projectRoot,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 30000,
      });
      
      this.toolResults.set(`${tool}:${args.join(',')}`, result);
      
      // Truncate if too long
      if (result.length > 8000) {
        return result.substring(0, 8000) + '\n... (truncated)';
      }
      
      return result;
    } catch (error) {
      return `Tool error: ${error.message}`;
    }
  }
  
  _readFile(filePath) {
    const fullPath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(CONFIG.projectRoot, filePath);
    
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      // Truncate large files
      if (content.length > 10000) {
        return content.substring(0, 10000) + '\n... (truncated)';
      }
      return content;
    } catch (e) {
      return null;
    }
  }
  
  _listDir(dirPath) {
    const fullPath = path.isAbsolute(dirPath)
      ? dirPath
      : path.join(CONFIG.projectRoot, dirPath);
    
    try {
      const entries = fs.readdirSync(fullPath, { withFileTypes: true });
      return entries
        .map(e => e.isDirectory() ? `${e.name}/` : e.name)
        .join('\n');
    } catch (e) {
      return `Error listing directory: ${e.message}`;
    }
  }
  
  _gatherSessionContext(sessionPatterns) {
    const sessionsDir = path.join(CONFIG.projectRoot, 'docs/sessions');
    let context = '';
    
    for (const pattern of sessionPatterns) {
      try {
        const dirs = fs.readdirSync(sessionsDir)
          .filter(d => d.includes(pattern));
        
        for (const dir of dirs.slice(0, 3)) { // Limit to 3 matches
          const summaryPath = path.join(sessionsDir, dir, 'SESSION_SUMMARY.md');
          if (fs.existsSync(summaryPath)) {
            const summary = fs.readFileSync(summaryPath, 'utf8');
            context += `\n### Session: ${dir}\n${summary.substring(0, 2000)}\n`;
          }
        }
      } catch (e) {
        // Ignore errors
      }
    }
    
    return context;
  }
  
  _extractJson(content) {
    // Try to find JSON in the content
    const jsonMatch = content.match(/```json\n([\s\S]*?)```/) ||
                      content.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1] || jsonMatch[0]);
      } catch (e) {
        return { error: 'Failed to parse JSON', raw: content };
      }
    }
    
    return { raw: content };
  }
  
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help')) {
    console.log(`
OpenAI Agent Bridge - Use OpenAI for real work in this codebase

Usage:
  node openai-agent-bridge.js <command> [options]

Commands:
  task "<description>"     Execute a task with AI assistance
  generate-goal <id>       Generate detail page for a goal
  verify <file>           Verify and correct a detail page
  analyze <file>          Analyze a code file

Options:
  --tools <list>          Comma-separated tools to enable (default: js-scan,md-scan)
  --model <name>          OpenAI model to use (default: gpt-4o)
  --verbose              Show detailed output

Environment:
  OPENAI_API_KEY          Required - Your OpenAI API key

Examples:
  node openai-agent-bridge.js task "Analyze the crawler architecture"
  node openai-agent-bridge.js generate-goal crawler-refactor
  node openai-agent-bridge.js analyze src/crawl.js --tools js-scan,read-file
`);
    return;
  }
  
  const command = args[0];
  const agent = new OpenAIAgentBridge();
  
  try {
    switch (command) {
      case 'task': {
        const task = args[1];
        const toolsArg = args.find(a => a.startsWith('--tools='));
        const tools = toolsArg ? toolsArg.split('=')[1].split(',') : ['js-scan', 'md-scan'];
        
        console.log(`Executing task: ${task}`);
        console.log(`Tools enabled: ${tools.join(', ')}\n`);
        
        const result = await agent.execute({ task, tools });
        console.log('--- Result ---');
        console.log(result.response);
        console.log(`\nIterations: ${result.iterations}`);
        break;
      }
      
      case 'generate-goal': {
        const goalId = args[1];
        // TODO: Load goal data from goals.json
        const goalData = {
          title: goalId,
          status: 'active',
          progress: 50,
          lines: ['Goal description would come from goals.json'],
        };
        
        console.log(`Generating detail page for goal: ${goalId}\n`);
        const result = await agent.generateGoalDetail(goalId, goalData);
        console.log(result.response);
        break;
      }
      
      case 'analyze': {
        const filePath = args[1];
        const task = `Analyze this file and provide insights:
        
1. Purpose and responsibility
2. Key functions/classes
3. Dependencies (what it imports, what imports it)
4. Potential improvements
5. Test coverage gaps

File: ${filePath}`;

        const result = await agent.execute({
          task,
          tools: ['js-scan', 'read-file'],
          context: { files: [filePath] },
        });
        console.log(result.response);
        break;
      }
      
      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Export for programmatic use
module.exports = { OpenAIAgentBridge, CONFIG, SYSTEM_PROMPTS };

// Run CLI if executed directly
if (require.main === module) {
  main().catch(console.error);
}
