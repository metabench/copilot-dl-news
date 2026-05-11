'use strict';

const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../src/db/openNewsCrawlerDb');

const {
  listPlaceHubCandidateDebugRows
} = resolveNewsCrawlerDbModule();

async function main(domain = 'www.eltiempo.com') {
  const db = openNewsCrawlerDb('data/news.db', { readonly: true, fileMustExist: true });
  try {
    console.log(`Checking candidates for ${domain}...`);
    const candidates = listPlaceHubCandidateDebugRows(db, domain, { limit: 20 });

    if (candidates.length === 0) {
      console.log('No candidates found.');
    } else {
      console.log('Candidates found:');
      candidates.forEach(candidate => {
        const score = candidate.score !== null ? candidate.score.toFixed(2) : 'N/A';
        console.log(`${score}\t${candidate.place_kind}\t${candidate.place_name}`);
      });
    }
  } finally {
    await db.close();
  }
}

if (require.main === module) {
  main(process.argv[2] || 'www.eltiempo.com').catch(error => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
}

module.exports = { main };
