# Kilo Code Setup and Workflows for Autonomous Agent Development

## Overview

Kilo Code is an open-source VS Code AI agent that merges features from Roo Code and Cline, designed for planning, building, and fixing code autonomously. It supports multi-mode operation (Architect for planning, Coder for implementation, Debugger for troubleshooting) and can run terminal commands, automate browsers, and self-verify work. For this project (copilot-dl-news), Kilo can be configured for iterative testing, output validation, and automated fixes, reducing manual intervention.

**Important: This project runs on Windows.** All configurations, paths, and commands must be Windows-compatible. Use backslashes for file paths and ensure tools like npm and node are available in the Windows environment.

Based on research from GitHub (Kilo-Org/kilocode), Hacker News discussions, and Reddit anecdotes, Kilo requires more setup than GitHub Copilot due to its customizable workflows and API integrations. Users report it excels in autonomous loops for code improvement but needs credits for premium models like Claude 4 Sonnet. Anecdotes highlight its strength in merging open-source features for robust agent behavior.

## Setup Instructions

1. **Install the Extension**:
   - Download from [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=kilocode.Kilo-Code).
   - Alternatively, clone the repo (`git clone https://github.com/Kilo-Org/kilocode`) and build locally if customizing.

2. **Account and API Configuration**:
   - Create an account at [kilocode.ai](https://kilocode.ai/) for access to 400+ AI models (Gemini 2.5 Pro, Claude 4 Sonnet, GPT-5).
   - Pricing matches provider rates; get $20 bonus credits on first top-up.
   - Configure API keys in VS Code settings: Search for "Kilo" in settings and add keys for desired models.
   - Optional: Use free tiers (e.g., Qwen-Code 2K req/day via OpenAI-compatible API) as mentioned in HN posts.

3. **Workspace Configuration**:
   - In your project root (e.g., `c:\Users\james\Documents\repos\copilot-dl-news`), create a `.kilo/` directory for custom configs.
   - Key files to create (detailed below):
     - `.kilo/config.json`: Global settings for autonomy and triggers.
     - `.kilo/instructions/`: Folder with Markdown files for custom prompts/workflows.
     - `.vscode/settings.json`: Integrate with VS Code for auto-triggers.

4. **Initial Testing**:
   - Open a file in VS Code and use Kilo's command palette (`Ctrl+Shift+P` > "Kilo: Start Agent").
   - Watch the quick-start video: [YouTube Guide](https://youtu.be/pqGfYXgrhig).
   - Verify terminal command execution and self-checking features.

## Usage Basics

- **Modes**: Switch between Architect (planning), Coder (implementation), Debugger (fixes). Create custom modes via `.kilocodemodes` file.
- **Autonomy Features**:
  - Generates code from natural language.
  - Runs terminal commands.
  - Automates browser for testing.
  - Self-checks work before proceeding.
- **Integration**: Supports MCP servers for extended capabilities (e.g., database tools).
- **Limitations**: Requires credits for advanced models; free options limited. Reddit users note it's not "free" like Copilot for premium features.

## Workflows for This Project

Kilo can be set up for autonomous loops in testing, output checking, and improvements. Configure triggers to run on file saves or commands, enabling iterative development without constant user input.

### 1. Iterative Testing Workflow
   - **Purpose**: Auto-run tests after code changes, analyze failures, and suggest fixes.
   - **Setup**:
     - In `.kilo/config.json`, enable "iterative-testing" mode with triggers on `*.js` or `*.test.js` saves.
     - Create `.kilo/instructions/iterative-testing.md` with prompt:
       ```
       # Iterative Testing Agent
       When triggered:
       1. Execute the test suite and parse output for failures (look for 'FAIL', 'ERROR', or exit code 1).
       2. If failures, generate code fixes and apply via VS Code edits.
       3. Re-execute tests; loop up to 5 times or until pass.
       4. Log results and stop.
       ```
   - **Usage**: Save a test file; Kilo auto-executes. View output in terminal or Kilo's panel.
   - **Anecdotes**: HN users praise merging Roo/Cline features for seamless test-fix cycles; Reddit mentions it reduces manual reruns.

### 2. Output Viewing and Validation Workflow
   - **Purpose**: Check command-line tool outputs (e.g., test logs, linters) against requirements and flag issues.
   - **Setup**:
     - Enable "response-validation" in config.
     - Prompt in `.kilo/instructions/output-validation.md`:
       ```
       # Output Validation Agent
       After executing commands:
       1. Capture output from terminal.
       2. Check against criteria: e.g., "PASS" in test output, no 'ERROR' in logs.
       3. If mismatch, generate improvements (e.g., fix schema bugs).
       4. Apply changes and re-execute for verification.
       ```
   - **Usage**: Trigger via command (`Kilo: Validate Output`); integrates with tools like `get-failing-tests.js`.
   - **Anecdotes**: Users on Reddit/ HN note Kilo's self-checking prevents regressions; ideal for log-heavy projects like this.

### 3. Problem Correction and Improvement Workflow
   - **Purpose**: Auto-correct issues from outputs and enhance code iteratively.
   - **Setup**:
     - Custom mode "fix-and-improve" in `.kilocodemodes`.
     - Instruction file `.kilo/instructions/fix-improvements.md`:
       ```
       # Fix and Improve Agent
       On detection of problems (e.g., failing tests, slow queries):
       1. Analyze root cause (e.g., schema mismatch, async errors).
       2. Propose fixes: Edit files, run migrations.
       3. Test improvements; iterate if needed.
       4. Ensure output meets requirements (e.g., <100 lines, no hangs).
       ```
   - **Usage**: Link to test failures; Kilo applies fixes like updating DB schemas or refactoring code.
   - **Anecdotes**: Open-source nature allows merging fixes from community; HN highlights its refactoring automation.

### 4. Command-Line Tool Integration Workflow
   - **Purpose**: View and act on outputs from tools like `analyze-test-logs.js` or `get-failing-tests.js`.
   - **Setup**:
     - Triggers on tool execution.
     - Prompt: Parse tool output, check for "as required" (e.g., no structural failures), make improvements if not.
   - **Usage**: Run tools via Kilo; it auto-validates and fixes.
   - **Anecdotes**: Reddit users compare it favorably to Copilot for tool-heavy workflows.

### 5. Documentation Review Mode
   - **Purpose**: Automate keeping documentation up-to-date by reviewing docs against code changes, identifying gaps or outdated info, and updating accordingly. Only prompts user for clarification when ambiguities can't be resolved from prompts, code, and existing docs.
   - **Setup**:
     - Enable "doc-review" mode in `.kilo/config.json` with triggers on code commits or doc saves.
     - Create `.kilo/instructions/doc-review.md` with prompt:
       ```
       # Documentation Review Agent
       When triggered (e.g., after code changes or doc edits):
       1. Scan relevant docs (e.g., AGENTS.md, API_ENDPOINT_REFERENCE.md) and code files.
       2. Identify discrepancies: Missing features, outdated examples, broken links, or unaligned descriptions.
       3. Cross-reference with code comments, function signatures, and recent changes.
       4. Update docs autonomously: Fix typos, add missing sections, update examples.
       5. If unclear (e.g., ambiguous intent in code), note and ask user for clarification via prompt.
       6. Log updates and suggest PRs if major changes.
       ```
     - Integrate with Git: Trigger on `git commit` or via VS Code's Git extension.
   - **Usage**: After pushing code, Kilo reviews docs. For example, if a new API endpoint is added, it updates API_ENDPOINT_REFERENCE.md without asking.
   - **Clarification Rules**: Only ask user if:
     - Code intent is ambiguous (e.g., undocumented side effects).
     - Docs conflict with code and no clear resolution.
     - New features lack context in prompts/docs.
     - Otherwise, proceed with best-effort updates and log assumptions.
   - **Anecdotes**: Based on Kilo's open-source nature, users on HN/Reddit praise its ability to merge community docs; this mode leverages self-checking for doc hygiene, reducing manual reviews.

## Configuration Files Reference

All Kilo instruction files are located in the `.kilo/` directory at the project root. Agents (e.g., GitHub Copilot) can edit these files to customize workflows:

- **`.kilo/config.json`**: Main config for modes, triggers, and API settings.
- **`.kilo/instructions/*.md`**: Custom prompts for specific workflows (e.g., `iterative-testing.md`).
- **`.vscode/settings.json`**: VS Code integration for auto-triggers.

Refer to the [Kilo Repo](https://github.com/Kilo-Org/kilocode) for examples. Update these files as needed for project evolution.

## Sources and Further Reading

- **GitHub Repo**: [Kilo-Org/kilocode](https://github.com/Kilo-Org/kilocode) - Full docs, changelog, and community contributions.
- **Hacker News**: [Discussion on Kilo Code](https://news.ycombinator.com/item?id=44851015) - Praises merging Roo/Cline features; mentions free tiers.
- **Reddit**: [r/vscode thread](https://www.reddit.com/r/vscode/comments/1nnxfsv/) - Users note credit requirements for Claude models but value autonomy.
- **Blog**: [kilocode.ai/blog](https://blog.kilocode.ai/) - Tutorials on custom modes and MCP integration.
- **Discord**: [kilocode.ai/discord](https://kilocode.ai/discord) - Community support for setup issues.

For issues, check the repo's issues or contribute via PRs.