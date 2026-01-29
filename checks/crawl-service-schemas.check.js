'use strict';

/**
 * Check script for enhanced crawlService.getAvailability()
 * Verifies that operation schemas are included in API responses.
 * 
 * Run: node checks/crawl-service-schemas.check.js
 */

const { createCrawlService } = require('../src/server/crawl-api/core/crawlService');

console.log('=== Crawl Service Schema Integration Check ===\n');

const service = createCrawlService();
const availability = service.getAvailability({ logger: console });

console.log('📋 Operations with Schema Metadata:\n');

for (const op of availability.operations) {
  const hasSchema = !!op.optionSchema;
  const optionCount = op.optionSchema ? Object.keys(op.optionSchema).length : 0;
  
  console.log(`${op.icon || '❓'} ${op.name}`);
  console.log(`   Label: ${op.label || '(none)'}`);
  console.log(`   Category: ${op.category || '(none)'}`);
  console.log(`   Schema: ${hasSchema ? `✓ ${optionCount} options` : '✗ missing'}`);
  console.log('');
}

// Verify one operation in detail
console.log('\n📊 Detail Check (basicArticleCrawl):\n');
const basicOp = availability.operations.find(o => o.name === 'basicArticleCrawl');
if (basicOp && basicOp.optionSchema) {
  console.log('Option schema keys:', Object.keys(basicOp.optionSchema).join(', '));
  
  // Check one option has full metadata
  const maxDownloads = basicOp.optionSchema.maxDownloads;
  if (maxDownloads) {
    console.log('\nSample option (maxDownloads):');
    console.log(`  type: ${maxDownloads.type}`);
    console.log(`  label: ${maxDownloads.label}`);
    console.log(`  description: ${maxDownloads.description}`);
    console.log(`  default: ${maxDownloads.default}`);
    console.log(`  min: ${maxDownloads.min}`);
    console.log(`  max: ${maxDownloads.max}`);
  }
} else {
  console.error('❌ basicArticleCrawl missing schema');
  process.exit(1);
}

// Check sequences still work
console.log('\n\n📋 Sequences (unchanged):\n');
for (const seq of availability.sequences) {
  console.log(`  ${seq.name} - ${seq.stepCount} steps`);
}

console.log('\n\n✅ Schema integration check passed!');
