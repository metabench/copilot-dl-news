const fs = require('fs');
const path = require('path');

const DISCOVERY_DIR = path.join(process.cwd(), 'tmp/discovery');
const SOURCES_FILE = path.join(process.cwd(), 'data/bootstrap/news-sources.json');

function analyzeResults() {
  if (!fs.existsSync(DISCOVERY_DIR)) {
    console.log('Discovery directory not found.');
    return;
  }

  const files = fs.readdirSync(DISCOVERY_DIR).filter(f => f.endsWith('.json') && f !== '_summary.json');
  const sources = JSON.parse(fs.readFileSync(SOURCES_FILE, 'utf8')).sources;
  
  const results = {};
  const missing = [];
  
  // Map files to domains
  files.forEach(file => {
    try {
      const content = JSON.parse(fs.readFileSync(path.join(DISCOVERY_DIR, file), 'utf8'));
      const domain = new URL(content.seed).hostname;
      results[domain] = content;
    } catch (e) {
      console.error(`Error reading ${file}:`, e.message);
    }
  });

  console.log('--- Discovery Status ---');
  console.log(`Sources: ${sources.length}`);
  console.log(`Results: ${files.length}`);
  console.log('------------------------');

  sources.forEach(source => {
    try {
      const url = new URL(source.url);
      const host = url.hostname;
      const result = results[host]; // Simple check, might need better mapping if host is www. vs not

      // Try finding by file name matching too
      const fileMatch = files.find(f => f.includes(host));
      const content = fileMatch ? JSON.parse(fs.readFileSync(path.join(DISCOVERY_DIR, fileMatch), 'utf8')) : null;

      if (content) {
        const africa = content.hubs.some(h => h.text.includes('Africa') || h.path.includes('africa'));
        const asia = content.hubs.some(h => h.text.includes('Asia') || h.path.includes('asia'));
        console.log(`[OK] ${source.label} (${host}): ${content.hubs.length} hubs. (Africa: ${africa}, Asia: ${asia})`);
      } else {
        console.log(`[MISSING] ${source.label} (${host})`);
        missing.push(host);
      }
    } catch (e) {
      console.log(`[ERROR] ${source.label}: ${e.message}`);
    }
  });

  return missing;
}

analyzeResults();
