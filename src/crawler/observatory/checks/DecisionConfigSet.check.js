/**
 * Decision Config Set - Check Script
 * 
 * Validates the DecisionConfigSet model and its operations:
 * - Loading from production
 * - Saving/loading sets
 * - Cloning
 * - Diffing
 * - Mutations (bonuses, weights, features)
 * - Change logging
 * 
 * Run: node src/crawler/observatory/checks/DecisionConfigSet.check.js
 */

const path = require('path');
const fs = require('fs');

// Import the module under test
const { DecisionConfigSet, CONFIG_SETS_DIR } = require('../DecisionConfigSet');

// Test state
let passed = 0;
let failed = 0;

function check(description, condition) {
  if (condition) {
    console.log(`  ✅ ${description}`);
    passed++;
  } else {
    console.log(`  ❌ ${description}`);
    failed++;
  }
}

function section(name) {
  console.log(`\n📋 ${name}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

async function runTests() {
  console.log('🔬 Decision Config Set - Check Script');
  console.log('=====================================\n');

  const rootDir = path.resolve(__dirname, '../../../../');
  
  // ─────────────────────────────────────────────────────────────────────────
  section('Load from Production');
  // ─────────────────────────────────────────────────────────────────────────
  
  let baseline;
  try {
    baseline = await DecisionConfigSet.fromProduction('test-baseline', rootDir);
    check('fromProduction() loads successfully', true);
  } catch (err) {
    check('fromProduction() loads successfully', false);
    console.error('     Error:', err.message);
    return;
  }
  
  check('Has slug', typeof baseline.slug === 'string' && baseline.slug.length > 0);
  check('Has name', typeof baseline.name === 'string' && baseline.name.length > 0);
  check('Has priorityConfig', baseline.priorityConfig !== null);
  check('Has priorityConfig.queue', baseline.priorityConfig?.queue !== null);
  check('Has priorityConfig.queue.bonuses', Object.keys(baseline.priorityConfig?.queue?.bonuses || {}).length > 0);
  check('Has priorityConfig.queue.weights', Object.keys(baseline.priorityConfig?.queue?.weights || {}).length > 0);
  check('Has decisionTrees', Object.keys(baseline.decisionTrees).length > 0);
  check('Has features', baseline.features !== null);
  check('Has metadata', baseline.metadata !== null);
  check('metadata.createdAt is set', baseline.metadata.createdAt !== undefined);
  
  // ─────────────────────────────────────────────────────────────────────────
  section('Priority Bonuses');
  // ─────────────────────────────────────────────────────────────────────────
  
  const bonusKeys = Object.keys(baseline.priorityConfig?.queue?.bonuses || {});
  check('Has at least 1 bonus', bonusKeys.length >= 1);
  console.log(`     (found ${bonusKeys.length} bonuses: ${bonusKeys.slice(0, 5).join(', ')}${bonusKeys.length > 5 ? '...' : ''})`);
  
  if (bonusKeys.length > 0) {
    const firstBonusKey = bonusKeys[0];
    const bonusValue = baseline.getPriorityBonus(firstBonusKey);
    check('getPriorityBonus() returns value', bonusValue !== undefined);
    
    // Test mutation
    const oldValue = bonusValue;
    baseline.setPriorityBonus(firstBonusKey, 999);
    check('setPriorityBonus() updates value', baseline.getPriorityBonus(firstBonusKey) === 999);
    check('setPriorityBonus() logs change', baseline._changeLog.length > 0);
    
    // Restore
    baseline.setPriorityBonus(firstBonusKey, oldValue);
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  section('Priority Weights');
  // ─────────────────────────────────────────────────────────────────────────
  
  const weightKeys = Object.keys(baseline.priorityConfig?.queue?.weights || {});
  check('Has at least 1 weight', weightKeys.length >= 1);
  console.log(`     (found ${weightKeys.length} weights: ${weightKeys.join(', ')})`);
  
  if (weightKeys.length > 0) {
    const firstWeightKey = weightKeys[0];
    const weightValue = baseline.getPriorityWeight(firstWeightKey);
    check('getPriorityWeight() returns value', weightValue !== undefined);
    
    // Test mutation
    const oldValue = weightValue;
    baseline.setPriorityWeight(firstWeightKey, 999);
    check('setPriorityWeight() updates value', baseline.getPriorityWeight(firstWeightKey) === 999);
    
    // Restore
    baseline.setPriorityWeight(firstWeightKey, oldValue);
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  section('Features');
  // ─────────────────────────────────────────────────────────────────────────
  
  const featureKeys = Object.keys(baseline.features);
  check('Has features', featureKeys.length >= 0);
  console.log(`     (found ${featureKeys.length} features)`);
  
  // Test mutation
  baseline.setFeature('test-feature-123', true);
  check('setFeature() enables feature', baseline.getFeature('test-feature-123') === true);
  
  baseline.setFeature('test-feature-123', false);
  check('setFeature() disables feature', baseline.getFeature('test-feature-123') === false);
  
  const allFeatures = baseline.getAllFeatures();
  check('getAllFeatures() returns object', typeof allFeatures === 'object');
  
  // ─────────────────────────────────────────────────────────────────────────
  section('Decision Trees');
  // ─────────────────────────────────────────────────────────────────────────
  
  const treeNames = baseline.getDecisionTreeNames();
  check('Has decision trees', treeNames.length >= 1);
  console.log(`     (found ${treeNames.length} trees: ${treeNames.join(', ')})`);
  
  if (treeNames.length > 0) {
    const tree = baseline.getDecisionTree(treeNames[0]);
    check('getDecisionTree() returns tree', tree !== null);
    check('Tree has categories', tree?.categories !== undefined || tree?.root !== undefined);
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  section('Clone');
  // ─────────────────────────────────────────────────────────────────────────
  
  const clone = baseline.clone('test-clone');
  check('clone() creates new instance', clone !== baseline);
  check('Clone has different slug', clone.slug !== baseline.slug);
  check('Clone has parentSlug', clone.parentSlug === baseline.slug);
  check('Clone has same bonuses', 
    JSON.stringify(clone.priorityConfig.queue.bonuses) === JSON.stringify(baseline.priorityConfig.queue.bonuses)
  );
  check('Clone has same decision trees', 
    Object.keys(clone.decisionTrees).length === Object.keys(baseline.decisionTrees).length
  );
  
  // Modify clone, ensure original unchanged
  clone.setPriorityBonus('clone-test-bonus', 123);
  check('Clone modifications do not affect original', baseline.getPriorityBonus('clone-test-bonus') === undefined);
  
  // ─────────────────────────────────────────────────────────────────────────
  section('Diff');
  // ─────────────────────────────────────────────────────────────────────────
  
  clone.setPriorityBonus('diff-test-bonus', 500);
  clone.setFeature('diff-test-feature', true);
  
  const diffs = baseline.diff(clone);
  check('diff() returns array', Array.isArray(diffs));
  check('diff() detects bonus difference', diffs.some(d => d.type === 'bonus' && d.key === 'diff-test-bonus'));
  check('diff() detects feature difference', diffs.some(d => d.type === 'feature' && d.key === 'diff-test-feature'));
  console.log(`     (found ${diffs.length} differences)`);
  
  // ─────────────────────────────────────────────────────────────────────────
  section('Serialization');
  // ─────────────────────────────────────────────────────────────────────────
  
  const json = baseline.toJSON();
  check('toJSON() returns object', typeof json === 'object');
  check('JSON has slug', json.slug === baseline.slug);
  check('JSON has name', json.name === baseline.name);
  check('JSON has priorityConfig', json.priorityConfig !== undefined);
  check('JSON has decisionTrees', json.decisionTrees !== undefined);
  check('JSON has metadata', json.metadata !== undefined);
  
  const summary = baseline.getSummary();
  check('getSummary() returns object', typeof summary === 'object');
  check('Summary has stats', summary.stats !== undefined);
  check('Summary has bonusCount', typeof summary.stats.bonusCount === 'number');
  check('Summary has treeCount', typeof summary.stats.treeCount === 'number');
  
  // ─────────────────────────────────────────────────────────────────────────
  section('Save/Load Round-Trip');
  // ─────────────────────────────────────────────────────────────────────────
  
  const testSet = baseline.clone('check-script-test-set');
  testSet.setPriorityBonus('test-bonus', 42);
  
  // Save
  const savedPath = await testSet.save(rootDir);
  check('save() returns path', typeof savedPath === 'string' && savedPath.length > 0);
  check('Saved file exists', fs.existsSync(savedPath));
  
  // Load
  const loaded = await DecisionConfigSet.load(testSet.slug, rootDir);
  check('load() returns config set', loaded !== null);
  check('Loaded slug matches', loaded.slug === testSet.slug);
  check('Loaded name matches', loaded.name === testSet.name);
  check('Loaded bonus matches', loaded.getPriorityBonus('test-bonus') === 42);
  
  // Clean up test file
  try {
    await testSet.delete(rootDir);
    check('delete() removes file', !fs.existsSync(savedPath));
  } catch (err) {
    check('delete() removes file', false);
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  section('List');
  // ─────────────────────────────────────────────────────────────────────────
  
  const list = await DecisionConfigSet.list(rootDir);
  check('list() returns array', Array.isArray(list));
  console.log(`     (found ${list.length} saved config sets)`);
  
  if (list.length > 0) {
    const first = list[0];
    check('List items have slug', first.slug !== undefined);
    check('List items have name', first.name !== undefined);
    check('List items have createdAt', first.createdAt !== undefined);
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  section('Change Log');
  // ─────────────────────────────────────────────────────────────────────────
  
  const changeLog = baseline.getChangeLog();
  check('getChangeLog() returns array', Array.isArray(changeLog));
  console.log(`     (${changeLog.length} changes logged)`);
  
  if (changeLog.length > 0) {
    const lastChange = changeLog[changeLog.length - 1];
    check('Change log entries have timestamp', lastChange.timestamp !== undefined);
    check('Change log entries have action', lastChange.action !== undefined);
    check('Change log entries have details', lastChange.details !== undefined);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════════
  
  console.log('\n=====================================');
  console.log(`Results: ${passed} passed, ${failed} failed\n`);
  
  if (failed === 0) {
    console.log('✅ All checks passed!\n');
    process.exit(0);
  } else {
    console.log('❌ Some checks failed.\n');
    process.exit(1);
  }
}

// Run tests
runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
