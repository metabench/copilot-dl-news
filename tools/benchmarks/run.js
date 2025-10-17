#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const os = require('os');
const express = require('express');
const request = require('supertest');
const Database = require('better-sqlite3');

const { openDbReadOnly } = require('../../src/db/sqlite');
const {
  getCountryByCode,
  listTopCities
} = require('../../src/db/sqlite/queries/ui/gazetteerCountry');
const {
  fetchCountryMinimalData
} = require('../../src/ui/express/data/gazetteerCountry');
const {
  createGazetteerCountryRouter
} = require('../../src/ui/express/routes/ssr.gazetteer.country');

const DEFAULT_OUTPUT_PATH = path.join(__dirname, 'results', 'benchmark-results.json');

function parseArgs(argv) {
  const args = { output: null, iterations: 5 };
  for (let i = 2; i < argv.length; i += 1) {
    const current = argv[i];
    if (current === '--output' || current === '-o') {
      args.output = argv[i + 1];
      i += 1;
    } else if (current === '--iterations' || current === '-n') {
      const value = parseInt(argv[i + 1], 10);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error('Iterations must be a positive integer');
      }
      args.iterations = value;
      i += 1;
    }
  }
  if (!args.output) {
    args.output = DEFAULT_OUTPUT_PATH;
  }
  return {
    ...args,
    output: path.resolve(args.output)
  };
}

function resolveDbPath() {
  const candidate = process.env.DB_PATH
    || process.env.UI_DB_PATH
    || path.join(process.cwd(), 'data', 'news.db');
  if (!fs.existsSync(candidate)) {
    throw new Error(`Database file not found at ${candidate}`);
  }
  return candidate;
}

function hrtimeToMs(hrtimeBigInt) {
  return Number(hrtimeBigInt) / 1e6;
}

function computeStats(values) {
  if (!values.length) {
    return { count: 0, minMs: 0, maxMs: 0, meanMs: 0, medianMs: 0 }; 
  }
  const sorted = [...values].sort((a, b) => a - b);
  const total = values.reduce((sum, v) => sum + v, 0);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
  return {
    count: values.length,
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
    meanMs: total / values.length,
    medianMs: median
  };
}

async function runTimed(iterations, fn) {
  const durations = [];
  for (let i = 0; i < iterations; i += 1) {
    const start = process.hrtime.bigint();
    // eslint-disable-next-line no-await-in-loop
    await fn();
    const end = process.hrtime.bigint();
    durations.push(hrtimeToMs(end - start));
  }
  return durations;
}

function setupTraceStub() {
  return function startTraceStub() {
    return {
      pre() {
        return () => {};
      },
      end() {}
    };
  };
}

async function benchmarkDirectDb({ dbPath, iterations }) {
  const section = { name: 'direct-db', benchmarks: [] };
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const countCountriesStmt = db.prepare("SELECT COUNT(1) as total FROM places WHERE kind='country'");
    const topCitiesStmt = db.prepare("SELECT id, name FROM place_names ORDER BY id LIMIT 20");

    const countDurations = await runTimed(iterations, () => {
      countCountriesStmt.get();
    });
    section.benchmarks.push({
      name: 'count-countries',
      stats: computeStats(countDurations)
    });

    const citiesDurations = await runTimed(iterations, () => {
      topCitiesStmt.all();
    });
    section.benchmarks.push({
      name: 'list-canonical-names',
      stats: computeStats(citiesDurations)
    });

    return section;
  } finally {
    try { db.close(); } catch (_) { /* noop */ }
  }
}

async function benchmarkModuleQueries({ dbPath, iterations }) {
  const section = { name: 'db-modules', benchmarks: [] };
  const db = openDbReadOnly(dbPath);
  try {
    const durationsCountry = await runTimed(iterations, () => {
      getCountryByCode(db, 'ID');
    });
    section.benchmarks.push({
      name: 'get-country-by-code',
      stats: computeStats(durationsCountry)
    });

    const durationsTopCities = await runTimed(iterations, () => {
      listTopCities(db, 'ID', 10);
    });
    section.benchmarks.push({
      name: 'list-top-cities',
      stats: computeStats(durationsTopCities)
    });

    const durationsMinimal = await runTimed(iterations, () => {
      fetchCountryMinimalData({ dbPath, countryCode: 'ID' });
    });
    section.benchmarks.push({
      name: 'fetch-country-minimal-data',
      stats: computeStats(durationsMinimal)
    });

    return section;
  } finally {
    try { db.close(); } catch (_) { /* noop */ }
  }
}

async function benchmarkSsr({ dbPath, iterations }) {
  const section = { name: 'ssr-routes', benchmarks: [] };
  const app = express();
  app.use(createGazetteerCountryRouter({
    urlsDbPath: dbPath,
    startTrace: setupTraceStub()
  }));
  const agent = request(app);

  // Warm up caches before measurement
  await agent.get('/gazetteer/country/ID').expect(200);

  const durationsMinimal = await runTimed(iterations, async () => {
    const response = await agent.get('/gazetteer/country/ID').expect(200);
    // ensure minimal HTML contains expected marker
    if (!response.text.includes('Top cities')) {
      throw new Error('Unexpected SSR response payload');
    }
  });

  section.benchmarks.push({
    name: 'gazetteer-country-minimal',
    stats: computeStats(durationsMinimal)
  });

  return section;
}

async function main() {
  const argv = parseArgs(process.argv);
  const dbPath = resolveDbPath();
  const outputDir = path.dirname(argv.output);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const metadata = {
    generatedAt: new Date().toISOString(),
    hostname: os.hostname(),
    platform: os.platform(),
    dbPath,
    iterations: argv.iterations
  };

  const sections = [];
  sections.push(await benchmarkDirectDb({ dbPath, iterations: argv.iterations }));
  sections.push(await benchmarkModuleQueries({ dbPath, iterations: argv.iterations }));
  sections.push(await benchmarkSsr({ dbPath, iterations: Math.max(1, Math.min(3, argv.iterations)) }));

  const output = {
    metadata,
    sections
  };

  fs.writeFileSync(argv.output, JSON.stringify(output, null, 2));
  console.log(`Benchmark results written to ${argv.output}`);
}

main().catch((err) => {
  console.error('Benchmark execution failed:', err);
  process.exitCode = 1;
});
