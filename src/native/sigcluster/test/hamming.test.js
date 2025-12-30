/**
 * Test harness for sigcluster native module
 * 
 * Run: node test/hamming.test.js
 * Or after building: npm test
 */

const crypto = require('crypto');
const path = require('path');

// Load module from parent directory
const sigcluster = require('..');

console.log('='.repeat(60));
console.log('SIGCLUSTER NATIVE MODULE TESTS');
console.log('='.repeat(60));

// Check if native is available
console.log(`\nNative module available: ${sigcluster.isAvailable()}`);
if (!sigcluster.isAvailable()) {
    console.log(`Load error: ${sigcluster.getLoadError()?.message}`);
    console.log('\nRunning tests with JS fallback only...\n');
}

// Test helpers
function generateSignature(bits) {
    return crypto.randomBytes(bits / 8);
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(`ASSERTION FAILED: ${message}`);
    }
    console.log(`  ✓ ${message}`);
}

// Test 1: Basic Hamming distance
console.log('\n1. Basic Hamming Distance');
{
    const a = Buffer.from([0b11110000, 0b10101010]);
    const b = Buffer.from([0b11110000, 0b10101010]);
    const c = Buffer.from([0b00001111, 0b01010101]);
    
    const distAB_JS = sigcluster.hammingJS(a, b);
    const distAC_JS = sigcluster.hammingJS(a, c);
    
    assert(distAB_JS === 0, `Identical buffers: distance = ${distAB_JS} (expected 0)`);
    assert(distAC_JS === 16, `Opposite buffers: distance = ${distAC_JS} (expected 16)`);
    
    if (sigcluster.isAvailable()) {
        const distAB = sigcluster.hamming(a, b);
        const distAC = sigcluster.hamming(a, c);
        assert(distAB === 0, `Native: Identical buffers: distance = ${distAB}`);
        assert(distAC === 16, `Native: Opposite buffers: distance = ${distAC}`);
    }
}

// Test 2: Various signature sizes
console.log('\n2. Signature Size Tests');
for (const bits of [64, 128, 256, 512]) {
    const a = generateSignature(bits);
    const b = generateSignature(bits);
    
    const distJS = sigcluster.hammingJS(a, b);
    assert(distJS >= 0 && distJS <= bits, `${bits}-bit: JS distance = ${distJS} (range 0-${bits})`);
    
    if (sigcluster.isAvailable()) {
        const distNative = sigcluster.hamming(a, b);
        assert(distJS === distNative, `${bits}-bit: Native matches JS (${distNative})`);
    }
}

// Test 3: Batch Hamming
console.log('\n3. Batch Hamming Distance');
{
    const target = generateSignature(128);
    const signatures = Array.from({ length: 100 }, () => generateSignature(128));
    
    const startJS = Date.now();
    const distancesJS = sigcluster.batchHammingJS(target, signatures);
    const timeJS = Date.now() - startJS;
    
    assert(distancesJS.length === 100, `JS batch: ${distancesJS.length} distances computed`);
    console.log(`  Time: ${timeJS}ms`);
    
    if (sigcluster.isAvailable()) {
        const startNative = Date.now();
        const distancesNative = sigcluster.batchHamming(target, signatures);
        const timeNative = Date.now() - startNative;
        
        assert(distancesNative.length === 100, `Native batch: ${distancesNative.length} distances`);
        console.log(`  Native time: ${timeNative}ms`);
        
        // Verify results match
        let match = true;
        for (let i = 0; i < 100; i++) {
            if (distancesJS[i] !== distancesNative[i]) {
                match = false;
                break;
            }
        }
        assert(match, 'Native results match JS results');
    }
}

// Test 4: Find similar pairs
console.log('\n4. Find Similar Pairs');
{
    // Create some signatures with known similarities
    const base = generateSignature(64);
    const similar1 = Buffer.from(base);
    similar1[0] ^= 0x03;  // Flip 2 bits
    const similar2 = Buffer.from(base);
    similar2[1] ^= 0x07;  // Flip 3 bits
    const different = generateSignature(64);
    
    const signatures = [base, similar1, similar2, different];
    
    const pairsJS = sigcluster.findSimilarPairsJS(signatures, 5);
    console.log(`  JS found ${pairsJS.length} pairs with threshold ≤ 5`);
    
    // Should find pairs (0,1), (0,2), maybe (1,2)
    assert(pairsJS.length >= 2, `Found at least 2 similar pairs`);
    
    if (sigcluster.isAvailable()) {
        const pairsNative = sigcluster.findSimilarPairs(signatures, 5);
        console.log(`  Native found ${pairsNative.length} pairs`);
        assert(pairsNative.length === pairsJS.length, 'Native finds same number of pairs');
    }
}

// Test 5: Performance benchmark
console.log('\n5. Performance Benchmark');
{
    const N = 1000;
    const bits = 128;
    const threshold = 20;
    
    console.log(`  Generating ${N} × ${bits}-bit signatures...`);
    const signatures = Array.from({ length: N }, () => generateSignature(bits));
    const pairs = (N * (N - 1)) / 2;
    
    // JS benchmark
    console.log(`  Computing ${pairs.toLocaleString()} pairwise distances (JS)...`);
    const startJS = Date.now();
    const pairsJS = sigcluster.findSimilarPairsJS(signatures, threshold);
    const timeJS = Date.now() - startJS;
    const rateJS = pairs / timeJS / 1000;
    
    console.log(`  JS: ${timeJS}ms, ${rateJS.toFixed(1)}M pairs/sec, found ${pairsJS.length} pairs`);
    
    if (sigcluster.isAvailable()) {
        console.log(`  Computing ${pairs.toLocaleString()} pairwise distances (Native)...`);
        const startNative = Date.now();
        const pairsNative = sigcluster.findSimilarPairs(signatures, threshold);
        const timeNative = Date.now() - startNative;
        const rateNative = pairs / timeNative / 1000;
        
        console.log(`  Native: ${timeNative}ms, ${rateNative.toFixed(1)}M pairs/sec, found ${pairsNative.length} pairs`);
        
        const speedup = timeJS / timeNative;
        console.log(`\n  ⚡ SPEEDUP: ${speedup.toFixed(1)}x faster with native module`);
    }
}

console.log('\n' + '='.repeat(60));
console.log('ALL TESTS PASSED');
console.log('='.repeat(60));
