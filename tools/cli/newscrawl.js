#!/usr/bin/env node
'use strict';

/**
 * NewsCrawl CLI Tool
 * Command-line interface for programmatic access to the news crawler
 * @module tools/cli/newscrawl
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const CONFIG_DIR = path.join(process.env.HOME || process.env.USERPROFILE, '.newscrawl');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

/**
 * CLI colors (simple ANSI codes)
 */
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

/**
 * Print colored output
 */
function print(color, text) {
  console.log(`${colors[color] || ''}${text}${colors.reset}`);
}

/**
 * Load saved configuration
 * @returns {Object} Configuration object
 */
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (e) {
    // Ignore errors
  }
  return {};
}

/**
 * Save configuration
 * @param {Object} config - Configuration to save
 */
function saveConfig(config) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * Make HTTP request
 * @param {Object} options - Request options
 * @returns {Promise<Object>} Response data
 */
function request(options) {
  return new Promise((resolve, reject) => {
    const config = loadConfig();
    const baseUrl = options.baseUrl || config.baseUrl || 'http://localhost:3000';
    const url = new URL(options.path, baseUrl);
    
    const reqOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {}),
        ...options.headers
      }
    };

    const protocol = url.protocol === 'https:' ? https : http;
    const req = protocol.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

/**
 * Command: login
 * Store API credentials
 */
async function cmdLogin(args) {
  const apiKey = args[0];
  const baseUrl = args[1] || 'http://localhost:3000';

  if (!apiKey) {
    print('red', 'Error: API key required');
    print('dim', 'Usage: newscrawl login <api-key> [base-url]');
    return { success: false, error: 'API key required' };
  }

  // Validate the API key
  const config = { apiKey, baseUrl };
  saveConfig(config);
  
  try {
    const response = await request({ path: '/api/v1/me' });
    if (response.status === 200) {
      print('green', '✓ Logged in successfully');
      print('dim', `User: ${response.data.email || response.data.name || 'Unknown'}`);
      return { success: true, user: response.data };
    } else {
      print('red', '✗ Invalid API key');
      saveConfig({});
      return { success: false, error: 'Invalid API key' };
    }
  } catch (e) {
    print('yellow', '⚠ Could not verify API key (server not reachable)');
    print('dim', 'Credentials saved anyway');
    return { success: true, verified: false };
  }
}

/**
 * Command: logout
 * Clear stored credentials
 */
function cmdLogout() {
  saveConfig({});
  print('green', '✓ Logged out');
  return { success: true };
}

/**
 * Command: status
 * Show account and connection status
 */
async function cmdStatus() {
  const config = loadConfig();
  
  if (!config.apiKey) {
    print('yellow', 'Not logged in');
    print('dim', 'Run: newscrawl login <api-key>');
    return { loggedIn: false };
  }

  print('cyan', 'Configuration:');
  print('dim', `  Base URL: ${config.baseUrl}`);
  print('dim', `  API Key: ${config.apiKey.substring(0, 8)}...`);

  try {
    const response = await request({ path: '/api/v1/me' });
    if (response.status === 200) {
      print('green', '\n✓ Connected');
      print('dim', `  User: ${response.data.email || response.data.name}`);
      if (response.data.plan) {
        print('dim', `  Plan: ${response.data.plan}`);
      }
      if (response.data.usage) {
        print('dim', `  API calls: ${response.data.usage.apiCalls || 0}`);
      }
      return { loggedIn: true, connected: true, user: response.data };
    }
    print('red', '✗ Not connected');
    return { loggedIn: true, connected: false };
  } catch (e) {
    print('red', '✗ Server not reachable');
    return { loggedIn: true, connected: false, error: e.message };
  }
}

/**
 * Command: search
 * Search for articles
 */
async function cmdSearch(args, flags) {
  const query = args.join(' ');
  if (!query) {
    print('red', 'Error: Search query required');
    return { success: false, error: 'Query required' };
  }

  const limit = flags.limit || 10;
  const format = flags.format || 'text';

  try {
    const response = await request({
      path: `/api/v1/articles/search?q=${encodeURIComponent(query)}&limit=${limit}`
    });

    if (response.status !== 200) {
      print('red', `Error: ${response.data.error || 'Search failed'}`);
      return { success: false, error: response.data.error };
    }

    const articles = response.data.articles || response.data || [];
    
    if (format === 'json') {
      console.log(JSON.stringify(articles, null, 2));
    } else {
      print('cyan', `Found ${articles.length} articles:\n`);
      articles.forEach((article, i) => {
        print('bold', `${i + 1}. ${article.title}`);
        print('dim', `   ${article.url}`);
        if (article.publishedAt) {
          print('dim', `   Published: ${article.publishedAt}`);
        }
        console.log();
      });
    }

    return { success: true, count: articles.length, articles };
  } catch (e) {
    print('red', `Error: ${e.message}`);
    return { success: false, error: e.message };
  }
}

/**
 * Command: export
 * Export articles to file
 */
async function cmdExport(args, flags) {
  const format = flags.format || 'json';
  const output = flags.output || `export-${Date.now()}.${format}`;
  const limit = flags.limit || 100;

  try {
    const response = await request({
      path: `/api/v1/articles/export?format=${format}&limit=${limit}`
    });

    if (response.status !== 200) {
      print('red', `Error: ${response.data.error || 'Export failed'}`);
      return { success: false, error: response.data.error };
    }

    const data = typeof response.data === 'string' 
      ? response.data 
      : JSON.stringify(response.data, null, 2);
    
    fs.writeFileSync(output, data);
    print('green', `✓ Exported to ${output}`);
    return { success: true, file: output };
  } catch (e) {
    print('red', `Error: ${e.message}`);
    return { success: false, error: e.message };
  }
}

/**
 * Command: alerts list
 * List configured alerts
 */
async function cmdAlertsList() {
  try {
    const response = await request({ path: '/api/v1/alerts' });
    
    if (response.status !== 200) {
      print('red', `Error: ${response.data.error || 'Failed to list alerts'}`);
      return { success: false, error: response.data.error };
    }

    const alerts = response.data.alerts || response.data || [];
    
    if (alerts.length === 0) {
      print('dim', 'No alerts configured');
      return { success: true, count: 0, alerts: [] };
    }

    print('cyan', `${alerts.length} alerts:\n`);
    alerts.forEach((alert, i) => {
      const status = alert.enabled ? colors.green + '●' : colors.dim + '○';
      print('reset', `${status} ${alert.name || `Alert ${alert.id}`}${colors.reset}`);
      print('dim', `   Query: ${alert.query || alert.conditions}`);
      print('dim', `   Channel: ${alert.channel || 'email'}`);
      console.log();
    });

    return { success: true, count: alerts.length, alerts };
  } catch (e) {
    print('red', `Error: ${e.message}`);
    return { success: false, error: e.message };
  }
}

/**
 * Command: alerts create
 * Create a new alert
 */
async function cmdAlertsCreate(args, flags) {
  const name = flags.name || args[0];
  const query = flags.query || args[1];
  const channel = flags.channel || 'email';

  if (!name || !query) {
    print('red', 'Error: Name and query required');
    print('dim', 'Usage: newscrawl alerts create --name "My Alert" --query "keyword"');
    return { success: false, error: 'Name and query required' };
  }

  try {
    const response = await request({
      path: '/api/v1/alerts',
      method: 'POST',
      body: { name, query, channel, enabled: true }
    });

    if (response.status === 201 || response.status === 200) {
      print('green', `✓ Alert created: ${name}`);
      return { success: true, alert: response.data };
    } else {
      print('red', `Error: ${response.data.error || 'Failed to create alert'}`);
      return { success: false, error: response.data.error };
    }
  } catch (e) {
    print('red', `Error: ${e.message}`);
    return { success: false, error: e.message };
  }
}

/**
 * Command: alerts delete
 * Delete an alert
 */
async function cmdAlertsDelete(args) {
  const id = args[0];
  if (!id) {
    print('red', 'Error: Alert ID required');
    return { success: false, error: 'ID required' };
  }

  try {
    const response = await request({
      path: `/api/v1/alerts/${id}`,
      method: 'DELETE'
    });

    if (response.status === 200 || response.status === 204) {
      print('green', `✓ Alert ${id} deleted`);
      return { success: true };
    } else {
      print('red', `Error: ${response.data.error || 'Failed to delete alert'}`);
      return { success: false, error: response.data.error };
    }
  } catch (e) {
    print('red', `Error: ${e.message}`);
    return { success: false, error: e.message };
  }
}

/**
 * Parse command line flags
 * @param {string[]} args - Command line arguments
 * @returns {Object} Parsed args and flags
 */
function parseArgs(args) {
  const result = { args: [], flags: {} };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.substring(2);
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        result.flags[key] = next;
        i++;
      } else {
        result.flags[key] = true;
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      const key = arg.substring(1);
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        result.flags[key] = next;
        i++;
      } else {
        result.flags[key] = true;
      }
    } else {
      result.args.push(arg);
    }
  }
  
  return result;
}

/**
 * Show help
 */
function showHelp() {
  print('cyan', 'NewsCrawl CLI\n');
  print('bold', 'Usage: newscrawl <command> [options]\n');
  print('reset', 'Commands:');
  print('dim', '  login <api-key> [url]  Store API credentials');
  print('dim', '  logout                 Clear stored credentials');
  print('dim', '  status                 Show connection status');
  print('dim', '  search <query>         Search articles');
  print('dim', '    --limit <n>          Max results (default: 10)');
  print('dim', '    --format json|text   Output format');
  print('dim', '  export                 Export articles');
  print('dim', '    --format json|csv    Export format');
  print('dim', '    --output <file>      Output file');
  print('dim', '    --limit <n>          Max articles');
  print('dim', '  alerts list            List alerts');
  print('dim', '  alerts create          Create alert');
  print('dim', '    --name <name>        Alert name');
  print('dim', '    --query <query>      Search query');
  print('dim', '    --channel <ch>       Notification channel');
  print('dim', '  alerts delete <id>     Delete alert');
  print('dim', '  help                   Show this help');
  
  return { command: 'help' };
}

/**
 * Main CLI entry point
 * @param {string[]} argv - Command line arguments
 * @returns {Promise<Object>} Command result
 */
async function main(argv = process.argv.slice(2)) {
  const parsed = parseArgs(argv);
  const command = parsed.args[0];
  const subArgs = parsed.args.slice(1);

  switch (command) {
    case 'login':
      return cmdLogin(subArgs);
    case 'logout':
      return cmdLogout();
    case 'status':
      return cmdStatus();
    case 'search':
      return cmdSearch(subArgs, parsed.flags);
    case 'export':
      return cmdExport(subArgs, parsed.flags);
    case 'alerts':
      const subCommand = subArgs[0];
      switch (subCommand) {
        case 'list':
          return cmdAlertsList();
        case 'create':
          return cmdAlertsCreate(subArgs.slice(1), parsed.flags);
        case 'delete':
          return cmdAlertsDelete(subArgs.slice(1));
        default:
          print('red', `Unknown alerts command: ${subCommand}`);
          return { success: false, error: 'Unknown command' };
      }
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      return showHelp();
    default:
      print('red', `Unknown command: ${command}`);
      print('dim', 'Run: newscrawl help');
      return { success: false, error: 'Unknown command' };
  }
}

// Run if called directly
if (require.main === module) {
  main().then(result => {
    process.exit(result.success === false ? 1 : 0);
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  main,
  loadConfig,
  saveConfig,
  parseArgs,
  cmdLogin,
  cmdLogout,
  cmdStatus,
  cmdSearch,
  cmdExport,
  cmdAlertsList,
  cmdAlertsCreate,
  cmdAlertsDelete
};
