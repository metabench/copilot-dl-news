/**
 * Run all gazetteer loading experiments
 */
'use strict';

const { run: run001 } = require('./experiments/001-matcher-performance/run');
const { run: run002 } = require('./experiments/002-incremental-loading/run');
const { run: run003 } = require('./experiments/003-query-patterns/run');

async function runAll() {
  console.log('\n========================================');
  console.log('  GAZETTEER LOADING LAB EXPERIMENTS');
  console.log('========================================\n');
  
  const results = {};
  
  try {
    console.log('Running Experiment 001: Matcher Performance...\n');
    results['001'] = await run001();
  } catch (err) {
    console.error('Experiment 001 failed:', err.message);
    results['001'] = { error: err.message };
  }
  
  console.log('\n');
  
  try {
    console.log('Running Experiment 002: Incremental Loading...\n');
    results['002'] = await run002();
  } catch (err) {
    console.error('Experiment 002 failed:', err.message);
    results['002'] = { error: err.message };
  }
  
  console.log('\n');
  
  try {
    console.log('Running Experiment 003: Query Patterns...\n');
    results['003'] = await run003();
  } catch (err) {
    console.error('Experiment 003 failed:', err.message);
    results['003'] = { error: err.message };
  }
  
  console.log('\n========================================');
  console.log('  ALL EXPERIMENTS COMPLETE');
  console.log('========================================\n');
  
  return results;
}

if (require.main === module) {
  runAll().catch(console.error);
}

module.exports = { runAll };
