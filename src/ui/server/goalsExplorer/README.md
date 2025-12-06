# Goals Explorer

An interactive UI for exploring project goals with AI-generated detail pages.

## Quick Start

```bash
# 1. Install OpenAI package (one-time)
npm install openai

# 2. Set your API key
$env:OPENAI_API_KEY = "sk-..."

# 3. Generate goals data
node tmp/generate-goals-svg.js

# 4. Start the server
node src/ui/server/goalsExplorer/server.js

# 5. Open http://localhost:3010
```

## Features

- **Interactive SVG Map** - Click on any goal to view details
- **On-Demand Generation** - Detail pages are generated via OpenAI API when first accessed
- **Caching** - Generated content is cached to avoid redundant API calls
- **Verification** - AI can verify/correct details against actual codebase
- **Tool Access** - OpenAI can use js-scan, md-scan to analyze actual code

## Architecture

```
Browser (jsgui3)
    │
    ├─ GET /goals                    → Goals list (from JSON)
    ├─ GET /goals/:id                → Cached detail page (if exists)
    └─ POST /goals/:id/generate      → Generate via OpenAI API
                                           │
                                           ├─ Check session docs
                                           ├─ Check codebase
                                           └─ Generate markdown
```

## OpenAI Integration Options

### Option 1: OpenAI API (Recommended)
```bash
npm install openai
```

```javascript
const OpenAI = require('openai');
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const response = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: prompt }]
});
```

### Option 2: OpenAI CLI
```bash
# Install CLI
pip install openai

# Use from Node.js
const { execSync } = require('child_process');
const result = execSync(`openai api chat.completions.create -m gpt-4o -g user "${prompt}"`);
```

### Option 3: GitHub Copilot CLI (for code-aware tasks)
```bash
gh copilot suggest "explain the crawler architecture"
```

## Setup

1. Set your OpenAI API key:
   ```bash
   $env:OPENAI_API_KEY = "sk-..."
   ```

2. Start the server:
   ```bash
   node src/ui/server/goalsExplorer/server.js
   ```

3. Open http://localhost:3010

## Data Flow

1. **Goals JSON** - Master list at `data/goals/goals.json`
2. **Detail Cache** - Generated pages at `data/goals/details/{goal-id}.md`
3. **Session Context** - Pulls from `docs/sessions/` for real project data

## Future Enhancements

- [ ] Real-time progress updates during generation
- [ ] Edit mode for manual corrections
- [ ] Regenerate button to refresh stale content
- [ ] Link to related sessions and code files
- [ ] Export to various formats (PDF, HTML, Obsidian)
