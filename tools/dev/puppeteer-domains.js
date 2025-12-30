#!/usr/bin/env node
'use strict';

/**
 * puppeteer-domains.js - CLI to manage Puppeteer fallback domains
 * 
 * Usage:
 *   node tools/dev/puppeteer-domains.js --list
 *   node tools/dev/puppeteer-domains.js --add example.com --reason "TLS fingerprinting"
 *   node tools/dev/puppeteer-domains.js --remove example.com
 *   node tools/dev/puppeteer-domains.js --pending
 *   node tools/dev/puppeteer-domains.js --approve example.com
 *   node tools/dev/puppeteer-domains.js --approve-all
 *   node tools/dev/puppeteer-domains.js --status
 *   node tools/dev/puppeteer-domains.js --tracking
 *   node tools/dev/puppeteer-domains.js --settings autoApprove=true
 */

const path = require('path');
const { PuppeteerDomainManager } = require('../../src/crawler/PuppeteerDomainManager');

// ANSI colors
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  gray: '\x1b[90m'
};

function parseArgs(args) {
  const parsed = { command: null, args: [], flags: {} };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--list' || arg === '-l') {
      parsed.command = 'list';
    } else if (arg === '--add' || arg === '-a') {
      parsed.command = 'add';
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        parsed.args.push(args[++i]);
      }
    } else if (arg === '--remove' || arg === '-r') {
      parsed.command = 'remove';
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        parsed.args.push(args[++i]);
      }
    } else if (arg === '--pending' || arg === '-p') {
      parsed.command = 'pending';
    } else if (arg === '--approve') {
      parsed.command = 'approve';
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        parsed.args.push(args[++i]);
      }
    } else if (arg === '--reject') {
      parsed.command = 'reject';
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        parsed.args.push(args[++i]);
      }
    } else if (arg === '--approve-all') {
      parsed.command = 'approve-all';
    } else if (arg === '--status' || arg === '-s') {
      parsed.command = 'status';
    } else if (arg === '--tracking' || arg === '-t') {
      parsed.command = 'tracking';
    } else if (arg === '--settings') {
      parsed.command = 'settings';
      // Collect key=value pairs
      while (args[i + 1] && !args[i + 1].startsWith('--')) {
        parsed.args.push(args[++i]);
      }
    } else if (arg === '--reason') {
      if (args[i + 1]) {
        parsed.flags.reason = args[++i];
      }
    } else if (arg === '--json') {
      parsed.flags.json = true;
    } else if (arg === '--help' || arg === '-h') {
      parsed.command = 'help';
    } else if (!arg.startsWith('-')) {
      parsed.args.push(arg);
    }
  }
  
  return parsed;
}

function printHelp() {
  console.log(`
${c.bold}puppeteer-domains${c.reset} - Manage Puppeteer fallback domains

${c.cyan}USAGE${c.reset}
  node tools/dev/puppeteer-domains.js <command> [options]

${c.cyan}COMMANDS${c.reset}
  ${c.bold}--list, -l${c.reset}              List all active domains
  ${c.bold}--add, -a${c.reset} <domain>      Add a domain manually
  ${c.bold}--remove, -r${c.reset} <domain>   Remove a domain
  ${c.bold}--pending, -p${c.reset}           Show pending domains awaiting approval
  ${c.bold}--approve${c.reset} <domain>      Approve a pending domain
  ${c.bold}--reject${c.reset} <domain>       Reject a pending domain
  ${c.bold}--approve-all${c.reset}           Approve all pending domains
  ${c.bold}--status, -s${c.reset}            Show full status summary
  ${c.bold}--tracking, -t${c.reset}          Show failure tracking data
  ${c.bold}--settings${c.reset} [key=val]    View or update settings

${c.cyan}OPTIONS${c.reset}
  ${c.bold}--reason${c.reset} <text>         Reason for adding (with --add)
  ${c.bold}--json${c.reset}                  Output as JSON
  ${c.bold}--help, -h${c.reset}              Show this help

${c.cyan}EXAMPLES${c.reset}
  ${c.dim}# List all active Puppeteer domains${c.reset}
  node tools/dev/puppeteer-domains.js --list

  ${c.dim}# Add a new domain${c.reset}
  node tools/dev/puppeteer-domains.js --add reuters.com --reason "TLS fingerprinting"

  ${c.dim}# Review and approve pending domains${c.reset}
  node tools/dev/puppeteer-domains.js --pending
  node tools/dev/puppeteer-domains.js --approve reuters.com

  ${c.dim}# Enable auto-approve for learned domains${c.reset}
  node tools/dev/puppeteer-domains.js --settings autoApprove=true

${c.cyan}CONFIG FILE${c.reset}
  config/puppeteer-domains.json
`);
}

function formatDate(isoDate) {
  if (!isoDate) return c.dim + 'never' + c.reset;
  const d = new Date(isoDate);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  const manager = new PuppeteerDomainManager({ logger: { info: () => {}, warn: console.warn, error: console.error } });
  manager.load();
  
  if (!args.command || args.command === 'help') {
    printHelp();
    return;
  }
  
  switch (args.command) {
    case 'list': {
      const status = manager.getStatus();
      
      if (args.flags.json) {
        console.log(JSON.stringify({
          active: status.domains.manual.concat(status.domains.learned),
          counts: status.counts
        }, null, 2));
        return;
      }
      
      console.log(`\n${c.bold}Active Puppeteer Domains${c.reset} (${status.counts.active} total)\n`);
      
      if (status.domains.manual.length > 0) {
        console.log(`${c.cyan}Manual:${c.reset}`);
        for (const domain of status.domains.manual) {
          console.log(`  ${c.green}✓${c.reset} ${domain}`);
        }
      }
      
      if (status.domains.learned.length > 0) {
        console.log(`\n${c.cyan}Learned:${c.reset}`);
        for (const domain of status.domains.learned) {
          console.log(`  ${c.yellow}⚡${c.reset} ${domain}`);
        }
      }
      
      if (status.domains.pending.length > 0) {
        console.log(`\n${c.gray}Pending approval: ${status.domains.pending.length}${c.reset}`);
      }
      
      console.log();
      break;
    }
    
    case 'add': {
      const domain = args.args[0];
      if (!domain) {
        console.error(`${c.red}Error:${c.reset} Please specify a domain to add`);
        process.exit(1);
      }
      
      const reason = args.flags.reason || 'Manually added via CLI';
      const success = manager.addDomain(domain, reason);
      
      if (args.flags.json) {
        console.log(JSON.stringify({ success, domain, reason }));
      } else if (success) {
        console.log(`${c.green}✓${c.reset} Added domain: ${c.bold}${domain}${c.reset}`);
      } else {
        console.log(`${c.yellow}⚠${c.reset} Domain already exists: ${domain}`);
      }
      break;
    }
    
    case 'remove': {
      const domain = args.args[0];
      if (!domain) {
        console.error(`${c.red}Error:${c.reset} Please specify a domain to remove`);
        process.exit(1);
      }
      
      const success = manager.removeDomain(domain);
      
      if (args.flags.json) {
        console.log(JSON.stringify({ success, domain }));
      } else if (success) {
        console.log(`${c.green}✓${c.reset} Removed domain: ${c.bold}${domain}${c.reset}`);
      } else {
        console.log(`${c.yellow}⚠${c.reset} Domain not found: ${domain}`);
      }
      break;
    }
    
    case 'pending': {
      const pending = manager.getPendingDomains();
      
      if (args.flags.json) {
        console.log(JSON.stringify(pending, null, 2));
        return;
      }
      
      console.log(`\n${c.bold}Pending Domains${c.reset} (${pending.length} awaiting approval)\n`);
      
      if (pending.length === 0) {
        console.log(`  ${c.dim}No pending domains${c.reset}\n`);
        return;
      }
      
      for (const entry of pending) {
        console.log(`  ${c.yellow}?${c.reset} ${c.bold}${entry.domain}${c.reset}`);
        console.log(`    ${c.dim}Reason:${c.reset} ${entry.reason}`);
        console.log(`    ${c.dim}Added:${c.reset} ${formatDate(entry.addedAt)}`);
        if (entry.lastUrl) {
          console.log(`    ${c.dim}Last URL:${c.reset} ${entry.lastUrl}`);
        }
        console.log();
      }
      
      console.log(`${c.dim}Use --approve <domain> or --approve-all to activate${c.reset}\n`);
      break;
    }
    
    case 'approve': {
      const domain = args.args[0];
      if (!domain) {
        console.error(`${c.red}Error:${c.reset} Please specify a domain to approve`);
        process.exit(1);
      }
      
      const success = manager.approveDomain(domain);
      
      if (args.flags.json) {
        console.log(JSON.stringify({ success, domain }));
      } else if (success) {
        console.log(`${c.green}✓${c.reset} Approved domain: ${c.bold}${domain}${c.reset}`);
      } else {
        console.log(`${c.yellow}⚠${c.reset} Domain not in pending: ${domain}`);
      }
      break;
    }
    
    case 'reject': {
      const domain = args.args[0];
      if (!domain) {
        console.error(`${c.red}Error:${c.reset} Please specify a domain to reject`);
        process.exit(1);
      }
      
      const success = manager.rejectDomain(domain);
      
      if (args.flags.json) {
        console.log(JSON.stringify({ success, domain }));
      } else if (success) {
        console.log(`${c.green}✓${c.reset} Rejected domain: ${c.bold}${domain}${c.reset}`);
      } else {
        console.log(`${c.yellow}⚠${c.reset} Domain not in pending: ${domain}`);
      }
      break;
    }
    
    case 'approve-all': {
      const count = manager.approveAllPending();
      
      if (args.flags.json) {
        console.log(JSON.stringify({ approved: count }));
      } else {
        console.log(`${c.green}✓${c.reset} Approved ${c.bold}${count}${c.reset} pending domains`);
      }
      break;
    }
    
    case 'status': {
      const status = manager.getStatus();
      
      if (args.flags.json) {
        console.log(JSON.stringify(status, null, 2));
        return;
      }
      
      console.log(`\n${c.bold}Puppeteer Domain Manager Status${c.reset}\n`);
      console.log(`  ${c.cyan}Config:${c.reset} ${status.configPath}`);
      console.log(`  ${c.cyan}Loaded:${c.reset} ${status.loaded ? c.green + 'yes' : c.red + 'no'}${c.reset}`);
      console.log();
      
      console.log(`  ${c.cyan}Counts:${c.reset}`);
      console.log(`    Active:   ${c.bold}${status.counts.active}${c.reset}`);
      console.log(`    Manual:   ${status.counts.manual}`);
      console.log(`    Learned:  ${status.counts.learned}`);
      console.log(`    Pending:  ${status.counts.pending > 0 ? c.yellow + status.counts.pending + c.reset : status.counts.pending}`);
      console.log(`    Tracking: ${status.counts.tracking}`);
      console.log();
      
      console.log(`  ${c.cyan}Auto-Learn Settings:${c.reset}`);
      console.log(`    Auto-learn:    ${status.settings.autoLearnEnabled ? c.green + 'enabled' : c.dim + 'disabled'}${c.reset}`);
      console.log(`    Threshold:     ${status.settings.autoLearnThreshold} failures`);
      console.log(`    Window:        ${status.settings.autoLearnWindowMs / 1000}s`);
      console.log(`    Auto-approve:  ${status.settings.autoApprove ? c.yellow + 'yes' : 'no'}${c.reset}`);
      console.log(`    Tracking:      ${status.settings.trackingEnabled ? 'enabled' : 'disabled'}`);
      console.log();
      
      // Browser lifecycle settings (from config)
      if (status.browserLifecycle) {
        const bl = status.browserLifecycle;
        console.log(`  ${c.cyan}Browser Lifecycle:${c.reset}`);
        console.log(`    Max pages/session:  ${bl.maxPagesPerSession}`);
        console.log(`    Max session age:    ${bl.maxSessionAgeMs / 1000}s (${Math.round(bl.maxSessionAgeMs / 60000)} min)`);
        console.log(`    Health check:       ${bl.healthCheckEnabled ? 'every ' + (bl.healthCheckIntervalMs / 1000) + 's' : 'disabled'}`);
        console.log(`    Restart on error:   ${bl.restartOnError ? 'after ' + bl.maxConsecutiveErrors + ' errors' : 'disabled'}`);
        console.log();
      }
      break;
    }
    
    case 'tracking': {
      const status = manager.getStatus();
      
      if (args.flags.json) {
        console.log(JSON.stringify(status.tracking, null, 2));
        return;
      }
      
      console.log(`\n${c.bold}Failure Tracking${c.reset}\n`);
      
      const entries = Object.entries(status.tracking);
      if (entries.length === 0) {
        console.log(`  ${c.dim}No failures being tracked${c.reset}\n`);
        return;
      }
      
      for (const [domain, data] of entries) {
        const pct = Math.round((data.count / data.threshold) * 100);
        const bar = '█'.repeat(Math.min(10, Math.round(pct / 10))) + '░'.repeat(10 - Math.min(10, Math.round(pct / 10)));
        console.log(`  ${c.bold}${domain}${c.reset}`);
        console.log(`    ${bar} ${data.count}/${data.threshold} (${pct}%)`);
        if (data.lastUrl) {
          console.log(`    ${c.dim}Last:${c.reset} ${data.lastUrl}`);
        }
        console.log();
      }
      break;
    }
    
    case 'settings': {
      if (args.args.length === 0) {
        // Just show settings
        const status = manager.getStatus();
        if (args.flags.json) {
          console.log(JSON.stringify(status.settings, null, 2));
        } else {
          console.log(`\n${c.bold}Settings${c.reset}\n`);
          for (const [key, value] of Object.entries(status.settings)) {
            console.log(`  ${c.cyan}${key}:${c.reset} ${value}`);
          }
          console.log();
        }
        return;
      }
      
      // Parse and update settings
      const updates = {};
      for (const arg of args.args) {
        const [key, val] = arg.split('=');
        if (!key || val === undefined) {
          console.error(`${c.red}Error:${c.reset} Invalid setting format: ${arg} (use key=value)`);
          process.exit(1);
        }
        
        // Type coercion
        if (val === 'true') updates[key] = true;
        else if (val === 'false') updates[key] = false;
        else if (/^\d+$/.test(val)) updates[key] = parseInt(val, 10);
        else updates[key] = val;
      }
      
      manager.updateSettings(updates);
      
      if (args.flags.json) {
        console.log(JSON.stringify({ updated: updates }));
      } else {
        console.log(`${c.green}✓${c.reset} Updated settings:`);
        for (const [key, value] of Object.entries(updates)) {
          console.log(`    ${key}: ${value}`);
        }
      }
      break;
    }
    
    default:
      console.error(`${c.red}Unknown command:${c.reset} ${args.command}`);
      printHelp();
      process.exit(1);
  }
}

run();
