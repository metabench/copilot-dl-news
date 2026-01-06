# Crawler + Analysis Progress Integration Lab

Unified dashboard that monitors both web crawler and content analysis processes with auto-start capability.

## Quick Start

```bash
# Start the server (auto-starts crawl when browser connects)
node labs/crawler-progress-integration/server.js

# Open http://localhost:3100 in your browser
```

## Features

- **Dual Progress Tracking**: Shows both crawl and analysis progress side-by-side
- **Auto-Start**: Crawl starts automatically when first browser connects
- **Sequential Flow**: Analysis auto-starts after crawl completes
- **Real-time Updates**: SSE-based progress streaming
- **Graceful Stop**: Stop both processes with one button

## Options

```bash
# Custom port
node labs/crawler-progress-integration/server.js --port 3200

# Custom crawl target
node labs/crawler-progress-integration/server.js --crawl-url https://example.com --crawl-pages 10

# Custom analysis limit
node labs/crawler-progress-integration/server.js --analysis-limit 50

# Disable auto-start (manual control only)
node labs/crawler-progress-integration/server.js --no-auto-start

# Verbose logging
node labs/crawler-progress-integration/server.js -v
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Dashboard UI |
| `/health` | GET | Health check |
| `/api/config` | GET | Current configuration |
| `/sse/progress` | GET | SSE stream (both processes) |
| `/sse/crawl` | GET | SSE stream (crawl only) |
| `/sse/analysis` | GET | SSE stream (analysis only) |
| `/api/crawl/start` | POST | Start crawl |
| `/api/crawl/stop` | POST | Stop crawl |
| `/api/analysis/start` | POST | Start analysis |
| `/api/analysis/stop` | POST | Stop analysis |
| `/api/stop-all` | POST | Stop all processes |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   Express Server (port 3100)                     │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────────┐     ┌────────────────────────────────┐   │
│  │  Process Manager  │     │     SSE Broadcaster             │   │
│  │  ─────────────────│     │  ─────────────────────────────  │   │
│  │  • mini-crawl.js  │────▶│  /sse/progress (unified)        │   │
│  │  • run-lab.js     │     │  /sse/crawl (crawl-only)        │   │
│  └───────────────────┘     │  /sse/analysis (analysis-only)  │   │
│                            └────────────────────────────────┬─┘   │
└───────────────────────────────────────────────────────────┬─────┘
                                                            │
                                                            ▼
                                              ┌─────────────────────┐
                                              │    Browser/Electron  │
                                              │  ─────────────────── │
                                              │  Real-time Dashboard │
                                              └─────────────────────┘
```

## Process Flow

1. **Browser connects** → SSE connection established
2. **Auto-start** → Crawl begins (if enabled)
3. **Crawl progress** → Updates stream to dashboard
4. **Crawl completes** → Analysis auto-starts
5. **Analysis progress** → Updates stream to dashboard
6. **Analysis completes** → Both cards show "Complete"

## Integration with AI Agents

This lab demonstrates patterns for AI agents to monitor long-running tasks:

```javascript
// Example: Subscribe to progress from an AI agent
const EventSource = require('eventsource');

const es = new EventSource('http://localhost:3100/sse/progress');

es.onmessage = (event) => {
  const { type, value } = JSON.parse(event.data);
  
  if (type === 'crawl' && value.phase === 'complete') {
    console.log(`Crawl finished: ${value.processed} pages`);
  }
  
  if (type === 'analysis' && value.phase === 'complete') {
    console.log(`Analysis finished: ${value.processed} records`);
    es.close();
  }
};
```

## Related Labs

- `labs/analysis-observable/` - Analysis-only with advanced metrics
- `labs/jsgui3-idiomatic-progress/` - jsgui3 control patterns
- `labs/jsgui3-ssr-progress/` - SSR + client activation

## Lessons Learned

1. **Observable pattern** is essential for long-running processes
2. **SSE reconnection** needs exponential backoff
3. **Process parsing** is fragile - prefer structured output (JSON)
4. **Auto-start** improves UX but needs clear indication
5. **Sequential flow** (crawl → analysis) prevents resource contention
