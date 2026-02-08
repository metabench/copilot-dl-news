'use strict';

/**
 * Check script for GeoImportDashboard
 * 
 * Renders the dashboard with sample data to a static HTML file for preview.
 * 
 * Usage:
 *   node src/ui/server/checks/geoImportDashboard.check.js
 *   # Opens checks/html-outputs/geo-import-dashboard.check.html
 */

const fs = require('fs');
const path = require('path');
const jsgui = require('jsgui3-html');
const { GeoImportDashboard } = require('../../controls/GeoImportDashboard');

// Read CSS
const cssPath = path.join(__dirname, '../../styles/geo-import-dashboard.css');
const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';

// Create context
const context = new jsgui.Page_Context();

// Create dashboard with sample running state
const dashboard = new GeoImportDashboard({
  context,
  importState: {
    phase: 'importing',
    currentSource: 'geonames',
    progress: { current: 12450, total: 24687 },
    sources: {
      geonames: {
        id: 'geonames',
        name: 'GeoNames',
        emoji: '🌍',
        status: 'running',
        description: 'cities15000.txt: ~25,000 cities with population >15K',
        stats: { 
          processed: 12450, 
          inserted: 12230, 
          skipped: 220,
          names_added: 89500
        },
        lastRun: 'In progress...'
      },
      wikidata: {
        id: 'wikidata',
        name: 'Wikidata',
        emoji: '📚',
        status: 'pending',
        description: 'SPARQL queries for metadata enrichment (runs after GeoNames)',
        stats: { 
          linked_entities: 0,
          queries_planned: 25000
        }
      },
      osm: {
        id: 'osm',
        name: 'OpenStreetMap',
        emoji: '🗺️',
        status: 'idle',
        description: 'Local PostGIS database for boundaries & spatial queries',
        stats: { 
          boundaries_ready: 5200,
          connection: 'Ready'
        }
      }
    },
    logs: [
      { time: '10:30:00', level: 'info', message: '🚀 Starting GeoNames import...' },
      { time: '10:30:01', level: 'info', message: '📂 Loading cities15000.txt (2.9 MB)' },
      { time: '10:30:02', level: 'success', message: '✅ File parsed: 24,687 records' },
      { time: '10:30:03', level: 'info', message: '💾 Beginning database insertion...' },
      { time: '10:31:15', level: 'info', message: '📊 Batch 1/25 complete: 1000 cities' },
      { time: '10:32:30', level: 'info', message: '📊 Batch 5/25 complete: 5000 cities' },
      { time: '10:33:45', level: 'warning', message: '⚠️ Skipped duplicate: Paris (already exists)' },
      { time: '10:34:00', level: 'info', message: '📊 Batch 10/25 complete: 10000 cities' },
      { time: '10:35:15', level: 'success', message: '✅ Found Chicago (pop: 2,746,388)' },
      { time: '10:35:16', level: 'success', message: '✅ Found Manchester (pop: 552,858)' },
      { time: '10:35:17', level: 'success', message: '✅ Found Birmingham (pop: 1,141,816)' },
      { time: '10:36:30', level: 'info', message: '📊 Batch 12/25 complete: 12450 cities' },
      { time: '10:36:31', level: 'info', message: '⏳ Estimated time remaining: 4 minutes' }
    ],
    totals: {
      places_before: 508,
      places_after: 12738,
      names_before: 14855,
      names_after: 104355,
      coverage_improvement: '2,407%'
    }
  }
});

// Render HTML
const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🌐 Geo Import Dashboard - Check</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    ${css}
  </style>
</head>
<body>
  ${dashboard.all_html_render()}
  
  <script>
    // Simulate live updates
    let progress = 12450;
    const total = 24687;
    const stageIds = ['idle', 'validating', 'counting', 'preparing', 'importing', 'indexing', 'verifying', 'complete'];
    let currentStageIndex = 4; // Start at 'importing'
    
    function updateStagesStepper(stageIndex) {
      const stages = document.querySelectorAll('.stage-item');
      stages.forEach((stageEl, index) => {
        stageEl.classList.remove('stage-completed', 'stage-current', 'stage-pending');
        
        const connector = stageEl.querySelector('.stage-connector');
        if (connector) {
          connector.classList.remove('connector-completed');
        }
        
        if (index < stageIndex) {
          stageEl.classList.add('stage-completed');
          if (connector) connector.classList.add('connector-completed');
        } else if (index === stageIndex) {
          stageEl.classList.add('stage-current');
        } else {
          stageEl.classList.add('stage-pending');
        }
      });
    }
    
    function simulateProgress() {
      if (progress >= total) {
        // Move to 'complete' stage
        currentStageIndex = 7;
        updateStagesStepper(currentStageIndex);
        document.querySelector('.progress-phase').textContent = '🎉 Import complete!';
        document.querySelector('.progress-ring-circle').style.stroke = '#4CAF50';
        return;
      }
      
      progress += Math.floor(Math.random() * 200) + 50;
      if (progress > total) progress = total;
      
      const percent = Math.round((progress / total) * 100);
      
      // Simulate stage transitions at certain progress points
      if (percent >= 60 && currentStageIndex === 4) {
        currentStageIndex = 5; // indexing
        updateStagesStepper(currentStageIndex);
      } else if (percent >= 85 && currentStageIndex === 5) {
        currentStageIndex = 6; // verifying
        updateStagesStepper(currentStageIndex);
      }
      
      // Update progress text
      const ringText = document.querySelector('.progress-ring-text');
      if (ringText) ringText.textContent = percent + '%';
      
      // Update progress ring
      const circle = document.querySelector('.progress-ring-circle');
      if (circle) {
        const radius = 56; // (140 - 10*2) / 2
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (percent / 100) * circumference;
        circle.style.strokeDashoffset = offset;
      }
      
      // Update stats
      const statValue = document.querySelector('.progress-stat .stat-value');
      if (statValue) statValue.textContent = progress.toLocaleString();
      
      // Add log entry
      const logBody = document.querySelector('.log-body');
      if (logBody && Math.random() > 0.7) {
        const stage = stageIds[currentStageIndex];
        const entry = document.createElement('div');
        entry.className = 'log-entry log-info';
        entry.innerHTML = \`
          <span class="log-timestamp">\${new Date().toLocaleTimeString()}</span>
          <span class="log-message">📊 [\${stage}] Progress: \${progress.toLocaleString()} / \${total.toLocaleString()} (\${percent}%)</span>
        \`;
        logBody.appendChild(entry);
        logBody.scrollTop = logBody.scrollHeight;
      }
      
      setTimeout(simulateProgress, 500 + Math.random() * 500);
    }
    
    // Start simulation after 2 seconds
    setTimeout(simulateProgress, 2000);
    
    // Button handlers
    document.querySelector('[data-action="start-import"]').addEventListener('click', function() {
      this.disabled = true;
      this.textContent = '🔄 Running...';
      document.querySelector('[data-action="pause-import"]').disabled = false;
      document.querySelector('[data-action="cancel-import"]').disabled = false;
    });
    
    console.log('🌐 Geo Import Dashboard check loaded');
    console.log('📊 Simulating live import progress...');
  </script>
</body>
</html>`;

// Write output
const outputDir = path.join(process.cwd(), 'checks', 'html-outputs');
fs.mkdirSync(outputDir, { recursive: true });
const outPath = path.join(outputDir, 'geo-import-dashboard.check.html');
fs.writeFileSync(outPath, html, 'utf8');

console.log('✅ Generated:', outPath);
console.log('📊 Dashboard shows:');
console.log('   - GeoNames import in progress (50.4%)');
console.log('   - Live log with import events');
console.log('   - Coverage comparison (before/after)');
console.log('   - Animated progress ring');
console.log('');
console.log('🌐 Open in browser to see live simulation!');
