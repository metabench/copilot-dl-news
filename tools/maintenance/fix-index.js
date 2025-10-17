const fs = require('fs');

// Read current truncated file
const current = fs.readFileSync('src/ui/public/index.js', 'utf8');
const currentLines = current.split('\n');

// Read original from git
const { execSync } = require('child_process');
const original = execSync('git show HEAD:src/ui/public/index.js', { encoding: 'utf8' });
const originalLines = original.split('\n');

// Find where the initialization block should end
// We want to keep everything after "})();" at the end of loadHealth IIFE (line ~1064 in original)
// And add our new initialization code in place of the old initialization IIFEs

// Find the loadDomains function start in original (line ~676)
let loadDomainsStart = -1;
for (let i = 670; i < 690; i++) {
  if (originalLines[i] && originalLines[i].includes('async function loadDomains')) {
    loadDomainsStart = i;
    break;
  }
}

console.log('Found loadDomains at line:', loadDomainsStart);

// Get everything from loadDomains to end of file from original
const missingCode = originalLines.slice(loadDomainsStart).join('\n');

// Find where current file ends
const lastLine = currentLines[currentLines.length - 1];
console.log('Current file last line:', lastLine.trim());

// Remove the incomplete line and add closing brace + missing code
const fixedLines = currentLines.slice(0, -1); // Remove "const scheduleFlush = scheduleLogFlush;"

// Add proper closure for the advanced capabilities block
fixedLines.push('  }');
fixedLines.push('');

// Add the missing functions and SSE handlers
fixedLines.push('  // ========================================');
fixedLines.push('  // Analysis Link Rendering');
fixedLines.push('  // ========================================');
fixedLines.push('  function renderAnalysisLink(url, runId) {');
fixedLines.push('    if (analysisLink) {');
fixedLines.push('      analysisLink.textContent = \'\';');
fixedLines.push('      analysisLink.classList.remove(\'muted\');');
fixedLines.push('      if (url) {');
fixedLines.push('        const label = document.createElement(\'span\');');
fixedLines.push('        label.textContent = \'View analysis: \';');
fixedLines.push('        analysisLink.appendChild(label);');
fixedLines.push('        const link = document.createElement(\'a\');');
fixedLines.push('        link.href = url;');
fixedLines.push('        link.textContent = runId ? runId : url;');
fixedLines.push('        link.target = \'_blank\';');
fixedLines.push('        link.rel = \'noopener\';');
fixedLines.push('        analysisLink.appendChild(link);');
fixedLines.push('      } else {');
fixedLines.push('        analysisLink.textContent = \'No analysis runs yet.\';');
fixedLines.push('        analysisLink.classList.add(\'muted\');');
fixedLines.push('      }');
fixedLines.push('    }');
fixedLines.push('    if (pipelineAnalysisLink) {');
fixedLines.push('      pipelineAnalysisLink.textContent = \'\';');
fixedLines.push('      pipelineAnalysisLink.classList.remove(\'muted\');');
fixedLines.push('      if (url) {');
fixedLines.push('        const anchor = document.createElement(\'a\');');
fixedLines.push('        anchor.href = url;');
fixedLines.push('        anchor.target = \'_blank\';');
fixedLines.push('        anchor.rel = \'noopener\';');
fixedLines.push('        anchor.textContent = runId || \'View\';');
fixedLines.push('        pipelineAnalysisLink.appendChild(anchor);');
fixedLines.push('      } else {');
fixedLines.push('        pipelineAnalysisLink.textContent = \'—\';');
fixedLines.push('        pipelineAnalysisLink.classList.add(\'muted\');');
fixedLines.push('      }');
fixedLines.push('    }');
fixedLines.push('  }');
fixedLines.push('');

// Add the rest of the missing code from loadDomains onwards
fixedLines.push(missingCode);

fs.writeFileSync('src/ui/public/index.js', fixedLines.join('\n'));
console.log('Fixed! New line count:', fixedLines.length);
