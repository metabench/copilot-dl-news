/**
 * ArgumentNormalizer - CLI argument parsing and normalization for guess-place-hubs
 *
 * Handles parsing CLI arguments, validating inputs, and constructing
 * normalized options for the place hub guessing workflow.
 */

const { CliArgumentParser } = require('../../utils/CliArgumentParser');
const { BatchLoader } = require('./BatchLoader');

class ArgumentNormalizer {
  /**
   * Parse and normalize CLI arguments
   * @param {string[]} argv - Raw command line arguments
   * @returns {Object} Normalized options
   */
  static parseCliArgs(argv) {
    const rawArgv = Array.isArray(argv) ? [...argv] : process.argv.slice(2);
    const parser = new CliArgumentParser('guess-place-hubs', 'Predict candidate place hubs and verify them');

    parser.add('--domain <domain>', 'Domain or host to inspect (repeatable; positional args supported)', [], (value, previous) => {
      const acc = Array.isArray(previous) ? previous.slice() : [];
      acc.push(value);
      return acc;
    });
    parser.add('--domains <csv>', 'Comma-separated list of domains to inspect (batch mode)', null);
    parser.add('--import <file>', 'CSV file of domains (columns: domain,kinds,limit)', null);
    parser.add('--db <path>', 'Path to SQLite database (defaults to data/news.db)', null);
    parser.add('--db-path <path>', 'Alias for --db', null);
    parser.add('--kinds <csv>', 'Place kinds to consider (country, region, city)', 'country');
    parser.add('--limit <n>', 'Limit number of places to evaluate', null, 'number');
    parser.add('--patterns-per-place <n>', 'Maximum URL patterns to test per place (default 3)', 3, 'number');
    parser.add('--max-age-days <n>', 'Skip re-fetch when success newer than N days (default 7)', 7, 'number');
    parser.add('--refresh-404-days <n>', 'Skip re-fetching known 404s newer than N days (default 180)', 180, 'number');
    parser.add('--retry-4xx-days <n>', 'Skip retrying other 4xx statuses newer than N days (default 7)', 7, 'number');
    parser.add('--apply', 'Persist confirmed hubs to place_hubs table', false, 'boolean');
    parser.add('--dry-run', 'Do not persist hubs (default behaviour)', false, 'boolean');
    parser.add('--verbose', 'Enable verbose logging', false, 'boolean');
    parser.add('--http', 'Use http scheme instead of https', false, 'boolean');
    parser.add('--scheme <scheme>', 'Override URL scheme (http or https)', 'https');
    parser.add('--readiness-timeout <seconds>', 'Maximum seconds allotted to readiness probes (0 = unlimited, default 10)', 10, 'number');
    parser.add('--json', 'Emit JSON summary output', false, 'boolean');
    parser.add('--emit-report [path]', 'Write detailed JSON report to disk (optional path or directory)', null);
    parser.add('--report-dir <path>', 'Directory used when --emit-report omits a filename', null);
    parser.add('--hierarchical', 'Enable hierarchical place-place hub discovery (parent/child relationships)', false, 'boolean');

    const parsedArgs = parser.parse(rawArgv);

    const schemeInput = parsedArgs.http ? 'http' : (parsedArgs.scheme ? String(parsedArgs.scheme).toLowerCase() : 'https');
    const scheme = ['http', 'https'].includes(schemeInput) ? schemeInput : 'https';

    const kindsInput = parsedArgs.kinds != null ? parsedArgs.kinds : 'country';
    const kinds = BatchLoader.parseCsv(kindsInput);
    if (!kinds.length) kinds.push('country');
    const uniqueKinds = Array.from(new Set(kinds.map((kind) => kind.toLowerCase())));

    const limit = Number.isFinite(parsedArgs.limit) ? parsedArgs.limit : null;
    const patternsPerPlace = Number.isFinite(parsedArgs.patternsPerPlace)
      ? Math.max(1, parsedArgs.patternsPerPlace)
      : 3;
    const maxAgeDays = Number.isFinite(parsedArgs.maxAgeDays)
      ? Math.max(0, parsedArgs.maxAgeDays)
      : 7;
    const refresh404Days = Number.isFinite(parsedArgs.refresh404Days)
      ? Math.max(0, parsedArgs.refresh404Days)
      : 180;
    const retry4xxDays = Number.isFinite(parsedArgs.retry4xxDays)
      ? Math.max(0, parsedArgs.retry4xxDays)
      : 7;
    const readinessTimeoutSeconds = Number.isFinite(parsedArgs.readinessTimeout)
      ? Math.max(0, parsedArgs.readinessTimeout)
      : 10;
    const readinessTimeoutMs = readinessTimeoutSeconds > 0 ? readinessTimeoutSeconds * 1000 : null;

    let apply = parsedArgs.apply === true;
    if (parsedArgs.dryRun === true) {
      apply = false;
    }

    const emitReportRaw = parsedArgs.emitReport;
    const reportDirRaw = parsedArgs.reportDir;
    const reportResolution = BatchLoader.resolveReportOutput({
      requested: emitReportRaw !== undefined && emitReportRaw !== null,
      explicitPath: typeof emitReportRaw === 'string' ? emitReportRaw : null,
      reportDir: reportDirRaw || null
    });

    const dbPath = parsedArgs.dbPath || parsedArgs.db || null;

    const positionalDomains = Array.isArray(parsedArgs.positional) ? parsedArgs.positional : [];
    const domainFlags = Array.isArray(parsedArgs.domain) ? parsedArgs.domain : (parsedArgs.domain ? [parsedArgs.domain] : []);

    const csvDomainArgs = BatchLoader.collectFlagValues(rawArgv, '--domains');
    if (parsedArgs.domains && !csvDomainArgs.includes(parsedArgs.domains)) {
      csvDomainArgs.push(parsedArgs.domains);
    }
    const csvDomainList = csvDomainArgs.flatMap((value) => BatchLoader.parseCsv(value));

    const importFlagValues = BatchLoader.collectFlagValues(rawArgv, '--import');
    if (parsedArgs.import && !importFlagValues.includes(parsedArgs.import)) {
      importFlagValues.push(parsedArgs.import);
    }
    const importedDomains = [];
    for (const importCandidate of importFlagValues) {
      if (!importCandidate) continue;
      const entries = BatchLoader.parseDomainImportFile(importCandidate);
      if (entries.length) {
        importedDomains.push(...entries);
      }
    }

    const envDomain = process.env.GPH_DOMAIN || null;

    const domainBatch = BatchLoader.buildDomainBatchInputs({
      repeatedDomains: domainFlags,
      positionalDomains,
      csvDomains: csvDomainList,
      importedDomains,
      envDomain,
      defaultKinds: uniqueKinds,
      defaultLimit: limit,
      scheme
    });

    const primaryDomain = domainBatch.length ? domainBatch[0].domain : null;

    return {
      domain: primaryDomain,
      domains: domainBatch,
      domainBatch,
      domainInputs: {
        repeated: domainFlags,
        positional: positionalDomains,
        csv: csvDomainList,
        imported: importedDomains,
        env: envDomain ? [envDomain] : []
      },
      importPaths: importFlagValues,
      dbPath,
      kinds: uniqueKinds,
      limit,
      patternsPerPlace,
      apply,
      maxAgeDays,
      refresh404Days,
      retry4xxDays,
      verbose: Boolean(parsedArgs.verbose),
      scheme,
      readinessTimeoutSeconds,
      readinessTimeoutMs,
      json: Boolean(parsedArgs.json),
      dryRun: !apply,
      emitReport: reportResolution.requested,
      reportPath: reportResolution.path,
      reportDirectory: reportResolution.directory,
      hierarchical: Boolean(parsedArgs.hierarchical)
    };
  }
}

// Constants used by argument parsing
ArgumentNormalizer.DSPL_KIND_PROPERTY_MAP = Object.freeze({
  country: 'countryHubPatterns',
  region: 'regionHubPatterns',
  city: 'cityHubPatterns'
});

ArgumentNormalizer.SUMMARY_NUMERIC_FIELDS = [
  'totalPlaces',
  'totalUrls',
  'fetched',
  'cached',
  'skipped',
  'skippedDuplicatePlace',
  'skippedRecent4xx',
  'stored404',
  'insertedHubs',
  'updatedHubs',
  'errors',
  'rateLimited',
  'readinessTimedOut',
  'validationSucceeded',
  'validationFailed'
];

module.exports = { ArgumentNormalizer };