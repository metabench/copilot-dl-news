#!/usr/bin/env node
const path = require('path');
const { spawnSync } = require('child_process');
const { parseHub, getSessionPlan } = require('./what-next');

function getObjective(location) {
  const plan = getSessionPlan(location);
  if (!plan) return 'No plan found';
  const match = plan.match(/Objective: (.*)/);
  return match ? match[1].trim() : 'No objective found';
}

function main() {
  const sessions = parseHub();
  const activeSessions = sessions.filter(s => 
    s.status.includes('In progress') || 
    s.status.includes('Active') ||
    s.status.includes('🔄')
  );

  const options = [];

  // 1. Primary Focus
  if (activeSessions.length > 0) {
    const primary = activeSessions[0];
    options.push({
      label: `👉 Continue: ${primary.title}`,
      description: getObjective(primary.location),
      value: `continue:${primary.location}`
    });
  }

  // 2. Other Active Sessions
  if (activeSessions.length > 1) {
    activeSessions.slice(1).forEach(s => {
      options.push({
        label: `Switch to: ${s.title}`,
        description: getObjective(s.location),
        value: `switch:${s.location}`
      });
    });
  }

  // 3. New Session
  options.push({
    label: '✨ Start New Session',
    description: 'Initialize a new task session',
    value: 'new-session'
  });

  // 4. Just Chat
  options.push({
    label: '💬 Just Chat',
    description: 'No specific session context',
    value: 'chat'
  });

  // Run picker
  const script = path.resolve(__dirname, 'ui-pick.js');
  const result = spawnSync('node', [script, '--options', JSON.stringify(options)], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit']
  });

  if (result.status !== 0) {
    console.log('User cancelled selection.');
    process.exit(0);
  }

  const selection = result.stdout.trim().replace(/^"|"$/g, '');
  
  if (!selection) {
    console.log('No selection made.');
    return;
  }

  console.log(`USER_SELECTION:${selection}`);
  
  // If it's a session, print some context for the agent
  if (selection.startsWith('continue:') || selection.startsWith('switch:')) {
    const location = selection.split(':')[1];
    const plan = getSessionPlan(location);
    console.log('\n--- SELECTED SESSION PLAN ---');
    console.log(plan ? plan.slice(0, 1000) + '...' : 'No plan content');
  }
}

main();
