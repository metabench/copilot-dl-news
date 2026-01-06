'use strict';
/**
 * Test runner for crawler-app - runs Electron with timeout and captures all output
 * Usage: node test-runner.js [--timeout 10000]
 */

const { spawn, exec } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const timeoutIdx = args.indexOf('--timeout');
const timeout = timeoutIdx !== -1 ? parseInt(args[timeoutIdx + 1]) : 10000;

console.log(`🧪 Starting Electron app with ${timeout}ms timeout...`);
console.log('─'.repeat(60));

// Use shell: true to properly handle Windows paths
const child = spawn('npx', ['electron', '.'], {
  cwd: __dirname,
  shell: true,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' }
});

let stdout = '';
let stderr = '';

child.stdout.on('data', (data) => {
  const text = data.toString();
  stdout += text;
  text.split('\n').filter(l => l.trim()).forEach(line => {
    console.log(`📤 STDOUT: ${line}`);
  });
});

child.stderr.on('data', (data) => {
  const text = data.toString();
  stderr += text;
  text.split('\n').filter(l => l.trim()).forEach(line => {
    console.log(`🔴 STDERR: ${line}`);
  });
});

child.on('error', (err) => {
  console.log(`❌ Spawn error: ${err.message}`);
});

child.on('exit', (code, signal) => {
  console.log('─'.repeat(60));
  console.log(`🏁 Process exited: code=${code}, signal=${signal}`);
  if (stdout.length > 0) {
    console.log('\n📋 Full STDOUT:');
    console.log(stdout);
  }
  if (stderr.length > 0) {
    console.log('\n🔴 Full STDERR:');
    console.log(stderr);
  }
  process.exit(code || 0);
});

// Kill after timeout
const timer = setTimeout(() => {
  console.log('─'.repeat(60));
  console.log(`⏱️ Timeout reached (${timeout}ms), killing process...`);
  child.kill('SIGTERM');
  setTimeout(() => {
    if (!child.killed) {
      child.kill('SIGKILL');
    }
  }, 2000);
}, timeout);

// Handle ctrl+c
process.on('SIGINT', () => {
  clearTimeout(timer);
  child.kill('SIGTERM');
});
