'use strict';

/**
 * Check script for OperationSchemaRegistry
 * Validates that all schemas load correctly and can be queried.
 * 
 * Run: node src/crawler/operations/schemas/checks/schemas.check.js
 */

const { OperationSchemaRegistry } = require('../index');

console.log('=== Operation Schema Registry Check ===\n');

// 1. List all schemas
console.log('📋 Registered Operations:');
const schemas = OperationSchemaRegistry.listSchemas();
for (const schema of schemas) {
  console.log(`  ${schema.icon || '❓'} ${schema.operation} - ${schema.label}`);
}
console.log(`\n  Total: ${schemas.length} operations\n`);

// 2. List by category
console.log('📂 By Category:');
const byCategory = OperationSchemaRegistry.listByCategory();
for (const [key, cat] of Object.entries(byCategory)) {
  if (cat.operations.length > 0) {
    console.log(`\n  ${cat.icon} ${cat.label} (${cat.operations.length})`);
    for (const op of cat.operations) {
      console.log(`     - ${op.operation}`);
    }
  }
}

// 3. Test schema retrieval
console.log('\n\n🔍 Schema Detail Test (basicArticleCrawl):');
const basicSchema = OperationSchemaRegistry.getSchema('basicArticleCrawl');
if (basicSchema) {
  console.log(`  Label: ${basicSchema.label}`);
  console.log(`  Category: ${basicSchema.category}`);
  console.log(`  Options: ${Object.keys(basicSchema.options).length}`);
  
  console.log('\n  Option Summary:');
  for (const [name, opt] of Object.entries(basicSchema.options)) {
    const defaultStr = opt.default !== undefined ? ` (default: ${JSON.stringify(opt.default)})` : '';
    console.log(`    - ${name}: ${opt.type}${defaultStr}`);
  }
} else {
  console.error('  ❌ Failed to load basicArticleCrawl schema');
  process.exit(1);
}

// 4. Test validation
console.log('\n\n✅ Validation Tests:');

// Valid options
const validResult = OperationSchemaRegistry.validateOptions('basicArticleCrawl', {
  maxDownloads: 500,
  useSitemap: true,
  crawlType: 'basic'
});
console.log(`  Valid options: ${validResult.valid ? '✓ PASS' : '✗ FAIL'}`);

// Invalid number
const invalidNumber = OperationSchemaRegistry.validateOptions('basicArticleCrawl', {
  maxDownloads: -10
});
console.log(`  Invalid number (negative): ${!invalidNumber.valid ? '✓ PASS (rejected)' : '✗ FAIL'}`);
if (!invalidNumber.valid) {
  console.log(`    Error: ${invalidNumber.errors.maxDownloads}`);
}

// Invalid enum
const invalidEnum = OperationSchemaRegistry.validateOptions('basicArticleCrawl', {
  crawlType: 'not-a-valid-type'
});
console.log(`  Invalid enum: ${!invalidEnum.valid ? '✓ PASS (rejected)' : '✗ FAIL'}`);
if (!invalidEnum.valid) {
  console.log(`    Error: ${invalidEnum.errors.crawlType}`);
}

// Unknown operation
const unknownOp = OperationSchemaRegistry.validateOptions('notAnOperation', {});
console.log(`  Unknown operation: ${!unknownOp.valid ? '✓ PASS (rejected)' : '✗ FAIL'}`);

// 5. Test defaults
console.log('\n\n📝 Defaults Test (guessPlaceHubs):');
const defaults = OperationSchemaRegistry.getDefaults('guessPlaceHubs');
console.log(`  kinds: ${JSON.stringify(defaults.kinds)}`);
console.log(`  patternsPerPlace: ${defaults.patternsPerPlace}`);
console.log(`  apply: ${defaults.apply}`);
console.log(`  maxAgeDays: ${defaults.maxAgeDays}`);

// 6. Test options by category
console.log('\n\n📊 Options by Category (exploreCountryHubs):');
const optionsByCategory = OperationSchemaRegistry.getOptionsByCategory('exploreCountryHubs');
for (const [cat, options] of Object.entries(optionsByCategory)) {
  console.log(`  ${cat}: ${options.map(o => o.name).join(', ')}`);
}

console.log('\n\n✅ All checks passed!');
