# Configuration Guide

**When to Read**: Read this when setting up the server, configuring crawls, adjusting performance settings, or troubleshooting environment-specific issues.

---

## Overview

This document provides a comprehensive reference for all configuration options available in the news crawler application. Configuration can be provided via **environment variables**, **configuration files**, or **programmatic options** to the `createApp()` function.

---

## Table of Contents

1. [Environment Variables](#environment-variables)
2. [Configuration Files](#configuration-files)
3. [Programmatic Options](#programmatic-options)
4. [Default Values](#default-values)
5. [Configuration Validation](#configuration-validation)
6. [Examples](#examples)

---

## Environment Variables

### Database Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `DB_PATH` | string | `data/news.db` | Path to SQLite database file |
| `UI_DB_PATH` | string | (fallback) | Alternative database path variable |

**Example**:
```bash
export DB_PATH="/path/to/custom.db"
node src/ui/express/server.js
```

---

### Server Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `PORT` | number | `3000` | HTTP server port |
| `NODE_ENV` | string | `development` | Environment (development, test, production) |

**Example**:
```bash
export PORT=8080
export NODE_ENV=production
node src/ui/express/server.js
```

---

### UI Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `UI_VERBOSE` | boolean | `false` | Enable verbose logging |
| `UI_QUEUE_DEBUG` | boolean | `false` | Enable queue debugging logs |
| `UI_TEST_QUIET` | boolean | `false` | Suppress test output |
| `UI_FAKE_RUNNER` | boolean | `false` | Use fake process runner (testing) |
| `UI_ALLOW_MULTI_JOBS` | boolean | `false` | Allow multiple concurrent crawl jobs |
| `UI_TRACE_START` | boolean | `false` | Trace server startup timing |
| `UI_FAST_START` | boolean | `false` | Skip slow initialization steps |

**Boolean Values**: Accepts `1`, `true`, `yes`, `on` (case-insensitive) as truthy.

**Example**:
```bash
export UI_VERBOSE=1
export UI_ALLOW_MULTI_JOBS=true
node src/ui/express/server.js
```

---

### Logging Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `UI_LOGS_MAX_PER_SEC` | number | `200` | Maximum SSE log messages per second (rate limiting) |
| `UI_LOG_LINE_MAX_CHARS` | number | `8192` | Maximum characters per log line (truncation) |

**Example**:
```bash
export UI_LOGS_MAX_PER_SEC=500
export UI_LOG_LINE_MAX_CHARS=16384
node src/ui/express/server.js
```

---

### Priority & Configuration Files

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `UI_PRIORITY_CONFIG` | string | `config/priority-config.json` | Path to priority configuration file |
| `UI_PRIORITY_CONFIG_PATH` | string | (alias) | Alternative path variable |
| `UI_BOOTSTRAP_DATASET_PATH` | string | `data/bootstrap/bootstrap-db.json` | Path to bootstrap dataset JSON |
| `UI_BOOTSTRAP_DATASET` | string | (alias) | Alternative dataset path variable |

**Example**:
```bash
export UI_PRIORITY_CONFIG="/path/to/custom-priority.json"
node src/ui/express/server.js
```

---

### Gazetteer Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `UI_SKIP_GAZETTEER_WARMUP` | boolean | `false` | Skip gazetteer cache warmup on startup |
| `UI_GAZETTEER_WARMUP_CODE` | string | `ID` | Country code for warmup query (ISO-3166) |

**Example**:
```bash
export UI_SKIP_GAZETTEER_WARMUP=1  # Skip warmup (faster startup)
export UI_GAZETTEER_WARMUP_CODE=US  # Use USA for warmup
node src/ui/express/server.js
```

---

### Test Environment Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `JEST_WORKER_ID` | string | (auto) | Jest worker ID (automatically set by Jest) |
| `E2E` | boolean | `false` | Enable E2E test mode |
| `GEOGRAPHY_FULL_E2E` | boolean | `false` | Enable full geography E2E test |

**Note**: These are typically set by test runners, not manually.

---

## Configuration Files

### priority-config.json

**Location**: `config/priority-config.json`

**Purpose**: Configure crawl prioritization and scheduling.

**Schema Overview**:

- `queue.bonuses`: Named scoring bonuses applied when URLs enter the queue (each entry has `value`, optional `description` and `category`).
- `queue.weights`: Base weights that influence priority for different URL categories (`article`, `nav`, `refresh`, etc.).
- `queue.clustering`: Parameters that tune problem clustering (thresholds, time windows, boost multipliers).
- `coverage`: Telemetry cadence and milestone thresholds used by coverage dashboards.
- `features`: Feature flags for planner/coverage capabilities (camelCase and kebab-case keys both supported).

**Defaults**: If the file is missing or invalid, `ConfigManager` generates sane defaults that match `src/config/ConfigManager.js::_getDefaultConfig()`.

**Example extract**:
```json
{
  "queue": {
    "bonuses": {
      "adaptive-seed": { "value": 20, "description": "URLs discovered by intelligent planning" },
      "gap-prediction": { "value": 15, "description": "Predicted to fill coverage gaps" }
    },
    "weights": {
      "article": { "value": 0 },
      "refresh": { "value": 25 }
    },
    "clustering": {
      "problemThreshold": 5,
      "timeWindowMinutes": 30,
      "maxClusterSize": 100
    }
  },
  "coverage": {
    "telemetryIntervalSeconds": 30
  },
  "features": {
    "gapDrivenPrioritization": true,
    "realTimeCoverageAnalytics": true
  }
}
```

---

### Bootstrap Dataset

**Location**: `data/bootstrap/bootstrap-db.json` (override with `UI_BOOTSTRAP_DATASET_PATH` or `UI_BOOTSTRAP_DATASET`)

**Purpose**: Provide a curated set of countries, topics, and skip terms that can be imported via `/api/bootstrap-db` to prime a fresh database.

**Format**: Single JSON document with these top-level keys:

- `version` / `source` metadata (strings)
- `countries`: array of country entries with `code`, `names`, optional `capital`, etc.
- `topics`: array of topic objects `{ topic, lang, terms }`
- `skipTerms`: map of language code → array of skip-term records

**Example extract**:
```json
{
  "version": "2025-10-05",
  "countries": [
    {
      "code": "US",
      "names": {
        "en": { "common": ["United States"], "official": ["United States of America"] }
      },
      "capital": {
        "name": { "en": "Washington, D.C." },
        "lat": 38.9072,
        "lng": -77.0369
      }
    }
  ],
  "skipTerms": {
    "en": [
      { "term": "lorem ipsum", "reason": "placeholder" }
    ]
  }
}
```

Use `getBootstrapDatasetPath(customPath)` (from `src/ui/express/data/bootstrapDb.js`) to resolve absolute paths when wiring custom datasets.

---

## Programmatic Options

### createApp(options)

The `createApp()` function accepts an options object for programmatic configuration.

**Function Signature**:
```javascript
const { createApp } = require('./src/ui/express/server');

const app = createApp({
  // Database
  dbPath: '/path/to/db.sqlite',
  
  // Server
  port: 3000,
  verbose: false,
  queueDebug: false,
  
  // Crawl Management
  allowMultiJobs: false,
  guardWindowMs: 600,
  
  // Configuration Files
  priorityConfigPath: '/path/to/priority-config.json',
  bootstrapDatasetPath: '/path/to/bootstrap-db.json',
  
  // Testing
  fakeRunner: false,
  traceStart: false,
  
  // Dependency Injection
  jobRegistry: null,           // Provide custom JobRegistry
  crawlerManager: null,        // Provide custom IntelligentCrawlerManager
  realtime: null,              // Provide custom RealtimeBroadcaster
  planningSessionManager: null // Provide custom PlanningSessionManager
});
```

**Options Reference**:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `dbPath` | string | `data/news.db` | Database path |
| `port` | number | `3000` | Server port |
| `verbose` | boolean | `false` | Verbose logging |
| `queueDebug` | boolean | `false` | Queue debug logging |
| `allowMultiJobs` | boolean | `false` | Allow concurrent jobs |
| `guardWindowMs` | number | `600` | Cooldown between jobs (ms) |
| `priorityConfigPath` | string | `config/priority-config.json` | Priority config path |
| `bootstrapDatasetPath` | string | `data/bootstrap/bootstrap-db.json` | Bootstrap dataset path |
| `fakeRunner` | boolean | `false` | Use fake runner (testing) |
| `traceStart` | boolean | `false` | Trace startup timing |
| `jobRegistry` | object | `null` | Custom JobRegistry instance |
| `crawlerManager` | object | `null` | Custom IntelligentCrawlerManager |
| `realtime` | object | `null` | Custom RealtimeBroadcaster |
| `planningSessionManager` | object | `null` | Custom PlanningSessionManager |

**Example**:
```javascript
const app = createApp({
  dbPath: './test.db',
  port: 8080,
  verbose: true,
  allowMultiJobs: true,
  priorityConfigPath: './custom-priority.json'
});

const server = app.listen(8080, () => {
  console.log('Server running on http://localhost:8080');
});
```

---

## Default Values

### Default Configuration Summary

```javascript
{
  // Database
  dbPath: 'data/news.db',
  
  // Server
  port: 3000,
  
  // Logging
  verbose: false,
  queueDebug: false,
  logsMaxPerSec: 200,
  logLineMaxChars: 8192,
  
  // Crawl Management
  allowMultiJobs: false,
  guardWindowMs: 600,
  
  // Gazetteer
  skipGazetteerWarmup: false,
  gazetteerWarmupCode: 'ID',
  
  // Configuration Files
  priorityConfigPath: 'config/priority-config.json',
  bootstrapDatasetPath: 'data/bootstrap/bootstrap-db.json',
  
  // Testing
  fakeRunner: false,
  traceStart: false,
  testQuiet: false
}
```

---

## Configuration Validation

### Validation Rules

**Database Path**:
- Must be a valid file path
- Directory must exist or be creatable
- Write permissions required

**Port**:
- Must be a number between 1 and 65535
- Must not be in use by another process

**Priority Config Path**:
- Must be a valid JSON file
- Must conform to priority config schema
- File must be readable

**Bootstrap Dataset Path**:
- Must be a directory
- Must contain valid NDJSON files
- Files must be readable

### Validation Example

```javascript
function validateConfig(options) {
  const errors = [];
  
  // Validate port
  if (options.port < 1 || options.port > 65535) {
    errors.push('Port must be between 1 and 65535');
  }
  
  // Validate database path
  if (!options.dbPath || typeof options.dbPath !== 'string') {
    errors.push('dbPath must be a non-empty string');
  }
  
  // Validate priority config
  if (options.priorityConfigPath) {
    try {
      const config = JSON.parse(fs.readFileSync(options.priorityConfigPath, 'utf8'));
      if (!config.hosts && !config.patterns && !config.global) {
        errors.push('Priority config must have hosts, patterns, or global section');
      }
    } catch (err) {
      errors.push(`Invalid priority config: ${err.message}`);
    }
  }
  
  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}
```

---

## Examples

### Example 1: Production Server

```bash
#!/bin/bash
# production-server.sh

export NODE_ENV=production
export PORT=8080
export DB_PATH="/data/production/crawler.db"
export UI_VERBOSE=0
export UI_ALLOW_MULTI_JOBS=1
export UI_LOGS_MAX_PER_SEC=500
export UI_PRIORITY_CONFIG="/etc/crawler/priority-config.json"

node src/ui/express/server.js
```

---

### Example 2: Development Server

```bash
#!/bin/bash
# dev-server.sh

export NODE_ENV=development
export PORT=3000
export DB_PATH="./dev.db"
export UI_VERBOSE=1
export UI_QUEUE_DEBUG=1
export UI_ALLOW_MULTI_JOBS=1
export UI_TRACE_START=1

node src/ui/express/server.js
```

---

### Example 3: Testing Configuration

```javascript
// test-helper.js
const { createApp } = require('../src/ui/express/server');
const fs = require('fs');
const path = require('path');

function createTestApp() {
  // Create temporary database
  const testDbPath = path.join(__dirname, '../tmp', `test-${Date.now()}.db`);
  
  // Create test app with minimal configuration
  const app = createApp({
    dbPath: testDbPath,
    verbose: false,
    queueDebug: false,
  allowMultiJobs: true,
  fakeRunner: true,  // Don't spawn real processes
  priorityConfigPath: null,  // Let ConfigManager fall back to defaults
  bootstrapDatasetPath: null  // Resolve packaged bootstrap dataset automatically
  });
  
  // Clean up function
  app.cleanup = () => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  };
  
  return app;
}

module.exports = { createTestApp };
```

---

### Example 4: Custom Priority Configuration

```json
{
  "hosts": {
    "bbc.com": {
      "priority": 20,
      "maxDepth": 3,
      "rateLimit": 200,
      "respectRobotsTxt": true,
      "allowedPatterns": [
        "/news/*",
        "/sport/*"
      ],
      "blockedPatterns": [
        "/weather/*"
      ]
    },
    "reuters.com": {
      "priority": 18,
      "maxDepth": 2,
      "rateLimit": 150
    },
    "example.com": {
      "priority": 5,
      "maxDepth": 1,
      "rateLimit": 50
    }
  },
  "patterns": {
    "/news/*": {
      "priority": 15
    },
    "/article/*": {
      "priority": 12
    },
    "/blog/*": {
      "priority": 8
    }
  },
  "global": {
    "defaultPriority": 5,
    "defaultMaxDepth": 2,
    "defaultRateLimit": 100,
    "respectRobotsTxt": true,
    "userAgent": "NewsBot/1.0"
  }
}
```

---

### Example 5: Environment-Specific Configuration

```javascript
// config.js - Environment-specific configuration loader
const path = require('path');

function loadConfig(env = process.env.NODE_ENV) {
  const configs = {
    development: {
      dbPath: './dev.db',
      port: 3000,
      verbose: true,
      allowMultiJobs: true,
      priorityConfigPath: './config/priority-config.dev.json'
    },
    
    test: {
      dbPath: ':memory:',  // In-memory database
      port: 0,  // Random port
      verbose: false,
      allowMultiJobs: true,
      fakeRunner: true,
      priorityConfigPath: null
    },
    
    production: {
      dbPath: process.env.DB_PATH || '/data/production/crawler.db',
      port: parseInt(process.env.PORT) || 8080,
      verbose: false,
      allowMultiJobs: true,
      priorityConfigPath: '/etc/crawler/priority-config.json'
    }
  };
  
  return configs[env] || configs.development;
}

module.exports = { loadConfig };

// Usage:
// const { loadConfig } = require('./config');
// const { createApp } = require('./src/ui/express/server');
// const app = createApp(loadConfig());
```

---

## Configuration Best Practices

### 1. Use Environment Variables for Secrets

❌ **Bad**:
```javascript
const app = createApp({
  dbPath: '/data/production/crawler.db',  // Hardcoded
  apiKey: 'secret-key-12345'  // Secret in code
});
```

✅ **Good**:
```javascript
const app = createApp({
  dbPath: process.env.DB_PATH,
  apiKey: process.env.API_KEY
});
```

---

### 2. Validate Configuration Early

```javascript
function createApp(options) {
  // Validate BEFORE initializing services
  validateConfig(options);
  
  // Now safe to proceed
  const db = ensureDatabase(options.dbPath);
  // ...
}
```

---

### 3. Provide Sensible Defaults

```javascript
const defaultOptions = {
  port: 3000,
  verbose: false,
  allowMultiJobs: false,
  guardWindowMs: 600
};

function createApp(userOptions = {}) {
  const options = { ...defaultOptions, ...userOptions };
  // ...
}
```

---

### 4. Document Configuration in Code

```javascript
/**
 * @param {Object} options - Configuration options
 * @param {string} [options.dbPath='data/news.db'] - Database file path
 * @param {number} [options.port=3000] - HTTP server port
 * @param {boolean} [options.verbose=false] - Enable verbose logging
 * @param {boolean} [options.allowMultiJobs=false] - Allow concurrent jobs
 */
function createApp(options = {}) {
  // ...
}
```

---

### 5. Use Configuration Files for Complex Settings

For complex configuration (priority rules, crawl patterns), use JSON files:
- Easier to edit without code changes
- Can be hot-reloaded (with ConfigManager)
- Version-controlled alongside code
- Validated with JSON Schema

---

## Troubleshooting

### Issue: Server won't start

**Check**:
1. Port already in use: `lsof -i :3000` (Unix) or `netstat -ano | findstr :3000` (Windows)
2. Database path exists and is writable
3. Configuration file is valid JSON

**Solution**:
```bash
# Use different port
export PORT=8080
node src/ui/express/server.js

# Or use programmatic config
node -e "require('./src/ui/express/server').createApp({ port: 8080 })"
```

---

### Issue: Configuration not being applied

**Check**:
1. Environment variables are set: `echo $UI_VERBOSE`
2. Configuration file path is correct
3. Variable names match exactly (case-sensitive)
4. Boolean values are truthy (`1`, `true`, `yes`, `on`)

**Debug**:
```bash
# Enable trace logging
export UI_VERBOSE=1
export UI_TRACE_START=1
node src/ui/express/server.js
```

---

### Issue: Priority config not loading

**Check**:
1. File exists and is readable
2. JSON is valid: `node -e "JSON.parse(require('fs').readFileSync('config/priority-config.json'))"`
3. Path is absolute or relative to working directory

**Solution**:
```bash
# Use absolute path
export UI_PRIORITY_CONFIG="$(pwd)/config/priority-config.json"
node src/ui/express/server.js
```

---

## Related Documentation

- **docs/SERVICE_LAYER_GUIDE.md** - Service architecture and dependency injection
- **RUNBOOK.md** - Operations guide with server CLI reference
- **AGENTS.md** - Development guidelines and patterns
- **docs/API_ENDPOINT_REFERENCE.md** - API configuration endpoints

---

*Last Updated: October 10, 2025*
*Version: 1.0*
