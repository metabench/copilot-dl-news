const { createSQLiteDatabase } = require('../src/db/sqlite');

const db = createSQLiteDatabase('data/news.db');

const domain = 'www.eltiempo.com';
console.log(`Checking candidates for ${domain}...`);

const query = `
  SELECT place_name, place_kind, score, candidate_url
  FROM place_hub_candidates
  WHERE domain = ?
  ORDER BY score DESC
  LIMIT 20
`;

const candidates = db.db.prepare(query).all(domain);

if (candidates.length === 0) {
    console.log('No candidates found.');
} else {
    console.log('Candidates found:');
    candidates.forEach(c => {
        const score = c.score !== null ? c.score.toFixed(2) : 'N/A';
        console.log(`${score}\t${c.place_kind}\t${c.place_name}`);
    });
}
