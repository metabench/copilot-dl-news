'use strict';

/**
 * Check: CrawlProfileEditorControl renders correctly
 * 
 * Validates:
 * - New profile form renders with all basic fields
 * - Edit mode shows profile data pre-populated
 * - Dynamic options render based on selected operation
 * - Form structure is correct
 */

const jsgui = require('jsgui3-html');
const { CrawlProfileEditorControl } = require('../controls');
const { OperationSchemaRegistry } = require('../../../../core/crawler/operations/schemas');

function makeContext() {
  return new jsgui.Page_Context();
}

// Get real operations from schema registry
function getRealOperations() {
  const summaries = OperationSchemaRegistry.listSchemas();
  return summaries.map(summary => {
    const schema = OperationSchemaRegistry.getSchema(summary.operation);
    return {
      name: summary.operation,
      label: schema?.label || summary.operation,
      description: schema?.description || 'No description',
      category: schema?.category || 'other',
      icon: schema?.icon || '❓',
      optionSchema: schema?.options || {}
    };
  });
}

const mockProfile = {
  id: 'test-profile',
  label: 'Test Profile',
  description: 'A test crawler profile',
  startUrl: 'https://example.com',
  operationName: 'basicArticleCrawl',
  tags: ['test', 'example'],
  overrides: {
    maxDownloads: 500,
    concurrency: 2,
    useSitemap: false
  }
};

console.log('===== CrawlProfileEditorControl Check =====\n');

const allOperations = getRealOperations();
console.log(`Loaded ${allOperations.length} operations from schema registry\n`);

// Test 1: New profile form
console.log('1. New Profile Form');
try {
  const ctx = makeContext();
  const control = new CrawlProfileEditorControl({
    context: ctx,
    basePath: '/crawl-strategies',
    profile: null,
    operations: allOperations
  });

  const html = control.all_html_render();
  
  const assertions = [
    { test: html.includes('data-testid="profile-editor"'), name: 'has testid' },
    { test: html.includes('New Profile'), name: 'new profile title' },
    { test: html.includes('name="id"'), name: 'id field' },
    { test: html.includes('name="label"'), name: 'label field' },
    { test: html.includes('name="startUrl"'), name: 'startUrl field' },
    { test: html.includes('data-operation-select'), name: 'operation select' },
    { test: html.includes('Create Profile'), name: 'create button' },
    { test: html.includes('Configuration Options'), name: 'options section' }
  ];

  let passed = 0;
  for (const a of assertions) {
    if (a.test) {
      passed++;
      console.log(`   ✓ ${a.name}`);
    } else {
      console.log(`   ✗ ${a.name}`);
    }
  }
  console.log(`   [${passed}/${assertions.length} passed]\n`);

} catch (err) {
  console.log(`   ✗ Error: ${err.message}\n`);
  console.log(`   Stack: ${err.stack}\n`);
  process.exitCode = 1;
}

// Test 2: Edit profile form
console.log('2. Edit Profile Form');
try {
  const ctx = makeContext();
  const control = new CrawlProfileEditorControl({
    context: ctx,
    basePath: '/crawl-strategies',
    profile: mockProfile,
    operations: allOperations
  });

  const html = control.all_html_render();
  
  const assertions = [
    { test: html.includes('data-profile-id="test-profile"'), name: 'profile id in data attr' },
    { test: html.includes(`Edit: ${mockProfile.label}`), name: 'edit title with label' },
    { test: html.includes('value="test-profile"'), name: 'id field pre-filled' },
    { test: html.includes('value="Test Profile"'), name: 'label field pre-filled' },
    { test: html.includes('value="https://example.com"'), name: 'startUrl field pre-filled' },
    { test: html.includes('Save Changes'), name: 'save button' },
    { test: html.includes('Delete'), name: 'delete button for existing' }
  ];

  let passed = 0;
  for (const a of assertions) {
    if (a.test) {
      passed++;
      console.log(`   ✓ ${a.name}`);
    } else {
      console.log(`   ✗ ${a.name}`);
    }
  }
  console.log(`   [${passed}/${assertions.length} passed]\n`);

} catch (err) {
  console.log(`   ✗ Error: ${err.message}\n`);
  console.log(`   Stack: ${err.stack}\n`);
  process.exitCode = 1;
}

// Test 3: Dynamic options from schema
console.log('3. Dynamic Options from Schema');
try {
  const ctx = makeContext();
  const control = new CrawlProfileEditorControl({
    context: ctx,
    basePath: '/crawl-strategies',
    profile: mockProfile,
    operations: allOperations
  });

  const html = control.all_html_render();
  
  const assertions = [
    { test: html.includes('data-option-key="maxDownloads"'), name: 'maxDownloads option' },
    { test: html.includes('data-option-key="concurrency"'), name: 'concurrency option' },
    { test: html.includes('data-option-key="useSitemap"'), name: 'useSitemap option' },
    { test: html.includes('data-option-type="number"'), name: 'number type options' },
    { test: html.includes('data-option-type="boolean"'), name: 'boolean type options' },
    { test: html.includes('data-option-type="enum"'), name: 'enum type options' },
    { test: html.includes('Limits'), name: 'limits category' },
    { test: html.includes('Performance'), name: 'performance category' }
  ];

  let passed = 0;
  for (const a of assertions) {
    if (a.test) {
      passed++;
      console.log(`   ✓ ${a.name}`);
    } else {
      console.log(`   ✗ ${a.name}`);
    }
  }
  console.log(`   [${passed}/${assertions.length} passed]\n`);

} catch (err) {
  console.log(`   ✗ Error: ${err.message}\n`);
  console.log(`   Stack: ${err.stack}\n`);
  process.exitCode = 1;
}

// Test 4: Form field types
console.log('4. Form Field Types');
try {
  const ctx = makeContext();
  const control = new CrawlProfileEditorControl({
    context: ctx,
    basePath: '/crawl-strategies',
    profile: mockProfile,
    operations: allOperations
  });

  const html = control.all_html_render();
  
  const assertions = [
    { test: html.includes('type="range"'), name: 'range sliders for numbers' },
    { test: html.includes('type="checkbox"'), name: 'checkboxes for booleans' },
    { test: /<select[^>]*data-option-key/.test(html), name: 'selects for enums' },
    { test: html.includes('data-range-value'), name: 'range value display' },
    { test: html.includes('min="1"'), name: 'min constraint on numbers' },
    { test: html.includes('max="'), name: 'max constraint on numbers' }
  ];

  let passed = 0;
  for (const a of assertions) {
    if (a.test) {
      passed++;
      console.log(`   ✓ ${a.name}`);
    } else {
      console.log(`   ✗ ${a.name}`);
    }
  }
  console.log(`   [${passed}/${assertions.length} passed]\n`);

} catch (err) {
  console.log(`   ✗ Error: ${err.message}\n`);
  console.log(`   Stack: ${err.stack}\n`);
  process.exitCode = 1;
}

console.log('===== Check Complete =====');
process.exit(process.exitCode || 0);
