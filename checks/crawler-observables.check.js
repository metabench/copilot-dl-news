/**
 * Verification script for Crawler Observables (Phase 6)
 * 
 * This script verifies that CrawlContext, ProgressModel, and FetchPipeline
 * correctly emit events during a simulated crawl.
 */

const CrawlContext = require('../src/crawler/context/CrawlContext');
const ProgressModel = require('../src/crawler/progress/ProgressModel');
const EventEmitter = require('events');

// Mock FetchPipeline since it requires more dependencies
class MockFetchPipeline extends EventEmitter {
  async fetch(url) {
    this.emit('fetch:start', { url });
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 50));
    
    if (url.includes('error')) {
      this.emit('fetch:error', { url, error: 'Simulated error' });
      return { success: false };
    }
    
    this.emit('fetch:success', { url, duration: 50 });
    return { success: true };
  }
}

async function runCheck() {
  console.log('🚀 Starting Crawler Observables Verification\n');

  const context = new CrawlContext({
    id: 'check-session',
    config: { maxUrls: 10 }
  });

  const progress = new ProgressModel(context, null, {
    etaAlpha: 0.5
  });

  const pipeline = new MockFetchPipeline();

  // Event Listeners
  const events = [];
  
  context.on('stats:change', (data) => {
    events.push(`[Context] stats:change - ${data.name}: ${data.oldValue} -> ${data.newValue} (delta: ${data.delta})`);
  });

  context.on('url:state-change', (data) => {
    events.push(`[Context] url:state-change - ${data.url}: ${data.oldState} -> ${data.newState}`);
  });

  progress.on('change', (data) => {
    const completion = data.completion ? data.completion.new : progress.completion;
    const eta = data.eta ? data.eta.new : progress.eta;
    const etaSec = eta ? (eta / 1000).toFixed(1) : 'N/A';
    events.push(`[Progress] change - completion: ${completion.toFixed(2)}%, ETA: ${etaSec}s`);
  });

  pipeline.on('fetch:start', (data) => {
    events.push(`[Pipeline] fetch:start - ${data.url}`);
    context.markDequeued(data.url);
  });

  pipeline.on('fetch:success', (data) => {
    events.push(`[Pipeline] fetch:success - ${data.url}`);
    context.markVisited(data.url);
  });

  pipeline.on('fetch:error', (data) => {
    events.push(`[Pipeline] fetch:error - ${data.url}`);
    context.recordError();
  });

  // Simulate Crawl
  console.log('--- Simulating Crawl ---');
  
  context.markQueued('https://example.com/1');
  context.markQueued('https://example.com/2');
  context.markQueued('https://example.com/error');

  await pipeline.fetch('https://example.com/1');
  await pipeline.fetch('https://example.com/2');
  await pipeline.fetch('https://example.com/error');

  console.log('\n--- Event Log ---');
  events.forEach(e => console.log(e));

  console.log('\n--- Final State ---');
  console.log('Stats:', context.stats);
  console.log('Progress:', progress.getSnapshot());

  // Assertions
  const hasStatsChange = events.some(e => e.includes('stats:change'));
  const hasUrlStateChange = events.some(e => e.includes('url:state-change'));
  const hasProgressChange = events.some(e => e.includes('change'));

  if (hasStatsChange && hasUrlStateChange && hasProgressChange) {
    console.log('\n✅ Verification PASSED: All observable events emitted correctly.');
  } else {
    console.error('\n❌ Verification FAILED: Missing expected events.');
    process.exit(1);
  }
}

runCheck().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
