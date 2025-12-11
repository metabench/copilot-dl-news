#!/usr/bin/env node
/**
 * SVG MCP Tools - Quick Check Script
 * 
 * Verifies the MCP tools work correctly with basic operations.
 * Run: node tools/dev/svg-mcp-tools.check.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  svg_stamp,
  svg_query,
  svg_edit,
  svg_batch,
  svg_create,
  svg_theme,
  locateElement,
  queryIndex,
  MCP_TOOLS
} = require('./svg-mcp-tools');

const TMP_DIR = path.join(__dirname, '..', '..', 'tmp');
const TEST_SVG = path.join(TMP_DIR, 'mcp-tools-test.svg');

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('SVG MCP Tools — Check Script');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  // Ensure tmp dir exists
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
  
  const checks = [];
  
  // ─────────────────────────────────────────────────────────────────────────
  // Check 1: Tool definitions exist
  // ─────────────────────────────────────────────────────────────────────────
  console.log('1. MCP Tool Definitions');
  console.log('───────────────────────────────────────────────────────────────');
  
  const toolNames = Object.keys(MCP_TOOLS);
  console.log(`   Tools defined: ${toolNames.length}`);
  toolNames.forEach(name => {
    const tool = MCP_TOOLS[name];
    const hasHandler = typeof tool.handler === 'function';
    const hasSchema = tool.inputSchema && tool.inputSchema.type === 'object';
    console.log(`   ✓ ${name}: handler=${hasHandler}, schema=${hasSchema}`);
  });
  checks.push({ name: 'Tool definitions', passed: toolNames.length >= 7 });
  console.log();

  // ─────────────────────────────────────────────────────────────────────────
  // Check 1b: svg_theme — List + fetch theme
  // ─────────────────────────────────────────────────────────────────────────
  console.log('1b. svg_theme — Theme Registry');
  console.log('───────────────────────────────────────────────────────────────');

  const themeList = await svg_theme({ action: 'list' });
  console.log(`   Success: ${themeList.success}`);
  console.log(`   Default: ${themeList.defaultTheme}`);
  console.log(`   Available: ${Array.isArray(themeList.themes) ? themeList.themes.join(', ') : 'none'}`);
  checks.push({ name: 'svg_theme list', passed: themeList.success === true && Array.isArray(themeList.themes) });

  const targetTheme = (themeList.themes && themeList.themes[0]) || 'obsidian';
  const themeGet = await svg_theme({ action: 'get', name: targetTheme });
  console.log(`   Loaded: ${themeGet.theme?.name}`);
  console.log(`   Svg palette keys: ${themeGet.theme ? Object.keys(themeGet.theme.svg || {}).join(', ') : 'none'}`);
  checks.push({ name: 'svg_theme get', passed: themeGet.success === true && !!themeGet.theme });
  console.log();
  
  // ─────────────────────────────────────────────────────────────────────────
  // Check 2: svg_create — Generate new SVG
  // ─────────────────────────────────────────────────────────────────────────
  console.log('2. svg_create — Generate New SVG');
  console.log('───────────────────────────────────────────────────────────────');
  
  const createResult = await svg_create({
    output: TEST_SVG,
    plan: {
      viewBox: { width: 400, height: 300 },
      background: '#f8f9fa',
      layers: [
        {
          id: 'shapes',
          elements: [
            { t: 'rect', id: 'box1', x: 50, y: 50, w: 100, h: 60, fill: '#3498db' },
            { t: 'rect', id: 'box2', x: 200, y: 50, w: 100, h: 60, fill: '#e74c3c' }
          ]
        },
        {
          id: 'labels',
          elements: [
            { t: 'text', id: 'label1', x: 100, y: 85, text: 'Box A', anchor: 'middle', fill: 'white' },
            { t: 'text', id: 'label2', x: 250, y: 85, text: 'Box B', anchor: 'middle', fill: 'white' }
          ]
        }
      ]
    }
  });
  
  console.log(`   Success: ${createResult.success}`);
  console.log(`   Output: ${createResult.output}`);
  console.log(`   Layers: ${createResult.layerCount}`);
  checks.push({ name: 'svg_create', passed: createResult.success && fs.existsSync(TEST_SVG) });
  console.log();
  
  // ─────────────────────────────────────────────────────────────────────────
  // Check 3: svg_query — Index elements
  // ─────────────────────────────────────────────────────────────────────────
  console.log('3. svg_query — Index Elements');
  console.log('───────────────────────────────────────────────────────────────');
  
  const indexResult = await svg_query({
    file: TEST_SVG,
    action: 'index'
  });
  
  console.log(`   Success: ${indexResult.success}`);
  console.log(`   Total elements: ${indexResult.totalElements}`);
  console.log(`   By tag: ${JSON.stringify(indexResult.byTag)}`);
  
  // Show some elements
  if (indexResult.elements) {
    console.log(`   Sample elements:`);
    indexResult.elements.slice(0, 5).forEach(el => {
      console.log(`     - ${el.tagName}${el.id ? '#' + el.id : ''} hash=${el.hash}`);
    });
  }
  checks.push({ name: 'svg_query index', passed: indexResult.success && indexResult.totalElements > 0 });
  console.log();
  
  // ─────────────────────────────────────────────────────────────────────────
  // Check 4: svg_query — Find specific element
  // ─────────────────────────────────────────────────────────────────────────
  console.log('4. svg_query — Find Element');
  console.log('───────────────────────────────────────────────────────────────');
  
  const findResult = await svg_query({
    file: TEST_SVG,
    action: 'find',
    selector: '#box1'
  });
  
  console.log(`   Success: ${findResult.success}`);
  console.log(`   Found: ${findResult.found}`);
  if (findResult.found) {
    console.log(`   Tag: ${findResult.tagName}`);
    console.log(`   Hash: ${findResult.hash}`);
    console.log(`   Path: ${findResult.pathSignature}`);
  }
  checks.push({ name: 'svg_query find', passed: findResult.success && findResult.found });
  console.log();
  
  // ─────────────────────────────────────────────────────────────────────────
  // Check 5: svg_edit — Set attributes with guard
  // ─────────────────────────────────────────────────────────────────────────
  console.log('5. svg_edit — Set Attributes (Guarded)');
  console.log('───────────────────────────────────────────────────────────────');
  
  // First locate to get hash
  const locateResult = await locateElement(TEST_SVG, '#box1');
  console.log(`   Located hash: ${locateResult.hash}`);
  
  const editResult = await svg_edit({
    file: TEST_SVG,
    selector: '#box1',
    action: 'set',
    attrs: { fill: '#27ae60', 'stroke-width': '2' },
    expectHash: locateResult.hash,
    dryRun: false
  });
  
  console.log(`   Success: ${editResult.success}`);
  console.log(`   Dry run: ${editResult.dryRun}`);
  if (editResult.after) {
    console.log(`   New hash: ${editResult.after.hash}`);
  }
  checks.push({ name: 'svg_edit set', passed: editResult.success });
  console.log();
  
  // ─────────────────────────────────────────────────────────────────────────
  // Check 6: svg_edit — Hash mismatch guard
  // ─────────────────────────────────────────────────────────────────────────
  console.log('6. svg_edit — Hash Mismatch Guard');
  console.log('───────────────────────────────────────────────────────────────');
  
  const guardResult = await svg_edit({
    file: TEST_SVG,
    selector: '#box1',
    action: 'set',
    attrs: { fill: '#9b59b6' },
    expectHash: 'wrong-hash-123',
    dryRun: true
  });
  
  console.log(`   Success: ${guardResult.success}`);
  console.log(`   Error: ${guardResult.error}`);
  console.log(`   Message: ${guardResult.message}`);
  checks.push({ name: 'Guard hash mismatch', passed: !guardResult.success && guardResult.error === 'HASH_MISMATCH' });
  console.log();
  
  // ─────────────────────────────────────────────────────────────────────────
  // Check 7: svg_stamp — Add template instances
  // ─────────────────────────────────────────────────────────────────────────
  console.log('7. svg_stamp — Template Instances');
  console.log('───────────────────────────────────────────────────────────────');
  
  const stampResult = await svg_stamp({
    file: TEST_SVG,
    template: 'badge',
    instances: [
      { text: 'OK', x: 50, y: 150, bgColor: '#27ae60' },
      { text: 'WARN', x: 150, y: 150, bgColor: '#f39c12' },
      { text: 'ERR', x: 250, y: 150, bgColor: '#e74c3c' }
    ],
    dryRun: false
  });
  
  console.log(`   Success: ${stampResult.success}`);
  console.log(`   Template: ${stampResult.template}`);
  console.log(`   Count: ${stampResult.count}`);
  checks.push({ name: 'svg_stamp', passed: stampResult.success && stampResult.count === 3 });
  console.log();
  
  // ─────────────────────────────────────────────────────────────────────────
  // Check 8: svg_batch — Multiple operations
  // ─────────────────────────────────────────────────────────────────────────
  console.log('8. svg_batch — Multiple Operations');
  console.log('───────────────────────────────────────────────────────────────');
  
  const batchResult = await svg_batch({
    file: TEST_SVG,
    operations: [
      { op: 'set', selector: '#box2', attrs: { opacity: '0.8' } },
      { op: 'insert', elements: [
        { t: 'line', x1: 150, y1: 80, x2: 200, y2: 80, stroke: '#333', sw: 2 }
      ]},
      { op: 'move', selector: '#label2', by: { x: 0, y: 5 } }
    ],
    atomic: true,
    dryRun: false
  });
  
  console.log(`   Success: ${batchResult.success}`);
  console.log(`   Summary: ${JSON.stringify(batchResult.summary)}`);
  if (batchResult.results) {
    batchResult.results.forEach(r => {
      console.log(`     - Op ${r.index}: ${r.op} ✓`);
    });
  }
  checks.push({ name: 'svg_batch', passed: batchResult.success });
  console.log();
  
  // ─────────────────────────────────────────────────────────────────────────
  // Check 9: svg_query — Positions (Puppeteer-based)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('9. svg_query — Positions (Puppeteer)');
  console.log('───────────────────────────────────────────────────────────────');
  
  const posResult = await svg_query({
    file: TEST_SVG,
    action: 'positions'
  });
  
  console.log(`   Success: ${posResult.success}`);
  console.log(`   Elements with positions: ${posResult.elements?.length || 0}`);
  if (posResult.elements?.length > 0) {
    const sample = posResult.elements[0];
    console.log(`   Sample: ${sample.tagName} at (${sample.absolutePosition?.x}, ${sample.absolutePosition?.y})`);
  }
  checks.push({ name: 'svg_query positions', passed: posResult.success && posResult.elements?.length > 0 });
  console.log();
  
  // ─────────────────────────────────────────────────────────────────────────
  // Check 10: svg_query — Collisions
  // ─────────────────────────────────────────────────────────────────────────
  console.log('10. svg_query — Collisions');
  console.log('───────────────────────────────────────────────────────────────');
  
  const collResult = await svg_query({
    file: TEST_SVG,
    action: 'collisions'
  });
  
  console.log(`   Success: ${collResult.success}`);
  console.log(`   Total elements: ${collResult.totalElements}`);
  console.log(`   Summary: ${JSON.stringify(collResult.summary)}`);
  checks.push({ name: 'svg_query collisions', passed: collResult.success });
  console.log();
  
  // ─────────────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const passed = checks.filter(c => c.passed).length;
  const failed = checks.filter(c => !c.passed).length;
  
  checks.forEach(c => {
    console.log(`   ${c.passed ? '✓' : '✗'} ${c.name}`);
  });
  
  console.log();
  console.log(`   Passed: ${passed}/${checks.length}`);
  console.log(`   Failed: ${failed}`);
  console.log();
  
  if (failed === 0) {
    console.log('   ✅ All checks passed!');
    console.log(`   Test SVG saved to: ${TEST_SVG}`);
  } else {
    console.log('   ❌ Some checks failed');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
