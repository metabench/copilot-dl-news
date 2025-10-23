#!/usr/bin/env node

/**
 * CLI Tool: Query Country Hub Gap Analysis
 * 
 * Uses the standalone CountryHubGapAnalyzer to query gazetteer data and
 * generate country hub URL predictions without requiring a crawler.
 * 
 * Usage:
 *   node tools/gazetteer/query-country-hub-gaps.js --all                    # Show all countries
 *   node tools/gazetteer/query-country-hub-gaps.js --top 20                 # Show top 20 countries by importance
 *   node tools/gazetteer/query-country-hub-gaps.js --country France         # Show specific country
 *   node tools/gazetteer/query-country-hub-gaps.js --domain bbc.co.uk       # Predict URLs for domain
 *   node tools/gazetteer/query-country-hub-gaps.js --analyze bbc.co.uk      # Analyze gap coverage
 * 
 * Examples:
 *   node tools/gazetteer/query-country-hub-gaps.js --top 10
 *   node tools/gazetteer/query-country-hub-gaps.js --domain nytimes.com --country "United States"
 *   node tools/gazetteer/query-country-hub-gaps.js --analyze theguardian.com
 */

const { ensureDatabase } = require('../../src/db/sqlite');
const { createCountryHubGapReporter } = require('../../src/services/CountryHubGapReporter');
const { CountryHubMatcher } = require('../../src/services/CountryHubMatcher');
const path = require('path');

// Parse command line arguments
function parseArgs() {
  const args = {
    all: false,
    top: null,
    country: null,
    domain: null,
    analyze: null,
    autoMatch: true,
    populations: false
  };
  
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    
    if (arg === '--all') {
      args.all = true;
    } else if (arg === '--top') {
      args.top = parseInt(process.argv[++i], 10);
    } else if (arg === '--country') {
      args.country = process.argv[++i];
    } else if (arg === '--domain') {
      args.domain = process.argv[++i];
    } else if (arg === '--analyze') {
      args.analyze = process.argv[++i];
    } else if (arg === '--match') {
      args.autoMatch = true;
    } else if (arg === '--no-match') {
      args.autoMatch = false;
    } else if (arg === '--populations') {
      args.populations = true;
    } else if (arg === '--help' || arg === '-h') {
      showHelp();
      process.exit(0);
    }
  }
  
  return args;
}

function showHelp() {
  console.log(`
Country Hub Gap Analysis Tool

Usage:
  node tools/gazetteer/query-country-hub-gaps.js [options]

Options:
  --all                    Show all countries from gazetteer
  --top N                  Show top N countries by importance
  --country NAME           Show details for specific country
  --domain DOMAIN          Predict country hub URLs for domain
  --analyze DOMAIN         Analyze gap coverage for domain
  --match / --no-match     Enable or disable automatic matching (default: enabled)
  --populations            When analyzing, output a population-sorted table
  --help, -h               Show this help message

Examples:
  node tools/gazetteer/query-country-hub-gaps.js --all
  node tools/gazetteer/query-country-hub-gaps.js --top 20
  node tools/gazetteer/query-country-hub-gaps.js --country "United States"
  node tools/gazetteer/query-country-hub-gaps.js --domain bbc.co.uk
  node tools/gazetteer/query-country-hub-gaps.js --analyze theguardian.com
  node tools/gazetteer/query-country-hub-gaps.js --domain nytimes.com --country France
  node tools/gazetteer/query-country-hub-gaps.js --analyze theguardian.com --no-match

Description:
  This tool queries the gazetteer database and generates country hub URL
  predictions using the standalone CountryHubGapAnalyzer service. It does
  not require a crawler and can be used to explore gazetteer data and test
  URL prediction patterns.
`);
}

async function main() {
  const args = parseArgs();
  
  // Connect to database (use news.db which has gazetteer data)
  const dbPath = path.join(__dirname, '..', '..', 'data', 'news.db');
  const db = ensureDatabase(dbPath);
  
  const reporter = createCountryHubGapReporter({ db, logger: console });
  const analyzer = reporter.analyzer;
  
  try {
    // Show all countries
    if (args.all) {
      const countries = analyzer.getAllCountries();
      console.log(`\nAll Countries (${countries.length} total):\n`);
      console.log('Name                          | Code | Importance | Population');
      console.log('-'.repeat(75));
      for (const country of countries) {
        const name = country.name.padEnd(30);
        const code = (country.code || '??').padEnd(4);
        const importance = String(country.importance || 0).padEnd(10);
        const population = String(country.population || 0).padEnd(12);
        console.log(`${name} | ${code} | ${importance} | ${population}`);
      }
      return;
    }
    
    // Show top N countries
    if (args.top) {
      const countries = analyzer.getTopCountries(args.top);
      console.log(`\nTop ${args.top} Countries by Importance:\n`);
      console.log('Name                          | Code | Importance | Population');
      console.log('-'.repeat(75));
      for (const country of countries) {
        const name = country.name.padEnd(30);
        const code = (country.code || '??').padEnd(4);
        const importance = String(country.importance || 0).padEnd(10);
        const population = String(country.population || 0).padEnd(12);
        console.log(`${name} | ${code} | ${importance} | ${population}`);
      }
      return;
    }
    
    // Show specific country
    if (args.country) {
      const countries = analyzer.getAllCountries();
      const country = countries.find(c => 
        c.name.toLowerCase() === args.country.toLowerCase()
      );
      
      if (!country) {
        console.error(`\nCountry not found: ${args.country}`);
        process.exit(1);
      }
      
      console.log(`\nCountry Details:\n`);
      console.log(`Name:        ${country.name}`);
      console.log(`Code:        ${country.code || 'N/A'}`);
      console.log(`Importance:  ${country.importance || 0}`);
      console.log(`Population:  ${country.population || 0}`);
      
      if (args.domain) {
        console.log(`\nPredicted URLs for ${args.domain}:\n`);
        const predictions = analyzer.predictCountryHubUrls(
          args.domain,
          country.name,
          country.code
        );
        
        for (const url of predictions) {
          console.log(`  ${url}`);
        }
      }
      
      return;
    }
    
    // Predict URLs for domain
    if (args.domain && !args.analyze) {
      const countries = analyzer.getTopCountries(20);
      console.log(`\nCountry Hub URL Predictions for ${args.domain}:\n`);
      
      for (const country of countries) {
        console.log(`\n${country.name} (${country.code || '??'}):`);
        const predictions = analyzer.predictCountryHubUrls(
          args.domain,
          country.name,
          country.code
        );
        
        for (const url of predictions) {
          console.log(`  ${url}`);
        }
      }
      
      return;
    }
    
    // Analyze gap coverage
    if (args.analyze) {
      const hubStats = { perKind: { country: { seeded: 0, visited: 0 } } };

      let matchResult = null;
      if (args.autoMatch) {
        const matcher = new CountryHubMatcher({ db, logger: console });
        matchResult = matcher.matchDomain(args.analyze, {
          dryRun: false,
          hubStats
        });

        const { linkedCount, candidateCount } = matchResult;
        const skippedCount = matchResult.skipped?.length || 0;

        console.log(`\nAuto-matching existing hubs for ${args.analyze}: linked ${linkedCount} of ${candidateCount} candidates (skipped ${skippedCount}).`);

        if (linkedCount > 0) {
          const preview = matchResult.actions
            .filter((action) => action.applied)
            .slice(0, 10)
            .map(({ target, candidate }) => `  ✓ ${target.name} (${target.code || '??'}) → ${candidate.url}`);
          preview.forEach((line) => console.log(line));
          if (matchResult.actions.filter((action) => action.applied).length > 10) {
            console.log('  … additional matches applied');
          }
        }
      }

      console.log(`\nGap Analysis for ${args.analyze}:\n`);
      const { analysis, formatted } = reporter.analyzeAndFormat(args.analyze, {
        hubStats,
        missingLineLimit: Number.POSITIVE_INFINITY,
        includeStatus: false
      });

      formatted.headerLines.forEach((line) => console.log(line));

      if (analysis.missing > 0) {
        if (args.populations) {
          const sorted = [...(analysis.missingCountries || [])]
            .sort((a, b) => {
              const popA = a?.population || 0;
              const popB = b?.population || 0;
              if (popB !== popA) return popB - popA;
              return (a?.name || '').localeCompare(b?.name || '');
            });

          console.log(`\nMissing country hubs by population (${analysis.missing}):\n`);
          const header = ['Name', 'Code', 'Population'];
          const formatPopulation = (value) => {
            const population = Number.isFinite(value) ? value : 0;
            return population.toLocaleString('en-US');
          };

          const formattedPopulations = sorted.map((country) =>
            formatPopulation(country?.population || 0)
          );

          const columnWidths = {
            name: Math.max(
              header[0].length,
              ...sorted.map((country) => (country?.name || '').length)
            ),
            code: Math.max(
              header[1].length,
              ...sorted.map((country) => (country?.code || '??').length)
            ),
            population: Math.max(
              header[2].length,
              ...formattedPopulations.map((value) => value.length)
            )
          };

          const padLeft = (value, width) => String(value).padStart(width, ' ');
          const padRight = (value, width) => String(value).padEnd(width, ' ');

          console.log(
            `${padRight(header[0], columnWidths.name)} | ${padRight(header[1], columnWidths.code)} | ${padLeft(header[2], columnWidths.population)}`
          );
          console.log('-'.repeat(columnWidths.name + columnWidths.code + columnWidths.population + 6));

          sorted.forEach((country) => {
            const population = formatPopulation(country?.population || 0);
            const name = padRight(country?.name || 'Unknown', columnWidths.name);
            const code = padRight(country?.code || '??', columnWidths.code);
            const populationColumn = padLeft(population, columnWidths.population);
            console.log(`${name} | ${code} | ${populationColumn}`);
          });
        } else {
          console.log(`\nMissing country hubs (${analysis.missing}):`);
          formatted.missing.lines.forEach((line) => console.log(line));
          if (formatted.missing.moreAfterLines > 0) {
            console.log(`  … +${formatted.missing.moreAfterLines} more`);
          }
        }
      } else {
        console.log('\nAll country hubs verified!');
      }

      console.log(`\nNote: This shows potential gaps. Run with --domain to see URL predictions.`);

      return;
    }
    
    // No action specified
    console.log('No action specified. Use --help for usage information.');
    showHelp();
    
  } finally {
    db.close();
  }
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
