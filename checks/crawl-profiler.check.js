#!/usr/bin/env node
'use strict';

/**
 * @fileoverview Crawl Profiler check script.
 * Demonstrates profiler usage with mock phases simulating a real crawl.
 * 
 * Usage: node checks/crawl-profiler.check.js
 */

const { CrawlProfiler, BottleneckDetector, ProfileReporter, VALID_PHASES } = require('../src/crawler/profiler');

// Helper to simulate async work
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function simulateCrawl(profiler) {
  console.log('🕷️  Simulating crawl with profiler...\n');
  console.log(`Valid phases: ${VALID_PHASES.join(', ')}\n`);

  // Phase 1: DNS lookup
  profiler.start('dns');
  await delay(15);
  profiler.end('dns');

  // Phase 2: TCP connection
  profiler.start('tcp');
  await delay(25);
  profiler.end('tcp');

  // Phase 3: TLS handshake
  profiler.start('tls');
  await delay(30);
  profiler.end('tls');

  // Phase 4: First byte
  profiler.start('firstByte');
  await delay(80);
  profiler.end('firstByte');

  // Phase 5: Download content
  profiler.start('download');
  await delay(45);
  profiler.end('download');

  // Phase 6: Parse HTML
  profiler.start('parseHtml');
  await delay(25);
  profiler.end('parseHtml');

  // Phase 7: Extract content
  profiler.start('extract');
  await delay(35);
  profiler.end('extract');

  // Phase 8: Database write
  profiler.start('dbWrite');
  await delay(20);
  profiler.end('dbWrite');
}

async function main() {
  const profiler = new CrawlProfiler();
  const detector = new BottleneckDetector();
  const reporter = new ProfileReporter({ barWidth: 40 });

  try {
    // Run the simulated crawl
    await simulateCrawl(profiler);

    const profile = profiler.getProfile();

    // Display ASCII timeline
    console.log('═══ ASCII Timeline ═══\n');
    console.log(reporter.reportProfile(profile, { format: 'ascii' }));
    console.log('');

    // One-line summary
    console.log('═══ Summary ═══\n');
    console.log(reporter.summarize(profile));
    console.log('');

    // Add profile to detector
    detector.addProfile(profile);

    // Run detection
    const detection = detector.detect();

    // Display bottleneck analysis
    console.log(reporter.reportBottlenecks(detection, { includeStatistics: true }));
    console.log('');

    // Show phase-specific analysis
    console.log('═══ Phase Analysis ═══\n');
    for (const phase of VALID_PHASES.slice(0, 4)) {
      const analysis = detector.getPhaseAnalysis(phase);
      if (analysis) {
        console.log(`${phase}: avg=${analysis.avgDuration.toFixed(1)}ms, p95=${analysis.p95.toFixed(1)}ms`);
      }
    }
    console.log('');

    // JSON export
    console.log('═══ JSON Export (partial) ═══\n');
    console.log(`Total duration: ${profile.total.toFixed(1)}ms`);
    console.log(`Phases: ${Object.keys(profile.phases).length}`);
    console.log(`Bottleneck: ${profile.bottleneck || 'none'}`);
    console.log('');

    // Demonstrate comparison with a faster profile
    console.log('═══ Profile Comparison Demo ═══\n');
    
    // Reset profiler and run a "faster" crawl
    profiler.reset();
    profiler.record('dns', 10);
    profiler.record('tcp', 20);
    profiler.record('tls', 25);
    profiler.record('firstByte', 60);
    profiler.record('download', 35);
    profiler.record('parseHtml', 20);
    profiler.record('extract', 25);
    profiler.record('dbWrite', 15);
    
    const optimizedProfile = profiler.getProfile();
    console.log(reporter.compareProfiles(profile, optimizedProfile));

    // Markdown report
    console.log('\n═══ Markdown Report ═══\n');
    console.log(reporter.reportProfile(optimizedProfile, { format: 'markdown' }));

    console.log('\n✅ Check completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Check failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
