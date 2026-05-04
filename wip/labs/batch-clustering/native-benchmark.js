/**
 * Batch Clustering Lab - Native Addon Benchmark
 * 
 * Compares JavaScript vs C++ native module performance for:
 * 1. Single Hamming distance
 * 2. Batch Hamming distances
 * 3. Find all similar pairs
 * 4. Full clustering workflow
 * 
 * Run: node labs/batch-clustering/native-benchmark.js
 * 
 * Prerequisites:
 *   cd src/native/sigcluster
 *   npm install
 *   npm run build
 */

const crypto = require('crypto');
const path = require('path');

// Try to load native module
let sigcluster;
let nativeAvailable = false;

try {
    sigcluster = require('../../src/native/sigcluster');
    nativeAvailable = sigcluster.isAvailable();
    if (!nativeAvailable) {
        console.log('Native module failed to load:', sigcluster.getLoadError()?.message);
    }
} catch (e) {
    console.log('Could not load sigcluster module:', e.message);
    // Provide inline fallbacks
    sigcluster = {
        hammingJS(a, b) {
            let dist = 0;
            for (let i = 0; i < a.length; i++) {
                let xor = a[i] ^ b[i];
                while (xor) { dist += xor & 1; xor >>= 1; }
            }
            return dist;
        },
        batchHammingJS(target, sigs) {
            const d = new Uint32Array(sigs.length);
            for (let i = 0; i < sigs.length; i++) d[i] = this.hammingJS(target, sigs[i]);
            return d;
        },
        findSimilarPairsJS(sigs, threshold) {
            const pairs = [];
            for (let i = 0; i < sigs.length; i++) {
                for (let j = i + 1; j < sigs.length; j++) {
                    const d = this.hammingJS(sigs[i], sigs[j]);
                    if (d <= threshold) pairs.push({ i, j, dist: d });
                }
            }
            return pairs;
        }
    };
}

// Helpers
function generateSignature(bits) {
    return crypto.randomBytes(bits / 8);
}

function formatNum(n) {
    return n.toLocaleString();
}

function formatRate(pairs, ms) {
    return (pairs / ms / 1000).toFixed(1) + 'M/s';
}

// Union-Find for clustering
class UnionFind {
    constructor(n) {
        this.parent = new Int32Array(n);
        this.rank = new Uint8Array(n);
        for (let i = 0; i < n; i++) this.parent[i] = i;
    }
    find(x) {
        if (this.parent[x] !== x) this.parent[x] = this.find(this.parent[x]);
        return this.parent[x];
    }
    union(x, y) {
        const px = this.find(x), py = this.find(y);
        if (px === py) return false;
        if (this.rank[px] < this.rank[py]) this.parent[px] = py;
        else if (this.rank[px] > this.rank[py]) this.parent[py] = px;
        else { this.parent[py] = px; this.rank[px]++; }
        return true;
    }
}

function clusterFromPairs(n, pairs) {
    const uf = new UnionFind(n);
    for (const { i, j } of pairs) uf.union(i, j);
    
    const clusters = new Map();
    const assignments = new Int32Array(n);
    for (let i = 0; i < n; i++) {
        const root = uf.find(i);
        if (!clusters.has(root)) clusters.set(root, clusters.size);
        assignments[i] = clusters.get(root);
    }
    return { assignments, clusterCount: clusters.size };
}

// Benchmarks
console.log('='.repeat(70));
console.log('NATIVE ADDON BENCHMARK: JavaScript vs C++ Hamming Distance');
console.log('='.repeat(70));
console.log(`\nNative module available: ${nativeAvailable ? '✓ YES' : '✗ NO (using JS fallback)'}`);
if (!nativeAvailable) {
    console.log('\nTo build native module:');
    console.log('  cd src/native/sigcluster');
    console.log('  npm install');
    console.log('  npm run build');
}

// Benchmark 1: Single distance (micro)
console.log('\n' + '-'.repeat(70));
console.log('BENCHMARK 1: Single Hamming Distance (1M iterations)');
console.log('-'.repeat(70));

for (const bits of [64, 128, 256, 512]) {
    const a = generateSignature(bits);
    const b = generateSignature(bits);
    const iterations = 1_000_000;
    
    // Warm up
    for (let i = 0; i < 1000; i++) sigcluster.hammingJS(a, b);
    
    // JS benchmark
    const startJS = Date.now();
    let sumJS = 0;
    for (let i = 0; i < iterations; i++) sumJS += sigcluster.hammingJS(a, b);
    const timeJS = Date.now() - startJS;
    
    let timeNative = 0;
    let speedup = 'N/A';
    
    if (nativeAvailable) {
        // Native benchmark
        for (let i = 0; i < 1000; i++) sigcluster.hamming(a, b);
        const startNative = Date.now();
        let sumNative = 0;
        for (let i = 0; i < iterations; i++) sumNative += sigcluster.hamming(a, b);
        timeNative = Date.now() - startNative;
        speedup = (timeJS / timeNative).toFixed(1) + 'x';
    }
    
    console.log(`  ${bits}-bit: JS=${timeJS}ms, Native=${timeNative || 'N/A'}ms, Speedup=${speedup}`);
}

// Benchmark 2: Batch distance
console.log('\n' + '-'.repeat(70));
console.log('BENCHMARK 2: Batch Distance (target vs N signatures)');
console.log('-'.repeat(70));

for (const n of [1000, 10000, 50000]) {
    const bits = 128;
    const target = generateSignature(bits);
    const signatures = Array.from({ length: n }, () => generateSignature(bits));
    
    // JS
    const startJS = Date.now();
    const distJS = sigcluster.batchHammingJS(target, signatures);
    const timeJS = Date.now() - startJS;
    
    let timeNative = 0;
    let speedup = 'N/A';
    
    if (nativeAvailable) {
        const startNative = Date.now();
        const distNative = sigcluster.batchHamming(target, signatures);
        timeNative = Date.now() - startNative;
        speedup = timeJS > 0 ? (timeJS / Math.max(1, timeNative)).toFixed(1) + 'x' : 'N/A';
    }
    
    console.log(`  N=${formatNum(n).padStart(6)}: JS=${timeJS}ms, Native=${timeNative || 'N/A'}ms, Speedup=${speedup}`);
}

// Benchmark 3: All-pairs distance (N² complexity)
console.log('\n' + '-'.repeat(70));
console.log('BENCHMARK 3: Find Similar Pairs (N² all-pairs comparison)');
console.log('-'.repeat(70));

const benchResults = [];

for (const n of [500, 1000, 2000]) {
    const bits = 128;
    const threshold = 20;
    const signatures = Array.from({ length: n }, () => generateSignature(bits));
    const totalPairs = (n * (n - 1)) / 2;
    
    // JS
    const startJS = Date.now();
    const pairsJS = sigcluster.findSimilarPairsJS(signatures, threshold);
    const timeJS = Date.now() - startJS;
    const rateJS = formatRate(totalPairs, timeJS);
    
    let timeNative = 0;
    let rateNative = 'N/A';
    let speedup = 'N/A';
    let pairsNative = [];
    
    if (nativeAvailable) {
        const startNative = Date.now();
        pairsNative = sigcluster.findSimilarPairs(signatures, threshold);
        timeNative = Date.now() - startNative;
        rateNative = formatRate(totalPairs, timeNative);
        speedup = (timeJS / Math.max(1, timeNative)).toFixed(1) + 'x';
    }
    
    console.log(`  N=${formatNum(n).padStart(5)} (${formatNum(totalPairs).padStart(10)} pairs):`);
    console.log(`    JS:     ${timeJS.toString().padStart(5)}ms, ${rateJS.padStart(8)}, found ${pairsJS.length} similar`);
    if (nativeAvailable) {
        console.log(`    Native: ${timeNative.toString().padStart(5)}ms, ${rateNative.padStart(8)}, found ${pairsNative.length} similar`);
        console.log(`    Speedup: ${speedup}`);
    }
    
    benchResults.push({ n, bits, totalPairs, timeJS, timeNative, pairsFound: pairsJS.length });
}

// Benchmark 4: Full clustering workflow
console.log('\n' + '-'.repeat(70));
console.log('BENCHMARK 4: Full Clustering Workflow');
console.log('-'.repeat(70));

{
    const n = 2000;
    const bits = 128;
    const threshold = 20;
    
    console.log(`  Generating ${n} × ${bits}-bit signatures...`);
    const signatures = Array.from({ length: n }, () => generateSignature(bits));
    const totalPairs = (n * (n - 1)) / 2;
    
    // JS workflow
    console.log('\n  === JavaScript Workflow ===');
    let startTotal = Date.now();
    
    let start = Date.now();
    const pairsJS = sigcluster.findSimilarPairsJS(signatures, threshold);
    const timeFindJS = Date.now() - start;
    
    start = Date.now();
    const { assignments: assignJS, clusterCount: countJS } = clusterFromPairs(n, pairsJS);
    const timeClusterJS = Date.now() - start;
    
    const totalJS = Date.now() - startTotal;
    
    console.log(`    Find pairs:  ${timeFindJS}ms (${formatRate(totalPairs, timeFindJS)})`);
    console.log(`    Clustering:  ${timeClusterJS}ms`);
    console.log(`    Total:       ${totalJS}ms`);
    console.log(`    Clusters:    ${countJS} from ${pairsJS.length} edges`);
    
    if (nativeAvailable) {
        console.log('\n  === Native C++ Workflow ===');
        startTotal = Date.now();
        
        start = Date.now();
        const pairsNative = sigcluster.findSimilarPairs(signatures, threshold);
        const timeFindNative = Date.now() - start;
        
        start = Date.now();
        const { assignments: assignNative, clusterCount: countNative } = clusterFromPairs(n, pairsNative);
        const timeClusterNative = Date.now() - start;
        
        const totalNative = Date.now() - startTotal;
        
        console.log(`    Find pairs:  ${timeFindNative}ms (${formatRate(totalPairs, timeFindNative)})`);
        console.log(`    Clustering:  ${timeClusterNative}ms`);
        console.log(`    Total:       ${totalNative}ms`);
        console.log(`    Clusters:    ${countNative} from ${pairsNative.length} edges`);
        
        console.log('\n  === Summary ===');
        console.log(`    Find pairs speedup: ${(timeFindJS / Math.max(1, timeFindNative)).toFixed(1)}x`);
        console.log(`    Total speedup:      ${(totalJS / Math.max(1, totalNative)).toFixed(1)}x`);
    }
}

// Final summary
console.log('\n' + '='.repeat(70));
console.log('BENCHMARK SUMMARY');
console.log('='.repeat(70));

if (nativeAvailable) {
    console.log('\n✓ Native C++ addon is working!');
    console.log(`  Threads available: ${sigcluster.getThreadCount()}`);
    
    // Multi-threaded scaling test
    const maxThreads = sigcluster.getThreadCount();
    if (maxThreads > 1) {
        console.log('\n' + '-'.repeat(70));
        console.log('BENCHMARK 5: Multi-threaded Scaling');
        console.log('-'.repeat(70));
        
        const n = 3000;
        const bits = 128;
        const threshold = 20;
        const signatures = Array.from({ length: n }, () => generateSignature(bits));
        const totalPairs = (n * (n - 1)) / 2;
        
        console.log(`  N=${n}, ${totalPairs.toLocaleString()} pairs, testing thread counts 1-${maxThreads}`);
        
        const threadResults = [];
        for (let threads = 1; threads <= maxThreads; threads++) {
            sigcluster.setThreadCount(threads);
            
            // Warm up
            sigcluster.findSimilarPairs(signatures.slice(0, 100), threshold);
            
            const start = Date.now();
            sigcluster.findSimilarPairs(signatures, threshold);
            const time = Date.now() - start;
            const rate = totalPairs / time / 1000;
            
            threadResults.push({ threads, time, rate });
            console.log(`  ${threads} thread${threads > 1 ? 's' : ' '}: ${time}ms, ${rate.toFixed(1)}M pairs/sec`);
        }
        
        // Calculate scaling efficiency
        const singleThreadTime = threadResults[0].time;
        const maxThreadTime = threadResults[threadResults.length - 1].time;
        const idealSpeedup = maxThreads;
        const actualSpeedup = singleThreadTime / maxThreadTime;
        const efficiency = (actualSpeedup / idealSpeedup * 100).toFixed(0);
        
        console.log(`\n  Scaling summary:`);
        console.log(`    Single-threaded: ${singleThreadTime}ms`);
        console.log(`    ${maxThreads} threads:      ${maxThreadTime}ms`);
        console.log(`    Speedup:         ${actualSpeedup.toFixed(1)}x (ideal: ${idealSpeedup}x)`);
        console.log(`    Efficiency:      ${efficiency}%`);
        
        // Reset to max threads
        sigcluster.setThreadCount(maxThreads);
    }
    
    console.log('\nExpected speedups with SIMD + OpenMP:');
    console.log('  - Single distance: 2-5x faster (SIMD)');
    console.log('  - Batch operations: 5-20x faster (SIMD)');
    console.log('  - All-pairs: 50-200x faster (SIMD × threads)');
    console.log('  - Full workflow: 20-100x faster');
} else {
    console.log('\n✗ Native module not available');
    console.log('\nTo enable native acceleration:');
    console.log('  cd src/native/sigcluster');
    console.log('  npm install');
    console.log('  npm run build');
    console.log('\nPrerequisites:');
    console.log('  - node-gyp (npm install -g node-gyp)');
    console.log('  - C++ compiler (MSVC on Windows, gcc/clang on Linux/Mac)');
    console.log('  - Python 3.x (for node-gyp)');
}

console.log('\n' + '='.repeat(70));
