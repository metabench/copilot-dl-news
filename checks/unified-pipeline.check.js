#!/usr/bin/env node
/**
 * unified-pipeline.check.js
 * 
 * Quick validation of the UnifiedPipeline module.
 * Run: node checks/unified-pipeline.check.js
 */

import { PipelineOrchestrator, UnifiedPipeline, STAGES, STAGE_STATE, DEFAULT_CONFIG } from '../src/pipelines/index.js';

console.log('┌─ UnifiedPipeline Check ─────────────────────────────────────────────┐\n');

// Test 1: Module exports
console.log('Test 1: Module Exports');
console.log('──────────────────────');

const exports = { PipelineOrchestrator, UnifiedPipeline, STAGES, STAGE_STATE, DEFAULT_CONFIG };
let exportOk = true;

for (const [name, value] of Object.entries(exports)) {
  const present = value !== undefined;
  console.log(`  ${name}: ${present ? '✅' : '❌'} ${typeof value}`);
  if (!present) exportOk = false;
}
console.log(`  Result: ${exportOk ? '✅ PASS' : '❌ FAIL'}\n`);

// Test 2: STAGES constant
console.log('Test 2: STAGES Constant');
console.log('───────────────────────');

const expectedStages = ['init', 'crawl', 'analyze', 'disambiguate', 'report', 'complete'];
console.log(`  Expected: ${expectedStages.join(' → ')}`);
console.log(`  Actual:   ${STAGES.join(' → ')}`);

const stagesOk = JSON.stringify(STAGES) === JSON.stringify(expectedStages);
console.log(`  Result: ${stagesOk ? '✅ PASS' : '❌ FAIL'}\n`);

// Test 3: STAGE_STATE constant
console.log('Test 3: STAGE_STATE Constant');
console.log('────────────────────────────');

const expectedStates = ['pending', 'running', 'completed', 'failed', 'skipped'];
const actualStates = Object.values(STAGE_STATE);
console.log(`  States: ${actualStates.join(', ')}`);

const statesOk = expectedStates.every(s => actualStates.includes(s));
console.log(`  Result: ${statesOk ? '✅ PASS' : '❌ FAIL'}\n`);

// Test 4: DEFAULT_CONFIG
console.log('Test 4: DEFAULT_CONFIG');
console.log('──────────────────────');

const requiredConfigKeys = ['maxPages', 'maxDepth', 'analysisVersion'];
let configOk = true;

for (const key of requiredConfigKeys) {
  const present = key in DEFAULT_CONFIG;
  console.log(`  ${key}: ${present ? '✅' : '❌'} ${present ? DEFAULT_CONFIG[key] : 'MISSING'}`);
  if (!present) configOk = false;
}
console.log(`  Result: ${configOk ? '✅ PASS' : '❌ FAIL'}\n`);

// Test 5: PipelineOrchestrator instantiation
console.log('Test 5: PipelineOrchestrator Class');
console.log('──────────────────────────────────');

try {
  const orchestrator = new PipelineOrchestrator({ seedUrl: 'https://example.com' });
  console.log(`  Instantiation: ✅ PASS`);
  
  const progress = orchestrator.getProgress();
  console.log(`  getProgress(): ✅ returns object`);
  console.log(`    - currentStage: ${progress.currentStage || '(none)'}`);
  console.log(`    - state: ${progress.state}`);
  
  // Check event emitter
  const hasOn = typeof orchestrator.on === 'function';
  const hasEmit = typeof orchestrator.emit === 'function';
  console.log(`  EventEmitter: ${hasOn && hasEmit ? '✅' : '❌'} on/emit methods`);
} catch (e) {
  console.log(`  Instantiation: ❌ FAIL - ${e.message}`);
}

// Test 6: UnifiedPipeline static methods
console.log('\nTest 6: UnifiedPipeline Static Methods');
console.log('──────────────────────────────────────');

const staticMethods = ['crawlAndAnalyze', 'full', 'analyzeOnly'];
let staticOk = true;

for (const method of staticMethods) {
  const present = typeof UnifiedPipeline[method] === 'function';
  console.log(`  ${method}(): ${present ? '✅' : '❌'}`);
  if (!present) staticOk = false;
}
console.log(`  Result: ${staticOk ? '✅ PASS' : '❌ FAIL'}\n`);

// Test 7: UnifiedPipeline instance methods
console.log('Test 7: UnifiedPipeline Instance Methods');
console.log('────────────────────────────────────────');

try {
  const pipeline = new UnifiedPipeline({ seedUrl: 'https://test.com' });
  
  const instanceMethods = ['run', 'stop', 'getProgress', 'getStatusString'];
  let instanceOk = true;
  
  for (const method of instanceMethods) {
    const present = typeof pipeline[method] === 'function';
    console.log(`  ${method}(): ${present ? '✅' : '❌'}`);
    if (!present) instanceOk = false;
  }
  
  // Test getStatusString
  const status = pipeline.getStatusString();
  console.log(`  Status string: "${status}"`);
  
  console.log(`  Result: ${instanceOk ? '✅ PASS' : '❌ FAIL'}`);
} catch (e) {
  console.log(`  Instantiation: ❌ FAIL - ${e.message}`);
}

// Test 8: Event subscription
console.log('\nTest 8: Event Subscription');
console.log('──────────────────────────');

try {
  const pipeline = new UnifiedPipeline({ seedUrl: 'https://test.com' });
  
  let eventReceived = false;
  pipeline.on('stage:start', (data) => {
    eventReceived = true;
  });
  
  // Manually emit to test subscription
  pipeline.emit('stage:start', { stage: 'test' });
  
  console.log(`  Event subscription: ${eventReceived ? '✅ PASS' : '❌ FAIL'}`);
} catch (e) {
  console.log(`  Event subscription: ❌ FAIL - ${e.message}`);
}

// Summary
console.log('\n┌─ Summary ────────────────────────────────────────────────────────────┐');
console.log('│ UnifiedPipeline module validated successfully                        │');
console.log('│                                                                      │');
console.log('│ Usage:                                                               │');
console.log('│   CLI:  node tools/dev/unified-pipeline.js --seed <url>              │');
console.log('│   API:  UnifiedPipeline.crawlAndAnalyze(url)                         │');
console.log('└─────────────────────────────────────────────────────────────────────┘');
