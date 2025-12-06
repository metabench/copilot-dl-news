#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

// Parse args
const args = process.argv.slice(2);
let options = [];

// Check for --options flag
const optionsFlagIndex = args.indexOf('--options');
if (optionsFlagIndex !== -1 && args[optionsFlagIndex + 1]) {
  try {
    options = JSON.parse(args[optionsFlagIndex + 1]);
  } catch (e) {
    console.error('Error parsing options JSON:', e.message);
    process.exit(1);
  }
} else {
  // Treat remaining args as simple string options
  options = args.filter(arg => !arg.startsWith('--'));
}

if (options.length === 0) {
  console.error('Usage: node tools/dev/ui-pick.js --options \'["Option A", "Option B"]\'');
  console.error('   or: node tools/dev/ui-pick.js "Option A" "Option B"');
  process.exit(1);
}

// Write options to temp file
const tmpDir = os.tmpdir();
const tmpFile = path.join(tmpDir, `ui-pick-${Date.now()}.json`);
fs.writeFileSync(tmpFile, JSON.stringify(options));

// Path to electron app
const pickerDir = path.resolve(__dirname, '../ui/quick-picker');
const electronBin = path.resolve(pickerDir, 'node_modules/.bin/electron');

// Spawn electron via npm start to avoid path/binary issues
const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

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
      if (result.cancelled) {
        console.log('Cancelled');
        process.exit(1);
      } else {
        console.log(result.selection);
        process.exit(0);
      }
    } else {
      console.error('No selection received');
      process.exit(1);
    }
  } catch (e) {
    console.error('Error parsing result:', e);
    process.exit(1);
  }
});
