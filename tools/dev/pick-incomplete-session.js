#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SESSIONS_DIR = path.resolve(__dirname, '../../docs/sessions');
const HUB_PATH = path.join(SESSIONS_DIR, 'SESSIONS_HUB.md');

function parseSessionsHub() {
  if (!fs.existsSync(HUB_PATH)) {
    return {};
  }

  const content = fs.readFileSync(HUB_PATH, 'utf8');
  const lines = content.split('\n');
  const hubStatus = {};

  let currentSession = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Match session header: ### Session YYYY-MM-DD: Title
    // Note: Some headers might vary slightly, but this is the standard format
    const headerMatch = line.match(/^### Session (\d{4}-\d{2}-\d{2}): (.+)$/);
    if (headerMatch) {
      currentSession = {
        date: headerMatch[1],
        title: headerMatch[2],
        status: 'Unknown',
        location: null
      };
      continue;
    }

    if (!currentSession) continue;

    // Match Completion: ...
    const completionMatch = line.match(/^\*\*Completion\*\*: (.+)$/);
    if (completionMatch) {
      currentSession.status = completionMatch[1].trim();
    }

    // Match Duration: Closed (Alternative completion signal)
    const durationMatch = line.match(/^\*\*Duration\*\*: (.*)$/);
    if (durationMatch && durationMatch[1].trim().toLowerCase() === 'closed') {
      currentSession.status = 'Completed';
    }

    // Match Location: `docs/sessions/.../`
    const locationMatch = line.match(/^\*\*Location\*\*: `docs\/sessions\/([^/]+)\/`$/);
    if (locationMatch) {
      const slug = locationMatch[1];
      hubStatus[slug] = currentSession.status;
      currentSession = null; // Reset after finding location
    }
  }
  return hubStatus;
}

function getSessionStatus(sessionDir, hubStatusMap) {
  const slug = path.basename(sessionDir);
  const planPath = path.join(sessionDir, 'PLAN.md');
  const summaryPath = path.join(sessionDir, 'SESSION_SUMMARY.md');
  
  let isComplete = false;
  let statusSource = 'local';
  let remainingTasks = [];
  let title = slug;
  let planComplete = false;

  // Check Plan Completion (All checked, none unchecked)
  if (fs.existsSync(planPath)) {
    const planContent = fs.readFileSync(planPath, 'utf-8');
    const hasUnchecked = /^\s*-\s*\[ \]/m.test(planContent);
    const hasChecked = /^\s*-\s*\[x\]/mi.test(planContent);
    
    if (hasChecked && !hasUnchecked) {
      planComplete = true;
    }
  }

  // 1. Check Hub Status (Authoritative)
  if (hubStatusMap[slug]) {
    const status = hubStatusMap[slug].toLowerCase();
    if (status.includes('completed') || status.includes('✅') || status.includes('closed')) {
      isComplete = true;
      statusSource = 'hub';
    } else {
      isComplete = false; // "In progress", "Active", etc.
      statusSource = 'hub';
    }
  } else {
    // 2. Fallback to Local Checks
    
    // Check Summary
    if (fs.existsSync(summaryPath)) {
      const summaryContent = fs.readFileSync(summaryPath, 'utf-8');
      if (summaryContent.match(/Status:\s*Complete/i) || planComplete) {
        isComplete = true;
      }
    } else if (planComplete) {
      // Plan is fully checked off, treat as complete even if summary missing
      isComplete = true;
    } else {
      // No summary usually means incomplete
      isComplete = false;
    }
  }

  // Get Title and Tasks from Plan (for display)
  if (fs.existsSync(planPath)) {
    const planContent = fs.readFileSync(planPath, 'utf-8');
    
    // Extract title if possible (first h1)
    const titleMatch = planContent.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      title = titleMatch[1].trim();
    }

    // Find unchecked items
    const lines = planContent.split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*-\s*\[ \]\s*(.+)$/);
      if (match) {
        remainingTasks.push(match[1].trim());
      }
    }
  }

  return {
    id: slug,
    path: sessionDir,
    title,
    isComplete,
    statusSource,
    remainingTasks
  };
}

function main() {
  if (!fs.existsSync(SESSIONS_DIR)) {
    console.error(`Sessions directory not found: ${SESSIONS_DIR}`);
    process.exit(1);
  }

  const hubStatusMap = parseSessionsHub();

  const sessions = fs.readdirSync(SESSIONS_DIR)
    .map(name => path.join(SESSIONS_DIR, name))
    .filter(p => fs.statSync(p).isDirectory() && path.basename(p) !== 'archive')
    .map(p => getSessionStatus(p, hubStatusMap))
    .filter(s => !s.isComplete)
    .sort((a, b) => b.id.localeCompare(a.id)); // Newest first

  if (sessions.length === 0) {
    console.log('No incomplete sessions found.');
    process.exit(0);
  }

  const options = sessions.map(s => {
    const taskCount = s.remainingTasks.length;
    const taskPreview = s.remainingTasks.slice(0, 2).join(', ');
    const suffix = s.remainingTasks.length > 2 ? '...' : '';
    const taskInfo = taskCount > 0 ? ` (${taskCount} left: ${taskPreview}${suffix})` : '';
    return `${s.id} | ${s.title}${taskInfo}`;
  });

  // Call ui-pick.js
  const uiPickPath = path.join(__dirname, 'ui-pick.js');
  const result = spawnSync('node', [uiPickPath, '--options', JSON.stringify(options)], {
    stdio: 'pipe',
    encoding: 'utf-8'
  });

  if (result.status !== 0) {
    process.exit(1);
  }

  const selection = result.stdout.trim();
  if (!selection) {
    process.exit(1);
  }

  // Extract ID from selection
  const selectedId = selection.split(' | ')[0];
  const selectedSession = sessions.find(s => s.id === selectedId);

  if (selectedSession) {
    console.log(selectedSession.path);
  } else {
    console.error('Could not find session for selection:', selection);
    process.exit(1);
  }
}

main();
