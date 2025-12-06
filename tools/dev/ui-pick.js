#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

function showHelp() {
  console.log('Usage: node tools/dev/ui-pick.js [--options "[\"A\",{\"label\":\"B\",\"value\":\"b\"}]"] [--json] <option...>');
  console.log('  --options <json>  JSON array of strings or {label,value,description} objects');
  console.log('  --json            Emit JSON {selection,cancelled,success,raw}');
  console.log('  -h, --help        Show this help');
  process.exit(0);
}

// Parse args
const args = process.argv.slice(2);
let options = [];
let useJson = false;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--help' || arg === '-h') {
    showHelp();
  } else if (arg === '--json') {
    useJson = true;
  } else if (arg === '--options') {
    const value = args[i + 1];
    if (!value) {
      console.error('Missing value for --options');
      process.exit(2);
    }
    i += 1;
    try {
      options = JSON.parse(value);
    } catch (e) {
      console.error('Error parsing options JSON:', e.message);
      process.exit(2);
    }
  } else if (arg.startsWith('--options=')) {
    const value = arg.slice('--options='.length);
    try {
      options = JSON.parse(value);
    } catch (e) {
      console.error('Error parsing options JSON:', e.message);
      process.exit(2);
    }
  } else if (arg.startsWith('--')) {
    console.error(`Unknown flag: ${arg}`);
    process.exit(2);
  } else {
    options.push(arg);
  }
}

if (options.length === 0) {
  console.error('Usage: node tools/dev/ui-pick.js --options "[\"Option A\", \"Option B\"]"');
  console.error('   or: node tools/dev/ui-pick.js "Option A" "Option B"');
  process.exit(2);
}

// Normalize to objects with label/value to match renderer expectations
const normalizedOptions = options.map((opt, idx) => {
  if (typeof opt === 'string') {
    return { label: opt, value: opt };
  }
  if (opt && typeof opt === 'object') {
    const label = opt.label || opt.value;
    const value = opt.value || opt.label;
    if (!label || !value) {
      console.error(`Option at index ${idx} is missing label/value`);
      process.exit(2);
    }
    return {
      label,
      value,
      description: opt.description,
      icon: opt.icon || opt.emoji,
      emoji: opt.emoji,
      phase: opt.phase
    };
  }
  console.error(`Unsupported option type at index ${idx}`);
  process.exit(2);
});

// Write options to temp file
const tmpDir = os.tmpdir();
const tmpFile = path.join(tmpDir, `ui-pick-${Date.now()}.json`);
fs.writeFileSync(tmpFile, JSON.stringify(normalizedOptions));

// Path to electron app
const pickerDir = path.resolve(__dirname, '../ui/quick-picker');

const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

// Spawn electron via npm start to avoid path/binary issues
const child = spawn(npmCmd, ['start', '--', `--options-file=${tmpFile}`], {
  cwd: pickerDir,
  stdio: ['ignore', 'pipe', 'inherit'], // Pipe stdout to capture result
  windowsHide: false,
  shell: true
});

let output = '';

child.stdout.on('data', (data) => {
  output += data.toString();
});

child.on('close', (code) => {
  // Clean up
  try {
    if (fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  } catch (e) {
    // ignore cleanup errors
  }

  if (code !== 0) {
    console.error(`Picker exited with code ${code}`);
    process.exit(code);
  }

  // Parse output
  try {
    // Electron might output other logs, look for the JSON line
    const lines = output.split('\n');
    let result = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const json = JSON.parse(trimmed);
          if (json.selection !== undefined || json.cancelled) {
            result = json;
            break;
          }
        } catch (e) {
          // Not our JSON
        }
      }
    }

    if (result) {
      const payload = {
        success: !result.cancelled,
        selection: result.selection ?? null,
        cancelled: !!result.cancelled,
        option: result.option || null,
        phase: result.phase || (result.option && result.option.phase) || null,
        raw: result
      };

      if (useJson) {
        console.log(JSON.stringify(payload, null, 2));
      } else if (payload.cancelled) {
        console.log('Cancelled');
      } else {
        console.log(payload.selection);
      }

      process.exit(payload.cancelled ? 1 : 0);
    } else {
      console.error('No selection received');
      process.exit(1);
    }
  } catch (e) {
    console.error('Error parsing result:', e);
    process.exit(2);
  }
});
