const https = require('https');
const { JSDOM } = require('jsdom');

const TARGET_URL = 'https://www.theguardian.com/world/all';

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    }, (res) => {
      console.log('Status:', res.statusCode);
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        console.log('Redirect to:', res.headers.location);
        fetchPage(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Status ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

const fs = require('fs');

async function main() {
  const log = [];
  function logMsg(...args) {
    console.log(...args);
    log.push(args.join(' '));
  }
  
  logMsg("--- EXPLORER START ---");
  logMsg(`Fetching ${TARGET_URL}...`);
  try {
    const html = await fetchPage(TARGET_URL);
    logMsg('Status: 200 OK');
    
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    
    // Find all links
    const links = Array.from(doc.querySelectorAll('a[href]'));
    logMsg(`Found ${links.length} links.`);
    
    // Filter for /world/ links
    const worldLinks = links
      .map(a => a.href)
      .filter(href => href.includes('/world/'))
      .map(href => {
        try {
          if (href.startsWith('/')) return href;
          const u = new URL(href);
          return u.pathname;
        } catch {
          return href;
        }
      });
      
    const unique = [...new Set(worldLinks)].sort();
    
    logMsg(`Found ${unique.length} unique /world/ links.`);
    
    const hubs = unique.filter(l => l.split('/').filter(Boolean).length === 2);
    logMsg(`\nPotential Hubs (Depth 2): ${hubs.length}`);
    hubs.slice(0, 50).forEach(h => logMsg('  ' + h));
    
    fs.writeFileSync('tmp/guardian_indices.json', JSON.stringify({ log, hubs, unique }, null, 2));
    
  } catch (err) {
    console.error('Error:', err.message);
    fs.writeFileSync('tmp/guardian_indices_error.txt', err.message);
  }
}

main();
