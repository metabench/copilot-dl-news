const db = require('better-sqlite3')('data/news.db');
const fs = require('fs');

const hosts = ['theguardian.com', 'independent.co.uk', 'aljazeera.com', 'reuters.com'];
const totalCountries = db.prepare(`SELECT count(*) as cnt FROM places WHERE kind = 'country'`).get().cnt;

let output = `Total Countries: ${totalCountries}\n\n`;

for (const host of hosts) {
    const row = db.prepare(`
        SELECT count(DISTINCT ppm.place_id) as cnt
        FROM place_page_mappings ppm
        JOIN places p ON p.id = ppm.place_id
        WHERE ppm.host = ?
          AND p.kind = 'country'
    `).get(host);
    
    const pct = (row.cnt / totalCountries * 100).toFixed(1);
    output += `Host: ${host}\n`;
    output += `Coverage: ${row.cnt} / ${totalCountries} (${pct}%)\n\n`;
}

fs.writeFileSync('tmp/final_coverage.txt', output);
console.log('Written to tmp/final_coverage.txt');
