'use strict';

/**
 * Check SimHash Hamming distance for near-duplicate detection
 */

const SimHasher = require('../src/analysis/similarity/SimHasher');

const article1 = `
  WASHINGTON — The Federal Reserve announced Wednesday that it would raise 
  interest rates by a quarter percentage point, marking the first increase 
  since March 2020. The decision comes as policymakers seek to combat 
  inflation that has climbed to levels not seen in decades across America.
  The central bank signaled additional rate increases may follow soon.
`;

const article2 = `
  WASHINGTON — The Federal Reserve announced Wednesday that it would raise 
  interest rates by a quarter percentage point, marking the first increase 
  since March 2020. The decision comes as policymakers seek to combat 
  inflation that has climbed to levels not seen in decades across America.
  The central bank signaled additional rate increases may follow later.
`;

const hash1 = SimHasher.compute(article1);
const hash2 = SimHasher.compute(article2);
const distance = SimHasher.hammingDistance(hash1, hash2);

console.log('Hash 1:', SimHasher.toHexString(hash1));
console.log('Hash 2:', SimHasher.toHexString(hash2));
console.log('Hamming distance:', distance);
console.log('Would be detected (threshold 3):', distance <= 3);
console.log('Would be detected (threshold 5):', distance <= 5);
