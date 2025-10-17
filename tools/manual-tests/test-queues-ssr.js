/**
 * Test script to verify queues SSR implementation
 * Tests without killing the background server
 */

const http = require('http');

async function testEndpoint(port, path) {
  return new Promise((resolve, reject) => {
    http.get({
      hostname: 'localhost',
      port,
      path,
      timeout: 5000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data,
          bodyLength: data.length
        });
      });
    }).on('error', reject).on('timeout', () => reject(new Error('Timeout')));
  });
}

async function runTests() {
  const port = 41001; // Server is on this port
  
  console.log('🧪 Testing Queues SSR Implementation\n');
  
  // Test 1: SSR endpoint
  console.log('1️⃣  Testing /queues/ssr endpoint...');
  try {
    const result = await testEndpoint(port, '/queues/ssr');
    console.log(`   Status: ${result.status}`);
    console.log(`   Content-Type: ${result.headers['content-type']}`);
    console.log(`   Body length: ${result.bodyLength} bytes`);
    
    // Check for our new elements
    const hasDataJsguiId = result.body.includes('data-jsgui-id');
    const hasEnhancerScript = result.body.includes('/js/queues-enhancer.js');
    const hasTable = result.body.includes('queues-table');
    
    console.log(`   ✓ Has data-jsgui-id: ${hasDataJsguiId}`);
    console.log(`   ✓ Has enhancer script: ${hasEnhancerScript}`);
    console.log(`   ✓ Has queues table: ${hasTable}`);
    
    if (result.status === 200 && hasDataJsguiId && hasEnhancerScript) {
      console.log('   ✅ SSR endpoint working correctly!\n');
    } else {
      console.log('   ⚠️  Some checks failed\n');
    }
  } catch (err) {
    console.log(`   ❌ Failed: ${err.message}\n`);
  }
  
  // Test 2: Enhancement script
  console.log('2️⃣  Testing /js/queues-enhancer.js...');
  try {
    const result = await testEndpoint(port, '/js/queues-enhancer.js');
    console.log(`   Status: ${result.status}`);
    console.log(`   Content-Type: ${result.headers['content-type']}`);
    console.log(`   Body length: ${result.bodyLength} bytes`);
    
    const hasActivators = result.body.includes('COMPONENT_ACTIVATORS');
    const hasScanFunction = result.body.includes('scanAndActivate');
    
    console.log(`   ✓ Has COMPONENT_ACTIVATORS: ${hasActivators}`);
    console.log(`   ✓ Has scanAndActivate: ${hasScanFunction}`);
    
    if (result.status === 200 && hasActivators && hasScanFunction) {
      console.log('   ✅ Enhancement script available!\n');
    } else {
      console.log('   ⚠️  Some checks failed\n');
    }
  } catch (err) {
    console.log(`   ❌ Failed: ${err.message}\n`);
  }
  
  // Test 3: Check for isomorphic pattern
  console.log('3️⃣  Checking isomorphic rendering pattern...');
  try {
    const result = await testEndpoint(port, '/queues/ssr');
    
    // Look for our GUIDs
    const ssrPrefix = result.body.match(/data-jsgui-id="ssr-/g);
    const rowIds = result.body.match(/data-jsgui-id="ssr-queue-row-/g);
    
    console.log(`   ✓ SSR-prefixed components: ${ssrPrefix ? ssrPrefix.length : 0}`);
    console.log(`   ✓ Queue row components: ${rowIds ? rowIds.length : 0}`);
    
    if (ssrPrefix && ssrPrefix.length > 0) {
      console.log('   ✅ Isomorphic pattern implemented!\n');
    } else {
      console.log('   ⚠️  SSR prefix not found\n');
    }
  } catch (err) {
    console.log(`   ❌ Failed: ${err.message}\n`);
  }
  
  console.log('✅ All tests complete!');
  console.log('\n💡 Server is still running on port 41001');
  console.log('   Open http://localhost:41001/queues/ssr in your browser');
}

runTests().catch(console.error);
