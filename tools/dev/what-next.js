#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const HUB_PATH = path.join(__dirname, '../../docs/sessions/SESSIONS_HUB.md');

function parseHub() {
  if (!fs.existsSync(HUB_PATH)) {
    console.error('SESSIONS_HUB.md not found at', HUB_PATH);
    process.exit(1);
  }
  const content = fs.readFileSync(HUB_PATH, 'utf8');
  
  // Regex to capture session blocks
  // We look for the header, then capture until the next header or end of file
  // Inside the block we look for Status and Location
  
  const sessions = [];
  const lines = content.split('\n');
  let currentSession = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headerMatch = line.match(/^### Session ([\d-]+): (.*)/);
    
    if (headerMatch) {
      if (currentSession) sessions.push(currentSession);
      currentSession = {
        date: headerMatch[1],
        title: headerMatch[2],
        status: 'Unknown',
        location: ''
      };
    } else if (currentSession) {
      const statusMatch = line.match(/\*\*Completion\*\*: (.*)/);
      if (statusMatch) currentSession.status = statusMatch[1].trim();

      const durationMatch = line.match(/\*\*Duration\*\*: (.*)/);
      if (durationMatch && durationMatch[1].trim().toLowerCase() === 'closed') {
         // Only override if status is unknown or not explicitly set to something else yet
         if (currentSession.status === 'Unknown') {
             currentSession.status = 'Completed';
         }
      }
      
      const locationMatch = line.match(/\*\*Location\*\*: `(.*?)`/);
      if (locationMatch) currentSession.location = locationMatch[1];
    }
  }
  if (currentSession) sessions.push(currentSession);
  
  return sessions;
}

function getSessionPlan(location) {
  // Location is relative to repo root, e.g. docs/sessions/slug/
  const planPath = path.join(__dirname, '../../', location, 'PLAN.md');
  if (!fs.existsSync(planPath)) return null;
  return fs.readFileSync(planPath, 'utf8');
}

function main() {
  const sessions = parseHub();
  // Filter for active sessions
  const activeSessions = sessions.filter(s => 
    s.status.includes('In progress') || 
    s.status.includes('Active') ||
    s.status.includes('🔄')
  );
  
  if (activeSessions.length === 0) {
    console.log('No active sessions found.');
    return;
  }

  console.log(`\n🔍 Found ${activeSessions.length} active sessions.\n`);

  // Show the most recent active session in detail (assuming top of list is most recent)
  const primary = activeSessions[0];
  console.log(`👉 PRIMARY FOCUS: ${primary.title}`);
  console.log(`   📅 Date: ${primary.date}`);
  console.log(`   📂 Location: ${primary.location}`);
  
  const plan = getSessionPlan(primary.location);
  if (plan) {
    console.log('\n   --- PLAN SUMMARY ---');
    // Extract Objective
    const objectiveMatch = plan.match(/Objective: (.*)/);
    if (objectiveMatch) console.log(`   🎯 Objective: ${objectiveMatch[1]}\n`);
    
    // Extract "Done when" or "Todo" section
    const lines = plan.split('\n');
    let printing = false;
    let count = 0;
    let sectionFound = false;
    
    for (const line of lines) {
      const lower = line.toLowerCase();
      const isHeader = line.trim().startsWith('#');
      
      if (isHeader) {
        if (lower.includes('done when') || lower.includes('todo') || lower.includes('change set') || lower.includes('follow-ups') || lower.includes('next steps')) {
          printing = true;
          count = 0;
          sectionFound = true;
          console.log(`\n   📝 ${line.replace(/^#+\s*/, '').trim()}:`);
          continue;
        } else {
          printing = false;
        }
      }
      
      if (printing) {
        // Skip empty lines at start
        if (count === 0 && line.trim() === '') continue;
        
        console.log(`   ${line}`);
        count++;
        if (count > 6) {
          console.log('      ...');
          printing = false;
        }
      }
    }
    if (!sectionFound) {
        console.log('   (No explicit "Done when" or "Todo" section found in PLAN.md)');
    }
  } else {
    console.log('   (No PLAN.md found)');
  }
  
  if (activeSessions.length > 1) {
    console.log('\n📚 Other Active Sessions:');
    activeSessions.slice(1, 6).forEach(s => {
      console.log(`   - ${s.title} (${s.location})`);
    });
    if (activeSessions.length > 6) {
        console.log(`   ... and ${activeSessions.length - 6} more.`);
    }
  }
  console.log('');
}

if (require.main === module) {
  main();
}

module.exports = { parseHub, getSessionPlan };
