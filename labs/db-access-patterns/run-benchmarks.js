#!/usr/bin/env node
/**
 * Run all DB access pattern benchmarks and save results
 */
const fs = require('fs');
const path = require('path');

const { FastBenchmark } = require('./benchmarks/gazetteer-fast.bench');
const { CandidateGenerationBenchmark } = require('./benchmarks/candidate-generation.bench');

const dbPath = path.join(__dirname, '../../data/news.db');
const resultsDir = path.join(__dirname, 'results');

// Ensure results directory exists
if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir, { recursive: true });
}

console.log('═'.repeat(60));
console.log('  DB Access Patterns Benchmark Suite');
console.log('═'.repeat(60));

// 1. Gazetteer lookup patterns
console.log('\n📦 Part 1: Gazetteer Lookup Patterns\n');
const gazetteerBench = new FastBenchmark(dbPath);
gazetteerBench.runAll();
gazetteerBench.printResults();
gazetteerBench.printInsights();
const gazetteerResults = gazetteerBench.toJSON();
gazetteerBench.close();

// 2. Candidate generation patterns
console.log('\n📦 Part 2: Candidate Generation Patterns\n');
const candidateBench = new CandidateGenerationBenchmark(dbPath);
candidateBench.runAll();
candidateBench.printResults();
candidateBench.printInsights();
const candidateResults = candidateBench.toJSON();
candidateBench.close();

// Combined results
const allResults = {
  timestamp: new Date().toISOString(),
  gazetteerLookups: gazetteerResults,
  candidateGeneration: candidateResults
};

// Save results
const dateStr = new Date().toISOString().slice(0, 10);
const resultsFile = path.join(resultsDir, `benchmark-${dateStr}.json`);
fs.writeFileSync(resultsFile, JSON.stringify(allResults, null, 2));

console.log('═'.repeat(60));
console.log(`  Results saved to: ${path.relative(process.cwd(), resultsFile)}`);
console.log('═'.repeat(60));
