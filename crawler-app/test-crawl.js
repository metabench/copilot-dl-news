'use strict';
/**
 * Quick crawl test to verify the crawl service works
 */

const { createCrawlService } = require('../src/server/crawl-api');

async function main() {
  console.log('🧪 Testing crawl service...');
  
  const service = createCrawlService();
  
  try {
    const result = await service.runOperation({
      logger: console,
      operationName: 'basicArticleCrawl',
      startUrl: 'https://www.theguardian.com',
      overrides: {
        maxPagesPerDomain: 5,
        maxDepth: 1,
        concurrency: 1,
        outputVerbosity: 'silent'
      }
    });
    
    console.log('✅ Success:', result);
  } catch (err) {
    console.error('❌ Failed:', err);
  }
  
  process.exit(0);
}

main();
