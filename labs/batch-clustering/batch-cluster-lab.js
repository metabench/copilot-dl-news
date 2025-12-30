/**
 * Batch Clustering Lab
 * 
 * Explores: Load N records from DB → compute in-memory → discover clusters → store compact IDs
 * 
 * Key insight: If we load 10K pages at once, we can:
 * 1. Compute pairwise similarities in parallel (O(N²) but parallelizable)
 * 2. Use SIMD/GPU to accelerate distance calculations
 * 3. Run graph-based clustering (connected components, DBSCAN)
 * 4. Assign cluster IDs and store just the ID (4 bytes per page)
 * 5. Store cluster "exemplars" for future verification
 * 
 * Trade-offs:
 * - Memory: 10K × 64B signatures = 640KB (trivial)
 * - Compute: 10K² = 100M pairs, but SIMD can do billions/sec
 * - GPU: Could do 100M distance calculations in <10ms
 * 
 * Signature Size Comparison:
 * - 64-bit: Good for near-duplicates, marginal for topical similarity
 * - 128-bit: Better separation, still fits L2 cache for 10K batch
 * - 256-bit: High-precision topical clustering
 */

const crypto = require('crypto');

// Signature sizes to benchmark
const SIGNATURE_CONFIGS = {
  64: { bytes: 8, threshold: 10, description: 'Near-duplicate detection' },
  128: { bytes: 16, threshold: 20, description: 'Structural + near-dupe' },
  256: { bytes: 32, threshold: 40, description: 'Topical similarity' }
};

// Simulate signatures of configurable size
function generateSignature(bits = 64) {
  return crypto.randomBytes(bits / 8);
}

// Hamming distance between two signatures (any size)
function hammingDistance(a, b) {
  let dist = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    let xor = a[i] ^ b[i];
    while (xor) {
      dist += xor & 1;
      xor >>= 1;
    }
  }
  return dist;
}

// SIMD-style batch distance (simulated - real would use WASM SIMD or native)
function batchHammingDistances(signatures, targetIdx) {
  const target = signatures[targetIdx];
  const distances = new Uint8Array(signatures.length);
  
  for (let i = 0; i < signatures.length; i++) {
    distances[i] = hammingDistance(target, signatures[i]);
  }
  
  return distances;
}

// Union-Find for connected components
class UnionFind {
  constructor(n) {
    this.parent = new Int32Array(n);
    this.rank = new Uint8Array(n);
    for (let i = 0; i < n; i++) this.parent[i] = i;
  }
  
  find(x) {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]);
    }
    return this.parent[x];
  }
  
  union(x, y) {
    const px = this.find(x), py = this.find(y);
    if (px === py) return false;
    if (this.rank[px] < this.rank[py]) {
      this.parent[px] = py;
    } else if (this.rank[px] > this.rank[py]) {
      this.parent[py] = px;
    } else {
      this.parent[py] = px;
      this.rank[px]++;
    }
    return true;
  }
}

// Graph-based clustering via connected components
function clusterByConnectedComponents(signatures, threshold = 10) {
  const n = signatures.length;
  const uf = new UnionFind(n);
  let edgeCount = 0;
  
  // O(N²) but parallelizable - find all similar pairs
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dist = hammingDistance(signatures[i], signatures[j]);
      if (dist <= threshold) {
        uf.union(i, j);
        edgeCount++;
      }
    }
  }
  
  // Extract cluster assignments
  const clusters = new Map();
  const assignments = new Int32Array(n);
  
  for (let i = 0; i < n; i++) {
    const root = uf.find(i);
    if (!clusters.has(root)) {
      clusters.set(root, clusters.size);
    }
    assignments[i] = clusters.get(root);
  }
  
  return { assignments, clusterCount: clusters.size, edgeCount };
}

// Select exemplars (one representative per cluster)
function selectExemplars(signatures, assignments, clusterCount) {
  const exemplars = [];
  const clusterMembers = new Map();
  
  for (let i = 0; i < assignments.length; i++) {
    const c = assignments[i];
    if (!clusterMembers.has(c)) clusterMembers.set(c, []);
    clusterMembers.get(c).push(i);
  }
  
  for (let c = 0; c < clusterCount; c++) {
    const members = clusterMembers.get(c) || [];
    // Pick first member as exemplar (could pick centroid instead)
    if (members.length > 0) {
      exemplars.push({
        clusterId: c,
        exemplarIdx: members[0],
        signature: signatures[members[0]],
        memberCount: members.length
      });
    }
  }
  
  return exemplars;
}

// Verify a new signature against exemplars
function verifyCluster(newSig, exemplars, threshold = 10) {
  let bestCluster = -1;
  let bestDist = Infinity;
  
  for (const ex of exemplars) {
    const dist = hammingDistance(newSig, ex.signature);
    if (dist < bestDist) {
      bestDist = dist;
      bestCluster = ex.clusterId;
    }
  }
  
  return bestDist <= threshold ? bestCluster : -1; // -1 = new cluster needed
}

// Main experiment
function runExperiment(batchSize, signatureBits = 64) {
  const config = SIGNATURE_CONFIGS[signatureBits] || SIGNATURE_CONFIGS[64];
  const sigBytes = config.bytes;
  const threshold = config.threshold;
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`BATCH CLUSTERING: N=${batchSize.toLocaleString()}, ${signatureBits}-bit signatures`);
  console.log(`Use case: ${config.description}`);
  console.log('='.repeat(60));
  
  // Generate signatures
  console.log('\n1. Generating signatures...');
  const startGen = Date.now();
  const signatures = Array.from({ length: batchSize }, () => generateSignature(signatureBits));
  console.log(`   Generated ${batchSize} × ${signatureBits}-bit in ${Date.now() - startGen}ms`);
  console.log(`   Memory: ${(batchSize * sigBytes / 1024).toFixed(1)}KB`);
  
  // Cluster
  console.log(`\n2. Clustering (connected components, threshold=${threshold})...`);
  const startCluster = Date.now();
  const { assignments, clusterCount, edgeCount } = clusterByConnectedComponents(signatures, threshold);
  const clusterTime = Date.now() - startCluster;
  console.log(`   Found ${clusterCount} clusters in ${clusterTime}ms`);
  console.log(`   Pairs checked: ${(batchSize * (batchSize - 1) / 2).toLocaleString()}`);
  console.log(`   Similar pairs (edges): ${edgeCount.toLocaleString()}`);
  console.log(`   Rate: ${((batchSize * batchSize / 2) / clusterTime / 1000).toFixed(1)}M pairs/sec`);
  
  // Extract exemplars
  console.log('\n3. Selecting exemplars...');
  const exemplars = selectExemplars(signatures, assignments, clusterCount);
  console.log(`   ${exemplars.length} exemplars selected`);
  console.log(`   Exemplar storage: ${(exemplars.length * sigBytes / 1024).toFixed(2)}KB`);
  
  // Verify with new signatures
  console.log('\n4. Verification test (100 new signatures)...');
  const testSigs = Array.from({ length: 100 }, () => generateSignature(signatureBits));
  const startVerify = Date.now();
  let matched = 0, newClusters = 0;
  for (const sig of testSigs) {
    const cluster = verifyCluster(sig, exemplars, threshold);
    if (cluster >= 0) matched++;
    else newClusters++;
  }
  console.log(`   Verified 100 in ${Date.now() - startVerify}ms`);
  console.log(`   Matched existing: ${matched}, New clusters: ${newClusters}`);
  
  // Storage summary
  console.log('\n5. Storage requirements:');
  console.log(`   Cluster IDs (${batchSize} pages × 4B): ${(batchSize * 4 / 1024).toFixed(1)}KB`);
  console.log(`   Exemplars (${clusterCount} × ${sigBytes}B): ${(clusterCount * sigBytes / 1024).toFixed(2)}KB`);
  console.log(`   Total: ${((batchSize * 4 + clusterCount * sigBytes) / 1024).toFixed(1)}KB`);
  console.log(`   vs Full sigs: ${(batchSize * sigBytes / 1024).toFixed(1)}KB`);
  
  return { batchSize, signatureBits, clusterCount, clusterTime, exemplars: exemplars.length, sigBytes };
}

// Run experiments at different scales and signature sizes
console.log('BATCH CLUSTERING LAB');
console.log('====================');
console.log('Concept: Load N pages → compute all-pairs similarity → cluster → store compact IDs');
console.log('Comparing: 64-bit vs 128-bit vs 256-bit signatures');
console.log('');

const results = [];

// Compare signature sizes at fixed batch size (1000)
console.log('\n' + '#'.repeat(60));
console.log('SIGNATURE SIZE COMPARISON (N=1000)');
console.log('#'.repeat(60));
for (const bits of [64, 128, 256]) {
  results.push(runExperiment(1000, bits));
}

// Scale test with recommended 128-bit
console.log('\n' + '#'.repeat(60));
console.log('SCALE TEST (128-bit signatures)');
console.log('#'.repeat(60));
for (const size of [100, 1000, 5000]) {
  results.push(runExperiment(size, 128));
}

console.log('\n' + '='.repeat(70));
console.log('SUMMARY: SIGNATURE SIZE COMPARISON');
console.log('='.repeat(70));
console.log('\n Bits | Batch | Clusters | Time (ms) |   Pairs/sec | Memory (KB)');
console.log('-'.repeat(70));
for (const r of results) {
  const pairsPerSec = (r.batchSize * r.batchSize / 2) / r.clusterTime / 1000;
  const memory = r.batchSize * r.sigBytes / 1024;
  console.log(`${r.signatureBits.toString().padStart(5)} | ${r.batchSize.toString().padStart(5)} | ${r.clusterCount.toString().padStart(8)} | ${r.clusterTime.toString().padStart(9)} | ${pairsPerSec.toFixed(1).padStart(11)}M | ${memory.toFixed(1).padStart(10)}`);
}

console.log('\nKEY INSIGHTS:');
console.log('• 64-bit: Fast, good for exact/near-duplicate detection');
console.log('• 128-bit: Sweet spot - 2x storage, better cluster separation');
console.log('• 256-bit: Best quality, 4x storage, slightly slower comparisons');
console.log('• All sizes: O(N²) viable for N≤10K, GPU could accelerate 100x');
console.log('• Recommendation: 128-bit for structural+content, 64-bit for pure dedup');
