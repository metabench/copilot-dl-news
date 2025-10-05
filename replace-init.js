const fs = require('fs');

// Read file
let content = fs.readFileSync('src/ui/public/index.js', 'utf8');
const lines = content.split('\n');

// Find the first initialization IIFE (logs height restore)
const start = lines.findIndex((l, i) => i > 450 && l.includes('// Restore saved logs height'));
console.log('Start marker at line:', start);

// Find the end of loadHealth IIFE (last initialization block)
let end = -1;
for (let i = 1040; i < lines.length; i++) {
  if (lines[i].includes('badgeWal.textContent')) {
    // Found end of loadHealth - look for closing })();
    for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
      if (lines[j].trim() === '})();') {
        end = j;
        break;
      }
    }
    break;
  }
}
console.log('End marker at line:', end);

if (start >= 0 && end >= 0) {
  const newInit = [
    '  // ========================================',
    '  // Initialization',
    '  // ========================================',
    '  const initialization = createInitialization({',
    '    elements: {',
    '      logs, logsResizer, logsFontMinus, logsFontPlus, logsFontVal,',
    '      secErrors, secDomains, secLogs, themeBtn,',
    '      badgeDb, badgeDisk, badgeCpu, badgeMem, badgeWal',
    '    },',
    '    openEventStream',
    '  });',
    '',
    '  // Run all initialization',
    '  const { themeController, scheduleLogFlush } = await initialization.initialize();',
    '  const scheduleFlush = scheduleLogFlush;'
  ];
  
  const removedLines = end - start + 2;  // +2 to include start comment and end })();
  lines.splice(start - 1, removedLines, ...newInit);
  
  fs.writeFileSync('src/ui/public/index.js', lines.join('\n'));
  console.log('Replaced', removedLines, 'lines with', newInit.length, 'lines');
  console.log('Net reduction:', removedLines - newInit.length, 'lines');
} else {
  console.log('Markers not found! Start:', start, 'End:', end);
}
