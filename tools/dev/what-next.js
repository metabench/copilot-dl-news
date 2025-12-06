#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const HUB_PATH = path.join(__dirname, '../../docs/sessions/SESSIONS_HUB.md');

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {
    json: false,
    session: null,
    sections: null,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') {
      flags.json = true;
    } else if (arg === '--help' || arg === '-h') {
      flags.help = true;
    } else if (arg === '--session') {
      flags.session = args[i + 1];
      i++;
    } else if (arg === '--sections') {
      flags.sections = args[i + 1];
      i++;
    }
  }
  return flags;
}

function parseHub() {
  if (!fs.existsSync(HUB_PATH)) {
    console.error('SESSIONS_HUB.md not found at', HUB_PATH);
    process.exit(2);
  }
  const content = fs.readFileSync(HUB_PATH, 'utf8');
  
  // Regex to capture session blocks
  // We look for the header, then capture until the next header or end of file
  // Inside the block we look for Status and Location
  
  const sessions = [];
  const lines = content.split('\n');
  let currentSession = null;
  let collectingFocus = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headerMatch = line.match(/^### Session ([\d-]+): (.*)/);
    
    if (headerMatch) {
      if (currentSession) {
        currentSession.slugStem = slugStemFromLocation(currentSession.location);
        sessions.push(currentSession);
      }
      currentSession = {
        date: headerMatch[1],
        title: headerMatch[2],
        status: 'Unknown',
        location: '',
        type: '',
        focus: [],
        quickLinks: []
      };
      collectingFocus = false;
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

      const typeMatch = line.match(/\*\*Type\*\*: (.*)/);
      if (typeMatch) currentSession.type = typeMatch[1].trim();

      if (line.startsWith('**Focus**')) {
        collectingFocus = true;
        currentSession.focus = [];
        continue;
      }
      if (collectingFocus) {
        const trimmed = line.trim();
        if (trimmed.startsWith('**') || trimmed.startsWith('###') || trimmed === '') {
          collectingFocus = false;
        } else if (trimmed.startsWith('-')) {
          currentSession.focus.push(trimmed.replace(/^-\s*/, ''));
        }
      }

      const quickLinkMatch = line.match(/-\s+[^[]*\[([^\]]+)\]\(([^)]+)\)/);
      if (quickLinkMatch) {
        currentSession.quickLinks.push({ label: quickLinkMatch[1], href: quickLinkMatch[2] });
      }
    }
  }
  if (currentSession) {
    currentSession.slugStem = slugStemFromLocation(currentSession.location);
    sessions.push(currentSession);
  }
  
  return sessions;
}

function slugStemFromLocation(location) {
  if (!location) return '';
  const trimmed = location.replace(/\/$/, '');
  const parts = trimmed.split('/');
  const last = parts[parts.length - 1] || '';
  return last.replace(/^\d{4}-\d{2}-\d{2}-/, '');
}

function getSessionPlan(location) {
  // Location is relative to repo root, e.g. docs/sessions/slug/
  const planPath = path.join(__dirname, '../../', location, 'PLAN.md');
  if (!fs.existsSync(planPath)) return null;
  return fs.readFileSync(planPath, 'utf8');
}

function canonicalSection(name) {
  const n = name.toLowerCase();
  if (n.includes('done')) return 'done';
  if (n.includes('todo')) return 'done';
  if (n.includes('change')) return 'change';
  if (n.includes('risk')) return 'risks';
  if (n.includes('test') || n.includes('validation')) return 'tests';
  if (n.includes('follow')) return 'followups';
  if (n.includes('next')) return 'followups';
  return null;
}

function parsePlan(planContent) {
  if (!planContent) return { objective: '', sections: {} };
  const lines = planContent.split('\n');
  const sections = {};
  let currentKey = null;
  let buffer = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headerMatch = line.trim().match(/^#+\s*(.+)$/);
    if (headerMatch) {
      if (currentKey) {
        sections[currentKey] = buffer.slice();
      }
      const key = canonicalSection(headerMatch[1]) || null;
      currentKey = key;
      buffer = [];
      continue;
    }
    if (currentKey) {
      const cleaned = line.replace(/\r$/, '');
      buffer.push(cleaned);
    }
  }
  if (currentKey) sections[currentKey] = buffer;

  for (const key of Object.keys(sections)) {
    sections[key] = sections[key].filter(line => line.trim() !== '');
  }

  const objectiveMatch = planContent.match(/Objective\s*:?\s*(.*)/i);
  const objective = objectiveMatch ? objectiveMatch[1].trim() : '';

  return { objective, sections };
}

function findFirstOpen(items) {
  if (!items || !items.length) return null;
  const checkbox = items.find(line => line.trim().startsWith('- [ ]'));
  if (checkbox) return checkbox;
  const bullet = items.find(line => line.trim().startsWith('-'));
  return bullet || null;
}

function buildTimeline(allSessions, primary, plan) {
  const stem = primary.slugStem || slugStemFromLocation(primary.location);
  const related = allSessions.filter(s => (s.slugStem || slugStemFromLocation(s.location)) === stem);
  const pastSessions = related
    .filter(s => s.location !== primary.location && s.date < primary.date)
    .sort((a, b) => b.date.localeCompare(a.date));
  const futureSessions = related
    .filter(s => s.location !== primary.location && s.date >= primary.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  const nextTask = findFirstOpen(plan.sections?.done) || findFirstOpen(plan.sections?.change);
  const nextTest = findFirstOpen(plan.sections?.tests);
  const followups = plan.sections?.followups || [];

  return {
    stem,
    pastSessions,
    futureSessions,
    nextTask,
    nextTest,
    followups
  };
}

function selectSession(activeSessions, selector) {
  if (!selector) return activeSessions[0] || null;
  // numeric index (1-based)
  const idx = parseInt(selector, 10);
  if (!Number.isNaN(idx) && idx >= 1 && idx <= activeSessions.length) {
    return activeSessions[idx - 1];
  }
  // slug/title/location match
  return activeSessions.find(s =>
    s.location.includes(selector) ||
    s.title.toLowerCase().includes(selector.toLowerCase())
  ) || activeSessions[0] || null;
}

function sectionFilter(flags) {
  if (!flags.sections) return ['objective', 'done', 'change', 'risks', 'tests', 'followups'];
  return flags.sections.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

function printHuman(output, flags) {
  const { activeSessions, primary, plan, timeline } = output;
  console.log(`\n🔍 Found ${activeSessions.length} active sessions.\n`);
  console.log(`👉 PRIMARY FOCUS: ${primary.title}`);
  if (primary.type) console.log(`   🏷️ Type: ${primary.type}`);
  console.log(`   📅 Date: ${primary.date}`);
  console.log(`   📂 Location: ${primary.location}`);
  if (primary.focus && primary.focus.length) {
    console.log('   🎯 Focus:');
    primary.focus.forEach(f => console.log(`     - ${f}`));
  }

  const sectionsToShow = sectionFilter(flags);
  console.log('\n   --- PLAN SUMMARY ---');
  if (sectionsToShow.includes('objective') && plan.objective) {
    console.log(`   🎯 Objective: ${plan.objective}`);
  }

  const nameMap = {
    done: 'Done When / Todo',
    change: 'Change Set',
    risks: 'Risks',
    tests: 'Tests / Validation',
    followups: 'Follow-ups / Next Steps'
  };

  for (const key of ['done', 'change', 'risks', 'tests', 'followups']) {
    if (!sectionsToShow.includes(key)) continue;
    const block = plan.sections[key];
    if (block && block.length) {
      console.log(`\n   📝 ${nameMap[key] || key}:`);
      const trimmed = block.slice(0, 7);
      trimmed.forEach(line => console.log(`   ${line}`));
      if (block.length > trimmed.length) console.log('      ...');
    }
  }

  console.log('\n   --- PAST / PRESENT / FUTURE ---');
  if (timeline && timeline.pastSessions && timeline.pastSessions.length) {
    console.log('   ⏮️ Past (related sessions):');
    timeline.pastSessions.slice(0, 3).forEach(s => {
      console.log(`     - ${s.date} ${s.title} [${s.status}] (${s.location})`);
    });
    if (timeline.pastSessions.length > 3) {
      console.log(`     ... ${timeline.pastSessions.length - 3} more`);
    }
  } else {
    console.log('   ⏮️ Past: No related sessions found for this slug.');
  }

  console.log('   ⏺️ Present:');
  if (plan.objective) console.log(`     • Objective: ${plan.objective}`);
  if (timeline?.nextTask) console.log(`     • Next task: ${timeline.nextTask}`);
  if (timeline?.nextTest) console.log(`     • Next test: ${timeline.nextTest}`);

  console.log('   ⏭️ Future:');
  if (timeline?.followups && timeline.followups.length) {
    timeline.followups.slice(0, 3).forEach(line => console.log(`     • ${line}`));
    if (timeline.followups.length > 3) console.log(`     ... ${timeline.followups.length - 3} more`);
  } else {
    console.log('     • No follow-ups listed.');
  }
  if (timeline?.futureSessions && timeline.futureSessions.length) {
    console.log('     • Upcoming related sessions:');
    timeline.futureSessions.slice(0, 2).forEach(s => console.log(`       - ${s.date} ${s.title} (${s.status})`));
    if (timeline.futureSessions.length > 2) {
      console.log(`       ... ${timeline.futureSessions.length - 2} more`);
    }
  }

  if (activeSessions.length > 1) {
    console.log('\n📚 Other Active Sessions:');
    activeSessions
      .filter(s => s !== primary)
      .slice(0, 6)
      .forEach(s => console.log(`   - ${s.title} (${s.location})`));
    if (activeSessions.length - 1 > 6) {
      console.log(`   ... and ${activeSessions.length - 7} more.`);
    }
  }
  console.log('');
}

function main() {
  const flags = parseArgs(process.argv);

  if (flags.help) {
    console.log('Usage: node tools/dev/what-next.js [--json] [--session <slug|index>] [--sections a,b,c]');
    process.exit(0);
  }

  const allSessions = parseHub();
  const activeSessions = allSessions.filter(s => 
    s.status.includes('In progress') || 
    s.status.includes('Active') ||
    s.status.includes('🔄')
  );
  
  if (activeSessions.length === 0 && !flags.session) {
    if (flags.json) {
      console.log(JSON.stringify({ activeSessions: [], message: 'No active sessions found.' }, null, 2));
    } else {
      console.log('No active sessions found.');
    }
    process.exit(1);
  }

  let primary = selectSession(activeSessions, flags.session);
  if (!primary && flags.session) {
    primary = selectSession(allSessions, flags.session);
  }
  if (!primary) primary = activeSessions[0];
  if (!primary) {
    console.error('No matching session found.');
    process.exit(1);
  }

  const planContent = getSessionPlan(primary.location);
  const plan = parsePlan(planContent);
  const timeline = buildTimeline(allSessions, primary, plan);

  const output = { activeSessions, primary, plan, timeline };

  if (flags.json) {
    console.log(JSON.stringify({
      activeSessions,
      primary,
      plan,
      timeline,
      sections: sectionFilter(flags)
    }, null, 2));
    process.exit(0);
  }

  printHuman(output, flags);
}

if (require.main === module) {
  main();
}

module.exports = { parseHub, getSessionPlan, parsePlan };
