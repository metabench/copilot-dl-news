'use strict';

/**
 * Check script for DownloadHistoryChart control
 * 
 * Validates:
 * 1. Control instantiates without error
 * 2. SVG renders with expected structure
 * 3. Summary stats are computed correctly
 * 
 * Usage: node src/ui/server/analyticsHub/checks/download-history-chart.check.js
 */

const path = require('path');
const Database = require('better-sqlite3');
const jsgui = require('jsgui3-html');

const { DownloadHistoryChart, getDailyDownloads } = require('../controls/DownloadHistoryChart');

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'news.db');

function check() {
  console.log('🔍 DownloadHistoryChart Check\n');
  
  const errors = [];
  const db = new Database(DB_PATH, { readonly: true });
  
  try {
    // Test 1: getDailyDownloads function
    console.log('1. Testing getDailyDownloads()...');
    const data = getDailyDownloads(db, 128);
    
    if (!Array.isArray(data)) {
      errors.push('getDailyDownloads did not return an array');
    } else {
      console.log(`   ✓ Retrieved ${data.length} days of data`);
      
      if (data.length > 0) {
        const last = data[data.length - 1];
        const today = new Date().toISOString().split('T')[0];
        if (last.day !== today) {
          errors.push(`Last day is ${last.day}, expected ${today}`);
        } else {
          console.log(`   ✓ Last day is today (${today})`);
        }
        
        if (typeof last.cumulative !== 'number') {
          errors.push('cumulative should be a number');
        } else {
          console.log(`   ✓ Cumulative total: ${last.cumulative.toLocaleString()}`);
        }
      }
    }
    
    // Test 2: Control instantiation with data
    console.log('\n2. Testing control instantiation...');
    const ctx = new jsgui.Page_Context();
    const chart = new DownloadHistoryChart({
      context: ctx,
      data,
      days: 128,
      title: 'Test Chart',
      wlilo: true
    });
    
    if (!chart) {
      errors.push('Control did not instantiate');
    } else {
      console.log('   ✓ Control instantiated successfully');
    }
    
    // Test 3: Render HTML
    console.log('\n3. Testing HTML render...');
    const html = chart.all_html_render();
    
    if (!html || html.length < 100) {
      errors.push('Rendered HTML is too short');
    } else {
      console.log(`   ✓ Rendered ${html.length} bytes of HTML`);
    }
    
    if (!html.includes('download-history-chart')) {
      errors.push('Missing download-history-chart class');
    } else {
      console.log('   ✓ Contains download-history-chart class');
    }
    
    if (!html.includes('<svg')) {
      errors.push('Missing SVG element');
    } else {
      console.log('   ✓ Contains SVG element');
    }
    
    if (!html.includes('dlc-todayGrad')) {
      errors.push('Missing today gradient (WLILO theme)');
    } else {
      console.log('   ✓ Contains WLILO theme gradients');
    }
    
    // Test 4: Control with db parameter
    console.log('\n4. Testing control with db parameter...');
    const chartWithDb = new DownloadHistoryChart({
      context: ctx,
      db,
      days: 30,
      title: 'DB Chart'
    });
    
    const dbHtml = chartWithDb.all_html_render();
    if (!dbHtml.includes('<svg')) {
      errors.push('DB-sourced chart missing SVG');
    } else {
      console.log('   ✓ DB-sourced chart renders correctly');
    }
    
    // Test 5: Empty data handling
    console.log('\n5. Testing empty data handling...');
    const emptyChart = new DownloadHistoryChart({
      context: ctx,
      data: [],
      days: 128
    });
    const emptyHtml = emptyChart.all_html_render();
    if (!emptyHtml.includes('No download data')) {
      errors.push('Empty chart should show "No download data" message');
    } else {
      console.log('   ✓ Empty chart displays appropriate message');
    }
    
  } finally {
    db.close();
  }
  
  // Summary
  console.log('\n' + '─'.repeat(50));
  if (errors.length > 0) {
    console.log(`\n❌ ${errors.length} error(s):`);
    errors.forEach(e => console.log(`   • ${e}`));
    process.exit(1);
  } else {
    console.log('\n✅ All checks passed!');
    process.exit(0);
  }
}

check();
