'use strict';

const path = require('path');
const { analyzeCrawlOperationsConciseness } = require('../src/crawler/operations/concisenessMetrics');

const main = () => {
  const result = analyzeCrawlOperationsConciseness();
  const status = result.isConcise ? 'PASS' : 'NEEDS WORK';

  console.log('CrawlOperations conciseness analysis');
  console.log('------------------------------------');
  console.log(`Status: ${status}`);
  console.log(`Total lines (non-empty): ${result.totalLines}`);
  console.log(`Public methods: ${result.publicMethodCount}`);
  console.log(`Line threshold: ${result.thresholds.maxLines}`);
  console.log(`Method threshold: ${result.thresholds.maxPublicMethods}`);
  console.log(`File: ${path.relative(process.cwd(), result.filePath)}`);

  if (!result.isConcise) {
    console.log('\nDetails:');
    if (result.exceedsLineThreshold) {
      console.log(`- Total lines exceed threshold by ${result.totalLines - result.thresholds.maxLines}`);
    }
    if (result.exceedsMethodThreshold) {
      console.log(`- Public method count exceeds threshold by ${result.publicMethodCount - result.thresholds.maxPublicMethods}`);
      console.log(`- Methods detected: ${result.methodNames.join(', ')}`);
    }
  }
};

if (require.main === module) {
  main();
}
