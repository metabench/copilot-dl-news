#!/usr/bin/env node
const path = require('path');
const { spawnSync } = require('child_process');
const { getSessionPlan } = require('./what-next');

// Get session location from args
const location = process.argv[2];
if (!location) {
  console.error('Usage: node ask-followup.js <session-location>');
  process.exit(1);
}

const plan = getSessionPlan(location);
if (!plan) {
  console.error('Plan not found');
  process.exit(1);
}

// Extract follow-ups
const lines = plan.split('\n');
const followUps = [];
let inFollowUps = false;

for (const line of lines) {
  if (line.trim().toLowerCase().startsWith('## follow-ups') || line.trim().toLowerCase().startsWith('### follow-ups')) {
    inFollowUps = true;
    continue;
  }
  if (inFollowUps && line.trim().startsWith('#')) {
    inFollowUps = false;
    break;
  }
  if (inFollowUps) {
    const match = line.match(/^-\s*(.*)/);
    if (match) {
      followUps.push(match[1].trim());
    }
  }
}

if (followUps.length === 0) {
  console.log('No follow-ups found in plan.');
  process.exit(0);
}

const options = followUps.map((f, i) => ({
  label: f.length > 50 ? f.slice(0, 47) + '...' : f,
  description: f,
  value: f
}));

// Run picker
const script = path.resolve(__dirname, 'ui-pick.js');
const result = spawnSync('node', [script, '--options', JSON.stringify(options)], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit']
});

if (result.status !== 0) {
  console.log('User cancelled.');
  process.exit(0);
}

const selection = result.stdout.trim().replace(/^"|"$/g, '');
console.log(`SELECTED_TASK:${selection}`);
