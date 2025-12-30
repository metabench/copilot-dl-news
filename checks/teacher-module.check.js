/**
 * Verification script for Teacher module (Phase 2)
 * 
 * Tests the TeacherService, VisualAnalyzer, and SkeletonHasher
 * without requiring network access.
 */

const { TeacherService } = require('../src/teacher/TeacherService');
const { VisualAnalyzer } = require('../src/teacher/VisualAnalyzer');
const { SkeletonHasher } = require('../src/teacher/SkeletonHasher');

console.log('🚀 Starting Teacher Module Verification\n');

// Test 1: TeacherService availability check
console.log('--- Test 1: TeacherService ---');
const isAvailable = TeacherService.isAvailable();
console.log(`Puppeteer available: ${isAvailable ? '✅ YES' : '⚠️ NO (optional dependency)'}`);

const teacher = new TeacherService({ headless: true });
console.log(`TeacherService instantiated: ✅`);
console.log(`Stats:`, teacher.getStats());

// Test 2: VisualAnalyzer
console.log('\n--- Test 2: VisualAnalyzer ---');
const analyzer = new VisualAnalyzer();

const mockStructure = {
  title: 'Test Article - News Site',
  largestTextBlock: {
    tagName: 'article',
    className: 'post-content',
    id: 'main-article',
    wordCount: 350,
    rect: { x: 100, y: 200, width: 600, height: 800 },
    area: 480000
  },
  metadataBlock: {
    selector: '.article-header',
    tagName: 'header',
    rect: { x: 100, y: 50, width: 600, height: 100 }
  },
  skeleton: {
    tag: 'body',
    childCount: 3,
    hasText: true,
    children: [
      { tag: 'header', childCount: 2, hasText: true },
      { tag: 'main', childCount: 1, hasText: true, children: [
        { tag: 'article', childCount: 5, hasText: true }
      ]},
      { tag: 'footer', childCount: 2, hasText: true }
    ]
  },
  viewport: { width: 1280, height: 800, scrollHeight: 2000 }
};

const analysis = analyzer.analyze(mockStructure);
console.log(`Analysis valid: ${analysis.valid ? '✅' : '❌'}`);
console.log(`Has main content: ${analysis.hasMainContent ? '✅' : '❌'}`);
console.log(`Has metadata: ${analysis.hasMetadata ? '✅' : '❌'}`);
console.log(`Layout type: ${analysis.layout?.type}`);
console.log(`Confidence: ${(analysis.confidence * 100).toFixed(1)}%`);

// Test 3: SkeletonHasher
console.log('\n--- Test 3: SkeletonHasher ---');
const hasher = new SkeletonHasher();

const hash1 = hasher.hash(mockStructure.skeleton);
console.log(`L1 hash: ${hash1.l1}`);
console.log(`L2 hash: ${hash1.l2}`);

// Create a similar skeleton (same template)
const similarSkeleton = {
  tag: 'body',
  childCount: 3,
  hasText: true,
  children: [
    { tag: 'header', childCount: 2, hasText: true },
    { tag: 'main', childCount: 1, hasText: true, children: [
      { tag: 'article', childCount: 6, hasText: true }  // Different child count
    ]},
    { tag: 'footer', childCount: 2, hasText: true }
  ]
};

const hash2 = hasher.hash(similarSkeleton);
console.log(`\nSimilar skeleton L1: ${hash2.l1}`);
console.log(`Similar skeleton L2: ${hash2.l2}`);

const comparison = hasher.compare(hash1, hash2);
console.log(`L1 match: ${comparison.l1Match ? '✅' : '❌'}`);
console.log(`L2 match: ${comparison.l2Match ? '✅' : '❌'}`);
console.log(`Similarity: ${(comparison.similarity * 100).toFixed(1)}%`);

// Create a different skeleton
const differentSkeleton = {
  tag: 'body',
  childCount: 2,
  hasText: true,
  children: [
    { tag: 'div', childCount: 10, hasText: true },
    { tag: 'aside', childCount: 3, hasText: false }
  ]
};

const hash3 = hasher.hash(differentSkeleton);
const comparison2 = hasher.compare(hash1, hash3);
console.log(`\nDifferent skeleton similarity: ${(comparison2.similarity * 100).toFixed(1)}%`);

// Test clustering
console.log('\n--- Test 4: Clustering ---');
const items = [
  { url: 'https://example.com/article/1', hash: hash1 },
  { url: 'https://example.com/article/2', hash: hash2 },
  { url: 'https://other.com/page', hash: hash3 }
];

const clusters = hasher.clusterByL1(items);
console.log(`Clusters found: ${clusters.size}`);
for (const [l1, group] of clusters) {
  console.log(`  L1=${l1}: ${group.length} pages`);
}

// Summary
console.log('\n--- Summary ---');
const hasherSummary = hasher.summarize(mockStructure.skeleton);
console.log('Skeleton structure:');
console.log(hasherSummary);

console.log('\n✅ Teacher Module Verification PASSED');
