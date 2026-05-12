const fs = require('fs');

const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');

const DEFAULT_HOSTS = ['theguardian.com', 'independent.co.uk', 'aljazeera.com', 'reuters.com'];

function formatCoverageReport(report) {
  let output = `Total Countries: ${report.totalCountries}\n\n`;

  for (const row of report.hosts) {
    output += `Host: ${row.host}\n`;
    output += `Coverage: ${row.mappedCountries} / ${row.totalCountries} (${row.coveragePct.toFixed(1)}%)\n\n`;
  }

  return output;
}

function runCoverageReport(options = {}) {
  const dbPath = options.dbPath || 'data/news.db';
  const outputPath = options.outputPath || 'tmp/final_coverage.txt';
  const hosts = options.hosts || DEFAULT_HOSTS;
  const db = openNewsCrawlerDb(dbPath);

  try {
    if (!db.placeHubDiagnostics || typeof db.placeHubDiagnostics.getCountryMappingCoverageByHosts !== 'function') {
      throw new Error('news-crawler-db does not expose placeHubDiagnostics.getCountryMappingCoverageByHosts');
    }

    const report = db.placeHubDiagnostics.getCountryMappingCoverageByHosts(hosts);
    const output = formatCoverageReport(report);
    fs.writeFileSync(outputPath, output);
    return { outputPath, report };
  } finally {
    if (db && typeof db.close === 'function') {
      db.close();
    }
  }
}

if (require.main === module) {
  const result = runCoverageReport();
  console.log(`Written to ${result.outputPath}`);
}

module.exports = {
  DEFAULT_HOSTS,
  formatCoverageReport,
  runCoverageReport
};
