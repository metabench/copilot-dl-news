/**
 * Save Current Production Config as Baseline
 * 
 * This script captures the current production decision-making configuration
 * and saves it as a named baseline set for future reference and comparison.
 * 
 * Usage:
 *   node scripts/save-baseline-config.js
 *   node scripts/save-baseline-config.js --name "pre-experiment-backup"
 */

const path = require('path');
const { DecisionConfigSet } = require('../src/crawler/observatory/DecisionConfigSet');

async function main() {
  const args = process.argv.slice(2);
  const nameFlag = args.indexOf('--name');
  
  // Generate a sensible default name with today's date
  const today = new Date().toISOString().split('T')[0];
  const defaultName = `baseline-${today}`;
  const name = nameFlag >= 0 && args[nameFlag + 1] 
    ? args[nameFlag + 1] 
    : defaultName;

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  📦 Saving Production Config as Baseline');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const rootDir = path.resolve(__dirname, '..');

  try {
    // Load from production files
    console.log('Loading from production files...');
    const baseline = await DecisionConfigSet.fromProduction(name, rootDir);
    
    // Get summary before saving
    const summary = baseline.getSummary();
    
    console.log(`\n  Name:             ${summary.name}`);
    console.log(`  Slug:             ${summary.slug}`);
    console.log(`  Bonuses:          ${summary.stats.bonusCount}`);
    console.log(`  Weights:          ${summary.stats.weightCount}`);
    console.log(`  Decision Trees:   ${summary.stats.treeCount}`);
    console.log(`  Enabled Features: ${summary.stats.enabledFeatureCount}`);
    
    if (summary.enabledFeatures.length > 0) {
      console.log(`\n  Features enabled:`);
      summary.enabledFeatures.forEach(f => console.log(`    • ${f}`));
    }

    // Save the config set
    const savedPath = await baseline.save(rootDir);
    
    console.log(`\n✅ Saved baseline to: ${savedPath}`);
    console.log('\n═══════════════════════════════════════════════════════════════\n');

    // List all saved sets
    const allSets = await DecisionConfigSet.list(rootDir);
    if (allSets.length > 0) {
      console.log('All saved config sets:');
      allSets.forEach(s => {
        const marker = s.isProduction ? '🏭' : '🧪';
        console.log(`  ${marker} ${s.name} (${s.slug})`);
      });
      console.log('');
    }

    return 0;
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    return 1;
  }
}

main().then(code => process.exit(code));
